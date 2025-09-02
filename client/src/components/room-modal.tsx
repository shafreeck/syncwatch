import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinRoom: (roomCode: string, username: string) => void;
  onCreateRoom: (roomName: string, username: string, roomCode?: string) => void;
}

export default function RoomModal({ isOpen, onClose, onJoinRoom, onCreateRoom }: RoomModalProps) {
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinUsername, setJoinUsername] = useState("");
  const [createRoomName, setCreateRoomName] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createRoomCode, setCreateRoomCode] = useState("");
  const [activeTab, setActiveTab] = useState("join");

  const handleJoin = () => {
    if (joinRoomCode.trim() && joinUsername.trim()) {
      onJoinRoom(joinRoomCode.trim(), joinUsername.trim());
    }
  };

  const handleCreate = () => {
    if (createRoomName.trim() && createUsername.trim()) {
      onCreateRoom(createRoomName.trim(), createUsername.trim(), createRoomCode.trim() || undefined);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") {
      action();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md [&>button]:hidden" data-testid="dialog-room-modal">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Join or Create Room</DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="join" data-testid="tab-join">Join Room</TabsTrigger>
            <TabsTrigger value="create" data-testid="tab-create">Create Room</TabsTrigger>
          </TabsList>
          
          <TabsContent value="join" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="join-room-code">Room Code</Label>
              <Input
                id="join-room-code"
                type="password"
                placeholder="Enter room code (e.g., abc123)"
                value={joinRoomCode}
                onChange={(e) => setJoinRoomCode(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleJoin)}
                data-testid="input-join-room-code"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="join-username">Your Name</Label>
              <Input
                id="join-username"
                type="text"
                autoComplete="name"
                placeholder="Enter your display name"
                value={joinUsername}
                onChange={(e) => setJoinUsername(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleJoin)}
                data-testid="input-join-username"
              />
            </div>
            
            <Button
              onClick={handleJoin}
              disabled={!joinRoomCode.trim() || !joinUsername.trim()}
              className="w-full"
              data-testid="button-join-room"
            >
              Join Room
            </Button>
          </TabsContent>
          
          <TabsContent value="create" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-room-name">Room Name</Label>
              <Input
                id="create-room-name"
                placeholder="Enter room name"
                value={createRoomName}
                onChange={(e) => setCreateRoomName(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleCreate)}
                data-testid="input-create-room-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="create-username">Your Name</Label>
              <Input
                id="create-username"
                type="text"
                autoComplete="name"
                placeholder="Enter your display name"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleCreate)}
                data-testid="input-create-username"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="create-room-code">Room Code (Optional)</Label>
              <Input
                id="create-room-code"
                type="password"
                placeholder="Enter custom room code (leave empty for auto-generated)"
                value={createRoomCode}
                onChange={(e) => setCreateRoomCode(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleCreate)}
                data-testid="input-create-room-code"
              />
            </div>
            
            <Button
              onClick={handleCreate}
              disabled={!createRoomName.trim() || !createUsername.trim()}
              className="w-full"
              data-testid="button-create-room"
            >
              Create Room
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
