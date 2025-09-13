import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, MessageCircle, Send, Settings, Lock, Crown, KeyRound, Hand } from "lucide-react";

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
  onShowRoomSettings?: () => void;
  roomId?: string;
  videoDuration?: number; // For accurate progress bar calculation
  hostOnlyControl?: boolean;
  allowedControlUserIds?: string[];
  onGrantControl?: (userId: string, canControl: boolean) => void;
  onRequestControl?: () => void;
  setHostOnlyControl?: (value: boolean) => void;
  roomStateProcessed?: boolean;
}

export default function ChatSidebar({
  users,
  messages,
  userProgresses = {},
  currentUser,
  onSendMessage,
  onSyncToHost,
  onShowRoomSettings,
  roomId,
  videoDuration = 600, // Default 10 minutes
  hostOnlyControl = false,
  allowedControlUserIds = [],
  onGrantControl,
  onRequestControl,
  setHostOnlyControl,
  roomStateProcessed = false,
}: ChatSidebarProps) {
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          {/* 回归最稳定的布局：单行靠右 + 固定间距 */}
          <div className="flex items-center justify-end space-x-2">
            <span className="text-sm text-muted-foreground" data-testid="text-user-count">
              {users.length}
            </span>
            {roomStateProcessed && currentUser?.isHost && (
              <div className="flex items-center space-x-2">
                {/* 极简开关：语义改为 Allow Control（开=所有人可控，关=仅房主） */}
                <button
                  type="button"
                  onClick={() => setHostOnlyControl && setHostOnlyControl(!hostOnlyControl)}
                  aria-pressed={!hostOnlyControl}
                  className={`relative inline-flex items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                    ${!hostOnlyControl ? 'bg-emerald-500/30' : 'bg-white/10'}
                    ring-1 ring-white/10 h-4 sm:h-5 w-8 sm:w-9`}
                  title={!hostOnlyControl ? 'Allow Control: on (everyone)' : 'Allow Control: off (host only)'}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 inline-block rounded-full transition-transform shadow-sm 
                      ${!hostOnlyControl ? 'bg-white/70' : 'bg-white/60'}
                      h-3 w-3 sm:h-4 sm:w-4
                      ${!hostOnlyControl ? 'translate-x-4 sm:translate-x-[18px]' : 'translate-x-0'}`}
                  />
                </button>
                <div className={`flex items-center select-none text-[10px] sm:text-xs ${!hostOnlyControl ? 'text-emerald-300' : 'text-white/60'}`}>
                  <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                  <span className="hidden sm:inline">Allow Control</span>
                </div>
              </div>
            )}
            {currentUser?.isHost && onShowRoomSettings && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onShowRoomSettings}
                className="h-8 w-8 p-0"
                data-testid="button-room-settings"
                title="Room Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}
          </div>
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
                    <span 
                      className={`text-sm font-medium ${
                        user.isHost ? 'text-purple-400' : ''
                      }`} 
                      data-testid={`text-username-${user.id}`}
                    >
                      {user.username}
                    </span>
                  </div>
                  {/* Per-user control chips */}
                  <div className="flex items-center">
                    {user.isHost && (
                      <span className="inline-flex items-center gap-1 text-xs text-purple-400" title="Room host">
                        <Crown className="w-3.5 h-3.5" /> Host
                      </span>
                    )}
                    {roomStateProcessed && currentUser?.isHost && !user.isHost && onGrantControl && (
                      <button
                        onClick={() => onGrantControl(user.id, !allowedControlUserIds.includes(user.id))}
                        className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[11px] transition-all ${
                          allowedControlUserIds.includes(user.id)
                            ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25'
                            : 'bg-white/5 text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white'
                        }`}
                        title={allowedControlUserIds.includes(user.id) ? 'Revoke control' : 'Grant control'}
                        aria-label={allowedControlUserIds.includes(user.id) ? 'Revoke control' : 'Grant control'}
                      >
                        <KeyRound className="w-3 h-3" />
                        {allowedControlUserIds.includes(user.id) ? 'Allowed' : 'Allow'}
                      </button>
                    )}
                    {roomStateProcessed && !currentUser?.isHost && currentUser?.id === user.id && hostOnlyControl && !allowedControlUserIds.includes(user.id) && onRequestControl && (
                      <button
                        onClick={() => onRequestControl()}
                        className="inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[11px] bg-white/5 text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
                        title="Request playback control"
                        aria-label="Request playback control"
                      >
                        <Hand className="w-3 h-3" /> Request
                      </button>
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
