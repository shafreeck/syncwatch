import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { wsMessageSchema, insertRoomSchema, insertUserSchema, type WSMessage } from "@shared/schema";
import { nanoid } from "nanoid";

interface ExtendedWebSocket extends WebSocket {
  userId?: string;
  roomId?: string;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Room management APIs
  app.post("/api/rooms", async (req, res) => {
    try {
      const roomData = insertRoomSchema.parse(req.body);
      // Default to host-only control; generate并持久化 ownerSecret
      const ownerSecret = nanoid(32);
      const room = await storage.createRoom({
        ...roomData,
        hostOnlyControl: (roomData as any).hostOnlyControl ?? true,
        ownerSecret,
      } as any);
      // 返回给创建者；后续接口不再暴露该字段
      res.json({ ...room, ownerSecret });
    } catch (error) {
      console.error("Create room error:", error);
      res.status(400).json({ error: "Invalid room data" });
    }
  });

  // 通过房间代码查找房间
  app.get("/api/rooms/code/:code", async (req, res) => {
    try {
      const room = await storage.getRoomByCode(req.params.code);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      const { ownerSecret, ...safe } = room as any;
      res.json(safe);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch room" });
    }
  });

  app.get("/api/rooms/:id", async (req, res) => {
    try {
      const room = await storage.getRoom(req.params.id);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      const { ownerSecret, ...safe } = room as any;
      res.json(safe);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch room" });
    }
  });

  app.get("/api/rooms/:id/users", async (req, res) => {
    try {
      const users = await storage.getUsersByRoom(req.params.id);
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/rooms/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getMessagesByRoom(req.params.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/rooms/:id/videos", async (req, res) => {
    try {
      const videos = await storage.getVideosByRoom(req.params.id);
      res.json(videos);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch videos" });
    }
  });

  // Update room settings
  app.patch("/api/rooms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { roomCode, hostOnlyControl } = req.body;
      
      const existingRoom = await storage.getRoom(id);
      if (!existingRoom) {
        return res.status(404).json({ error: "Room not found" });
      }
      
      const updateData: any = {};
      if (roomCode !== undefined) {
        updateData.roomCode = roomCode;
      }
      if (hostOnlyControl !== undefined) {
        updateData.hostOnlyControl = hostOnlyControl;
      }
      
      const updatedRoom = await storage.updateRoom(id, updateData);
      res.json(updatedRoom);
    } catch (error) {
      console.error("Error updating room:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // WebSocket server for real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const roomConnections = new Map<string, Set<ExtendedWebSocket>>();
  // Persist latest selected video per room so newcomers auto-load it
  const roomCurrentSelection = new Map<string, { videoId: string; magnetUri: string }>();
  // Persist last playback state (best-effort) so newcomers can align state
  const roomPlaybackState = new Map<string, { action: 'play' | 'pause' | 'seek'; currentTime: number }>();
  // ownerSecret 改为持久化到数据库，不再使用内存映射
  // Allow-list of users who can control playback when host-only mode is on
  const roomControlAllow = new Map<string, Set<string>>();

  async function cleanupStaleUsers(roomId: string) {
    try {
      const active = roomConnections.get(roomId) || new Set();
      const activeIds = new Set(Array.from(active).map(s => s.userId).filter(Boolean) as string[]);
      const existing = await storage.getUsersByRoom(roomId);
      await Promise.all(existing.map(async (u) => {
        if (!activeIds.has(u.id)) {
          try { await storage.deleteUser(u.id); } catch {}
        }
      }));
    } catch {}
  }

  function broadcastToRoom(roomId: string, message: any, excludeSocket?: ExtendedWebSocket) {
    const connections = roomConnections.get(roomId);
    if (connections) {
      const messageStr = JSON.stringify(message);
      connections.forEach(socket => {
        if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
          socket.send(messageStr);
        }
      });
    }
  }

  wss.on("connection", (socket: ExtendedWebSocket) => {
    console.log("New WebSocket connection");

    socket.on("message", async (data) => {
      try {
        const rawMessage = JSON.parse(data.toString());
        const message: WSMessage = wsMessageSchema.parse(rawMessage);

        switch (message.type) {
          case "join_room":
            const { roomId, username, persistentUserId, ownerSecret: providedOwnerSecret } = message.data;
            console.log(`🚪 Join room request:`, { roomId, username, persistentUserId });
            
            // Verify room exists
            const room = await storage.getRoom(roomId);
            if (!room) {
              socket.send(JSON.stringify({ type: "error", message: "Room not found" }));
              return;
            }

            // If this socket already joined the same room, treat as idempotent join
            if (socket.userId && socket.roomId === roomId) {
              // Best-effort update of username
              try { await storage.updateUser(socket.userId, { username }); } catch {}

              await cleanupStaleUsers(roomId);
              const users = await storage.getUsersByRoom(roomId);
              const messages = await storage.getMessagesByRoom(roomId);
              const videos = await storage.getVideosByRoom(roomId);
              socket.send(JSON.stringify({ type: "room_state", data: { room, users, messages, videos } }));

              const selection = roomCurrentSelection.get(roomId);
              if (selection) {
                socket.send(JSON.stringify({ type: "video_selected", data: { videoId: selection.videoId, magnetUri: selection.magnetUri } }));
              }
              const playback = roomPlaybackState.get(roomId);
              if (playback) {
                socket.send(JSON.stringify({ type: "video_sync", data: { action: playback.action, currentTime: playback.currentTime, roomId } }));
              }
              break;
            }

            // If this socket was in another room, leave previous
            if (socket.userId && socket.roomId && socket.roomId !== roomId) {
              try {
                const prevRoomId = socket.roomId;
                const prevUserId = socket.userId;
                await storage.deleteUser(prevUserId);
                const prevConns = roomConnections.get(prevRoomId);
                prevConns?.delete(socket);
                broadcastToRoom(prevRoomId, { type: "user_left", data: { userId: prevUserId } });
              } catch {}
            }

            // Create user for this socket in the new room
            // Before creating a new record, clean up any stale users in this room
            await cleanupStaleUsers(roomId);
            
            // 使用持久化的 ownerSecret 严格判定房主（不再兼容旧逻辑）
            let isHost = false;
            try {
              isHost = !!providedOwnerSecret && providedOwnerSecret === (room as any).ownerSecret;
            } catch {}
            
            // Use persistent user ID if provided, otherwise create new user
            let user;
            if (persistentUserId && typeof storage.createUserWithId === 'function') {
              // Create user with the persistent ID from client
              user = {
                id: persistentUserId,
                username,
                roomId,
                isHost,
                joinedAt: new Date()
              };
              await storage.createUserWithId(user);
              console.log(`🔄 Using persistent user ID: ${persistentUserId} for ${username}`);
            } else {
              // Fallback to auto-generated ID
              user = await storage.createUser({ username, roomId, isHost });
              console.log(`🆔 Created new user ID: ${user.id} for ${username}`);
              if (persistentUserId) {
                console.log(`⚠️ createUserWithId method not available, used auto-generated ID instead`);
              }
            }

            // 不再改写 hostId；房主身份仅由 ownerSecret 决定

            socket.userId = user.id;
            socket.roomId = roomId;

            // Add to room connections
            if (!roomConnections.has(roomId)) {
              roomConnections.set(roomId, new Set());
            }
            roomConnections.get(roomId)!.add(socket);

            // Broadcast user joined to everyone EXCEPT the joining socket
            broadcastToRoom(roomId, {
              type: "user_joined",
              data: { user }
            }, socket);

            // Initialize per-room control allow-list container if missing
            if (!roomControlAllow.has(roomId)) {
              roomControlAllow.set(roomId, new Set());
            }

            // Send current room state to new user
            const users = await storage.getUsersByRoom(roomId);
            const messages = await storage.getMessagesByRoom(roomId);
            const videos = await storage.getVideosByRoom(roomId);

            // If there is an active selection in this room, include it in room_state
            let currentVideo = null;
            let currentPlayback = null;
            const selection = roomCurrentSelection.get(roomId);
            if (selection) {
              // Find the selected video in the videos list
              currentVideo = videos.find(v => v.id === selection.videoId);
              // Also get the current playback state
              currentPlayback = roomPlaybackState.get(roomId);
            }

            const allowedUserIds = Array.from(roomControlAllow.get(roomId) || new Set());
            // 发送 room_state 前移除 ownerSecret
            const { ownerSecret, ...safeRoom } = room as any;
            socket.send(JSON.stringify({
              type: "room_state",
              data: {
                room: safeRoom,
                users,
                messages,
                videos,
                currentVideo: currentVideo || null,
                currentPlayback: currentPlayback || null,
                control: { allowedUserIds, hostOnlyControl: room.hostOnlyControl || false }
              }
            }));

            // Send current host information to the newcomer
            const hostUser = users.find(u => u.isHost);
            if (hostUser) {
              socket.send(JSON.stringify({
                type: "host_info",
                data: hostUser
              }));
            }

            // Send room settings to the newcomer
            if (room) {
              socket.send(JSON.stringify({
                type: "host_only_control_updated",
                data: { hostOnlyControl: room.hostOnlyControl || false }
              }));
            }

            // Send current host information to the newcomer

            break;

          case "leave_room":
            if (socket.roomId && socket.userId) {
              await storage.deleteUser(socket.userId);
              
              // Remove from room connections
              const connections = roomConnections.get(socket.roomId);
              if (connections) {
                connections.delete(socket);
              }

              broadcastToRoom(socket.roomId, {
                type: "user_left",
                data: { userId: socket.userId }
              });
            }
            break;

          case "chat_message":
            if (socket.userId && socket.roomId) {
              const chatMessage = await storage.createMessage({
                content: message.data.content,
                userId: socket.userId,
                roomId: message.data.roomId,
              });

              const user = await storage.getUser(socket.userId);
              
              broadcastToRoom(message.data.roomId, {
                type: "new_message",
                data: { ...chatMessage, user }
              });
            }
            break;

          case "video_sync":
            if (socket.roomId && socket.userId) {
              // Check if user is host or if host-only control is disabled
              const usersInRoom = await storage.getUsersByRoom(socket.roomId);
              const currentUser = usersInRoom.find(u => u.id === socket.userId);

              // Get room settings
              const room = await storage.getRoom(socket.roomId);
              const hostOnlyControl = room?.hostOnlyControl || false;

              // If host-only control is enabled and user is not host or explicitly allowed, block
              const allowedSet = roomControlAllow.get(socket.roomId) || new Set<string>();
              if (hostOnlyControl && (!currentUser || (!currentUser.isHost && !allowedSet.has(currentUser.id)))) {
                console.log("Host-only control is enabled. Only host can control playback.");
                return;
              }

              // Remember last playback state for newcomers
              try {
                const { action, currentTime } = message.data || {};
                if (action && typeof currentTime === 'number') {
                  roomPlaybackState.set(socket.roomId, { action, currentTime });
                }
              } catch {}
              broadcastToRoom(socket.roomId, {
                type: "video_sync",
                data: message.data
              }, socket);
            }
            break;

          case "control_request":
            if (socket.roomId && socket.userId) {
              const roomId = socket.roomId;
              const usersInRoom = await storage.getUsersByRoom(roomId);
              const hosts = usersInRoom.filter(u => u.isHost);
              const payload = {
                type: "control_request",
                data: { roomId, userId: socket.userId, username: usersInRoom.find(u => u.id === socket.userId)?.username }
              };
              const conns = roomConnections.get(roomId) || new Set();
              conns.forEach(s => {
                const isHostSocket = hosts.some(h => h.id === (s as ExtendedWebSocket).userId);
                if (isHostSocket && s.readyState === WebSocket.OPEN) {
                  s.send(JSON.stringify(payload));
                }
              });
            }
            break;

          case "control_grant":
            if (socket.roomId && socket.userId) {
              // Verify user is host
              const usersInRoom = await storage.getUsersByRoom(socket.roomId);
              const currentUser = usersInRoom.find(u => u.id === socket.userId);
              if (!currentUser || !currentUser.isHost) {
                socket.send(JSON.stringify({ type: "error", message: "Only host can grant control" }));
                return;
              }
              const { roomId, userId, canControl } = message.data;
              if (roomId !== socket.roomId) break;
              const set = roomControlAllow.get(roomId) || new Set<string>();
              if (canControl) set.add(userId); else set.delete(userId);
              roomControlAllow.set(roomId, set);
              broadcastToRoom(roomId, {
                type: "control_permissions",
                data: { roomId, allowedUserIds: Array.from(set) }
              });
            }
            break;
            
          case "user_progress":
            if (socket.roomId && socket.userId) {
              // Broadcast user's playback progress to other users in the room
              broadcastToRoom(socket.roomId, {
                type: "user_progress",
                data: { 
                  userId: socket.userId,
                  currentTime: message.data?.currentTime,
                  isPlaying: message.data?.isPlaying
                }
              }, socket);
            }
            break;

          case "video_upload":
          case "video_share":
            console.log(`📹 Received ${message.type} message:`, {
              userId: socket.userId,
              roomId: socket.roomId,
              data: message.data
            });
            if (socket.userId && socket.roomId) {
              // Deduplicate by (roomId, infoHash) or (roomId, name, size) for temp files
              const roomId = message.data.roomId;
              const infoHash = message.data.infoHash;
              const fileName = message.data.name;
              const fileSize = message.data.size;
              
              const existing = (await storage.getVideosByRoom(roomId)).find(v => {
                // If we have a real infoHash (not temp), use it for deduplication
                if (infoHash && !infoHash.startsWith('temp-') && v.infoHash === infoHash) {
                  return true;
                }
                // For temp infoHashes, deduplicate by name + size
                if (infoHash?.startsWith('temp-') && v.name === fileName && v.size === fileSize) {
                  return true;
                }
                return false;
              });

              let video;
              if (existing) {
                console.log(`🔍 Found existing video, using: ${existing.id} (${existing.name})`);
                video = existing;
                // Optionally, we could update name/magnet if changed; keep first seen stable for now
                // Do not broadcast a new item to avoid duplicates on clients
              } else {
                console.log(`📝 Creating new video in storage...`);
                video = await storage.createVideo({
                  name: message.data.name,
                  magnetUri: message.data.magnetUri,
                  infoHash: message.data.infoHash,
                  size: message.data.size,
                  roomId: roomId,
                  uploadedBy: socket.userId,
                  // **NEW**: Set initial status as ready for normal video shares
                  status: message.data.status || 'ready',
                  processingStep: message.data.processingStep,
                  sourceType: message.data.sourceType || 'local_file',
                });
                console.log(`✅ Video created:`, video);

                console.log(`📡 Broadcasting new_video to room ${roomId}...`);
                broadcastToRoom(roomId, {
                  type: "new_video",
                  data: { video }
                });
                console.log(`✅ new_video message broadcasted`);
              }
            }
            break;

          case "video_select":
            if (socket.roomId) {
              // Persist current selection for this room
              try {
                roomCurrentSelection.set(socket.roomId, {
                  videoId: message.data.videoId,
                  magnetUri: message.data.magnetUri,
                });
              } catch {}
              broadcastToRoom(message.data.roomId, {
                type: "video_selected",
                data: {
                  videoId: message.data.videoId,
                  magnetUri: message.data.magnetUri
                }
              });
            }
            break;

          // **NEW**: Update video processing status
          case "video_status_update":
            if (socket.userId && socket.roomId) {
              console.log(`🔄 Video status update:`, message.data);
              const { videoId, name, status, processingStep, size, infoHash, magnetUri } = message.data;
              
              try {
                let targetVideoId = videoId;
                
                // Find video by different identifiers
                if (!targetVideoId || targetVideoId.startsWith('temp-')) {
                  const videos = await storage.getVideosByRoom(socket.roomId);
                  
                  // Try to find by infoHash first
                  if (infoHash) {
                    const video = videos.find(v => v.infoHash === infoHash);
                    if (video) {
                      targetVideoId = video.id;
                      console.log(`📍 Found video by infoHash: ${infoHash} -> ${targetVideoId}`);
                    }
                  }
                  
                  // Try to find by temporary magnetUri (for local files)
                  if (!targetVideoId || targetVideoId.startsWith('temp-')) {
                    const video = videos.find(v => v.magnetUri === videoId || v.infoHash === videoId);
                    if (video) {
                      targetVideoId = video.id;
                      console.log(`📍 Found video by magnetUri/tempId: ${videoId} -> ${targetVideoId}`);
                    }
                  }
                }
                
                if (targetVideoId) {
                  // Update video in storage
                  const validStatus = status && ["processing", "ready", "error"].includes(status) 
                    ? status as "processing" | "ready" | "error"
                    : undefined;
                  await storage.updateVideo(targetVideoId, { 
                    ...(name && { name }),
                    status: validStatus, 
                    processingStep,
                    ...(size && { size }),
                    ...(infoHash && { infoHash }),
                    ...(magnetUri && { magnetUri })
                  });
                  
                  // Clean up duplicates: if we just set a real infoHash, remove other videos with same infoHash
                  if (infoHash && !infoHash.startsWith('temp-')) {
                    const allVideos = await storage.getVideosByRoom(socket.roomId);
                    const duplicates = allVideos.filter(v => v.id !== targetVideoId && v.infoHash === infoHash);
                    for (const dup of duplicates) {
                      console.log(`🧹 Removing duplicate video: ${dup.id} (same infoHash: ${infoHash})`);
                      await storage.deleteVideo(dup.id);
                    }
                  }
                  
                  // Broadcast update to all users in room
                  broadcastToRoom(socket.roomId, {
                    type: "video_status_updated",
                    data: { videoId: targetVideoId, name, status, processingStep, size, infoHash, magnetUri }
                  });
                  
                  console.log(`✅ Video ${targetVideoId} status updated to: ${status}`);
                } else {
                  console.warn(`⚠️ Could not find video to update: videoId=${videoId}, infoHash=${infoHash}`);
                }
              } catch (error) {
                console.error(`❌ Failed to update video status:`, error);
              }
            }
            break;

          case "update_host_only_control":
            if (socket.userId && socket.roomId) {
              // Verify user is host
              const usersInRoom = await storage.getUsersByRoom(socket.roomId);
              const currentUser = usersInRoom.find(u => u.id === socket.userId);
              
              if (!currentUser || !currentUser.isHost) {
                socket.send(JSON.stringify({ type: "error", message: "Only host can update room settings" }));
                return;
              }
              
              // Update room setting
              const { roomId, hostOnlyControl } = message.data;
              if (roomId === socket.roomId) {
                try {
                  await storage.updateRoom(roomId, { hostOnlyControl });
                  
                  // Broadcast update to all users in room
                  broadcastToRoom(socket.roomId, {
                    type: "host_only_control_updated",
                    data: { hostOnlyControl }
                  });
                } catch (error) {
                  console.error("Error updating hostOnlyControl:", error);
                  socket.send(JSON.stringify({ type: "error", message: "Failed to update room settings" }));
                }
              }
            }
            break;

          case "video_delete":
            if (socket.roomId) {
              try {
                const { videoId, roomId } = message.data || {};
                console.log(`🗑️ Delete request: videoId=${videoId}, roomId=${roomId}`);
                const video = await storage.getVideo(videoId);
                console.log(`🔍 Found video:`, video);
                if (!video || video.roomId !== roomId) {
                  console.log(`❌ Video not found or room mismatch`);
                  socket.send(JSON.stringify({ type: "error", message: "Video not found" }));
                  break;
                }
                // Allow any participant in the room to delete for now.
                // (We can tighten to host/uploader once host is reliably tracked.)
                console.log(`🔥 Deleting video from storage...`);
                const ok = await storage.deleteVideo(videoId);
                console.log(`🎯 Delete result: ${ok}`);
                if (ok) {
                  console.log(`📡 Broadcasting video_deleted to room ${roomId}`);
                  broadcastToRoom(roomId, {
                    type: "video_deleted",
                    data: { videoId }
                  });
                  console.log(`✅ Video ${videoId} deleted successfully`);
                } else {
                  console.log(`💥 Failed to delete video from storage`);
                  socket.send(JSON.stringify({ type: "error", message: "Failed to delete video" }));
                }
              } catch (e) {
                console.error(`💥 Exception during video delete:`, e);
                socket.send(JSON.stringify({ type: "error", message: "Failed to delete video" }));
              }
            } else {
              console.log(`❌ No roomId in socket for video_delete`);
            }
            break;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        socket.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    });

    socket.on("close", async () => {
      if (socket.roomId && socket.userId) {
        await storage.deleteUser(socket.userId);
        
        const connections = roomConnections.get(socket.roomId);
        if (connections) {
          connections.delete(socket);
        }

        broadcastToRoom(socket.roomId, {
          type: "user_left",
          data: { userId: socket.userId }
        });
      }
    });
  });

  return httpServer;
}
