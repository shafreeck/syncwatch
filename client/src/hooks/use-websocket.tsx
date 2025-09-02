import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { saveSeedHandle } from '@/lib/seed-store';

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

export function useWebSocket(registerTorrent?: (torrent: any) => void) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [lastSync, setLastSync] = useState<{ action: 'play'|'pause'|'seek'; currentTime: number; roomId: string; at: number } | null>(null);
  const { toast } = useToast();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  // Always call the latest message handler from ws.onmessage to avoid stale closures
  const handleMessageRef = useRef<(message: any) => void>();

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
          if (handleMessageRef.current) {
            handleMessageRef.current(message);
          }
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

  const handleMessage = useCallback((message: any) => {
    console.log('Received WebSocket message:', message.type, message.data);
    switch (message.type) {
      case "room_state":
        console.log('Setting room state:', {
          room: message.data.room,
          users: message.data.users?.length,
          messages: message.data.messages?.length,
          videos: message.data.videos?.length,
          videosData: message.data.videos
        });
        setRoom(message.data.room);
        setUsers(message.data.users || []);
        setMessages(message.data.messages || []);
        setVideos(message.data.videos || []);
        console.log('✓ Videos state updated:', message.data.videos);
        break;

      case "user_joined":
        setUsers(prev => {
          const u: User = message.data.user;
          const exists = prev.some(x => x.id === u.id);
          return exists ? prev.map(x => (x.id === u.id ? u : x)) : [...prev, u];
        });
        break;

      case "user_left":
        setUsers(prev => prev.filter(user => user.id !== message.data.userId));
        break;

      case "new_message":
        setMessages(prev => [...prev, message.data]);
        break;

      case "new_video":
        console.log("Received new video:", message.data.video);
        setVideos(prev => {
          const v = message.data.video as any;
          // Deduplicate by infoHash (fallback to id)
          const existsIdx = prev.findIndex(x => (x as any).infoHash && v.infoHash ? (x as any).infoHash === v.infoHash : x.id === v.id);
          let newList: any[];
          if (existsIdx >= 0) {
            newList = [...prev];
            newList[existsIdx] = { ...prev[existsIdx], ...v };
          } else {
            newList = [v, ...prev];
          }
          console.log('✓ Videos list updated, new count:', newList.length);
          return newList as any;
        });
        toast({
          title: "Video added",
          description: "Seeding started. Click Select to start streaming.",
        });
        break;

      case "video_deleted":
        console.log(`🗑️ Received video_deleted message:`, message.data);
        setVideos(prev => {
          console.log(`📝 Before delete - videos:`, prev.length);
          const newVideos = prev.filter(v => v.id !== message.data.videoId);
          console.log(`📝 After delete - videos:`, newVideos.length);
          return newVideos;
        });
        // If the current playing video is deleted, clear it
        setCurrentVideo(prev => (prev && prev.id === message.data.videoId ? null : prev));
        toast({
          title: "Video deleted",
          description: "The video has been removed from the room",
        });
        break;

      case "video_sync":
        // Handle video synchronization
        console.log("Video sync:", message.data);
        try {
          const { action, currentTime, roomId } = message.data || {};
          if (action && typeof currentTime === 'number') {
            setLastSync({ action, currentTime, roomId, at: Date.now() });
          }
        } catch {}
        break;

      case "video_selected":
        // Handle video selection - always set a fresh object to force re-load
        console.log("Video selected message received:", message.data);
        console.log("Current videos in state:", videos);
        {
          const selectedVideo = videos.find(v => v.id === message.data.videoId);
          if (selectedVideo) {
            const fresh = { ...selectedVideo };
            setCurrentVideo(fresh);
            console.log("Setting current video from videos list:", fresh);
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
  }, [currentVideo, videos, room, toast]);

  // Keep a ref of the latest handler so ws.onmessage always calls up-to-date logic
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  const sendMessage = useCallback((type: string, data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, data }));
    } else {
      console.error("WebSocket not connected");
    }
  }, [socket]);

  const sendWSMessage = useCallback((type: string, data: any) => {
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

  const shareVideo = useCallback(async (file: File, onProgress?: (progress: number) => void, handle?: any) => {
    console.log('Share attempt - room state:', room);
    if (!room) {
      console.error("No room available for share - room state:", room);
      toast({
        title: "Not in a room",
        description: "Please join a room before sharing videos",
        variant: "destructive",
      });
      return;
    }
    
    console.log("Starting P2P video sharing for:", file.name);
    
    try {
      // Use the same simplest logic as the test page (official tutorial) via centralized loader
      const getWebTorrent = (await import('@/lib/wt-esm')).default;
      const WebTorrent = await getWebTorrent();
      const client = new WebTorrent();

      // For seeding, we don't need to start the BrowserServer.
      // Avoid creating a second server instance that can race and reply 404s.
      // Keep SW registration minimal to speed up control for other views.
      await navigator.serviceWorker.register('/sw.min.js', { scope: '/' }).catch(() => {});
      
      console.log("Creating torrent from file...");
      // Give immediate feedback that we started preparing
      try { onProgress?.(1); } catch {}
      
      // Create torrent from the file
      client.seed(file, async (torrent: any) => {
        console.log("Torrent created:", {
          magnetURI: torrent.magnetURI,
          infoHash: torrent.infoHash,
          name: file.name,
          length: torrent.length
        });
        
        // Set up progress tracking for seeding
        if (onProgress) {
          console.log("📊 Tracking seeding readiness...");
          // Show quick feedback for preparation
          onProgress(10);
          const markReady = () => {
            onProgress(100);
            console.log("🎯 Torrent ready for seeding (progress 100%)");
          };
          if (torrent.ready) {
            markReady();
          } else {
            torrent.on('ready', markReady);
          }
        }
        
        // Send torrent info to room via WebSocket
        sendWSMessage("video_share", {
          name: file.name,
          magnetUri: torrent.magnetURI,
          infoHash: torrent.infoHash,
          size: torrent.length.toString(),
          roomId: room.id,
        });

        // Persist file handle to re-seed after refresh (when available)
        try {
          if (handle && torrent?.infoHash) {
            await saveSeedHandle({ infoHash: torrent.infoHash, roomId: room.id, name: file.name, handle });
            console.log('Saved seed handle for auto re-seed:', torrent.infoHash);
          }
        } catch (e) {
          console.warn('Failed saving seed handle:', e);
        }
        
        // Register torrent for P2P statistics if available
        if (registerTorrent) {
          console.log("📊 Registering torrent for P2P statistics tracking");
          registerTorrent(torrent);
        }
        
        console.log("Video is now being seeded and shared via P2P");
      });
      
    } catch (error) {
      console.error("Failed to create P2P torrent:", error);
      throw error;
    }
  }, [sendWSMessage, room]);

  useEffect(() => {
    connect();
    
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    room,
    users,
    messages,
    videos,
    currentVideo,
    lastSync,
    joinRoom,
    leaveRoom,
    sendMessage: sendChatMessage,
    sendWSMessage,
    syncVideo,
    shareVideo,
  };
}
