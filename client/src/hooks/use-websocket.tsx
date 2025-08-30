import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

interface Room {
  id: string;
  name: string;
  hostId: string;
  isActive: boolean;
}

interface User {
  id: string;
  username: string;
  isHost: boolean;
  joinedAt: Date;
}

interface Message {
  id: string;
  content: string;
  userId: string;
  timestamp: Date;
  user?: User;
}

interface Video {
  id: string;
  name: string;
  magnetUri?: string;
  infoHash?: string;
  size?: string;
  uploadedAt: Date;
}

export function useWebSocket() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const { toast } = useToast();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        setSocket(ws);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      ws.onclose = (event) => {
        console.log("WebSocket disconnected", event.code, event.reason);
        setIsConnected(false);
        setSocket(null);
        
        // Only attempt to reconnect for unexpected closures, not normal ones
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          setTimeout(() => {
            console.log(`Reconnecting... (${reconnectAttempts.current}/${maxReconnectAttempts})`);
            connect();
          }, 2000 * reconnectAttempts.current);
        } else if (event.code !== 1000) {
          toast({
            title: "Connection lost",
            description: "Failed to reconnect to the server",
            variant: "destructive",
          });
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        toast({
          title: "Connection error",
          description: "Failed to connect to the server",
          variant: "destructive",
        });
      };

    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
    }
  }, [toast]);

  const handleMessage = (message: any) => {
    switch (message.type) {
      case "room_state":
        setRoom(message.data.room);
        setUsers(message.data.users);
        setMessages(message.data.messages);
        setVideos(message.data.videos);
        break;

      case "user_joined":
        setUsers(prev => [...prev, message.data.user]);
        break;

      case "user_left":
        setUsers(prev => prev.filter(user => user.id !== message.data.userId));
        break;

      case "new_message":
        setMessages(prev => [...prev, message.data]);
        break;

      case "new_video":
        console.log("Received new video:", message.data.video);
        setVideos(prev => [message.data.video, ...prev]);
        toast({
          title: "Video uploaded",
          description: `${message.data.video.name} is ready for streaming`,
        });
        break;

      case "video_sync":
        // Handle video synchronization
        console.log("Video sync:", message.data);
        break;

      case "video_selected":
        // Handle video selection
        console.log("Video selected message received:", message.data);
        console.log("Current videos in state:", videos);
        const selectedVideo = videos.find(v => v.id === message.data.videoId);
        if (selectedVideo) {
          setCurrentVideo(selectedVideo);
          console.log("Setting current video from videos list:", selectedVideo);
        } else {
          // If video not found in current videos list, create it from message data
          const videoFromMessage = {
            id: message.data.videoId,
            magnetUri: message.data.magnetUri,
            name: "Selected Video",
            size: undefined,
            infoHash: undefined,
            roomId: room?.id || "",
            uploadedBy: "",
            uploadedAt: new Date()
          };
          setCurrentVideo(videoFromMessage);
          console.log("Setting current video from message data:", videoFromMessage);
        }
        break;

      case "error":
        toast({
          title: "Error",
          description: message.message,
          variant: "destructive",
        });
        break;

      default:
        console.log("Unknown message type:", message.type);
    }
  };

  const sendMessage = useCallback((type: string, data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, data }));
    } else {
      console.error("WebSocket not connected");
    }
  }, [socket]);

  const joinRoom = useCallback(async (roomId: string, username: string) => {
    sendMessage("join_room", { roomId, username });
  }, [sendMessage]);

  const leaveRoom = useCallback(() => {
    if (room) {
      sendMessage("leave_room", { roomId: room.id });
    }
  }, [sendMessage, room]);

  const sendChatMessage = useCallback((content: string) => {
    if (room) {
      sendMessage("chat_message", { content, roomId: room.id });
    }
  }, [sendMessage, room]);

  const syncVideo = useCallback((action: string, currentTime: number) => {
    if (room) {
      sendMessage("video_sync", { action, currentTime, roomId: room.id });
    }
  }, [sendMessage, room]);

  const uploadVideo = useCallback(async (file: File) => {
    if (!room) {
      console.error("No room available for upload");
      return;
    }
    
    console.log("Starting P2P video sharing for:", file.name);
    
    try {
      // Dynamically import WebTorrent for P2P functionality
      const WebTorrent = (await import('webtorrent')).default;
      const client = new WebTorrent();
      
      console.log("Creating torrent from file...");
      
      // Create torrent from the file
      client.seed(file, (torrent: any) => {
        console.log("Torrent created:", {
          magnetURI: torrent.magnetURI,
          infoHash: torrent.infoHash,
          name: file.name,
          length: torrent.length
        });
        
        // Send torrent info to room via WebSocket
        sendMessage("video_upload", {
          name: file.name,
          magnetUri: torrent.magnetURI,
          infoHash: torrent.infoHash,
          size: torrent.length.toString(),
          roomId: room.id,
        });
        
        console.log("Video is now being seeded and shared via P2P");
      });
      
    } catch (error) {
      console.error("Failed to create P2P torrent:", error);
      throw error;
    }
  }, [sendMessage, room]);

  useEffect(() => {
    connect();
    
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [connect]);

  const sendWSMessage = useCallback((type: string, data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, data }));
    } else {
      console.error("WebSocket not connected");
    }
  }, [socket]);

  return {
    isConnected,
    room,
    users,
    messages,
    videos,
    currentVideo,
    joinRoom,
    leaveRoom,
    sendMessage: sendChatMessage,
    sendWSMessage,
    syncVideo,
    uploadVideo,
  };
}
