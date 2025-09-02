import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import VideoPlayer from "@/components/video-player";
import ChatSidebar from "@/components/chat-sidebar";
import RoomModal from "@/components/room-modal";
import FileShare from "@/components/file-share";
import { useWebSocket } from "@/hooks/use-websocket";
import { useWebTorrent } from "@/hooks/use-webtorrent";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, PlayCircle, Users, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [username, setUsername] = useState("");
  // currentUser is now provided by useWebSocket hook

  // Extract room ID from URL
  const roomId = location.split("/room/")[1];

  // Get WebTorrent statistics for progress visualization
  const { shareSpeed, peers, statsByInfoHash, registerTorrent } = useWebTorrent();

  const {
    isConnected,
    room,
    users,
    messages,
    videos,
    currentVideo,
    lastSync,
    userProgresses,
    currentUser,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendWSMessage,
    syncVideo,
    sendUserProgress,
    syncToHost,
    shareVideo,
  } = useWebSocket(registerTorrent);

  useEffect(() => {
    // Show room modal only if no room ID in URL (not based on connection status)
    if (!roomId) {
      setShowRoomModal(true);
    } else {
      setShowRoomModal(false);
    }
    
  }, [roomId]);

  const handleJoinRoom = async (roomCode: string, displayName: string) => {
    try {
      // Prefer URL roomId if present, so invite links don't require typing the code
      const targetRoomId = roomId || roomCode;
      await joinRoom(targetRoomId, displayName);
      setUsername(displayName);
      // persist name for frictionless re-joins
      try { localStorage.setItem('syncwatch:username', displayName); } catch {}
      // mark recent join to guard auto-join effect after navigation
      try { sessionStorage.setItem('syncwatch:last-join', JSON.stringify({ roomId: targetRoomId, at: Date.now() })); } catch {}
      setShowRoomModal(false);
      navigate(`/room/${targetRoomId}`);
      
      toast({
        title: "Connected successfully",
        description: `Joined room: ${roomCode}`,
      });
    } catch (error) {
      toast({
        title: "Connection failed",
        description: "Failed to join room. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Auto-join when visiting an invite link (/room/:roomId)
  useEffect(() => {
    if (!roomId) return;
    // If already in a room with the same id, do nothing
    if (room && room.id === roomId) return;

    // When socket is connected, try to join automatically using saved name
    if (isConnected) {
      // Skip if we very recently joined this same room (avoid duplicate join)
      try {
        const raw = sessionStorage.getItem('syncwatch:last-join');
        if (raw) {
          const info = JSON.parse(raw);
          if (info?.roomId === roomId && Date.now() - (info.at || 0) < 8000) {
            return;
          }
        }
      } catch {}
      let saved = '';
      try { saved = localStorage.getItem('syncwatch:username') || ''; } catch {}
      if (saved) {
        joinRoom(roomId, saved);
        setUsername(saved);
        setShowRoomModal(false);
        try { sessionStorage.setItem('syncwatch:last-join', JSON.stringify({ roomId, at: Date.now() })); } catch {}
      } else {
        // No saved name – show modal to ask for display name
        setShowRoomModal(true);
      }
    }
  }, [roomId, isConnected, room, joinRoom]);

  const handleCreateRoom = async (roomName: string, displayName: string) => {
    try {
      // Create room via API
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName, hostId: "temp" }),
      });
      
      if (!response.ok) throw new Error("Failed to create room");
      
      const newRoom = await response.json();
      await joinRoom(newRoom.id, displayName);
      setUsername(displayName);
      // persist name so auto-join effect won't reopen modal
      try { localStorage.setItem('syncwatch:username', displayName); } catch {}
      // mark recent join for duplicate-guard
      try { sessionStorage.setItem('syncwatch:last-join', JSON.stringify({ roomId: newRoom.id, at: Date.now() })); } catch {}
      setShowRoomModal(false);
      navigate(`/room/${newRoom.id}`);
      
      toast({
        title: "Room created",
        description: `Created room: ${roomName}`,
      });
    } catch (error) {
      toast({
        title: "Failed to create room",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const copyInviteLink = async () => {
    if (!roomId) return;
    
    const link = `${window.location.origin}/room/${roomId}`;
    await navigator.clipboard.writeText(link);
    
    toast({
      title: "Invite link copied",
      description: "Share this link with friends to join the room",
    });
  };

  if (showRoomModal) {
    return (
      <RoomModal
        isOpen={showRoomModal}
        onClose={() => setShowRoomModal(false)}
        onJoinRoom={handleJoinRoom}
        onCreateRoom={handleCreateRoom}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card/50 backdrop-blur-sm border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-bold text-primary flex items-center">
                <PlayCircle className="mr-2" />
                SyncWatch
              </div>
              {room && (
                <div className="hidden md:flex items-center space-x-2 text-sm text-muted-foreground">
                  <Badge variant="secondary" data-testid="room-name">
                    Room: {room.name}
                  </Badge>
                  <span className="text-xs" data-testid="room-id">
                    #{room.id.substring(0, 6)}
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm text-muted-foreground" data-testid="viewer-count">
                  {users.length} viewers
                </span>
              </div>
              
              {roomId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyInviteLink}
                  data-testid="button-copy-invite"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                data-testid="button-settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-120px)]">
          {/* Video Section */}
          <div className="lg:col-span-3 space-y-4">
            <VideoPlayer
              currentVideo={currentVideo}
              onVideoSync={syncVideo}
              onUserProgress={sendUserProgress}
              onSyncToHost={syncToHost}
              isConnected={isConnected}
              lastSync={lastSync}
              statsByInfoHash={statsByInfoHash}
            />
            
            <FileShare
              onVideoShare={shareVideo}
              videos={videos}
              shareSpeed={shareSpeed}
              peers={peers}
              statsByInfoHash={statsByInfoHash}
              onDeleteVideo={async (video) => {
                if (!room) return;
                
                // Ensure WebSocket is properly connected to the room before deleting
                if (!isConnected) {
                  toast({
                    title: "Connection issue",
                    description: "Please wait for connection to establish",
                    variant: "destructive",
                  });
                  return;
                }
                
                // If not properly joined via WebSocket, attempt to join first
                if (room && username) {
                  console.log(`🔄 Ensuring WebSocket room connection before delete...`);
                  await joinRoom(room.id, username);
                  
                  // Give a brief moment for join to complete
                  setTimeout(() => {
                    console.log(`🗑️ Sending video_delete request:`, { videoId: video.id, roomId: room.id });
                    sendWSMessage("video_delete", { videoId: video.id, roomId: room.id });
                    toast({
                      title: "Requesting delete",
                      description: `${video.name}`,
                    });
                  }, 500);
                } else {
                  console.log(`🗑️ Sending video_delete request:`, { videoId: video.id, roomId: room.id });
                  sendWSMessage("video_delete", { videoId: video.id, roomId: room.id });
                  toast({
                    title: "Requesting delete",
                    description: `${video.name}`,
                  });
                }
              }}
              onSelectVideo={(video) => {
                if (video.magnetUri && room) {
                  console.log("Selecting video locally:", video);
                  
                  sendWSMessage("video_select", {
                    videoId: video.id,
                    magnetUri: video.magnetUri,
                    roomId: room.id
                  });
                  
                  toast({
                    title: "Video selected",
                    description: `Now playing: ${video.name}`,
                  });
                } else {
                  toast({
                    title: "Video not ready",
                    description: "This video is still processing",
                    variant: "destructive",
                  });
                }
              }}
            />
          </div>

          {/* Chat Sidebar */}
          <div className="lg:col-span-1">
            <ChatSidebar
              users={users}
              messages={messages}
              userProgresses={userProgresses}
              currentUser={currentUser}
              onSendMessage={sendMessage}
              onSyncToHost={syncToHost}
              roomId={roomId}
              videoDuration={currentVideo ? 600 : 0} // TODO: Get actual video duration
            />
          </div>
        </div>

      </main>
    </div>
  );
}
