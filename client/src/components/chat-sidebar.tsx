import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, MessageCircle, Send, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  username: string;
  isHost?: boolean;
  joinedAt?: Date;
}

interface Message {
  id: string;
  content: string;
  userId: string;
  timestamp?: Date;
  user?: User;
}

interface ChatSidebarProps {
  users: User[];
  messages: Message[];
  userProgresses?: Record<string, { currentTime: number; isPlaying: boolean; lastUpdate: number }>;
  currentUser: User | null;
  onSendMessage: (content: string) => void;
  onSyncToHost?: (targetTime: number) => void;
  roomId?: string;
  videoDuration?: number; // For accurate progress bar calculation
}

export default function ChatSidebar({
  users,
  messages,
  userProgresses = {},
  currentUser,
  onSendMessage,
  onSyncToHost,
  roomId,
  videoDuration = 600, // Default 10 minutes
}: ChatSidebarProps) {
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (messageInput.trim() && roomId) {
      onSendMessage(messageInput.trim());
      setMessageInput("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyInviteLink = async () => {
    if (!roomId) return;
    
    const link = `${window.location.origin}/room/${roomId}`;
    await navigator.clipboard.writeText(link);
    
    toast({
      title: "Invite link copied",
      description: "Share this link with friends to join the room",
    });
  };

  const getInitials = (username: string) => {
    return username.substring(0, 2).toUpperCase();
  };

  const formatProgressTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getUserProgress = (userId: string) => {
    const progress = userProgresses[userId];
    if (!progress) return null;
    
    // Show as "stale" if last update was more than 10 seconds ago
    const isStale = Date.now() - progress.lastUpdate > 10000;
    return { ...progress, isStale };
  };

  const formatTime = (date?: Date) => {
    if (!date) return "";
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(date));
  };

  return (
    <div className="space-y-4">
      {/* Active Users */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3 flex items-center justify-between">
          <span className="flex items-center">
            <Users className="w-5 h-5 text-primary mr-2" />
            Viewers
          </span>
          <span className="text-sm text-muted-foreground" data-testid="text-user-count">
            {users.length}
          </span>
        </h3>
        
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center space-x-3 p-2 hover:bg-secondary/50 rounded-lg"
              data-testid={`user-${user.id}`}
            >
              <div className="relative">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="text-xs">
                    {getInitials(user.username)}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 border-2 border-card rounded-full" />
              </div>
              
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium" data-testid={`text-username-${user.id}`}>
                      {user.username}
                    </span>
                    {user.isHost && (
                      <Badge variant="default" className="text-xs">
                        HOST
                      </Badge>
                    )}
                  </div>
                  
                </div>
                
                {/* User playback progress bar below name */}
                {(() => {
                  const progress = getUserProgress(user.id);
                  if (!progress) return null;
                  
                  const progressPercent = videoDuration > 0 ? Math.min(100, Math.max(0, (progress.currentTime / videoDuration) * 100)) : 0;
                  const isStale = (progress as any).isStale;
                  const isPlaying = progress.isPlaying;
                  
                  let barColor = '';
                  let tooltipText = '';
                  
                  if (isStale) {
                    // 离线状态 - 灰色
                    barColor = 'bg-gray-400';
                    tooltipText = 'Offline';
                  } else if (!isPlaying) {
                    // 暂停状态 - 黄色
                    barColor = 'bg-yellow-500';
                    tooltipText = 'Paused';
                  } else {
                    // 播放状态 - 根据落后程度显示绿色到红色
                    // 获取房间中最快的进度作为参考
                    const allUserIds = Object.keys(userProgresses || {});
                    const activeProgresses = allUserIds
                      .map(id => getUserProgress(id))
                      .filter(p => p && !(p as any).isStale && p.isPlaying)
                      .map(p => p!.currentTime);
                    
                    const maxProgress = Math.max(...activeProgresses, progress.currentTime);
                    const timeBehind = maxProgress - progress.currentTime;
                    
                    // 考虑网络延迟，3秒内算正常，3-10秒渐变，10秒以上完全红色
                    if (timeBehind <= 3) {
                      barColor = 'bg-green-500';
                      tooltipText = 'Playing (synced)';
                    } else if (timeBehind >= 10) {
                      barColor = 'bg-red-500';
                      tooltipText = `Playing (${Math.round(timeBehind)}s behind)`;
                    } else {
                      // 3-10秒之间的渐变：绿色到红色
                      const ratio = (timeBehind - 3) / 7; // 0-1之间
                      barColor = '';
                      tooltipText = `Playing (${Math.round(timeBehind)}s behind)`;
                    }
                  }
                  
                  return (
                    <div 
                      className="mt-1.5 w-full h-0.5 bg-secondary rounded-full overflow-hidden cursor-help"
                      title={tooltipText}
                    >
                      <div 
                        className={`h-full transition-all duration-300 ${barColor}`}
                        style={{ 
                          width: `${progressPercent}%`,
                          ...(barColor === '' && !isStale && isPlaying ? {
                            // 动态颜色用于3-10秒落后的渐变
                            backgroundColor: (() => {
                              const allUserIds = Object.keys(userProgresses || {});
                              const activeProgresses = allUserIds
                                .map(id => getUserProgress(id))
                                .filter(p => p && !(p as any).isStale && p.isPlaying)
                                .map(p => p!.currentTime);
                              const maxProgress = Math.max(...activeProgresses, progress.currentTime);
                              const timeBehind = maxProgress - progress.currentTime;
                              const ratio = (timeBehind - 3) / 7;
                              const red = Math.round(34 + ratio * (239 - 34));
                              const green = Math.round(197 - ratio * 197);
                              return `rgb(${red}, ${green}, 82)`;
                            })()
                          } : {})
                        }}
                      />
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>

        {/* Invite Link */}
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-center space-x-2">
            <Input
              type="text"
              value={roomId ? `syncwatch.app/room/${roomId}` : ""}
              readOnly
              className="flex-1 text-sm"
              data-testid="input-invite-link"
            />
            <Button
              variant="default"
              size="sm"
              onClick={copyInviteLink}
              data-testid="button-copy-invite-link"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Chat Section */}
      <Card className="flex flex-col h-96">
        <div className="p-4 border-b border-border">
          <h3 className="text-lg font-semibold flex items-center">
            <MessageCircle className="w-5 h-5 text-primary mr-2" />
            Chat
          </h3>
        </div>
        
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="chat-messages">
          {messages.map((message) => (
            <div key={message.id} className="flex items-start space-x-3">
              <Avatar className="w-6 h-6 flex-shrink-0">
                <AvatarFallback className="text-xs">
                  {message.user ? getInitials(message.user.username) : "?"}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-sm font-medium" data-testid={`text-message-username-${message.id}`}>
                    {message.user?.username || "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground" data-testid={`text-message-time-${message.id}`}>
                    {formatTime(message.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-foreground" data-testid={`text-message-content-${message.id}`}>
                  {message.content}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Chat Input */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center space-x-2">
            <Input
              type="text"
              placeholder="Type a message..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
              data-testid="input-chat-message"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!messageInput.trim()}
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
