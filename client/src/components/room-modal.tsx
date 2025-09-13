import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n";
import LanguageSwitcher from "@/components/language-switcher";

interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinRoom: (roomCode: string, username: string) => void;
  onCreateRoom: (roomName: string, username: string, roomCode?: string) => void;
}

export default function RoomModal({ isOpen, onClose, onJoinRoom, onCreateRoom }: RoomModalProps) {
  const t = useT('common');
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinUsername, setJoinUsername] = useState("");
  const [createRoomName, setCreateRoomName] = useState("");
  const [createUsername, setCreateUsername] = useState("");
  const [createRoomCode, setCreateRoomCode] = useState("");
  const [showRoomCodeInput, setShowRoomCodeInput] = useState(false);
  const [activeTab, setActiveTab] = useState("join");

  const handleJoin = () => {
    if (joinUsername.trim()) {
      onJoinRoom(joinRoomCode.trim(), joinUsername.trim());
    }
  };

  const handleCreate = () => {
    if (createRoomName.trim() && createUsername.trim()) {
      const roomCode = showRoomCodeInput && createRoomCode.trim() ? createRoomCode.trim() : undefined;
      onCreateRoom(createRoomName.trim(), createUsername.trim(), roomCode);
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
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">{t('joinOrCreate')}</DialogTitle>
            <LanguageSwitcher />
          </div>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="join" data-testid="tab-join">{t('joinRoom')}</TabsTrigger>
            <TabsTrigger value="create" data-testid="tab-create">{t('createRoom')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="join" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="join-username">{t('yourName')}</Label>
              <Input
                id="join-username"
                type="text"
                autoComplete="name"
                placeholder={t('enterDisplayName')}
                value={joinUsername}
                onChange={(e) => setJoinUsername(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleJoin)}
                data-testid="input-join-username"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="join-room-code">{t('roomPasswordIf')}</Label>
              <Input
                id="join-room-code"
                type="password"
                placeholder={t('enterRoomPasswordOpt')}
                value={joinRoomCode}
                onChange={(e) => setJoinRoomCode(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleJoin)}
                data-testid="input-join-room-code"
              />
            </div>
            
            <Button
              onClick={handleJoin}
              disabled={!joinUsername.trim()}
              className="w-full"
              data-testid="button-join-room"
            >
              {t('joinRoom')}
            </Button>
          </TabsContent>
          
          <TabsContent value="create" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-room-name">{t('roomName')}</Label>
              <Input
                id="create-room-name"
                placeholder={t('enterRoomName')}
                value={createRoomName}
                onChange={(e) => setCreateRoomName(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleCreate)}
                data-testid="input-create-room-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="create-username">{t('yourName')}</Label>
              <Input
                id="create-username"
                type="text"
                autoComplete="name"
                placeholder={t('enterDisplayName')}
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleCreate)}
                data-testid="input-create-username"
              />
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="enable-room-code"
                  checked={showRoomCodeInput}
                  onCheckedChange={setShowRoomCodeInput}
                  data-testid="switch-enable-room-code"
                />
                <Label htmlFor="enable-room-code" className="text-sm font-medium">{t('setRoomPassword')}</Label>
              </div>
              
              {showRoomCodeInput && (
                <div className="space-y-2">
                  <Label htmlFor="create-room-code">{t('roomPassword')}</Label>
                  <Input
                    id="create-room-code"
                    type="password"
                    placeholder={t('enterRoomPassword')}
                    value={createRoomCode}
                    onChange={(e) => setCreateRoomCode(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, handleCreate)}
                    data-testid="input-create-room-code"
                  />
                </div>
              )}
            </div>
            
            <Button
              onClick={handleCreate}
              disabled={!createRoomName.trim() || !createUsername.trim()}
              className="w-full"
              data-testid="button-create-room"
            >
              {t('createRoom')}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
