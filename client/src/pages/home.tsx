import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import VideoPlayer from "@/components/video-player";
import ChatSidebar from "@/components/chat-sidebar";
import RoomModal from "@/components/room-modal";
import FileUpload from "@/components/file-upload";
import { useWebSocket } from "@/hooks/use-websocket";
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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebugLog = (message: string) => {
    setDebugInfo(prev => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Extract room ID from URL
  const roomId = location.split("/room/")[1];

  const {
    isConnected,
    room,
    users,
    messages,
    videos,
    currentVideo,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendWSMessage,
    syncVideo,
    uploadVideo,
  } = useWebSocket();

  useEffect(() => {
    // Show room modal if no room ID in URL or not connected
    if (!roomId || !isConnected) {
      setShowRoomModal(true);
    }
    
    // Test console log to verify logs are working
    console.log("🔄 Home component loaded, roomId:", roomId, "isConnected:", isConnected);
    addDebugLog(`Home loaded - Room: ${roomId}, Connected: ${isConnected}`);
  }, [roomId, isConnected]);

  const handleJoinRoom = async (roomCode: string, displayName: string) => {
    try {
      await joinRoom(roomCode, displayName);
      setUsername(displayName);
      setShowRoomModal(false);
      navigate(`/room/${roomCode}`);
      
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
              isConnected={isConnected}
            />
            
            <FileUpload
              onVideoUpload={uploadVideo}
              videos={videos}
              onDebugLog={addDebugLog}
              onSelectVideo={(video) => {
                addDebugLog(`Selecting video: ${video.name}`);
                if (video.magnetUri && room) {
                  addDebugLog(`Video has magnetUri: ${video.magnetUri.substring(0, 50)}...`);
                  console.log("Selecting video locally:", video);
                  
                  sendWSMessage("video_select", {
                    videoId: video.id,
                    magnetUri: video.magnetUri,
                    roomId: room.id
                  });
                  
                  addDebugLog(`Sent video_select message`);
                  toast({
                    title: "Video selected",
                    description: `Now playing: ${video.name}`,
                  });
                } else {
                  addDebugLog(`Video not ready - no magnetUri or room`);
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
              currentUser={currentUser}
              onSendMessage={sendMessage}
              roomId={roomId}
            />
          </div>
        </div>

        {/* Debug Info Panel */}
        {debugInfo.length > 0 && (
          <div className="fixed bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg max-w-md text-xs">
            <div className="font-bold mb-2">Debug Info:</div>
            {debugInfo.map((info, index) => (
              <div key={index} className="mb-1">{info}</div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
