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

export function useWebSocket(registerTorrent?: (torrent: any) => void, globalWebTorrentClient?: any, clearCurrentVideo?: () => void) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [lastSync, setLastSync] = useState<{ action: 'play' | 'pause' | 'seek'; currentTime: number; roomId: string; at: number } | null>(null);
  const [userProgresses, setUserProgresses] = useState<Record<string, { currentTime: number; isPlaying: boolean; lastUpdate: number }>>({});
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [hostUser, setHostUser] = useState<User | null>(null); // New state for host user
  const [hostOnlyControl, setHostOnlyControl] = useState(false); // Host-only control setting
  const [roomStateProcessed, setRoomStateProcessed] = useState(false); // Track if room state has been processed
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
        console.log('🎬 Setting room state:', {
          room: message.data.room,
          users: message.data.users?.length,
          messages: message.data.messages?.length,
          videos: message.data.videos?.length,
          videosData: message.data.videos,
          currentVideo: message.data.currentVideo,
          currentPlayback: message.data.currentPlayback
        });
        setRoom(message.data.room);
        const users = message.data.users || [];
        setUsers(users);
        setMessages(message.data.messages || []);
        setVideos(message.data.videos || []);
        console.log('✓ Videos state updated:', message.data.videos);

        // Set current video if provided
        if (message.data.currentVideo) {
          setCurrentVideo(message.data.currentVideo);
          console.log('🎬 Setting current video from room_state:', message.data.currentVideo);
        }

        // Set last sync state if provided
        if (message.data.currentPlayback) {
          const { action, currentTime } = message.data.currentPlayback;
          const newSyncState = { action, currentTime, roomId: message.data.room.id, at: Date.now() };
          setLastSync(newSyncState);
          console.log('🎬 Setting lastSync from room_state:', newSyncState);
        }

        // Set the hostUser state
        const host = users.find((u: User) => u.isHost);
        if (host) {
          setHostUser(host);
        }

        // Find current user by username if we have a temp current user
        if (currentUser && (!currentUser.id || currentUser.id === '') && users.length > 0) {
          const foundUser = users.find((u: User) => u.username === currentUser.username);
          if (foundUser) {
            setCurrentUser(foundUser);
          }
        }

        // Mark room state as processed
        setRoomStateProcessed(true);
        break;

      case "user_joined":
        setUsers(prev => {
          const u: User = message.data.user;
          const exists = prev.some(x => x.id === u.id);
          const newUsers = exists ? prev.map(x => (x.id === u.id ? u : x)) : [...prev, u];

          // Check if this is the current user joining by matching username
          if (currentUser && !currentUser.id && u.username === currentUser.username) {
            setCurrentUser(u);
          }

          // Update hostUser if the new user is the host
          if (u.isHost) {
            setHostUser(u);
          }

          return newUsers;
        });
        break;

      case "user_left":
        setUsers(prev => {
          const newUsers = prev.filter(user => user.id !== message.data.userId);
          // If the host left, update the hostUser state
          setHostUser(prevHostUser => {
            if (prevHostUser && prevHostUser.id === message.data.userId) {
              // Find the new host (if any)
              const newHost = newUsers.find(user => user.isHost);
              return newHost || null;
            }
            return prevHostUser;
          });
          return newUsers;
        });
        break;

      case "new_message":
        setMessages(prev => [...prev, message.data]);
        break;

      case "new_video":
        console.log("Received new video:", message.data.video);
        setVideos(prev => {
          const v = message.data.video as any;

          // Remove pending magnet placeholder if this matches the pending tempId
          const pendingTempId = (window as any).__pendingMagnetTempId;
          let newList = prev;
          
          if (pendingTempId && v.infoHash) {
            console.log("🔄 Removing magnet placeholder:", pendingTempId);
            newList = prev.filter(video => video.id !== pendingTempId);
            // Clear the pending tempId
            delete (window as any).__pendingMagnetTempId;
          }

          // Deduplicate by infoHash (fallback to id)
          const existsIdx = newList.findIndex(x => (x as any).infoHash && v.infoHash ? (x as any).infoHash === v.infoHash : x.id === v.id);
          if (existsIdx >= 0) {
            newList = [...newList];
            newList[existsIdx] = { ...newList[existsIdx], ...v };
          } else {
            newList = [v, ...newList];
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
        setCurrentVideo(prev => {
          if (prev && prev.id === message.data.videoId) {
            // **ENHANCED CLEANUP**: Also clean up WebTorrent resources
            if (typeof clearCurrentVideo === 'function') {
              console.log("🧹 Triggering WebTorrent cleanup for deleted video");
              clearCurrentVideo();
            }
            return null;
          }
          return prev;
        });
        toast({
          title: "Video deleted",
          description: "The video has been removed from the room",
        });
        break;

      case "video_sync":
        // Handle video synchronization
        console.log("🎬 Video sync received:", message.data);
        try {
          const { action, currentTime, roomId } = message.data || {};
          if (action && typeof currentTime === 'number') {
            const newSyncState = { action, currentTime, roomId, at: Date.now() };
            console.log("🎬 Setting lastSync state:", newSyncState);
            setLastSync(newSyncState);
          }
        } catch (error) {
          console.error("❌ Error handling video_sync:", error);
        }
        break;

      case "user_progress":
        // Handle individual user progress updates
        try {
          const { userId, currentTime, isPlaying } = message.data || {};
          if (userId && typeof currentTime === 'number') {
            setUserProgresses(prev => ({
              ...prev,
              [userId]: {
                currentTime,
                isPlaying: !!isPlaying,
                lastUpdate: Date.now()
              }
            }));
          }
        } catch { }
        break;

      case "video_selected":
        // Handle video selection - always set a fresh object to force re-load
        console.log("🎬 Video selected message received:", message.data);
        console.log("Current videos in state:", videos);
        {
          const selectedVideo = videos.find(v => v.id === message.data.videoId);
          if (selectedVideo) {
            const fresh = { ...selectedVideo };
            setCurrentVideo(fresh);
            console.log("🎬 Setting current video from videos list:", fresh);
          } else {
            // If video not found in current videos list, create it from message data
            // Extract infoHash from magnetUri if available
            const magnetUri = message.data.magnetUri || "";
            const infoHashMatch = magnetUri.match(/xt=urn:btih:([a-f0-9]{40})/i);
            const extractedInfoHash = infoHashMatch ? infoHashMatch[1] : undefined;

            const videoFromMessage = {
              id: message.data.videoId,
              magnetUri: magnetUri,
              name: message.data.name || "Selected Video",
              size: message.data.size,
              infoHash: message.data.infoHash || extractedInfoHash,
              roomId: room?.id || "",
              uploadedBy: message.data.uploadedBy || "",
              uploadedAt: new Date()
            };
            setCurrentVideo(videoFromMessage);
            console.log("🎬 Setting current video from message data:", videoFromMessage);
          }
        }
        break;

      case "video_status_updated":
        // Handle video status updates (processing -> ready -> error)
        console.log("Video status update received:", message.data);
        {
          const { videoId, name, status, processingStep, size, infoHash, magnetUri } = message.data || {};
          console.log(`🔄 Updating video ${videoId} with:`, { name, magnetUri, infoHash, size });
          setVideos(prev => prev.map(video =>
            video.id === videoId
              ? {
                ...video,
                ...(name && { name }),
                ...(magnetUri && { magnetUri }),
                ...(infoHash && { infoHash }),
                ...(size && { size }),
                ...(status !== undefined && { status: status || 'ready' }),
                processingStep, // Always update, even if undefined to clear it
              }
              : video
          ));
        }
        break;

      case "error":
        toast({
          title: "Error",
          description: message.message,
          variant: "destructive",
        });
        break;

      case "host_info":
        // Handle host information
        console.log("Host info received:", message.data);
        setHostUser(message.data);
        // Update users list to mark the host
        setUsers(prev => prev.map(user => ({
          ...user,
          isHost: user.id === message.data.id
        })));
        break;

      case "host_only_control_updated":
        // Handle host-only control setting update
        console.log("Host-only control setting updated:", message.data);
        setHostOnlyControl(message.data.hostOnlyControl);
        break;

      default:
        console.log("Unknown message type:", message.type);
    }
  }, [currentVideo, videos, room, currentUser, toast]);

  // Keep a ref of the latest handler so ws.onmessage always calls up-to-date logic
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  // Check for current video selection after room state is processed
  useEffect(() => {
    if (roomStateProcessed && room && videos.length > 0) {
      // Check if there's a current selection for this room
      // This would require a way to track the current selection on the client side
      // For now, we'll just log that we've processed the room state
      console.log('Room state processed, videos available:', videos.length);
    }
  }, [roomStateProcessed, room, videos]);

  const sendMessage = useCallback((type: string, data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, data }));
    } else {
      console.error("WebSocket not connected");
    }
  }, [socket]);

  const sendWSMessage = useCallback((type: string, data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      // **CRITICAL**: For video_share messages, ensure user is properly joined
      if (type === "video_share" && (!currentUser || !room)) {
        console.error("❌ Cannot send video_share: User not properly joined to room", {
          currentUser: currentUser?.id || 'null',
          room: room?.id || 'null',
          type
        });
        return;
      }

      // Automatically add userId and roomId for relevant message types
      const messageData = {
        type,
        data,
        ...(currentUser && { userId: currentUser.id }),
        ...(room && { roomId: room.id })
      };

      socket.send(JSON.stringify(messageData));
    } else {
      console.error("WebSocket not connected");
    }
  }, [socket, currentUser, room]);

  const joinRoom = useCallback(async (roomId: string, username: string) => {
    console.log(`🚪 Joining room via WebSocket:`, { roomId, username });

    // Get or create persistent user ID for this browser/username combination
    const persistentUserIdKey = `syncwatch:userId:${username}`;
    let persistentUserId = localStorage.getItem(persistentUserIdKey);

    if (!persistentUserId) {
      // Generate new persistent ID for this username on this browser
      persistentUserId = crypto.randomUUID();
      localStorage.setItem(persistentUserIdKey, persistentUserId);
      console.log(`🆔 Generated new persistent user ID for ${username}: ${persistentUserId}`);
    } else {
      console.log(`🔄 Using existing persistent user ID for ${username}: ${persistentUserId}`);
    }

    // Store the username with persistent ID to identify current user when room state is received
    setCurrentUser({ id: persistentUserId, username, isHost: false, joinedAt: new Date() } as User);
    sendMessage("join_room", { roomId, username, persistentUserId });
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
    if (room && currentUser) {
      // Check if host-only control is enabled
      const isHost = currentUser.isHost;
      
      // If host-only control is enabled and user is not host, don't send sync message
      if (hostOnlyControl && !isHost) {
        console.log("Host-only control is enabled. Only host can control playback.");
        return;
      }
      
      sendMessage("video_sync", { action, currentTime, roomId: room.id });
    }
  }, [sendMessage, room, currentUser, hostOnlyControl]);

  // New function to send periodic user progress updates (visualization only)
  const sendUserProgress = useCallback((currentTime: number, isPlaying: boolean) => {
    if (room && currentUser && currentUser.id) {
      // Update local state immediately
      setUserProgresses(prev => ({
        ...prev,
        [currentUser.id]: {
          currentTime,
          isPlaying,
          lastUpdate: Date.now()
        }
      }));

      // Send to other users - does NOT affect video playback control
      sendMessage("user_progress", { currentTime, isPlaying, roomId: room.id });
    }
  }, [sendMessage, room, currentUser]);

  // Function to sync to host progress (for catching up)
  const syncToHost = useCallback((targetTime: number) => {
    if (room) {
      // This DOES affect video playback - for manual sync
      sendMessage("video_sync", { action: "seek", currentTime: targetTime, roomId: room.id });
    }
  }, [sendMessage, room]);

  const shareVideo = useCallback(async (file: File, onProgress?: (progress: number) => void, handle?: any) => {
    console.log('Share attempt - room state:', room);

    // Get room ID from either state or URL
    const currentPath = window.location.pathname;
    const roomIdMatch = currentPath.match(/\/room\/([^/]+)/);
    const currentRoomId = room?.id || roomIdMatch?.[1];

    if (!room && !currentRoomId) {
      console.error("No room available for share - room state:", room);
      toast({
        title: "Not in a room",
        description: "Please join a room before sharing videos",
        variant: "destructive",
      });
      return;
    }

    if (!room && currentRoomId && isConnected) {
      console.log("🔄 Room state not loaded yet, waiting briefly...");
      toast({
        title: "Please wait",
        description: "Connecting to room...",
      });

      // Wait a moment for room state to load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check again - if still no room state, continue with roomId from URL
      if (!room && !currentRoomId) {
        toast({
          title: "Connection issue",
          description: "Please refresh and try again",
          variant: "destructive",
        });
        return;
      }
    }

    console.log("Starting P2P video sharing for:", file.name);

    // **INSTANT FEEDBACK**: Create video entry immediately with ready status
    // Since user already selected the file, it's ready to be processed
    const tempMagnetUri = `temp-magnet-${Date.now()}`;

    // Send video immediately as ready (file is selected, just needs torrent creation)
    sendWSMessage("video_share", {
      name: file.name,
      magnetUri: tempMagnetUri, // Temporary URI, will be updated
      infoHash: `temp-${Date.now()}`, // Temporary hash
      size: file.size.toString(),
      roomId: currentRoomId,
      status: "ready", // File is ready, just creating torrent in background
      processingStep: undefined,
      sourceType: "local_file"
    });

    try {
      // Use the same simplest logic as the test page (official tutorial) via centralized loader
      const getWebTorrent = (await import('@/lib/wt-esm')).default;
      const WebTorrent = await getWebTorrent();
      const client = new WebTorrent();

      // For seeding, we don't need to start the BrowserServer.
      // Avoid creating a second server instance that can race and reply 404s.
      // Service Worker already registered in main.tsx

      console.log("Creating torrent from file...");
      // Give immediate feedback that we started preparing
      try { onProgress?.(1); } catch { }

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

        // Update video with real torrent data (keep status as ready)
        if (!currentRoomId) {
          console.error("No room ID available for video share");
          return;
        }

        // **UPDATE**: Replace temporary data with real torrent info
        // Find the video by temporary magnet URI and update it
        setTimeout(() => {
          sendWSMessage("video_status_update", {
            videoId: tempMagnetUri, // Use temp magnet as identifier
            size: torrent.length.toString(),
            infoHash: torrent.infoHash,
            magnetUri: torrent.magnetURI
            // Don't change status - it's already ready
          });
        }, 100);

        // Persist file handle to re-seed after refresh (when available)
        try {
          if (handle && torrent?.infoHash && currentRoomId) {
            await saveSeedHandle({ infoHash: torrent.infoHash, roomId: currentRoomId, name: file.name, handle });
            console.log('✅ Saved seed handle for auto re-seed:', torrent.infoHash);
          } else {
            if (!handle) {
              console.log('⚠️ No file handle available - auto re-seed after refresh not possible');
            } else if (!torrent?.infoHash) {
              console.log('⚠️ No torrent infoHash - cannot save seed handle');
            } else if (!currentRoomId) {
              console.log('⚠️ No room ID - cannot save seed handle');
            }
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

  const shareTorrentFile = useCallback(async (torrentFile: File) => {
    console.log('Torrent file share attempt - room state:', room);

    // Get room ID from either state or URL
    const currentPath = window.location.pathname;
    const roomIdMatch = currentPath.match(/\/room\/([^/]+)/);
    const currentRoomId = room?.id || roomIdMatch?.[1];

    if (!room && !currentRoomId) {
      console.error("No room available for torrent share - room state:", room);
      toast({
        title: "Not in a room",
        description: "Please join a room before sharing torrents",
        variant: "destructive",
      });
      return;
    }

    console.log("Starting P2P torrent file sharing for:", torrentFile.name);

    // **CRITICAL FIX**: Use the global WebTorrent client instead of creating a new one
    if (!globalWebTorrentClient) {
      console.error("❌ Global WebTorrent client not available for torrent file");
      toast({
        title: "Client not ready",
        description: "Please wait for WebTorrent to initialize",
        variant: "destructive",
      });
      return;
    }

    const client = globalWebTorrentClient;
    console.log("✅ Using global WebTorrent client for torrent file (preventing duplicate instances)");

    try {
      // Service Worker already registered in main.tsx

      console.log("Loading torrent file...");
      
      // Add timeout for torrent parsing 
      const parseTimeout = setTimeout(() => {
        console.warn("⏰ Torrent file parsing timeout - this may indicate file corruption or incompatibility");
        toast({
          title: "Parsing timeout",
          description: "The torrent file is taking too long to parse. It may be corrupted or incompatible.",
          variant: "destructive",
        });
      }, 15000);
      
      try {
        // Use the original File object directly - WebTorrent can handle it natively
        console.log("🔍 Adding torrent file directly to client...");
        console.log("File details:", { 
          name: torrentFile.name, 
          size: torrentFile.size, 
          type: torrentFile.type 
        });
        
        const torrentObj = client.add(torrentFile, {}, (torrent: any) => {
          clearTimeout(parseTimeout);
        console.log("Torrent loaded:", {
          magnetURI: torrent.magnetURI,
          infoHash: torrent.infoHash,
          name: torrent.name,
          length: torrent.length
        });

        // Find video file in torrent
        const videoFile = torrent.files.find((file: any) =>
          file.name.match(/\.(mp4|webm|ogg|avi|mov|mkv)$/i)
        );

        if (!videoFile) {
          toast({
            title: "No video found",
            description: "This torrent doesn't contain any video files",
            variant: "destructive",
          });
          return;
        }

        // Send torrent info to room via WebSocket
        if (!currentRoomId) {
          console.error("No room ID available for torrent share");
          return;
        }

        console.log("🔔 Sending video_share message for torrent file:", {
          name: videoFile.name,
          magnetUri: torrent.magnetURI,
          infoHash: torrent.infoHash,
          size: torrent.length.toString(),
          roomId: currentRoomId,
        });

        try {
          sendWSMessage("video_share", {
            name: videoFile.name,
            magnetUri: torrent.magnetURI,
            infoHash: torrent.infoHash,
            size: torrent.length.toString(),
            roomId: currentRoomId,
            sourceType: "torrent_file",
          });

          // Register torrent for P2P statistics if available
          if (registerTorrent) {
            console.log("📊 Registering torrent for P2P statistics tracking");
            registerTorrent(torrent);
          }

          console.log("✅ Torrent file info sent - video will appear in room list");
          toast({
            title: "Torrent loaded",
            description: `${videoFile.name} is now available for streaming`,
          });
        } catch (error) {
          console.error("Failed to send torrent video_share message:", error);
          toast({
            title: "Failed to share torrent",
            description: "Could not send torrent information to the room. Please try again.",
            variant: "destructive",
          });
        }
        });
        
        // Handle add torrent errors with detailed logging
        torrentObj.on('error', (torrentError: any) => {
          clearTimeout(parseTimeout);
          console.error('Torrent parsing error:', {
            error: torrentError,
            message: torrentError?.message,
            stack: torrentError?.stack,
            name: torrentError?.name
          });
          const errorMsg = torrentError?.message || "Could not parse torrent file";
          toast({
            title: "Torrent parsing failed", 
            description: errorMsg,
            variant: "destructive",
          });
        });
        
      } catch (addError) {
        clearTimeout(parseTimeout);
        console.error("Failed to add torrent to client:", addError);
        toast({
          title: "Failed to add torrent",
          description: "Could not add torrent file to WebTorrent client",
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error("Failed to load torrent file:", error);
      toast({
        title: "Torrent load failed",
        description: "Failed to load torrent file. Please check the file and try again.",
        variant: "destructive",
      });
      throw error;
    }
  }, [sendWSMessage, room, toast, registerTorrent, globalWebTorrentClient]);

  const shareMagnetLink = useCallback(async (magnetUri: string) => {
    console.log('🧲 Magnet link share using GLOBAL client (no duplicates)');

    // Get room ID from either state or URL
    const currentPath = window.location.pathname;
    const roomIdMatch = currentPath.match(/\/room\/([^/]+)/);
    const currentRoomId = room?.id || roomIdMatch?.[1];

    if (!room && !currentRoomId) {
      console.error("No room available for magnet share - room state:", room);
      toast({
        title: "Not in a room",
        description: "Please join a room before sharing magnet links",
        variant: "destructive",
      });
      return;
    }

    // **NEW APPROACH**: Create UI-only placeholder, no persistence
    const tempId = `temp-magnet-${Date.now()}`;
    const placeholderName = 'Loading...';

    // Add temporary placeholder to UI state only
    setVideos(prev => [...prev, {
      id: tempId,
      name: placeholderName,
      magnetUri: '',
      infoHash: '',
      size: '0',
      roomId: currentRoomId || '',
      uploadedBy: '',
      uploadedAt: new Date(),
      status: 'processing',
      processingStep: 'Loading magnet...'
    }]);

    // **CRITICAL FIX**: Use the global WebTorrent client instead of creating a new one
    if (!globalWebTorrentClient) {
      console.error("❌ Global WebTorrent client not available");
      toast({
        title: "Client not ready",
        description: "Please wait for WebTorrent to initialize",
        variant: "destructive",
      });
      return;
    }

    const client = globalWebTorrentClient;
    console.log("✅ Using global WebTorrent client (preventing duplicate instances)");

    try {
      // Service Worker already registered in main.tsx

      console.log("Loading magnet link...");

      // Users can see the loading state in the video list

      client.on('error', (err: any) => {
        console.error('WebTorrent client error:', err);
        toast({
          title: "Magnet link error",
          description: "This magnet link is not compatible with WebTorrent. Try using WebTorrent-optimized sources.",
          variant: "destructive",
        });
      });

      // Add timeout for magnet link loading
      const loadingTimeout = setTimeout(() => {
        console.warn("⏰ Magnet link loading timeout (30s) - this may be normal for P2P networks");
        toast({
          title: "Magnet loading slow",
          description: "This magnet link is taking longer than usual. Check if it has active seeders.",
          variant: "default",
        });
      }, 30000);

      // Add magnet URI to client - use simple approach
      console.log("🔗 Adding magnet URI to WebTorrent client...");
      console.log("📝 Magnet URI:", magnetUri);

      // **CORRECT LOGIC**: Use callback to get metadata, then rely on existing streamTo logic
      const torrent = client.add(magnetUri, (torrent: any) => {
        // Clear the timeout since we successfully got metadata
        clearTimeout(loadingTimeout);

        console.log("🎉 Magnet metadata ready! Now we have real video info:");
        console.log("📁 Video details:", {
          name: torrent.name,
          length: torrent.length,
          infoHash: torrent.infoHash,
          files: torrent.files?.length
        });

        // Find video file
        const videoFile = torrent.files.find((file: any) =>
          file.name.match(/\.(mp4|webm|ogg|avi|mov|mkv)$/i)
        );

        if (videoFile && currentRoomId) {
          console.log("🔄 Sending real video data to room...");

          try {
            sendWSMessage("video_share", {
              name: videoFile.name,
              magnetUri: torrent.magnetURI,
              infoHash: torrent.infoHash,
              size: torrent.length.toString(),
              roomId: currentRoomId,
              sourceType: "magnet_link",
            });

            // Store tempId for cleanup when we receive confirmation from server
            (window as any).__pendingMagnetTempId = tempId;
            
            // Set a fallback timeout to clean up placeholder if server doesn't respond
            setTimeout(() => {
              if ((window as any).__pendingMagnetTempId === tempId) {
                console.log("⏰ Timeout: Server didn't respond, cleaning up placeholder");
                setVideos(prev => prev.filter(v => v.id !== tempId));
                delete (window as any).__pendingMagnetTempId;
                toast({
                  title: "Video share timeout",
                  description: "Server didn't respond. Please try sharing the magnet link again.",
                  variant: "destructive",
                });
              }
            }, 10000); // 10 second timeout

            // Register torrent for P2P statistics tracking
            if (registerTorrent) {
              console.log("📊 Registering magnet torrent for P2P statistics tracking");
              registerTorrent(torrent);
            }

            console.log("✅ Real video info sent - waiting for server confirmation...");
          } catch (error) {
            console.error("Failed to send video_share message:", error);
            // Update placeholder to show error
            setVideos(prev => prev.map(v => 
              v.id === tempId 
                ? { ...v, status: 'error', processingStep: 'Failed to send to server' }
                : v
            ));
            toast({
              title: "Failed to share video",
              description: "Could not send video information to the room. Please try again.",
              variant: "destructive",
            });
          }
        }
      });

      console.log("🎯 Torrent object created with callback - waiting for metadata...");

    } catch (error) {
      console.error("Failed to load magnet link:", error);
      toast({
        title: "Magnet load failed",
        description: "Failed to load magnet link. Please check the link and try again.",
        variant: "destructive",
      });
      throw error;
    }
  }, [sendWSMessage, room, toast, registerTorrent, globalWebTorrentClient]);

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
    userProgresses,
    currentUser,
    hostUser, // Include hostUser in the return value
    hostOnlyControl, // Include hostOnlyControl in the return value
    setHostOnlyControl, // Include setHostOnlyControl in the return value
    joinRoom,
    leaveRoom,
    sendMessage: sendChatMessage,
    sendWSMessage,
    syncVideo,
    sendUserProgress,
    syncToHost,
    shareVideo,
    shareTorrentFile,
    shareMagnetLink,
  };
}
