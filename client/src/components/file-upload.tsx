import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudUpload, FileVideo, Play, Share2, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
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
}

interface FileUploadProps {
  onVideoUpload: (file: File, onProgress?: (progress: number) => void) => Promise<void>;
  videos: Video[];
  onSelectVideo: (video: Video) => void;
  onDeleteVideo?: (video: Video) => void;
  uploadSpeed?: number;
  peers?: number;
}

export default function FileUpload({ onVideoUpload, videos, onSelectVideo, onDeleteVideo, uploadSpeed = 0, peers = 0 }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [seedingProgress, setSeedingProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Reduce logging frequency
  if (videos?.length !== 0) {
    console.log('FileUpload rendered with videos:', videos?.length || 0, videos);
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
    console.log("Starting video upload...");
    
    try {
      // Pass progress callback to track seeding progress
      await onVideoUpload(file, (progress: number) => {
        setSeedingProgress(progress);
        console.log(`📈 Seeding progress: ${progress.toFixed(1)}%`);
      });

      console.log("Video upload initialized (seeding continues in background)");
      // Do not auto-close: keep the modal until user closes/minimizes
      if (seedingProgress >= 100) {
        toast({
          title: "Video ready",
          description: `${file.name} is now ready for streaming`,
        });
      }

    } catch (error) {
      console.error("Video upload failed:", error);
      setShowProgressModal(false);
      toast({
        title: "Upload failed",
        description: "Failed to upload video. Please try again.",
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

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleOneClickSeed = () => {
    openFileDialog();
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

  const formatUploadTime = (date?: Date) => {
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

  return (
    <>
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          <CloudUpload className="w-5 h-5 text-primary mr-2" />
          Share Video
        </h3>
        
        {/* One-Click Seed Button */}
        <Button
          onClick={handleOneClickSeed}
          disabled={isUploading}
          size="sm"
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
          data-testid="button-one-click-seed"
        >
          <Share2 className="w-4 h-4 mr-1" />
          One-Click Share
        </Button>
      </div>
      
      {/* Upload Dropzone */}
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

      {/* Recent Files */}
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
                <div className="flex items-center space-x-3">
                  <FileVideo className="w-4 h-4 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium" data-testid={`text-video-name-${video.id}`}>
                      {video.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(video.size)} • {formatUploadTime(video.uploadedAt)}
                    </p>
                    {/* Inline seeding progress for the current uploading file */}
                    {currentFileName === video.name && (isUploading || seedingProgress < 100) && (
                      <div className="mt-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Seeding progress</span>
                          <span className="font-mono">{seedingProgress.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-48 bg-secondary rounded overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, seedingProgress))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {onDeleteVideo && (
                    <TooltipProvider delayDuration={200}>
                      <Dialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="opacity-60 group-hover:opacity-100 hover:bg-red-50/5 hover:text-red-500"
                                data-testid={`button-delete-video-${video.id}`}
                                aria-label="Delete video"
                              >
                                <Trash2 className="w-4 h-4" />
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
      uploadSpeed={uploadSpeed}
      peers={peers}
      isCompleted={seedingProgress >= 100}
    />
    </>
  );
}
