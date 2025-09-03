import { useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileVideo, Play, Share2, Trash2, AlertCircle, Upload, Link, FileText } from "lucide-react";
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
  uploadedBy?: string;
}

interface FileShareProps {
  onVideoShare: (file: File, onProgress?: (progress: number) => void, handle?: any) => Promise<void>;
  onTorrentShare?: (torrentFile: File) => Promise<void>;
  onMagnetShare?: (magnetUri: string) => Promise<void>;
  videos: Video[];
  onSelectVideo: (video: Video) => void;
  onDeleteVideo?: (video: Video) => void;
  shareSpeed?: number;
  peers?: number;
  statsByInfoHash?: Record<string, { uploadMBps: number; downloadMBps: number; peers: number; progress: number; name?: string }>;
  currentUser?: { id: string; username: string } | null;
}

export default function FileShare({ onVideoShare, onTorrentShare, onMagnetShare, videos, onSelectVideo, onDeleteVideo, shareSpeed = 0, peers = 0, statsByInfoHash = {}, currentUser }: FileShareProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [seedingProgress, setSeedingProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState("");
  const [activeTab, setActiveTab] = useState("file");
  const [magnetUri, setMagnetUri] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const torrentFileInputRef = useRef<HTMLInputElement>(null);
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
      // Note: traditional file input doesn't provide handle, so no auto re-seed after refresh
      console.log("⚠️ Using traditional file input - no handle available for auto re-seed");
      await onVideoShare(file, (progress: number) => {
        setSeedingProgress(progress);
        console.log(`📈 Seeding progress: ${progress.toFixed(1)}%`);
      }, undefined); // Explicitly pass undefined for handle

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

  const openTorrentFileDialog = () => {
    if (torrentFileInputRef.current) {
      torrentFileInputRef.current.value = '';
      torrentFileInputRef.current.click();
    }
  };

  const handleTorrentFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    console.log("Selected torrent file:", { name: file.name, type: file.type, size: file.size });
    
    // Validate torrent file type
    if (!file.name.toLowerCase().endsWith('.torrent')) {
      toast({
        title: "Invalid file type",
        description: "Please select a .torrent file",
        variant: "destructive",
      });
      return;
    }

    try {
      if (onTorrentShare) {
        setIsUploading(true);
        
        // **INSTANT FEEDBACK**: Show torrent file name immediately
        const torrentFileName = file.name.replace('.torrent', '');
        
        console.log("🚀 Adding torrent placeholder:", torrentFileName);
        
        toast({
          title: "Processing torrent file",
          description: `Loading "${torrentFileName}"...`,
        });
        
        // **ASYNC PROCESSING**: The actual processing happens in background
        await onTorrentShare(file);
        console.log("Torrent share initialized");
        
        toast({
          title: "Torrent file ready",
          description: "Video is now available for streaming",
        });
      }
    } catch (error) {
      console.error("Torrent share failed:", error);
      toast({
        title: "Share failed",
        description: "Failed to load torrent file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleMagnetSubmit = async () => {
    const uri = magnetUri.trim();
    if (!uri) {
      toast({
        title: "Empty magnet link",
        description: "Please enter a magnet link",
        variant: "destructive",
      });
      return;
    }

    // Validate magnet URI format
    if (!uri.toLowerCase().startsWith('magnet:?')) {
      toast({
        title: "Invalid magnet link",
        description: "Please enter a valid magnet link starting with 'magnet:?'",
        variant: "destructive",
      });
      return;
    }

    try {
      if (onMagnetShare) {
        setIsUploading(true);
        
        // **INSTANT FEEDBACK**: Extract filename from magnet URI for immediate display
        const nameMatch = uri.match(/[&?]dn=([^&]+)/i);
        const fileName = nameMatch ? decodeURIComponent(nameMatch[1]) : "Loading torrent...";
        
        console.log("🚀 Adding magnet placeholder:", fileName);
        
        // Show immediate feedback to user
        toast({
          title: "Processing magnet link",
          description: `Loading "${fileName}"...`,
        });
        
        // **ASYNC PROCESSING**: The actual processing happens in background
        await onMagnetShare(uri);
        console.log("Magnet share initialized");
        setMagnetUri(""); // Clear input after successful share
        
        toast({
          title: "Magnet link ready",
          description: "Video is now available for streaming",
        });
      }
    } catch (error) {
      console.error("Magnet share failed:", error);
      toast({
        title: "Share failed",
        description: "Failed to load magnet link. Please check the link and try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };


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

  // Helper to check if video needs warning message (only for videos uploaded by current user)
  const needsWarning = (video: Video) => {
    // Don't show warning for temporary placeholders or processing videos
    if ((video as any).status === 'processing' || video.id.startsWith('temp-')) {
      return false;
    }
    
    // Don't show warning for magnet link videos (they were shared via magnet link input)
    // We identify magnet link videos by checking if the video ID contains 'temp-magnet'
    if (video.id.includes('temp-magnet')) {
      return false;
    }
    
    const hasInfoHash = !!video.infoHash;
    const hasStats = video.infoHash && !!statsByInfoHash[video.infoHash];
    const hasCurrentUser = !!currentUser;
    const isUploadedByCurrentUser = currentUser && video.uploadedBy === currentUser.id;
    
    const result = hasInfoHash && !hasStats && hasCurrentUser && isUploadedByCurrentUser;
    console.log(`🔍 Resume button check for ${video.name}:`);
    console.log(`  hasInfoHash: ${hasInfoHash} (${video.infoHash})`);
    console.log(`  hasStats: ${hasStats}`);
    console.log(`  hasCurrentUser: ${hasCurrentUser}`);
    console.log(`  isUploadedByCurrentUser: ${isUploadedByCurrentUser}`);
    console.log(`  videoUploadedBy: ${video.uploadedBy}`);
    console.log(`  currentUserId: ${currentUser?.id}`);
    console.log(`  video.id: ${video.id} (contains temp-magnet: ${video.id.includes('temp-magnet')})`);
    console.log(`  magnetUri: ${video.magnetUri}`);
    console.log(`  🎯 FINAL needsWarning result: ${result}`);
    
    return hasInfoHash && !hasStats && hasCurrentUser && isUploadedByCurrentUser;
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Reset magnet input when switching tabs
    if (tab !== 'magnet') {
      setMagnetUri("");
    }
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
      
      {/* Share Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="file" data-testid="tab-file-upload">
            <Upload className="w-4 h-4 mr-2" />
            Local File
          </TabsTrigger>
          <TabsTrigger value="torrent" data-testid="tab-torrent-upload">
            <FileText className="w-4 h-4 mr-2" />
            Torrent File
          </TabsTrigger>
          <TabsTrigger value="magnet" data-testid="tab-magnet-link">
            <Link className="w-4 h-4 mr-2" />
            Magnet Link
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="file" className="space-y-4 mt-4">
          {/* Local File Upload */}
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
                Supports MP4, WebM, AVI, MKV • Max 2GB
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
        </TabsContent>
        
        <TabsContent value="torrent" className="space-y-4 mt-4">
          {/* Torrent File Upload */}
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer border-border hover:border-primary/50"
            onClick={openTorrentFileDialog}
            data-testid="dropzone-torrent-upload"
          >
            <div className="space-y-2">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
              <p className="text-foreground">
                {isUploading ? "Loading torrent..." : "Click to select a .torrent file"}
              </p>
              <p className="text-sm text-muted-foreground">
                Upload a .torrent file to start downloading and sharing
              </p>
            </div>
            
            <input
              ref={torrentFileInputRef}
              type="file"
              accept=".torrent"
              className="hidden"
              onChange={(e) => handleTorrentFileSelect(e.target.files)}
              data-testid="input-torrent-upload"
            />
          </div>
        </TabsContent>
        
        <TabsContent value="magnet" className="space-y-4 mt-4">
          {/* Magnet Link Input */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="magnet-uri">Magnet Link</Label>
              <Input
                id="magnet-uri"
                type="text"
                placeholder="magnet:?xt=urn:btih:..."
                value={magnetUri}
                onChange={(e) => setMagnetUri(e.target.value)}
                disabled={false} // Allow magnet input even during file upload
                data-testid="input-magnet-uri"
              />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Paste a magnet link to start downloading and sharing the video</p>
                <p className="text-amber-600 dark:text-amber-400">
                  ⚠️ Note: Only WebTorrent-compatible magnets work reliably. Traditional BitTorrent magnets may timeout.
                </p>
                <p className="text-blue-600 dark:text-blue-400">
                  💡 Format tip: MP4/WebM work best. MKV may have audio issues due to advanced codecs.
                </p>
              </div>
            </div>
            <Button
              onClick={handleMagnetSubmit}
              disabled={!magnetUri.trim()}
              className="w-full"
              data-testid="button-magnet-submit"
            >
              Start Download & Share
            </Button>
          </div>
        </TabsContent>
      </Tabs>

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
                className="group flex items-center justify-between p-2 hover:bg-secondary rounded-lg transition-colors"
                data-testid={`video-item-${video.id}`}
              >
                {/* Left side - Video info with fixed width to prevent layout shifts */}
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <FileVideo className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" data-testid={`text-video-name-${video.id}`} title={video.name}>
                      {video.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(video.size)} • {formatSharedTime(video.uploadedAt)}
                      </p>
                      {/* **NEW**: Show processing status */}
                      {(video as any).status === 'processing' && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-500">
                          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                          <span>{(video as any).processingStep || 'Loading...'}</span>
                        </div>
                      )}
                      {(video as any).status === 'error' && (
                        <div className="flex items-center gap-1 text-[10px] text-red-500">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <span>Failed</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Right side - P2P Status and Actions with fixed width */}
                <div className="flex items-center gap-4 min-w-[280px] justify-end">
                  {/* P2P and seeding status with consistent positioning */}
                  {isVideoBeingSeeded(video) ? (
                    <div className="space-y-1 flex-shrink-0">
                      {/* Seeding progress for current uploading file */}
                      {currentFileName === video.name && (isUploading || seedingProgress < 100) && (
                        <div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>Seeding progress</span>
                            <span className="font-mono text-primary">{seedingProgress.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 w-48 bg-secondary rounded overflow-hidden mt-1">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, seedingProgress))}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {/* P2P network status */}
                      {video.infoHash && statsByInfoHash[video.infoHash] && (
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="text-green-500 font-medium">Seeding</span>
                          <span>Peers: <span className="text-blue-400">{statsByInfoHash[video.infoHash].peers}</span></span>
                          <span>↑ <span className="text-green-400">{formatSpeed(statsByInfoHash[video.infoHash].uploadMBps || 0)}</span></span>
                          <span>↓ <span className="text-yellow-400">{formatSpeed(statsByInfoHash[video.infoHash].downloadMBps || 0)}</span></span>
                        </div>
                      )}
                    </div>
                  ) : needsWarning(video) ? (
                    <button
                      className="px-2 py-1 text-[11px] bg-amber-500/20 text-amber-600 border border-amber-500/30 rounded hover:bg-amber-500/30 transition-colors cursor-pointer flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReshareFromDB(video);
                      }}
                      data-testid={`button-reshare-${video.id}`}
                    >
                      Click to resume seeding
                    </button>
                  ) : (
                    <div className="w-48 flex-shrink-0"></div>
                  )}
                  
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