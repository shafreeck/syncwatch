import { useRef, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Share, Download, Upload } from "lucide-react";
import { useWebTorrent } from "@/hooks/use-webtorrent";

interface VideoPlayerProps {
  currentVideo?: any;
  onVideoSync: (action: string, currentTime: number) => void;
  onUserProgress?: (currentTime: number, isPlaying: boolean) => void;
  onSyncToHost?: (targetTime: number) => void;
  isConnected: boolean;
  lastSync?: { action: 'play'|'pause'|'seek'; currentTime: number; roomId: string; at: number } | null;
  statsByInfoHash?: Record<string, { uploadMBps: number; downloadMBps: number; peers: number; progress: number; name?: string }>;
  userProgresses?: Record<string, { currentTime: number; isPlaying: boolean; lastUpdate: number }>;
  currentUser?: { id: string; username: string } | null;
}

export default function VideoPlayer({ currentVideo, onVideoSync, onUserProgress, onSyncToHost, isConnected, lastSync, statsByInfoHash = {}, userProgresses = {}, currentUser }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lastProgressUpdate, setLastProgressUpdate] = useState(0);
  const [showSyncNotification, setShowSyncNotification] = useState(false);

  const {
    client,
    downloadProgress,
    shareSpeed,
    peers,
    isSeeding,
    loadTorrent,
  } = useWebTorrent();

  // Set up video element event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      const newTime = video.currentTime || 0;
      setCurrentTime(newTime);
      
      // Send periodic user progress updates (every 2 seconds for better real-time tracking)
      const now = Date.now();
      if (onUserProgress && (now - lastProgressUpdate) > 2000) {
        setLastProgressUpdate(now);
        onUserProgress(newTime, !video.paused);
      }
    };

    const updateDuration = () => {
      setDuration(video.duration || 0);
    };

    const handleCanPlay = () => {
      console.log('Video ready to play');
    };
    
    const handleLoadedData = () => {
      console.log('Video data loaded - can start playback');
    };
    
    const handleError = (e: any) => {
      if (e.target.error && e.target.error.code !== 4) {
        console.error('Video error:', e.target.error);
      }
    };

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('durationchange', updateDuration);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('durationchange', updateDuration);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
    };
  }, [onUserProgress, lastProgressUpdate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentVideo || !currentVideo.magnetUri) return;
    console.log("Loading video via torrent:", currentVideo.name);
    loadTorrent(currentVideo.magnetUri, video);
  }, [currentVideo, loadTorrent]);

  // Apply incoming sync messages (best-effort)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !lastSync) return;
    const { action, currentTime } = lastSync;
    try {
      if (typeof currentTime === 'number' && !isNaN(currentTime)) {
        const timeDiff = Math.abs((video.currentTime || 0) - currentTime);
        
        // Only seek if difference is noticeable to avoid jank (only for official sync events)
        if (timeDiff > 0.5) {
          video.currentTime = currentTime;
        }
      }
      if (action === 'play') {
        video.play().catch(() => {});
        setIsPlaying(true);
      } else if (action === 'pause') {
        video.pause();
        setIsPlaying(false);
      }
    } catch {}
  }, [lastSync]);
  
  const handleSyncToHost = () => {
    // 获取房间中最快的进度作为同步目标
    if (!currentUser) return;
    
    const allUserIds = Object.keys(userProgresses).filter(id => id !== currentUser.id);
    const activeProgresses = allUserIds
      .map(id => {
        const progress = userProgresses[id];
        if (!progress) return null;
        const isStale = Date.now() - progress.lastUpdate > 10000;
        return isStale ? null : progress;
      })
      .filter(p => p && p.isPlaying);
    
    if (activeProgresses.length > 0) {
      const maxTime = Math.max(...activeProgresses.map(p => p!.currentTime));
      if (onSyncToHost) {
        onSyncToHost(maxTime);
        setShowSyncNotification(false);
      }
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      onVideoSync("pause", video.currentTime);
    } else {
      console.log('🎬 Attempting to play video...');
      console.log('Pre-play video state:', {
        src: video.src?.substring(0, 60) + '...',
        readyState: video.readyState,
        networkState: video.networkState,
        duration: video.duration,
        currentTime: video.currentTime,
        buffered: video.buffered.length,
        paused: video.paused,
        muted: video.muted
      });
      
      video.play().then(() => {
        console.log('✅ Play SUCCESS!');
        setIsPlaying(true);
        onVideoSync("play", video.currentTime);
      }).catch(error => {
        console.error('❌ Play FAILED:', error);
        console.log('Post-fail video state:', {
          src: video.src?.substring(0, 60) + '...',
          readyState: video.readyState,
          networkState: video.networkState,
          error: video.error
        });
      });
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    
    video.currentTime = newTime;
    onVideoSync("seek", newTime);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // 智能同步状态检测
  const getSyncStatus = () => {
    if (!isConnected) return { status: 'Offline', color: 'text-gray-400', dotColor: 'bg-gray-400', timeBehind: 0 };
    if (!currentUser || !isPlaying) return { status: 'Synced', color: 'text-green-400', dotColor: 'bg-green-400', timeBehind: 0 };
    
    // 获取当前用户的进度
    const currentUserProgress = userProgresses[currentUser.id];
    if (!currentUserProgress) return { status: 'Synced', color: 'text-green-400', dotColor: 'bg-green-400', timeBehind: 0 };
    
    // 获取所有活跃用户的进度（不包括当前用户）
    const allUserIds = Object.keys(userProgresses).filter(id => id !== currentUser.id);
    const activeProgresses = allUserIds
      .map(id => {
        const progress = userProgresses[id];
        if (!progress) return null;
        const isStale = Date.now() - progress.lastUpdate > 10000;
        return isStale ? null : progress;
      })
      .filter(p => p && p.isPlaying)
      .map(p => p!.currentTime);
    
    if (activeProgresses.length === 0) {
      return { status: 'Synced', color: 'text-green-400', dotColor: 'bg-green-400', timeBehind: 0 };
    }
    
    const maxProgress = Math.max(...activeProgresses);
    const timeBehind = maxProgress - currentTime;
    
    // 同步状态判断逻辑（与用户进度条相同）
    if (timeBehind <= 3) {
      return { status: 'Synced', color: 'text-green-400', dotColor: 'bg-green-400', timeBehind };
    } else if (timeBehind >= 10) {
      return { status: `${Math.round(timeBehind)}s behind`, color: 'text-red-400', dotColor: 'bg-red-400', timeBehind };
    } else {
      return { status: `${Math.round(timeBehind)}s behind`, color: 'text-yellow-400', dotColor: 'bg-yellow-400', timeBehind };
    }
  };

  // 基于智能同步状态显示同步通知
  useEffect(() => {
    if (!isPlaying || !currentUser) return;
    
    const syncStatus = getSyncStatus();
    const shouldShowNotification = syncStatus.timeBehind > 5; // 落后5秒以上显示通知
    
    if (shouldShowNotification && !showSyncNotification) {
      setShowSyncNotification(true);
    } else if (!shouldShowNotification && showSyncNotification) {
      setShowSyncNotification(false);
    }
  }, [currentTime, userProgresses, isPlaying, currentUser, showSyncNotification]);

  return (
    <Card className="overflow-hidden shadow-2xl">
      {/* WebTorrent Status Bar */}
      <div className="bg-secondary/50 px-4 py-2 flex items-center justify-between text-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Share className="w-3 h-3 text-primary" />
            <span className="text-muted-foreground">P2P Streaming</span>
          </div>
          {(() => {
            // Get current video's specific stats
            const currentStats = currentVideo?.infoHash ? statsByInfoHash[currentVideo.infoHash] : null;
            const currentProgress = currentStats?.progress || downloadProgress;
            const currentUploadSpeed = currentStats?.uploadMBps || shareSpeed;
            const currentPeers = currentStats?.peers || peers;
            
            return (
              <>
                {currentProgress > 0 && (
                  <div className="text-green-400 flex items-center space-x-1" data-testid="text-download-progress">
                    <Download className="w-3 h-3" />
                    <span>Recv: {Math.round(currentProgress)}%</span>
                  </div>
                )}
                {currentUploadSpeed > 0 && (
                  <div className="text-blue-400 flex items-center space-x-1" data-testid="text-upload-speed">
                    <Upload className="w-3 h-3" />
                    <span>Send: {currentUploadSpeed.toFixed(1)} MB/s</span>
                  </div>
                )}
                {(() => {
                  const syncStatus = getSyncStatus();
                  return (
                    <div className={`${syncStatus.color} flex items-center space-x-1`} data-testid="text-sync-status">
                      <div className={`w-2 h-2 ${syncStatus.dotColor} rounded-full`} />
                      <span>{syncStatus.status}</span>
                    </div>
                  );
                })()}
              </>
            );
          })()}
        </div>
        {(() => {
          const currentStats = currentVideo?.infoHash ? statsByInfoHash[currentVideo.infoHash] : null;
          const currentPeers = currentStats?.peers || peers;
          return currentPeers > 0 && (
            <div className="text-muted-foreground flex items-center space-x-1" data-testid="text-peer-count">
              <span>{currentPeers} peers</span>
            </div>
          );
        })()}
      </div>

      {/* Video Player */}
      <div className="relative bg-black aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          onPlay={() => {
            setIsPlaying(true);
            onVideoSync('play', videoRef.current?.currentTime || 0);
          }}
          onPause={() => {
            setIsPlaying(false);
            onVideoSync('pause', videoRef.current?.currentTime || 0);
          }}
          onSeeking={() => {
            onVideoSync('seek', videoRef.current?.currentTime || 0);
          }}
          data-testid="video-player"
        >
          Your browser does not support the video tag.
        </video>


        {/* Loading Overlay */}
        {!currentVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center">
              <div className="text-6xl mb-4">🎬</div>
              <p className="text-xl text-white mb-2">No video selected</p>
              <p className="text-muted-foreground">Share or select a video to start watching together</p>
            </div>
          </div>
        )}

        {/* Sync notification */}
        {showSyncNotification && (
          <div className="absolute top-4 right-4 z-50 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg p-3 shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="text-sm">
                <p className="font-medium text-white">You're behind</p>
                <p className="text-gray-300 text-xs">Catch up to the group?</p>
              </div>
              <Button 
                size="sm" 
                onClick={handleSyncToHost}
                className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <RotateCcw className="w-3 h-3" />
                Sync
              </Button>
            </div>
          </div>
        )}
      </div>

    </Card>
  );
}
