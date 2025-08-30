import { useRef, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Volume2, VolumeX, Maximize, Share, Download, Upload } from "lucide-react";
import { useWebTorrent } from "@/hooks/use-webtorrent";

interface VideoPlayerProps {
  currentVideo?: any;
  onVideoSync: (action: string, currentTime: number) => void;
  isConnected: boolean;
  onDebugLog?: (message: string) => void;
}

export default function VideoPlayer({ currentVideo, onVideoSync, isConnected, onDebugLog }: VideoPlayerProps) {
  // Debug: Log whenever component renders
  onDebugLog?.(`VideoPlayer RENDER: currentVideo=${currentVideo ? 'YES' : 'NO'}`);
  if (currentVideo) {
    onDebugLog?.(`VideoPlayer RENDER: name=${currentVideo.name}, magnetUri=${currentVideo.magnetUri?.substring(0, 30)}...`);
  }

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);

  const {
    downloadProgress,
    uploadSpeed,
    peers,
    isSeeding,
    loadTorrent,
  } = useWebTorrent();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      setCurrentTime(video.currentTime);
      setProgress((video.currentTime / video.duration) * 100 || 0);
    };

    const updateDuration = () => {
      setDuration(video.duration || 0);
    };

    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("durationchange", updateDuration);
    video.addEventListener("loadedmetadata", updateDuration);

    return () => {
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("durationchange", updateDuration);
      video.removeEventListener("loadedmetadata", updateDuration);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    onDebugLog?.(`VideoPlayer: Checking video element and currentVideo`);
    
    if (!video) {
      onDebugLog?.(`VideoPlayer: No video element ref available`);
      return;
    }
    
    if (!currentVideo) {
      onDebugLog?.(`VideoPlayer: No current video to load`);
      return;
    }
    
    onDebugLog?.(`VideoPlayer: Loading video - ${currentVideo.name}`);
    onDebugLog?.(`VideoPlayer: magnetUri = ${currentVideo.magnetUri ? currentVideo.magnetUri.substring(0, 50) + '...' : 'undefined'}`);
    
    // Clear any existing src first
    video.src = '';
    video.load();
    
    // Check if we have a magnetUri that's a blob URL or file URL
    if (currentVideo.magnetUri && (currentVideo.magnetUri.startsWith('blob:') || currentVideo.magnetUri.startsWith('data:'))) {
      onDebugLog?.(`VideoPlayer: Setting file URL as source`);
      video.src = currentVideo.magnetUri;
      video.load();
      
      // Add event listeners for debugging
      const handleLoadStart = () => onDebugLog?.('Video: loadstart');
      const handleLoadedData = () => onDebugLog?.('Video: loadeddata');
      const handleCanPlay = () => onDebugLog?.('Video: canplay');
      const handleError = (e: any) => onDebugLog?.(`Video error: ${e.target?.error?.message || 'Unknown error'}`);
      
      video.addEventListener('loadstart', handleLoadStart, { once: true });
      video.addEventListener('loadeddata', handleLoadedData, { once: true });
      video.addEventListener('canplay', handleCanPlay, { once: true });
      video.addEventListener('error', handleError, { once: true });
      
    } else if (currentVideo.magnetUri && currentVideo.magnetUri.startsWith('magnet:')) {
      onDebugLog?.(`VideoPlayer: Loading torrent`);
      loadTorrent(currentVideo.magnetUri, video);
    } else {
      onDebugLog?.(`VideoPlayer: No valid video source found`);
    }
  }, [currentVideo, loadTorrent, onDebugLog]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      onVideoSync("pause", video.currentTime);
    } else {
      video.play();
      setIsPlaying(true);
      onVideoSync("play", video.currentTime);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
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

  return (
    <Card className="overflow-hidden shadow-2xl">
      {/* WebTorrent Status Bar */}
      <div className="bg-secondary/50 px-4 py-2 flex items-center justify-between text-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Share className="w-3 h-3 text-primary" />
            <span className="text-muted-foreground">P2P Streaming</span>
          </div>
          {downloadProgress > 0 && (
            <div className="text-green-400 flex items-center space-x-1" data-testid="text-download-progress">
              <Download className="w-3 h-3" />
              <span>Download: {Math.round(downloadProgress)}%</span>
            </div>
          )}
          {uploadSpeed > 0 && (
            <div className="text-blue-400 flex items-center space-x-1" data-testid="text-upload-speed">
              <Upload className="w-3 h-3" />
              <span>↑ {uploadSpeed} MB/s</span>
            </div>
          )}
        </div>
        {peers > 0 && (
          <div className="text-muted-foreground flex items-center space-x-1" data-testid="text-peer-count">
            <span>{peers} peers</span>
          </div>
        )}
      </div>

      {/* Video Player */}
      <div className="relative bg-black aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          data-testid="video-player"
        >
          Your browser does not support the video tag.
        </video>

        {/* Sync Status Overlay */}
        {isConnected && (
          <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-white">Synced</span>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {!currentVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center">
              <div className="text-6xl mb-4">🎬</div>
              <p className="text-xl text-white mb-2">No video selected</p>
              <p className="text-muted-foreground">Upload or select a video to start watching together</p>
            </div>
          </div>
        )}
      </div>

      {/* Custom Video Controls */}
      <div className="bg-secondary/80 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button
              variant="default"
              size="sm"
              onClick={togglePlay}
              data-testid="button-toggle-play"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            
            <div className="flex items-center space-x-2 text-sm">
              <span data-testid="text-current-time">{formatTime(currentTime)}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground" data-testid="text-duration">
                {formatTime(duration)}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              data-testid="button-toggle-mute"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              data-testid="button-toggle-fullscreen"
            >
              <Maximize className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-3">
          <div
            className="w-full bg-border rounded-full h-1 cursor-pointer"
            onClick={handleSeek}
            data-testid="progress-bar"
          >
            <div
              className="bg-primary h-1 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
