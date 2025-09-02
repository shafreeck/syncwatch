import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { wsMessageSchema, insertRoomSchema, insertUserSchema, type WSMessage } from "@shared/schema";

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
      const room = await storage.createRoom(roomData);
      res.json(room);
    } catch (error) {
      res.status(400).json({ error: "Invalid room data" });
    }
  });

  app.get("/api/rooms/:id", async (req, res) => {
    try {
      const room = await storage.getRoom(req.params.id);
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }
      res.json(room);
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


  // WebSocket server for real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const roomConnections = new Map<string, Set<ExtendedWebSocket>>();
  // Persist latest selected video per room so newcomers auto-load it
  const roomCurrentSelection = new Map<string, { videoId: string; magnetUri: string }>();
  // Persist last playback state (best-effort) so newcomers can align state
  const roomPlaybackState = new Map<string, { action: 'play' | 'pause' | 'seek'; currentTime: number }>();

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
            const { roomId, username } = message.data;
            console.log(`🚪 Join room request:`, { roomId, username });
            
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
            const user = await storage.createUser({ username, roomId, isHost: false });

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

            // Send current room state to new user
            const users = await storage.getUsersByRoom(roomId);
            const messages = await storage.getMessagesByRoom(roomId);
            const videos = await storage.getVideosByRoom(roomId);

            socket.send(JSON.stringify({
              type: "room_state",
              data: { room, users, messages, videos }
            }));

            // If there is an active selection in this room, inform the newcomer
            const selection = roomCurrentSelection.get(roomId);
            if (selection) {
              socket.send(JSON.stringify({
                type: "video_selected",
                data: { videoId: selection.videoId, magnetUri: selection.magnetUri }
              }));
            }

            // Also send last known playback state (best-effort)
            const playback = roomPlaybackState.get(roomId);
            if (playback) {
              socket.send(JSON.stringify({
                type: "video_sync",
                data: { action: playback.action, currentTime: playback.currentTime, roomId }
              }));
            }

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
            if (socket.roomId) {
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

          case "video_upload":
          case "video_share":
            if (socket.userId && socket.roomId) {
              // Deduplicate by (roomId, infoHash)
              const roomId = message.data.roomId;
              const infoHash = message.data.infoHash;
              const existing = (await storage.getVideosByRoom(roomId)).find(v => v.infoHash === infoHash);

              let video;
              if (existing) {
                video = existing;
                // Optionally, we could update name/magnet if changed; keep first seen stable for now
                // Do not broadcast a new item to avoid duplicates on clients
              } else {
                video = await storage.createVideo({
                  name: message.data.name,
                  magnetUri: message.data.magnetUri,
                  infoHash: message.data.infoHash,
                  size: message.data.size,
                  roomId: roomId,
                  uploadedBy: socket.userId,
                });

                broadcastToRoom(roomId, {
                  type: "new_video",
                  data: { video }
                });
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
