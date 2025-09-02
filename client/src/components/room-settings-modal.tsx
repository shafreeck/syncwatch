import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Room {
  id: string;
  name: string;
  roomCode?: string;
}

interface RoomSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: Room | null;
  onRoomUpdate?: (room: Room) => void;
}

export default function RoomSettingsModal({ 
  open, 
  onOpenChange, 
  room,
  onRoomUpdate 
}: RoomSettingsModalProps) {
  const [roomCode, setRoomCode] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (room) {
      setRoomCode(room.roomCode || "");
      setHasPassword(!!room.roomCode);
    }
  }, [room]);

  const handleSave = async () => {
    if (!room) return;
    
    setIsLoading(true);
    try {
      const finalRoomCode = hasPassword && roomCode.trim() ? roomCode.trim() : null;
      
      const response = await fetch(`/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: finalRoomCode }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update room");
      }
      
      const updatedRoom = await response.json();

      toast({
        title: "Settings updated",
        description: hasPassword 
          ? "Room password has been updated" 
          : "Room password has been removed",
      });

      if (onRoomUpdate) {
        onRoomUpdate(updatedRoom);
      }
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Update failed",
        description: "Failed to update room settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordToggle = (enabled: boolean) => {
    setHasPassword(enabled);
    if (!enabled) {
      setRoomCode("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Room Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">
              Room Name
            </Label>
            <p className="text-sm mt-1" data-testid="text-room-name">
              {room?.name}
            </p>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Switch 
                id="enable-password"
                checked={hasPassword}
                onCheckedChange={handlePasswordToggle}
                data-testid="switch-enable-password"
              />
              <Label htmlFor="enable-password" className="text-sm font-medium">
                Require Password to Join
              </Label>
            </div>
            
            {hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="room-password">Room Password</Label>
                <Input
                  id="room-password"
                  type="password"
                  placeholder="Enter room password"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  data-testid="input-room-password"
                />
              </div>
            )}
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              data-testid="button-cancel-settings"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading || (hasPassword && !roomCode.trim())}
              data-testid="button-save-settings"
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}