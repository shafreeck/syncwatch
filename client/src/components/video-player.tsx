import { useRef, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Share, Download, Upload } from "lucide-react";
import { useWebTorrent } from "@/hooks/use-webtorrent";

// Type declaration for video.js
declare global {
  interface Window {
    videojs: any;
  }
}

interface VideoPlayerProps {
  currentVideo?: any;
  onVideoSync: (action: string, currentTime: number) => void;
  onUserProgress?: (currentTime: number, isPlaying: boolean) => void;
  onSyncToHost?: (targetTime: number) => void;
  isConnected: boolean;
  lastSync?: { action: 'play'|'pause'|'seek'; currentTime: number; roomId: string; at: number } | null;
  statsByInfoHash?: Record<string, { uploadMBps: number; downloadMBps: number; peers: number; progress: number; name?: string }>;
  userProgresses?: Record<string, { currentTime: number; isPlaying: boolean; lastUpdate: number }>;
  currentUser?: { id: string; username: string; isHost: boolean } | null;
  hostUser?: { id: string; username: string } | null;
  hostOnlyControl?: boolean;
  canControl?: boolean;
  setHostOnlyControl?: (value: boolean) => void;
  sendWSMessage?: (type: string, data: any) => void;
  room?: { id: string; name: string; isActive: boolean } | null;
}

export default function VideoPlayer({ currentVideo, onVideoSync, onUserProgress, onSyncToHost, isConnected, lastSync, statsByInfoHash = {}, userProgresses = {}, currentUser, hostUser, hostOnlyControl, canControl, setHostOnlyControl, sendWSMessage, room }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoJsPlayerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lastProgressUpdate, setLastProgressUpdate] = useState(0);
  const [showSyncNotification, setShowSyncNotification] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [allowSyncBroadcast, setAllowSyncBroadcast] = useState(true);
  const [hasPlayedFirstTime, setHasPlayedFirstTime] = useState(false);
  // Track seeking state to avoid broadcasting transient pauses
  const isSeekingRef = useRef(false);
  const wasPlayingBeforeSeekRef = useRef(false);

  const {
    client,
    downloadProgress,
    shareSpeed,
    peers,
    isSeeding,
    loadTorrent,
  } = useWebTorrent();

  // Initialize video.js player
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // Initialize video.js player
    if (window.videojs && !videoJsPlayerRef.current) {
      videoJsPlayerRef.current = window.videojs(video, {
        controls: true,
        errorDisplay: false, // Hide video.js error messages
        playbackRates: [0.5, 1, 1.25, 1.5, 2]
      });
      console.log('🎬 Video.js player initialized');
    }
    
    // Cleanup on unmount
    return () => {
      if (videoJsPlayerRef.current) {
        videoJsPlayerRef.current.dispose();
        videoJsPlayerRef.current = null;
      }
    };
  }, []);
  
  // Reset first play state when current video changes
  useEffect(() => {
    setHasPlayedFirstTime(false);
  }, [currentVideo]);

  // Reset first play state when room changes
  useEffect(() => {
    setHasPlayedFirstTime(false);
  }, [room]);

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
      setIsVideoLoading(false); // Hide loading when video is ready

      // Check if we should auto-play when video is ready
      if (lastSync && lastSync.action === 'play') {
        console.log('🎬 Auto-playing video on canplay');
        const video = videoRef.current;
        if (video) {
          // Small delay to ensure everything is ready
          setTimeout(() => {
            video.play().catch((error) => {
              console.error('❌ Auto-play on canplay failed:', error);
              // Show play button overlay when autoplay fails
              setIsPlaying(false);
            });
            setIsPlaying(true);
          }, 100);
        }
      }
    };

    const handleLoadedData = () => {
      console.log('Video data loaded - can start playback');
      setIsVideoLoading(false); // Hide loading when data loaded
      try { window.dispatchEvent(new CustomEvent('player-busy', { detail: { busy: false, hasVideo: true } })); } catch {}
    };

    const handleError = (e: any) => {
      // Suppress all video errors since we're using video.js errorDisplay: false
      // and handling errors through our own UI
      if (e.target.error) {
        console.log('Video error suppressed:', e.target.error.code);
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
    if (!video) {
      console.log("🚫 Video player: video element not available");
      return;
    }
    
    console.log("🎬 Video player currentVideo changed:", {
      hasCurrentVideo: !!currentVideo,
      currentVideoName: currentVideo?.name,
      currentVideoMagnetUri: currentVideo?.magnetUri,
      currentVideoId: currentVideo?.id
    });
    
    // **CLEANUP**: If currentVideo is null or invalid, clear the player
    if (!currentVideo || !currentVideo.magnetUri) {
      console.log("🧹 Clearing video player - no current video or magnetUri");
      if (videoJsPlayerRef.current) {
        videoJsPlayerRef.current.pause();
        videoJsPlayerRef.current.src('');
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setIsVideoLoading(false); // Clear loading state
      return;
    }
    
    console.log("🚀 Loading video via torrent:", currentVideo.name, "magnetUri:", currentVideo.magnetUri);
    setIsVideoLoading(true); // Show loading when starting to load video
    try { window.dispatchEvent(new CustomEvent('player-busy', { detail: { busy: true, hasVideo: !!currentVideo } })); } catch {}
    
    // **CRITICAL FIX**: For video.js, we MUST use the internal video element
    // Wait for video.js to initialize if it hasn't yet
    const loadVideoWithRetry = () => {
      let actualVideoElement = document.querySelector('#webtorrent-player_html5_api') as HTMLVideoElement;
      
      if (!actualVideoElement && videoJsPlayerRef.current) {
        // Try to get the tech element directly from video.js
        try {
          actualVideoElement = videoJsPlayerRef.current.tech().el() as HTMLVideoElement;
        } catch (e) {
          console.warn('Could not get video.js tech element:', e);
        }
      }
      
      if (!actualVideoElement) {
        console.log('⏳ video.js not ready yet, retrying in 100ms...');
        setTimeout(loadVideoWithRetry, 100);
        return;
      }
      
      
      console.log('✅ Using video.js internal element for streamTo:', actualVideoElement.id);
      loadTorrent(currentVideo.magnetUri, actualVideoElement);
    };
    
    loadVideoWithRetry();
  }, [currentVideo, loadTorrent]);

  // Also broadcast when these flags change (outer layout can react without tight coupling)
  useEffect(() => {
    try {
      const hasVideo = !!currentVideo;
      const busy = isVideoLoading;
      window.dispatchEvent(new CustomEvent('player-busy', { detail: { busy, hasVideo } }));
    } catch {}
  }, [isVideoLoading, currentVideo]);

  // **监听 resume seeding 事件，重新尝试加载**
  useEffect(() => {
    const handleSeedingStarted = (event: CustomEvent) => {
      console.log("🔄 Seeding started event received:", event.detail);
      console.log("🔍 infoHash comparison:", {
        currentVideoInfoHash: currentVideo?.infoHash,
        eventInfoHash: event.detail.infoHash,
        match: currentVideo?.infoHash === event.detail.infoHash
      });
      console.log("🔍 Full currentVideo:", currentVideo);
      console.log("🔍 Full event.detail:", event.detail);
      
      // 如果当前视频的 infoHash 匹配，或者文件名匹配，重新尝试加载
      const infoHashMatch = currentVideo && currentVideo.infoHash === event.detail.infoHash;
      const nameMatch = currentVideo && event.detail.name && currentVideo.name === event.detail.name;
      
      if (currentVideo && (infoHashMatch || nameMatch)) {
        console.log("✅ Video match found:", { infoHashMatch, nameMatch });
        console.log("🎯 Re-attempting video load after seeding started...");
        
        // **关键**: 延迟一下，让 resume seeding 的注册完成
        setTimeout(() => {
          if (loadTorrent && currentVideo.magnetUri) {
            const actualVideoElement = document.querySelector('#webtorrent-player_html5_api') as HTMLVideoElement;
            if (actualVideoElement) {
              console.log("🔄 Retrying loadTorrent after seeding registration...");
              loadTorrent(currentVideo.magnetUri, actualVideoElement);
            }
          }
        }, 100); // 100ms 延迟，确保注册完成
      }
    };

    window.addEventListener('webtorrent-seeding-started', handleSeedingStarted as EventListener);
    
    return () => {
      window.removeEventListener('webtorrent-seeding-started', handleSeedingStarted as EventListener);
    };
  }, [currentVideo, loadTorrent]);

  // Apply incoming sync messages (best-effort)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !lastSync) return;
    const { action, currentTime } = lastSync;
    
    // Temporarily disable sync broadcasting when applying incoming sync
    setAllowSyncBroadcast(false);
    
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
    
    // Re-enable sync broadcasting after a short delay
    setTimeout(() => {
      setAllowSyncBroadcast(true);
    }, 1000);
  }, [lastSync]);
  
  // Handle video sync for new users
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentVideo || !lastSync) return;

    console.log('🎬 Video sync triggered:', { currentVideo, lastSync, isPlaying, readyState: video.readyState });

    // Function to apply sync when video is ready
    const applySync = () => {
      // Always sync the time regardless of play/pause state
      if (typeof lastSync.currentTime === 'number' && !isNaN(lastSync.currentTime)) {
        const timeDiff = Math.abs((video.currentTime || 0) - lastSync.currentTime);
        // Only seek if difference is noticeable to avoid jank
        if (timeDiff > 0.5) {
          console.log('⏭️ Seeking to:', lastSync.currentTime);
          video.currentTime = lastSync.currentTime;
        }
      }

      // Handle play/pause state
      if (lastSync.action === 'play' && video.paused) {
        console.log('🎬 Playing video');
        video.play().catch((error) => {
          console.error('❌ Play failed:', error);
        });
        setIsPlaying(true);
      } else if (lastSync.action === 'pause' && !video.paused) {
        console.log('⏸️ Pausing video');
        video.pause();
        setIsPlaying(false);
      }
    };

    // Check if video is ready, otherwise wait for it to be ready
    if (video.readyState >= 2) { // HAVE_CURRENT_DATA or higher
      // Video is ready, apply sync immediately
      applySync();
    } else {
      // Video is not ready, wait for it to load
      console.log('⏳ Video not ready yet, waiting for canplay event');
      const canPlayHandler = () => {
        console.log('✅ Video ready, applying sync');
        applySync();
        video.removeEventListener('canplay', canPlayHandler);
      };
      video.addEventListener('canplay', canPlayHandler);

      // Clean up event listener
      return () => {
        video.removeEventListener('canplay', canPlayHandler);
      };
    }
  }, [currentVideo, lastSync]);
  
  const handleSyncToHost = () => {
    // 本地同步到房间中最快的进度，不广播（避免触发权限校验和干扰他人）
    if (!currentUser) return;
    const video = videoRef.current;
    if (!video) return;

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
      // 暂时关闭同步广播，避免触发 onSeeking 的 WS 消息
      setAllowSyncBroadcast(false);
      try {
        video.currentTime = maxTime;
      } finally {
        // 稍后恢复广播
        setTimeout(() => setAllowSyncBroadcast(true), 800);
      }
      setShowSyncNotification(false);
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    // Check if user is host or if host-only control is disabled
    const isHost = currentUser?.isHost || false;
    const allowed = canControl || !hostOnlyControl || isHost;
    if (!allowed) {
      console.log("Host-only control is enabled. Only host can control playback.");
      return;
    }

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      if (allowSyncBroadcast) {
        onVideoSync("pause", video.currentTime);
      }
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

      // If there's a lastSync state and the video is at the beginning, seek to the sync position first
      if (lastSync && video.currentTime === 0 && lastSync.currentTime > 0) {
        console.log('⏭️ Seeking to sync position before play:', lastSync.currentTime);
        video.currentTime = lastSync.currentTime;
      }

      video.play().then(() => {
        console.log('✅ Play SUCCESS!');
        setIsPlaying(true);
        if (allowSyncBroadcast) {
          onVideoSync("play", video.currentTime);
        }
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

    // Check if user is host or if host-only control is disabled
    const isHost = currentUser?.isHost || false;
    const allowed = canControl || !hostOnlyControl || isHost;
    if (!allowed) {
      console.log("Host-only control is enabled. Only host can control playback.");
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    video.currentTime = newTime;
    if (allowSyncBroadcast) {
      onVideoSync("seek", newTime);
    }
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

  // Handle video controls visibility (sync with native controls)
  useEffect(() => {
    const videoContainer = document.querySelector('[data-testid="video-player"]')?.parentElement;
    if (!videoContainer) return;

    let hideTimeout: NodeJS.Timeout;

    const showControlsHandler = () => {
      setShowControls(true);
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        setShowControls(false);
      }, 3000); // Hide after 3 seconds of inactivity
    };

    const hideControlsHandler = () => {
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        setShowControls(false);
      }, 100);
    };

    videoContainer.addEventListener('mousemove', showControlsHandler);
    videoContainer.addEventListener('mouseenter', showControlsHandler);
    videoContainer.addEventListener('mouseleave', hideControlsHandler);

    // Show initially
    setShowControls(true);
    hideTimeout = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => {
      videoContainer.removeEventListener('mousemove', showControlsHandler);
      videoContainer.removeEventListener('mouseenter', showControlsHandler);
      videoContainer.removeEventListener('mouseleave', hideControlsHandler);
      clearTimeout(hideTimeout);
    };
  }, [currentVideo]);

  return (
    <Card className="overflow-hidden shadow-2xl">
      {/* Video Player */}
      <div className="relative bg-black aspect-video">
        <video
          ref={videoRef}
          id="webtorrent-player"
          className="video-js vjs-default-skin w-full h-full"
          style={{ objectFit: 'contain', objectPosition: 'center' }}
          data-setup="{}"
          controls
          onPlay={() => {
            setIsPlaying(true);
            // Check if user is host or if host-only control is disabled
            const isHost = currentUser?.isHost || false;
            const allowed = canControl || !hostOnlyControl || isHost;

            // If this is the user's first play action after joining, don't broadcast it
            if (!hasPlayedFirstTime) {
              setHasPlayedFirstTime(true);
              console.log("首次播放，不广播同步消息");
              return;
            }

            // Only send sync if allowed (not applying incoming sync)
            if (allowSyncBroadcast && allowed) {
              onVideoSync('play', videoRef.current?.currentTime || 0);
            }
          }}
          onPause={() => {
            const video = videoRef.current;
            // Check if user is host or if host-only control is disabled
            const isHost = currentUser?.isHost || false;
            const allowed = canControl || !hostOnlyControl || isHost;
            // If pause occurs while scrubbing and we were playing, resume locally and do not broadcast
            if (isSeekingRef.current && wasPlayingBeforeSeekRef.current) {
              try { video?.play().catch(() => {}); } catch {}
              return;
            }
            setIsPlaying(false);
            // Only send sync if allowed (not applying incoming sync)
            if (allowSyncBroadcast && allowed) {
              onVideoSync('pause', videoRef.current?.currentTime || 0);
            }
          }}
          onSeeking={() => {
            // Check if user is host or if host-only control is disabled
            const isHost = currentUser?.isHost || false;
            const allowed = canControl || !hostOnlyControl || isHost;
            // Mark seeking state and remember if we were playing
            isSeekingRef.current = true;
            wasPlayingBeforeSeekRef.current = !videoRef.current?.paused;
            // Only send sync if allowed (not applying incoming sync)
            if (allowSyncBroadcast && allowed) {
              onVideoSync('seek', videoRef.current?.currentTime || 0);
            }
          }}
          onSeeked={() => {
            // Clear seeking flags; no extra broadcasts
            isSeekingRef.current = false;
            wasPlayingBeforeSeekRef.current = false;
          }}
          data-testid="video-player"
        >
          Your browser does not support the video tag.
        </video>

        {/* P2P Status Overlay - Sync with native controls */}
        {currentVideo && (
          <div className={`absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1 text-xs text-white transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}>
            <div className="flex items-center space-x-3">
              {(() => {
                // Get current video's specific stats
                const currentStats = currentVideo?.infoHash ? statsByInfoHash[currentVideo.infoHash] : null;
                const currentProgress = currentStats?.progress || downloadProgress;
                const currentUploadSpeed = currentStats?.uploadMBps || shareSpeed;
                const currentDownloadSpeed = currentStats?.downloadMBps || 0;
                const currentPeers = currentStats?.peers || peers;
                
                return (
                  <>
                    <div className="flex items-center space-x-1">
                      <Share className="w-3 h-3 text-blue-400" />
                      <span className="text-white/80">P2P</span>
                    </div>
                    {currentProgress > 0 && (
                      <div className="text-green-400 flex items-center space-x-1" data-testid="text-download-progress">
                        <Download className="w-3 h-3" />
                        <span>Recv: {Math.round(currentProgress)}%</span>
                      </div>
                    )}
                    {currentDownloadSpeed > 0 && (
                      <div className="text-yellow-400 flex items-center space-x-1" data-testid="text-download-speed">
                        <Download className="w-3 h-3" />
                        <span>↓ {currentDownloadSpeed.toFixed(1)} MB/s</span>
                      </div>
                    )}
                    {currentUploadSpeed > 0 && (
                      <div className="text-blue-400 flex items-center space-x-1" data-testid="text-upload-speed">
                        <Upload className="w-3 h-3" />
                        <span>↑ {currentUploadSpeed.toFixed(1)} MB/s</span>
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
                    {currentUser?.isHost && setHostOnlyControl && (
                      <button
                        onClick={() => {
                          const newSetting = !hostOnlyControl;
                          setHostOnlyControl && setHostOnlyControl(newSetting);
                          // Send update to server
                          if (room?.id && sendWSMessage) {
                            sendWSMessage("update_host_only_control", {
                              roomId: room.id,
                              hostOnlyControl: newSetting
                            });
                          }
                        }}
                        className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] ring-1 transition-colors ${
                          hostOnlyControl
                            ? 'text-red-300 ring-red-500/40 bg-red-500/10 hover:bg-red-500/15'
                            : 'text-emerald-300 ring-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15'
                        }`}
                        title={hostOnlyControl ? '仅房主可控' : '所有人可控'}
                      >
                        {hostOnlyControl ? 'Host Only' : 'All'}
                      </button>
                    )}
                    {currentPeers > 0 && (
                      <span className="text-white/80">{currentPeers} peers</span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

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

        {/* Video Loading Indicator */}
        {currentVideo && isVideoLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="text-center">
              <div className="mb-4">
                <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
              </div>
              <p className="text-xl text-white mb-2">Loading video...</p>
              <p className="text-white/70 text-sm">{currentVideo.name}</p>
              <div className="mt-3 text-xs text-white/50">
                Connecting to peers and buffering content
              </div>
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
