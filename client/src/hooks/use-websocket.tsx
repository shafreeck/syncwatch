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

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);
        setSocket(null);
        
        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          setTimeout(() => {
            console.log(`Reconnecting... (${reconnectAttempts.current}/${maxReconnectAttempts})`);
            connect();
          }, 2000 * reconnectAttempts.current);
        } else {
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
        setVideos(prev => [message.data.video, ...prev]);
        break;

      case "video_sync":
        // Handle video synchronization
        console.log("Video sync:", message.data);
        break;

      case "video_selected":
        // Handle video selection
        console.log("Video selected:", message.data);
        const selectedVideo = videos.find(v => v.id === message.data.videoId);
        if (selectedVideo) {
          setCurrentVideo(selectedVideo);
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
    // This would normally create a torrent and get magnet URI
    // For now, we'll create a mock video entry
    if (room) {
      const mockMagnetUri = `magnet:?xt=urn:btih:${Math.random().toString(36).substring(7)}`;
      const mockInfoHash = Math.random().toString(36).substring(7);
      
      sendMessage("video_upload", {
        name: file.name,
        magnetUri: mockMagnetUri,
        infoHash: mockInfoHash,
        size: file.size.toString(),
        roomId: room.id,
      });
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
