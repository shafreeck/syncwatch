import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';

type Resources = Record<string, Record<string, string>>;

const resources: Record<'en' | 'zh', Resources> = {
  en: {
    common: {
      viewers: 'Viewers',
      chat: 'Chat',
      share: 'Share',
      room: 'Room',
      allowControl: 'Allow Control',
      // player overlay
      p2p: 'P2P',
      recv: 'Recv',
      peers: 'peers',
      synced: 'Synced',
      noVideo: 'No video selected',
      loadingVideo: 'Loading video...',
      buffering: 'Connecting to peers and buffering content',
      // seeding modal
      sharingVideo: 'Sharing Video',
      seedingHelp: 'Seeding your video over P2P. Keep this tab open to continue sharing.',
      statusReadyWait: '✅ Ready. Waiting for peers...',
      statusReadySeed: '✅ Ready. Seeding to peers...',
      statusAlmost: '🔥 Almost ready...',
      statusBuilding: '📡 Building peer connections...',
      statusCreating: '⚡ Creating torrent...',
      statusStarting: '🚀 Starting video seeding...',
      progress: 'Progress',
      sendSpeed: 'Send Speed',
      connectedPeers: 'Connected Peers',
      done: 'Done',
      minimize: 'Minimize',
      // sidebar actions
      allow: 'Allow',
      allowed: 'Allowed',
      dismiss: 'Dismiss',
      request: 'Request',
      host: 'Host',
      all: 'All',
      // file share
      shareVideo: 'Share Video',
      localFile: 'Local File',
      torrentFile: 'Torrent File',
      magnetLink: 'Magnet Link',
      dropHere: 'Drop video files here or click to browse',
      supportsTypes: 'Supports MP4, WebM, AVI, MKV • Max 2GB',
      preparingSeeding: 'Preparing / Seeding...',
      invalidVideoType: 'Invalid file type',
      pleaseSelectVideo: 'Please select a video file',
      fileTooLarge: 'File too large',
      pleaseSelectSmaller: 'Please select a file smaller than 2GB',
      videoReady: 'Video ready',
      shareFailed: 'Share failed',
      processingTorrent: 'Processing torrent file',
      torrentReady: 'Torrent file ready',
      invalidTorrentType: 'Invalid file type',
      pleaseSelectTorrent: 'Please select a .torrent file',
      emptyMagnet: 'Empty magnet link',
      startDownloadShare: 'Start Download & Share',
      magnetPasteHint: 'Paste a magnet link to start downloading and sharing the video',
      magnetCompatNote: '⚠️ Note: Only WebTorrent-compatible magnets work reliably. Traditional BitTorrent magnets may timeout.',
      magnetFormatTip: '💡 Format tip: MP4/WebM work best. MKV may have audio issues due to advanced codecs.',
      seedingProgress: 'Seeding progress',
      failed: 'Failed',
      availableVideos: 'Available Videos',
      typeMessage: 'Type a message…',
      invalidMagnetLink: 'Invalid magnet link',
      pleaseEnterValidMagnet: "Please enter a valid magnet link starting with 'magnet:?'",
      loadingTorrent: 'Loading torrent...',
      clickSelectTorrent: 'Click to select a .torrent file',
      loadingMagnet: 'Loading magnet...',
      processingMagnet: 'Processing magnet link',
      failedLoadMagnet: 'Failed to load magnet link. Please check the link and try again.',
      // room modal
      joinOrCreate: 'Join or Create Room',
      joinRoom: 'Join Room',
      createRoom: 'Create Room',
      yourName: 'Your Name',
      enterDisplayName: 'Enter your display name',
      roomPasswordIf: 'Room Password (if required)',
      enterRoomPasswordOpt: 'Enter room password (leave empty if no password)',
      roomName: 'Room Name',
      enterRoomName: 'Enter room name',
      setRoomPassword: 'Set Room Password',
      roomPassword: 'Room Password',
      enterRoomPassword: 'Enter room password',
    },
  },
  zh: {
    common: {
      viewers: '观众',
      chat: '聊天',
      share: '分享',
      room: '房间',
      allowControl: '允许控制',
      // player overlay
      p2p: 'P2P',
      recv: '接收',
      peers: '节点',
      synced: '已同步',
      noVideo: '暂无选中的视频',
      loadingVideo: '正在加载视频...',
      buffering: '正在连接节点并缓冲内容',
      // seeding modal
      sharingVideo: '视频分享中',
      seedingHelp: '通过 P2P 正在做种分享，请保持此标签页打开以继续分享。',
      statusReadyWait: '✅ 已就绪，等待连接节点…',
      statusReadySeed: '✅ 已就绪，正在向节点做种…',
      statusAlmost: '🔥 即将完成…',
      statusBuilding: '📡 正在建立节点连接…',
      statusCreating: '⚡ 正在创建种子…',
      statusStarting: '🚀 开始分享视频…',
      progress: '进度',
      sendSpeed: '发送速度',
      connectedPeers: '已连接节点',
      done: '完成',
      minimize: '最小化',
      // sidebar actions
      allow: '允许',
      allowed: '已允许',
      dismiss: '忽略',
      request: '请求',
      host: '房主',
      all: '所有人',
      // file share
      shareVideo: '分享视频',
      localFile: '本地文件',
      torrentFile: 'Torrent 文件',
      magnetLink: '磁力链接',
      dropHere: '拖拽视频到此处或点击选择',
      supportsTypes: '支持 MP4、WebM、AVI、MKV • 最大 2GB',
      preparingSeeding: '准备中 / 正在做种…',
      invalidVideoType: '无效的文件类型',
      pleaseSelectVideo: '请选择一个视频文件',
      fileTooLarge: '文件过大',
      pleaseSelectSmaller: '请选择一个小于 2GB 的文件',
      videoReady: '视频就绪',
      shareFailed: '分享失败',
      processingTorrent: '正在处理 Torrent 文件',
      torrentReady: 'Torrent 文件已就绪',
      invalidTorrentType: '无效的文件类型',
      pleaseSelectTorrent: '请选择 .torrent 文件',
      emptyMagnet: '磁力链接为空',
      startDownloadShare: '开始下载并分享',
      magnetPasteHint: '粘贴磁力链接以开始下载并分享视频',
      magnetCompatNote: '⚠️ 注意：仅 WebTorrent 兼容的磁力链接能稳定工作，传统 BT 磁力可能超时。',
      magnetFormatTip: '💡 格式建议：MP4/WebM 兼容性最佳，MKV 可能因编解码导致无声等问题。',
      seedingProgress: '做种进度',
      failed: '失败',
      availableVideos: '可用视频',
      typeMessage: '输入消息…',
      invalidMagnetLink: '无效的磁力链接',
      pleaseEnterValidMagnet: "请输入以 'magnet:?' 开头的有效磁力链接",
      loadingTorrent: '正在加载种子…',
      clickSelectTorrent: '点击选择 .torrent 文件',
      loadingMagnet: '正在加载磁力链接…',
      processingMagnet: '正在处理磁力链接',
      failedLoadMagnet: '加载磁力链接失败，请检查链接后重试。',
      // room modal
      joinOrCreate: '加入或创建房间',
      joinRoom: '加入房间',
      createRoom: '创建房间',
      yourName: '你的昵称',
      enterDisplayName: '请输入你的昵称',
      roomPasswordIf: '房间密码（如需）',
      enterRoomPasswordOpt: '请输入房间密码（无密码留空）',
      roomName: '房间名称',
      enterRoomName: '请输入房间名称',
      setRoomPassword: '设置房间密码',
      roomPassword: '房间密码',
      enterRoomPassword: '请输入房间密码',
    },
  },
};

type Lang = 'en' | 'zh';

function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {}
  try {
    const nav = navigator?.language?.toLowerCase() || '';
    if (nav.startsWith('zh')) return 'zh';
  } catch {}
  return 'en';
}

type I18nContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, ns?: string) => string;
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang());

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('lang', l); } catch {}
  };

  const t = (key: string, ns = 'common') => {
    const table = resources[lang]?.[ns] || {};
    return table[key] || resources.en.common[key] || key;
  };

  const value = useMemo(() => ({ lang, setLang, t }), [lang]);

  // Sync <html lang>
  useEffect(() => {
    try { document.documentElement.lang = lang; } catch {}
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export function useT(ns?: string) {
  const { t } = useI18n();
  return (key: string) => t(key, ns);
}
