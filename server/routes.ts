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
            
            // Verify room exists
            const room = await storage.getRoom(roomId);
            if (!room) {
              socket.send(JSON.stringify({ type: "error", message: "Room not found" }));
              return;
            }

            // Create user
            const user = await storage.createUser({
              username,
              roomId,
              isHost: false,
            });

            socket.userId = user.id;
            socket.roomId = roomId;

            // Add to room connections
            if (!roomConnections.has(roomId)) {
              roomConnections.set(roomId, new Set());
            }
            roomConnections.get(roomId)!.add(socket);

            // Broadcast user joined
            broadcastToRoom(roomId, {
              type: "user_joined",
              data: { user }
            });

            // Send current room state to new user
            const users = await storage.getUsersByRoom(roomId);
            const messages = await storage.getMessagesByRoom(roomId);
            const videos = await storage.getVideosByRoom(roomId);

            socket.send(JSON.stringify({
              type: "room_state",
              data: { room, users, messages, videos }
            }));

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
              broadcastToRoom(socket.roomId, {
                type: "video_sync",
                data: message.data
              }, socket);
            }
            break;

          case "video_upload":
            if (socket.userId && socket.roomId) {
              const video = await storage.createVideo({
                name: message.data.name,
                magnetUri: message.data.magnetUri,
                infoHash: message.data.infoHash,
                size: message.data.size,
                roomId: message.data.roomId,
                uploadedBy: socket.userId,
              });

              broadcastToRoom(message.data.roomId, {
                type: "new_video",
                data: { video }
              });
            }
            break;

          case "video_select":
            if (socket.roomId) {
              broadcastToRoom(message.data.roomId, {
                type: "video_selected",
                data: {
                  videoId: message.data.videoId,
                  magnetUri: message.data.magnetUri
                }
              });
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
