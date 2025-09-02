import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Share, Users, Activity } from "lucide-react";

interface SeedingProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  progress: number;
  shareSpeed: number;
  peers: number;
  isCompleted: boolean;
}

export default function SeedingProgressModal({
  isOpen,
  onClose,
  fileName,
  progress,
  shareSpeed,
  peers,
  isCompleted
}: SeedingProgressModalProps) {
  const formatSpeed = (speed: number) => {
    if (speed < 1) {
      return `${(speed * 1024).toFixed(0)} KB/s`;
    }
    return `${speed.toFixed(1)} MB/s`;
  };

  const getProgressColor = () => {
    if (isCompleted) return "bg-green-500";
    if (progress > 50) return "bg-blue-500";
    if (progress > 25) return "bg-yellow-500";
    return "bg-orange-500";
  };

  const getStatusMessage = () => {
    if (progress >= 100) {
      return peers > 0
        ? "✅ Ready. Seeding to peers..."
        : "✅ Ready. Waiting for peers...";
    }
    if (progress > 80) return "🔥 Almost ready...";
    if (progress > 50) return "📡 Building peer connections...";
    if (progress > 10) return "⚡ Creating torrent...";
    return "🚀 Starting video seeding...";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-seeding-progress">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Share className="w-5 h-5 text-primary mr-2" />
              Sharing Video
            </div>
          </DialogTitle>
          <DialogDescription>
            Seeding your video over P2P. Keep this tab open to continue sharing.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* File Info */}
          <div className="text-center">
            <p className="font-medium text-sm truncate" data-testid="text-filename">
              {fileName}
            </p>
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-status">
              {getStatusMessage()}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span className="font-mono" data-testid="text-progress-percent">
                {progress.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={progress} 
              className="h-3"
              data-testid="progress-seeding"
            />
          </div>

          {/* Stats Grid */}
          {(() => {
            const showSpeed = peers > 0 && shareSpeed > 0;
            return (
              <div className={`grid ${showSpeed ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                {showSpeed && (
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-green-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Send Speed</p>
                      <p className="text-sm font-mono" data-testid="text-upload-speed">
                        {formatSpeed(shareSpeed)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Connected Peers</p>
                    <p className="text-sm font-mono" data-testid="text-peer-count">
                      {peers}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            {isCompleted ? (
              <Button onClick={onClose} data-testid="button-done">
                Done
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={onClose}
                data-testid="button-minimize"
              >
                Minimize
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
