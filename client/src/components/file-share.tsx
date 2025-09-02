import { useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileVideo, Play, Share2, Trash2, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { getSeedByInfoHash } from "@/lib/seed-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import SeedingProgressModal from "./seeding-progress-modal";

interface Video {
  id: string;
  name: string;
  size?: string;
  uploadedAt?: Date;
  magnetUri?: string;
  infoHash?: string;
}

interface FileShareProps {
  onVideoShare: (file: File, onProgress?: (progress: number) => void, handle?: any) => Promise<void>;
  videos: Video[];
  onSelectVideo: (video: Video) => void;
  onDeleteVideo?: (video: Video) => void;
  shareSpeed?: number;
  peers?: number;
  statsByInfoHash?: Record<string, { uploadMBps: number; downloadMBps: number; peers: number; progress: number; name?: string }>;
}

export default function FileShare({ onVideoShare, videos, onSelectVideo, onDeleteVideo, shareSpeed = 0, peers = 0, statsByInfoHash = {} }: FileShareProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [seedingProgress, setSeedingProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openingPickerRef = useRef(false);
  const { toast } = useToast();
  
  // Reduce logging frequency
  if (videos?.length !== 0) {
    console.log('FileShare rendered with videos:', videos?.length || 0, videos);
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    console.log("Selected file:", { name: file.name, type: file.type, size: file.size });
    
    // Validate file type
    if (!file.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please select a video file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (2GB limit)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 2GB",
        variant: "destructive",
      });
      return;
    }

    // One-click seeding with progress visualization
    setIsUploading(true);
    setCurrentFileName(file.name);
    setSeedingProgress(0);
    setShowProgressModal(true);
    console.log("Starting video share...");
    
    try {
      // Pass progress callback to track seeding progress
      await onVideoShare(file, (progress: number) => {
        setSeedingProgress(progress);
        console.log(`📈 Seeding progress: ${progress.toFixed(1)}%`);
      });

      console.log("Video share initialized (seeding continues in background)");
      // Do not auto-close: keep the modal until user closes/minimizes
      if (seedingProgress >= 100) {
        toast({
          title: "Video ready",
          description: `${file.name} is now ready for streaming`,
        });
      }

    } catch (error) {
      console.error("Video share failed:", error);
      setShowProgressModal(false);
      toast({
        title: "Share failed",
        description: "Failed to share video. Please try again.",
        variant: "destructive",
      });
    } finally {
      // Keep uploading state if progress not completed yet so inline list can show progress
      setIsUploading(prev => (seedingProgress >= 100 ? false : prev));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const openFileDialog = async () => {
    if (openingPickerRef.current) return;
    openingPickerRef.current = true;
    // Prefer File System Access API to retain a handle for auto re-seed after refresh
    const canFSAP = typeof (window as any).showOpenFilePicker === 'function';
    if (canFSAP) {
      try {
        const [h] = await (window as any).showOpenFilePicker({
          multiple: false,
          types: [{
            description: 'Video Files',
            accept: { 'video/*': ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.mkv'] },
          }],
          excludeAcceptAllOption: false,
        });
        if (h) {
          try {
            const file = await h.getFile();
            // Reuse existing file selection logic, but pass the handle downstream via onVideoShare
            // One-click seeding with progress visualization
            setIsUploading(true);
            setCurrentFileName(file.name);
            setSeedingProgress(0);
            setShowProgressModal(true);
            console.log("Starting video share via FS Access API...");
            await onVideoShare(file, (progress: number) => {
              setSeedingProgress(progress);
              console.log(`📈 Seeding progress: ${progress.toFixed(1)}%`);
            }, h);
            console.log("Video share initialized (seeding continues in background)");
          } catch (e) {
            console.error('Failed reading file from handle:', e);
          }
          openingPickerRef.current = false;
          return;
        }
      } catch (e: any) {
        // If user canceled, exit quietly without fallback
        const name = e?.name || e?.constructor?.name || '';
        if (name === 'AbortError' || name === 'AbortErrorDOMException') {
          openingPickerRef.current = false;
          return;
        }
        // Otherwise, fall back to classic input
      }
    }
    try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch {}
    fileInputRef.current?.click();
    openingPickerRef.current = false;
  };

  // Note: Clicking the dropzone triggers openFileDialog

  const formatFileSize = (bytes: string | undefined) => {
    if (!bytes) return "";
    const size = parseInt(bytes);
    const units = ["B", "KB", "MB", "GB"];
    let unitIndex = 0;
    let fileSize = size;

    while (fileSize >= 1024 && unitIndex < units.length - 1) {
      fileSize /= 1024;
      unitIndex++;
    }

    return `${fileSize.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatSpeed = (mbps: number) => {
    if (mbps < 1) return `${(mbps * 1024).toFixed(0)} KB/s`;
    return `${mbps.toFixed(1)} MB/s`;
  };

  const formatSharedTime = (date?: Date) => {
    if (!date) return "";
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) {
      const minutes = Math.floor(diff / (1000 * 60));
      return `${minutes} minutes ago`;
    } else if (hours < 24) {
      return `${hours} hours ago`;
    } else {
      const days = Math.floor(hours / 24);
      return `${days} days ago`;
    }
  };

  const handleReshareFromDB = useCallback(async (video: Video) => {
    if (!video.infoHash) return;
    
    try {
      const seedEntry = await getSeedByInfoHash(video.infoHash);
      if (!seedEntry || !seedEntry.handle) {
        toast({
          title: "File not found",
          description: "Cannot re-share: original file not found in storage",
          variant: "destructive",
        });
        return;
      }

      // Check file handle permissions
      const handle = seedEntry.handle;
      const canRead = await (async () => {
        try {
          if (typeof handle.queryPermission === 'function') {
            const p = await handle.queryPermission({ mode: 'read' });
            if (p === 'granted') return true;
          }
        } catch {}
        try {
          if (typeof handle.requestPermission === 'function') {
            const p = await handle.requestPermission({ mode: 'read' });
            return p === 'granted';
          }
        } catch {}
        return false;
      })();

      if (!canRead) {
        toast({
          title: "Permission denied",
          description: "Please grant file access permission to re-share",
          variant: "destructive",
        });
        return;
      }

      const file = await handle.getFile();
      if (!file) {
        toast({
          title: "File not accessible",
          description: "Unable to access the file for re-sharing",
          variant: "destructive",
        });
        return;
      }

      // Start re-sharing with progress tracking
      setIsUploading(true);
      setCurrentFileName(file.name);
      setSeedingProgress(0);
      setShowProgressModal(true);
      console.log("Re-sharing from IndexDB:", file.name);

      await onVideoShare(file, (progress: number) => {
        setSeedingProgress(progress);
        console.log(`📈 Re-seeding progress: ${progress.toFixed(1)}%`);
      }, handle);

      console.log("Re-share initialized successfully");
    } catch (error) {
      console.error("Re-share from IndexDB failed:", error);
      toast({
        title: "Re-share failed",
        description: "Failed to re-share video. Please try uploading again.",
        variant: "destructive",
      });
    }
  }, [onVideoShare, toast]);

  // Helper to check if video is currently being seeded
  const isVideoBeingSeeded = (video: Video) => {
    // Check if this video is currently being uploaded/seeded (inline progress)
    const isCurrentlySeeding = currentFileName === video.name && (isUploading || seedingProgress > 0);
    
    // Check if video has active P2P stats (peers connected)
    const hasActiveStats = video.infoHash && statsByInfoHash[video.infoHash] && statsByInfoHash[video.infoHash].peers >= 0;
    
    return isCurrentlySeeding || hasActiveStats;
  };

  // Helper to check if video needs warning message
  const needsWarning = (video: Video) => {
    return video.infoHash && !statsByInfoHash[video.infoHash];
  };

  return (
    <>
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          <Share2 className="w-5 h-5 text-primary mr-2" />
          Share Video
        </h3>
        
      </div>
      
      {/* Share Dropzone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          isDragOver
            ? "border-primary/50 bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFileDialog}
        data-testid="dropzone-file-upload"
      >
          <div className="space-y-2">
            <FileVideo className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-foreground">
            {isUploading ? "Preparing / Seeding..." : "Drop video files here or click to browse"}
            </p>
            <p className="text-sm text-muted-foreground">
              Supports MP4, WebM, AVI • Max 2GB
            </p>
          </div>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          data-testid="input-file-upload"
        />
      </div>

      {/* Recent Files with improved layout */}
      {videos.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Available Videos
          </h4>
          <div className="space-y-2">
            {videos.map((video) => (
              <div
                key={video.id}
                className="group grid grid-cols-12 gap-4 items-center p-3 hover:bg-secondary rounded-lg transition-colors"
                data-testid={`video-item-${video.id}`}
              >
                {/* Left side - Video info (7 columns) */}
                <div className="col-span-7 flex items-center space-x-3">
                  <FileVideo className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" data-testid={`text-video-name-${video.id}`}>
                      {video.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(video.size)} • {formatSharedTime(video.uploadedAt)}
                    </p>
                    {/* Only show minimal seeding progress for current upload */}
                    {currentFileName === video.name && (isUploading || seedingProgress < 100) && (
                      <div className="mt-1">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>Seeding</span>
                          <span className="font-mono text-primary">{seedingProgress.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-24 bg-secondary rounded overflow-hidden mt-1">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, seedingProgress))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Center - P2P Statistics (3 columns) */}
                <div className="col-span-3">
                  {video.infoHash && statsByInfoHash[video.infoHash] ? (
                    <div className="text-center space-y-1">
                      <div className="text-xs text-green-500 font-medium">Seeding</div>
                      <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                        <div className="text-center">
                          <div className="text-blue-400 font-mono text-xs">{statsByInfoHash[video.infoHash].peers}</div>
                          <div className="text-[9px]">Peers</div>
                        </div>
                        <div className="text-center">
                          <div className="text-green-400 font-mono text-xs">↑{formatSpeed(statsByInfoHash[video.infoHash].uploadMBps || 0)}</div>
                          <div className="text-[9px]">Up</div>
                        </div>
                        <div className="text-center">
                          <div className="text-yellow-400 font-mono text-xs">↓{formatSpeed(statsByInfoHash[video.infoHash].downloadMBps || 0)}</div>
                          <div className="text-[9px]">Down</div>
                        </div>
                      </div>
                    </div>
                  ) : needsWarning(video) ? (
                    <button
                      className="flex flex-col items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-orange-50/10 hover:text-orange-400 transition-colors text-orange-500/80 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReshareFromDB(video);
                      }}
                      data-testid={`button-reshare-${video.id}`}
                    >
                      <AlertCircle className="w-3 h-3" />
                      <span className="text-center">Click to re-share</span>
                    </button>
                  ) : null}
                </div>
                
                {/* Right side - Action buttons (2 columns) */}
                <div className="col-span-2 flex items-center justify-end space-x-1">
                  {onDeleteVideo && (
                    <TooltipProvider delayDuration={200}>
                      <Dialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-60 group-hover:opacity-100 hover:bg-red-50/5 hover:text-red-500"
                                data-testid={`button-delete-video-${video.id}`}
                                aria-label="Delete video"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </DialogTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Delete this video?</DialogTitle>
                            <DialogDescription>
                              "{video.name}" will be removed for everyone in this room.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <DialogClose asChild>
                              <Button
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => onDeleteVideo(video)}
                              >
                                Delete
                              </Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TooltipProvider>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelectVideo(video)}
                    className="h-7 text-xs px-3"
                    data-testid={`button-select-video-${video.id}`}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Select
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
    
    {/* Seeding Progress Modal */}
    <SeedingProgressModal
      isOpen={showProgressModal}
      onClose={() => setShowProgressModal(false)}
      fileName={currentFileName}
      progress={seedingProgress}
      shareSpeed={shareSpeed}
      peers={peers}
      isCompleted={seedingProgress >= 100}
    />
    </>
  );
}