import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import VideoPlayer from "@/components/video-player";
import ChatSidebar from "@/components/chat-sidebar";
import RoomModal from "@/components/room-modal";
import FileShare from "@/components/file-share";
import RoomSettingsModal from "@/components/room-settings-modal";
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
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [username, setUsername] = useState("");
  // currentUser is now provided by useWebSocket hook

  // Extract room ID from URL
  const roomId = location.split("/room/")[1];

  // Get WebTorrent statistics for progress visualization
  const { shareSpeed, peers, statsByInfoHash, registerTorrent, cleanupUnusedTorrents, client } = useWebTorrent();

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
    shareTorrentFile,
    shareMagnetLink,
  } = useWebSocket(registerTorrent, client);

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
      // 优先使用URL中的roomId
      let targetRoomId = roomId;
      
      if (targetRoomId) {
        // 如果有URL roomId，验证房间密码（如果房间有密码且用户输入了密码）
        const response = await fetch(`/api/rooms/${targetRoomId}`);
        if (!response.ok) {
          throw new Error("Room not found");
        }
        const room = await response.json();
        
        // 如果房间设置了密码，必须验证输入的密码
        if (room.roomCode) {
          if (!roomCode || room.roomCode !== roomCode) {
            throw new Error("Invalid room password");
          }
        }
      } else {
        // 如果没有URL roomId，需要通过房间代码或其他方式查找房间
        throw new Error("No room specified");
      }
      
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
        description: `Joined room successfully`,
      });
    } catch (error) {
      toast({
        title: "Connection failed",
        description: error instanceof Error && error.message === "Invalid room password" 
          ? "Incorrect room password. Please check and try again." 
          : "Room not found or connection failed.",
        variant: "destructive",
      });
    }
  };

  // Auto-join when visiting an invite link (/room/:roomId)
  useEffect(() => {
    if (!roomId) return;
    // If already in a room with the same id, do nothing
    if (room && room.id === roomId) return;

    // When socket is connected, check if room requires password
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

      // Check if room requires password first
      const checkRoomAndJoin = async () => {
        try {
          const response = await fetch(`/api/rooms/${roomId}`);
          if (!response.ok) {
            toast({
              title: "Room not found",
              description: "The room you're trying to join doesn't exist",
              variant: "destructive",
            });
            navigate('/');
            return;
          }
          
          const roomData = await response.json();
          
          // If room has password, always show modal for password input
          if (roomData.roomCode) {
            setShowRoomModal(true);
            return;
          }
          
          // No password required, try to auto-join using saved username
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
        } catch (error) {
          toast({
            title: "Connection failed",
            description: "Unable to connect to the room",
            variant: "destructive",
          });
          navigate('/');
        }
      };
      
      checkRoomAndJoin();
    }
  }, [roomId, isConnected, room, joinRoom, navigate, toast]);

  const handleCreateRoom = async (roomName: string, displayName: string, roomCode?: string) => {
    try {
      // Create room via API
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName, hostId: "temp", roomCode }),
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
        description: roomCode ? `Created room: ${roomName} (Code: ${roomCode})` : `Created room: ${roomName}`,
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

  const handleStorageCleanup = () => {
    if (cleanupUnusedTorrents) {
      const currentVideoHash = currentVideo?.infoHash;
      cleanupUnusedTorrents(currentVideoHash);
      toast({
        title: "Storage cleaned",
        description: "Unused video files have been removed from cache",
      });
    }
  };

  const getStorageInfo = () => {
    if (!client) return { activeVideos: 0, totalSize: "Unknown" };
    
    const torrents = client.torrents || [];
    const activeVideos = torrents.length;
    const totalDownloaded = torrents.reduce((sum: number, t: any) => sum + (t.downloaded || 0), 0);
    const totalSizeMB = (totalDownloaded / (1024 * 1024)).toFixed(1);
    
    return { activeVideos, totalSize: `${totalSizeMB} MB` };
  };

  if (showRoomModal) {
    return (
      <>
        <RoomModal
          isOpen={showRoomModal}
          onClose={() => setShowRoomModal(false)}
          onJoinRoom={handleJoinRoom}
          onCreateRoom={handleCreateRoom}
        />
        <RoomSettingsModal 
          open={showRoomSettings}
          onOpenChange={setShowRoomSettings}
          room={room}
          onRoomUpdate={(updatedRoom) => {
            console.log("Room settings updated:", updatedRoom);
          }}
        />
      </>
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
                  className="flex items-center space-x-2"
                >
                  <Copy className="w-4 h-4" />
                  <span className="hidden sm:inline text-sm">Share</span>
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
              userProgresses={userProgresses}
              currentUser={currentUser}
            />
            
            <FileShare
              onVideoShare={shareVideo}
              onTorrentShare={shareTorrentFile}
              onMagnetShare={shareMagnetLink}
              videos={videos}
              shareSpeed={shareSpeed}
              peers={peers}
              statsByInfoHash={statsByInfoHash}
              currentUser={currentUser}
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
              onShowRoomSettings={() => setShowRoomSettings(true)}
              roomId={roomId}
              videoDuration={currentVideo ? 600 : 0} // TODO: Get actual video duration
            />
          </div>
        </div>

      </main>

      {/* Storage Management Panel */}
      {showSettings && (
        <div className="fixed top-16 right-4 z-50 bg-card border border-border rounded-lg p-4 shadow-lg min-w-[280px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">存储管理</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(false)}
                className="h-6 w-6 p-0"
              >
                ×
              </Button>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">活跃视频:</span>
                <span>{getStorageInfo().activeVideos} 个</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">缓存大小:</span>
                <span>{getStorageInfo().totalSize}</span>
              </div>
            </div>
            
            <div className="border-t pt-3">
              <Button
                onClick={handleStorageCleanup}
                variant="outline"
                size="sm"
                className="w-full"
                data-testid="button-cleanup-storage"
              >
                清理未使用的视频
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                清理当前未播放的视频缓存，释放磁盘空间
              </p>
            </div>
            
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>存储说明:</strong></p>
                <p>• WebTorrent使用浏览器的IndexedDB存储视频片段</p>
                <p>• 只下载播放需要的部分，不是完整文件</p>
                <p>• 停止播放时，数据会保留用于再次观看</p>
                <p>• 定期清理可以节省磁盘空间</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <RoomSettingsModal 
        open={showRoomSettings}
        onOpenChange={setShowRoomSettings}
        room={room}
        onRoomUpdate={(updatedRoom) => {
          console.log("Room settings updated:", updatedRoom);
        }}
      />
    </div>
  );
}
