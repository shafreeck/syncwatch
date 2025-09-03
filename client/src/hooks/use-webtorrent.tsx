import { useState, useEffect, useCallback, useRef } from "react";
import type WebTorrentNS from "webtorrent";
import getWebTorrent from "@/lib/wt-esm";
import { getAllSeeds } from "@/lib/seed-store";

// Singleton state to avoid multiple WebTorrent clients/servers per window
let globalClient: any | null = null;
let globalInit: Promise<any> | null = null;

export function useWebTorrent() {
  const [client, setClient] = useState<any>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [shareSpeed, setShareSpeed] = useState(0);
  const [peers, setPeers] = useState(0);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const currentTorrent = useRef<any>(null);
  const [statsByInfoHash, setStatsByInfoHash] = useState<
    Record<
      string,
      {
        uploadMBps: number;
        downloadMBps: number;
        peers: number;
        progress: number;
        name?: string;
      }
    >
  >({});

  const registerTorrent = useCallback((torrent: any) => {
    const toMB = (x: number) => (x || 0) / (1024 * 1024);
    
    // Throttle updates to once per second to avoid excessive UI updates
    let lastUpdateTime = 0;
    let updateTimeoutId: number | null = null;
    
    const update = () => {
      const now = Date.now();
      
      // If we just updated, schedule an update for later
      if (now - lastUpdateTime < 1000) {
        if (updateTimeoutId) return; // Already scheduled
        updateTimeoutId = window.setTimeout(() => {
          updateTimeoutId = null;
          performUpdate();
        }, 1000 - (now - lastUpdateTime));
        return;
      }
      
      performUpdate();
    };
    
    const performUpdate = () => {
      lastUpdateTime = Date.now();
      try {
        setStatsByInfoHash((prev) => ({
          ...prev,
          [torrent.infoHash]: {
            uploadMBps: toMB(torrent.uploadSpeed || 0),
            downloadMBps: toMB(torrent.downloadSpeed || 0),
            peers: torrent.numPeers || 0,
            progress: (torrent.progress || 0) * 100,
            name: torrent.name,
          },
        }));
      } catch {}
    };
    
    update();
    torrent.on("download", update);
    torrent.on("upload", update);
    torrent.on("wire", update);
    torrent.on("done", update);
    
    // Clean up timeout when torrent is removed
    const cleanup = () => {
      if (updateTimeoutId) {
        window.clearTimeout(updateTimeoutId);
        updateTimeoutId = null;
      }
    };
    torrent.on("destroyed", cleanup);
    
    return cleanup;
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        if (globalClient) {
          setClient(globalClient);
          setIsLoading(false);
          return;
        }

        if (!globalInit) {
          globalInit = (async () => {
            // Import WebTorrent constructor via centralized loader
            const WebTorrent = await getWebTorrent();

            const webTorrentClient = new WebTorrent({
              // 优化存储配置，减少磁盘占用
              maxConns: 55,        // 限制连接数
              nodeId: undefined,   // 让WebTorrent生成随机ID
              peerId: undefined,   // 让WebTorrent生成随机peer ID
              dht: true,          // 启用DHT
              lsd: false,         // 禁用本地服务发现
              natUpnp: false,     // 禁用UPnP
              // 限制内存使用，优先流式播放而非下载完整文件
              downloadLimit: -1,   // 不限制下载速度
              uploadLimit: -1,     // 不限制上传速度
            });

            const reg = await navigator.serviceWorker
              .register("/sw.min.js", { scope: "/" })
              .then(
                (r) =>
                  new Promise<ServiceWorkerRegistration>((resolve) => {
                    const w = r.active || r.waiting || r.installing;
                    const ok = (sw: ServiceWorker | null | undefined) =>
                      sw && sw.state === "activated";
                    if (ok(w)) return resolve(r);
                    w?.addEventListener("statechange", () => {
                      if (ok(w)) resolve(r);
                    });
                  }),
              );
            // Ensure the current page is controlled by our SW
            if (!navigator.serviceWorker.controller) {
              await new Promise<void>((resolve) => {
                const onCtrl = () => {
                  resolve();
                };
                navigator.serviceWorker.addEventListener(
                  "controllerchange",
                  onCtrl,
                  { once: true } as any,
                );
              });
            }

            if (typeof webTorrentClient.createServer === "function") {
              webTorrentClient.createServer({ controller: reg });
            }

            globalClient = webTorrentClient;
            // **ADD**: 设置到 window 对象，供其他组件使用
            (window as any).__webtorrentClient = webTorrentClient;
            return webTorrentClient;
          })();
        }

        const shared = await globalInit;
        setClient(shared);
        setIsLoading(false);
        // **ADD**: 确保 window 对象上也有客户端引用
        (window as any).__webtorrentClient = shared;
        // **ADD**: 暴露 registerTorrent 函数到 window 对象
        (window as any).__registerTorrent = registerTorrent;
        console.log("WebTorrent client initialized (singleton)");

        // After client is ready, attempt to re-seed from persisted file handles
        try {
          const seeds = await getAllSeeds();
          console.log("🔄 Auto re-seed check: found persisted entries:", seeds?.length || 0);
          if (seeds?.length) {
            console.log("📋 Persisted seeds:", seeds.map(s => ({ name: s.name, infoHash: s.infoHash })));
          }
          for (const s of seeds) {
            const handle = (s as any).handle;
            if (!handle) continue;
            try {
              // Ensure read permission
              const canRead = await (async () => {
                try {
                  if (typeof handle.queryPermission === "function") {
                    const p = await handle.queryPermission({ mode: "read" });
                    if (p === "granted") return true;
                  }
                } catch {}
                try {
                  if (typeof handle.requestPermission === "function") {
                    const p = await handle.requestPermission({ mode: "read" });
                    return p === "granted";
                  }
                } catch {}
                return false;
              })();
              if (!canRead) {
                console.log(
                  "⚠️ Auto re-seed: permission not granted for",
                  s.name || s.infoHash,
                  "- file access permission lost after refresh"
                );
                continue;
              }
              const file = await handle.getFile();
              if (!file) continue;
              console.log(
                "Auto re-seed: seeding",
                s.name || file.name,
                s.infoHash,
              );
              shared.seed(file, (torrent: WebTorrentNS.Torrent) => {
                console.log(
                  "Auto re-seed: ready",
                  torrent.infoHash,
                  torrent.name,
                );
                registerTorrent(torrent);
              });
            } catch (e) {
              console.warn("Auto re-seed failed for", s.infoHash, e);
            }
          }
        } catch (e) {
          console.warn("Auto re-seed: enumeration failed", e);
        }
        console.log("🔚 Auto re-seed initialization completed");
      } catch (err) {
        console.error("Failed to create WebTorrent client:", err);
        setIsLoading(false);
      }
    };
    init();

    return () => {
      // Do not destroy global client; it may be used by other components
    };
  }, []);

  const cleanupUnusedTorrents = useCallback((activeInfoHash: string | null = null) => {
    if (!client) return;
    
    console.log("🧹 Cleaning up unused torrents...");
    const torrentsToRemove: any[] = [];
    
    client.torrents.forEach((torrent: any) => {
      // Keep the currently active torrent
      if (activeInfoHash && torrent.infoHash === activeInfoHash) {
        return;
      }
      
      // Keep the current playback torrent
      if (torrent === currentTorrent.current) {
        return;
      }
      
      // Keep seeding torrents (uploaded by user)
      if (torrent.ready && torrent.files && torrent.files.length > 0) {
        return;
      }
      
      // Only remove empty or broken torrents
      torrentsToRemove.push(torrent);
    });
    
    torrentsToRemove.forEach((torrent) => {
      console.log(`🗑️ Removing unused torrent: ${torrent.name || 'Unknown'}`);
      client.remove(torrent);
      
      // Also cleanup from stats
      if (torrent.infoHash) {
        setStatsByInfoHash((prev) => {
          const newStats = { ...prev };
          delete newStats[torrent.infoHash];
          return newStats;
        });
      }
    });
    
    if (torrentsToRemove.length > 0) {
      console.log(`✅ Cleaned up ${torrentsToRemove.length} unused torrents`);
    }
  }, [client]);

  const loadTorrent = useCallback(
    async (magnetUri: string, videoElement?: HTMLVideoElement | null) => {
      // Ensure a client instance, even if this hook mounted before init completed
      let wt: any = client || globalClient;
      if (!wt) {
        try {
          if (!globalInit) {
            // Trigger init path if somehow not started yet
            console.warn(
              "WebTorrent not initialized yet; deferring load until ready",
            );
          }
          wt = await globalInit;
          if (wt && !client) setClient(wt);
        } catch (e) {
          console.error("Failed waiting for WebTorrent client:", e);
          return;
        }
      }

      // Get the info hash of the torrent we're about to load
      const infoHashMatch = magnetUri.match(/btih:([a-f0-9]{40})/i);
      const targetInfoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null;

      // Check if we're already loading this same torrent
      if (
        currentTorrent.current &&
        currentTorrent.current.magnetURI === magnetUri
      ) {
        console.log(
          "Same torrent already loaded, skipping duplicate load:",
          magnetUri,
        );
        return;
      }

      // Clean up unused torrents before adding new one (keep the target one if exists)
      cleanupUnusedTorrents(targetInfoHash);

      // Remove existing torrent to prevent conflicts
      if (currentTorrent.current) {
        console.log("Removing existing torrent to prevent pipe conflicts");
        wt.remove(currentTorrent.current);
        currentTorrent.current = null;
      }

      // **SMART LOGIC**: Check if torrent exists, if not, add it
      const existingTorrent = wt.torrents.find((t: any) => t.magnetURI === magnetUri || t.infoHash === targetInfoHash);
      
      if (existingTorrent) {
        console.log("🎯 Found existing torrent, using directly:", existingTorrent.name);
        console.log("🔍 Torrent details:", {
          infoHash: existingTorrent.infoHash,
          magnetURI: existingTorrent.magnetURI,
          numPeers: existingTorrent.numPeers,
          progress: existingTorrent.progress,
          ready: existingTorrent.ready,
          filesCount: existingTorrent.files?.length || 0,
          files: existingTorrent.files?.map((f: any) => f.name) || []
        });
        // Use existing torrent directly for streaming
        const torrent = existingTorrent;
        setIsSeeding(true);
        registerTorrent(torrent);

        // Find video file and set up streaming
        const videoFile = torrent.files.find(
          (file: WebTorrentNS.TorrentFile) =>
            file.name.match(/\.(mp4|webm|ogg|avi|mov|mkv)$/i),
        );

        if (videoFile && videoElement) {
          console.log("Setting up streaming for existing torrent:", videoFile.name);
          try {
            videoFile.select();
            (videoFile as any).streamTo(videoElement);
            console.log("✅ StreamTo setup successful for existing torrent:", videoFile.name);
            
            videoElement.addEventListener("loadedmetadata", () => {
              console.log("🎬 Video metadata loaded, ready to play!");
              videoElement.play().catch((e) => {
                console.warn("Autoplay failed (browser policy):", e);
              });
            }, { once: true });
          } catch (e) {
            console.error("❌ StreamTo failed for existing torrent:", e);
          }
        } else if (!videoFile && torrent.files.length === 0) {
          // **新逻辑**: 如果 torrent 存在但文件列表为空，等待 metadata
          console.log("⏳ Torrent found but no files yet, waiting for metadata...");
          console.log("🔍 Torrent state:", {
            ready: torrent.ready,
            numPeers: torrent.numPeers,
            downloaded: torrent.downloaded,
            uploadedBy: torrent.name,
            created: torrent.created
          });
          
          const handleReady = () => {
            console.log("🎉 Torrent metadata ready, retrying video setup...");
            const videoFile = torrent.files.find(
              (file: WebTorrentNS.TorrentFile) =>
                file.name.match(/\.(mp4|webm|ogg|avi|mov|mkv)$/i),
            );
            
            if (videoFile && videoElement) {
              console.log("📽️ Setting up streaming for ready torrent:", videoFile.name);
              try {
                videoFile.select();
                (videoFile as any).streamTo(videoElement);
                console.log("✅ StreamTo setup successful after waiting:", videoFile.name);
                
                videoElement.addEventListener("loadedmetadata", () => {
                  console.log("🎬 Video metadata loaded, ready to play!");
                  videoElement.play().catch((e) => {
                    console.warn("Autoplay failed (browser policy):", e);
                  });
                }, { once: true });
              } catch (e) {
                console.error("❌ StreamTo failed after waiting:", e);
              }
            } else {
              console.error("❌ Still no video file after ready:", {
                hasVideoFile: !!videoFile,
                hasVideoElement: !!videoElement,
                filesCount: torrent.files.length,
                fileNames: torrent.files.map((f: any) => f.name)
              });
            }
          };
          
          // 添加更多事件监听来调试
          torrent.on('metadata', () => {
            console.log("📄 Torrent metadata event fired");
          });
          
          torrent.on('infoHash', () => {
            console.log("🔖 Torrent infoHash event fired");
          });
          
          torrent.on('error', (err: any) => {
            console.error("❌ Torrent error:", err);
          });
          
          if (torrent.ready) {
            console.log("🚀 Torrent is already ready, calling handler immediately");
            handleReady();
          } else {
            console.log("⏰ Setting up ready event listener...");
            torrent.on('ready', handleReady);
            
            // 添加超时保护
            setTimeout(() => {
              if (!torrent.ready) {
                console.warn("⚠️ Torrent metadata timeout after 30 seconds");
                console.log("🔍 Torrent timeout state:", {
                  ready: torrent.ready,
                  numPeers: torrent.numPeers,
                  downloaded: torrent.downloaded,
                  filesCount: torrent.files.length
                });
              }
            }, 30000);
          }
        } else {
          console.error("❌ Cannot setup streaming:", {
            hasVideoFile: !!videoFile,
            hasVideoElement: !!videoElement,
            videoFileName: videoFile?.name,
            torrentName: torrent.name,
            filesCount: torrent.files.length,
            ready: torrent.ready
          });
        }

        currentTorrent.current = torrent;
        return;
      }

      // If torrent doesn't exist (e.g., local file case), add it
      console.log("Adding torrent for streaming:", magnetUri);
      console.log("🔍 Target infoHash for streaming:", targetInfoHash);
      console.log("🔍 Current client torrents:", wt.torrents.map((t: any) => ({
        name: t.name,
        infoHash: t.infoHash,
        numPeers: t.numPeers
      })));
      
      const WSS = [
        "wss://tracker.btorrent.xyz",
        "wss://tracker.openwebtorrent.com",
        "wss://tracker.webtorrent.dev",
      ];
      const torrent = wt.add(
        magnetUri,
        { announce: WSS },
        (torrent: WebTorrentNS.Torrent) => {
          console.log("Torrent loaded for streaming:", torrent.name);
          setIsSeeding(true);
          registerTorrent(torrent);

          // Find video file and set up streaming
          const videoFile = torrent.files.find(
            (file: WebTorrentNS.TorrentFile) =>
              file.name.match(/\.(mp4|webm|ogg|avi|mov|mkv)$/i),
          );

          if (videoFile && videoElement) {
            console.log("Setting up streaming for new torrent:", videoFile.name);
            try {
              videoFile.select();
              (videoFile as any).streamTo(videoElement);
              console.log("✅ StreamTo setup successful for new torrent:", videoFile.name);
              
              videoElement.addEventListener("loadedmetadata", () => {
                console.log("🎬 Video metadata loaded, ready to play!");
                videoElement.play().catch((e) => {
                  console.warn("Autoplay failed (browser policy):", e);
                });
              }, { once: true });
            } catch (e) {
              console.error("❌ StreamTo failed for new torrent:", e);
            }
          }

          currentTorrent.current = torrent;
        },
      );

      torrent.on("error", (err: string | Error) => {
        console.error("WebTorrent torrent error:", err);
      });
    },
    [client],
  );

  const seedFile = useCallback(
    (file: File) => {
      if (!client) {
        console.error("WebTorrent client not available");
        return Promise.reject(new Error("WebTorrent client not available"));
      }

      return new Promise<WebTorrentNS.Torrent>((resolve, reject) => {
        // Remove existing torrent to prevent conflicts
        if (currentTorrent.current) {
          console.log("Removing existing torrent before seeding new file");
          client.remove(currentTorrent.current);
          currentTorrent.current = null;
        }

        const torrent = client.seed(file, (torrent: WebTorrentNS.Torrent) => {
          console.log("Seeding started:", torrent.name);
          setIsSeeding(true);
          registerTorrent(torrent);

          // **THROTTLED UPLOAD TRACKING**: Update only once per second  
          let lastUploadUpdate = 0;
          const updateProgress = () => {
            const now = Date.now();
            if (now - lastUploadUpdate < 1000) return; // Throttle to 1 second
            lastUploadUpdate = now;
            
            // Convert uploadSpeed from bytes/sec to MB/sec for consistency
            setShareSpeed((torrent.uploadSpeed || 0) / (1024 * 1024));
            setPeers(torrent.numPeers || 0);
          };

          torrent.on("upload", updateProgress);
          torrent.on("wire", updateProgress);

          currentTorrent.current = torrent;
          resolve(torrent);
        });

        torrent.on("error", (err: string | Error) => {
          console.error("Seeding error:", err);
          reject(err);
        });
      });
    },
    [client],
  );

  const downloadFile = useCallback(
    (magnetUri: string) => {
      if (!client) {
        console.error("WebTorrent client not available");
        return;
      }

      const torrent = client.add(magnetUri, (torrent: WebTorrentNS.Torrent) => {
        const file: any = torrent.files[0];
        if (file) {
          file
            .blob()
            .then((blob: Blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = file.name || "download";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            })
            .catch((err: any) => {
              console.error("Error creating blob URL:", err);
            });
        }
      });
    },
    [client],
  );

  // **NEW**: Clear current torrent when video is deleted
  const clearCurrentVideo = useCallback(() => {
    if (currentTorrent.current && client) {
      console.log("🧹 Clearing current torrent due to video deletion");
      client.remove(currentTorrent.current);
      currentTorrent.current = null;
      setIsSeeding(false);
      setDownloadProgress(0);
      setShareSpeed(0);
      setPeers(0);
    }
  }, [client]);

  return {
    client,
    downloadProgress,
    shareSpeed,
    peers,
    isSeeding,
    isLoading,
    loadTorrent,
    seedFile,
    downloadFile,
    statsByInfoHash,
    registerTorrent, // Export registerTorrent so shareVideo can use it
    cleanupUnusedTorrents, // Export cleanup function
    clearCurrentVideo, // NEW: Export cleanup function for deleted videos
  };
}
