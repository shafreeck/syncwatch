import { useState, useEffect, useCallback, useRef } from "react";
import type WebTorrentNS from 'webtorrent';
import getWebTorrent from '@/lib/wt-esm';
import { getAllSeeds } from '@/lib/seed-store';

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
  const [statsByInfoHash, setStatsByInfoHash] = useState<Record<string, {
    uploadMBps: number;
    downloadMBps: number;
    peers: number;
    progress: number;
    name?: string;
  }>>({});

  const registerTorrent = useCallback((torrent: any) => {
    const toMB = (x: number) => (x || 0) / (1024 * 1024);
    const update = () => {
      try {
        setStatsByInfoHash(prev => ({
          ...prev,
          [torrent.infoHash]: {
            uploadMBps: toMB(torrent.uploadSpeed || 0),
            downloadMBps: toMB(torrent.downloadSpeed || 0),
            peers: torrent.numPeers || 0,
            progress: (torrent.progress || 0) * 100,
            name: torrent.name,
          }
        }));
      } catch {}
    };
    update();
    torrent.on('download', update);
    torrent.on('upload', update);
    torrent.on('wire', update);
    torrent.on('done', update);
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
            const WSS = [
              'wss://tracker.btorrent.xyz',
              'wss://tracker.openwebtorrent.com',
              'wss://tracker.webtorrent.dev'
            ];
            const webTorrentClient = new WebTorrent({
              tracker: { announce: WSS },
              dht: false,
              lsd: false,
              utPex: false,
              natUpnp: false,
              natPmp: false,
            });

            const reg = await navigator.serviceWorker
              .register('/sw.min.js', { scope: '/' })
              .then((r) => new Promise<ServiceWorkerRegistration>((resolve) => {
                const w = r.active || r.waiting || r.installing;
                const ok = (sw: ServiceWorker | null | undefined) => sw && sw.state === 'activated';
                if (ok(w)) return resolve(r);
                w?.addEventListener('statechange', () => { if (ok(w)) resolve(r); });
              }));
            // Ensure the current page is controlled by our SW
            if (!navigator.serviceWorker.controller) {
              await new Promise<void>((resolve) => {
                const onCtrl = () => { resolve(); };
                navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true } as any);
              });
            }

            if (typeof webTorrentClient.createServer === 'function') {
              webTorrentClient.createServer({ controller: reg });
            }

            globalClient = webTorrentClient;
            return webTorrentClient;
          })();
        }

        const shared = await globalInit;
        setClient(shared);
        setIsLoading(false);
        console.log('WebTorrent client initialized (singleton)');

        // After client is ready, attempt to re-seed from persisted file handles
        try {
          const seeds = await getAllSeeds();
          if (seeds?.length) {
            console.log('Auto re-seed: found persisted entries:', seeds.length);
          }
          for (const s of seeds) {
            const handle = (s as any).handle;
            if (!handle) continue;
            try {
              // Ensure read permission
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
                console.log('Auto re-seed: permission not granted for', s.infoHash);
                continue;
              }
              const file = await handle.getFile();
              if (!file) continue;
              console.log('Auto re-seed: seeding', s.name || file.name, s.infoHash);
              shared.seed(file, (torrent: WebTorrentNS.Torrent) => {
                console.log('Auto re-seed: ready', torrent.infoHash, torrent.name);
                registerTorrent(torrent);
              });
            } catch (e) {
              console.warn('Auto re-seed failed for', s.infoHash, e);
            }
          }
        } catch (e) {
          console.warn('Auto re-seed: enumeration failed', e);
        }
      } catch (err) {
        console.error('Failed to create WebTorrent client:', err);
        setIsLoading(false);
      }
    };
    init();

    return () => {
      // Do not destroy global client; it may be used by other components
    };
  }, []);

  const loadTorrent = useCallback(async (magnetUri: string, videoElement?: HTMLVideoElement | null) => {
    // Ensure a client instance, even if this hook mounted before init completed
    let wt: any = client || globalClient;
    if (!wt) {
      try {
        if (!globalInit) {
          // Trigger init path if somehow not started yet
          console.warn('WebTorrent not initialized yet; deferring load until ready');
        }
        wt = await globalInit;
        if (wt && !client) setClient(wt);
      } catch (e) {
        console.error('Failed waiting for WebTorrent client:', e);
        return;
      }
    }

    // Check if we're already loading this same torrent
    if (currentTorrent.current && currentTorrent.current.magnetURI === magnetUri) {
      console.log('Same torrent already loaded, skipping duplicate load:', magnetUri);
      return;
    }

    // Remove existing torrent to prevent conflicts
    if (currentTorrent.current) {
      console.log('Removing existing torrent to prevent pipe conflicts');
      wt.remove(currentTorrent.current);
      currentTorrent.current = null;
    }

    console.log('Adding new torrent:', magnetUri);
    const WSS = [
      'wss://tracker.btorrent.xyz',
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.webtorrent.dev'
    ];
    const torrent = wt.add(magnetUri, { announce: WSS }, (torrent: WebTorrentNS.Torrent) => {
      console.log("Torrent loaded:", torrent.name);
      setIsSeeding(true);
      registerTorrent(torrent);

      // Find video file
      const videoFile = torrent.files.find((file: WebTorrentNS.TorrentFile) => 
        file.name.match(/\.(mp4|webm|ogg|avi|mov)$/i)
      );

      if (videoFile && videoElement) {
        console.log('Setting up progressive video streaming via BrowserServer...');
        try { videoFile.select(); } catch {}
        try { (videoFile as any).streamTo(videoElement); } catch (e) { console.error('streamTo failed:', e); }
        videoElement.addEventListener('loadedmetadata', () => {
          videoElement.play().catch(() => {});
        }, { once: true });
      }

      // Track progress and stats
      torrent.on('download', () => {
        setDownloadProgress(torrent.progress * 100);
        setShareSpeed(torrent.uploadSpeed);
        setPeers(torrent.numPeers);
      });

      torrent.on('upload', () => {
        setShareSpeed(torrent.uploadSpeed);
        setPeers(torrent.numPeers);
      });

      currentTorrent.current = torrent;
    });

    torrent.on('error', (err: string | Error) => {
      console.error('WebTorrent torrent error:', err);
    });
  }, [client]);

  const seedFile = useCallback((file: File) => {
    if (!client) {
      console.error("WebTorrent client not available");
      return Promise.reject(new Error("WebTorrent client not available"));
    }

    return new Promise<WebTorrentNS.Torrent>((resolve, reject) => {
      // Remove existing torrent to prevent conflicts
      if (currentTorrent.current) {
        console.log('Removing existing torrent before seeding new file');
        client.remove(currentTorrent.current);
        currentTorrent.current = null;
      }

      const torrent = client.seed(file, (torrent: WebTorrentNS.Torrent) => {
        console.log("Seeding started:", torrent.name);
        setIsSeeding(true);
        registerTorrent(torrent);

        // Track upload progress
        const updateProgress = () => {
          setShareSpeed(torrent.uploadSpeed);
          setPeers(torrent.numPeers);
        };

        torrent.on('upload', updateProgress);
        torrent.on('wire', updateProgress);
        
        currentTorrent.current = torrent;
        resolve(torrent);
      });

      torrent.on('error', (err: string | Error) => {
        console.error('Seeding error:', err);
        reject(err);
      });
    });
  }, [client]);

  const downloadFile = useCallback((magnetUri: string) => {
    if (!client) {
      console.error("WebTorrent client not available");
      return;
    }

    const torrent = client.add(magnetUri, (torrent: WebTorrentNS.Torrent) => {
      const file: any = torrent.files[0];
      if (file) {
        file.blob().then((blob: Blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name || 'download';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }).catch((err: any) => {
          console.error('Error creating blob URL:', err);
        });
      }
    });
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
  };
}
