import { useState, useEffect, useCallback, useRef } from "react";

declare global {
  interface Window {
    WebTorrent: any;
  }
}

export function useWebTorrent() {
  const [client, setClient] = useState<any>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [peers, setPeers] = useState(0);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const currentTorrent = useRef<any>(null);

  useEffect(() => {
    // Load WebTorrent dynamically
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
    script.onload = () => {
      if (window.WebTorrent) {
        const webTorrentClient = new window.WebTorrent({
          tracker: {
            announce: [
              'wss://tracker.btorrent.xyz',
              'wss://tracker.openwebtorrent.com',
              'wss://tracker.webtorrent.dev'
            ]
          },
          dht: true,
          webSeeds: true,
          maxConns: 100,
          downloadLimit: -1,
          uploadLimit: -1
        });
        setClient(webTorrentClient);
        setIsLoading(false);
        console.log("WebTorrent client initialized for progressive streaming");
      }
    };
    script.onerror = () => {
      console.error("Failed to load WebTorrent");
      setIsLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      if (client) {
        client.destroy();
      }
      document.head.removeChild(script);
    };
  }, []);

  const loadTorrent = useCallback((magnetUri: string, videoElement?: HTMLVideoElement | null) => {
    if (!client) {
      console.error("WebTorrent client not available");
      return;
    }

    // Remove existing torrent
    if (currentTorrent.current) {
      client.remove(currentTorrent.current);
    }

    const torrent = client.add(magnetUri, (torrent: any) => {
      // Set download strategy for progressive playback
      torrent.on('ready', () => {
        console.log('Torrent ready, setting sequential download');
        if (torrent.pieces) {
          // Select all pieces but prioritize the beginning
          torrent.pieces.forEach((piece: any, index: number) => {
            const priority = Math.max(1, 10 - Math.floor(index / 10));
            if (piece.priority !== undefined) {
              piece.priority = priority;
            }
          });
        }
      });
      console.log("Torrent loaded for progressive streaming:", torrent.name);
      setIsSeeding(true);

      // Find video file
      const videoFile = torrent.files.find((file: any) => 
        file.name.match(/\.(mp4|webm|ogg|avi|mov)$/i)
      );
      
      // Set priority for progressive download
      if (videoFile) {
        videoFile.select();
        console.log("Selected video file for progressive download:", videoFile.name);
      }

      if (videoFile && videoElement) {
        console.log('Setting up video streaming...', videoFile.name);
        
        // Use the most compatible streaming method
        try {
          // First, select the file for prioritized download
          videoFile.select();
          console.log('File selected for priority download');
          
          // Use streamTo which is the most reliable for progressive playback
          videoFile.streamTo(videoElement, {
            autoplay: false,
            controls: false
          });
          console.log('Video streamTo initiated - progressive playback should work');
          
          // Monitor the actual video element
          videoElement.addEventListener('loadstart', () => {
            console.log('Video element: loading started');
          });
          
          videoElement.addEventListener('loadedmetadata', () => {
            console.log('Video element: metadata loaded, duration:', videoElement.duration);
          });
          
          videoElement.addEventListener('canplay', () => {
            console.log('Video element: can play - buffered enough data');
          });
          
          videoElement.addEventListener('progress', () => {
            if (videoElement.buffered.length > 0) {
              const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
              const duration = videoElement.duration || 0;
              if (duration > 0) {
                const bufferedPercent = (bufferedEnd / duration) * 100;
                console.log(`Video buffered: ${bufferedPercent.toFixed(1)}% (${bufferedEnd.toFixed(1)}s of ${duration.toFixed(1)}s)`);
              }
            }
          });
          
        } catch (error) {
          console.error('streamTo failed:', error);
        }
      }
    });

    torrent.on("download", () => {
      const progress = (torrent.downloaded / torrent.length) * 100;
      setDownloadProgress(progress);
      const downSpeed = Math.round(torrent.downloadSpeed / 1024);
      const upSpeed = Math.round(torrent.uploadSpeed / 1024 / 1024 * 10) / 10;
      setUploadSpeed(upSpeed);
      setPeers(torrent.numPeers);
      
      // Log progressive download status with more details
      console.log(`Download: ${progress.toFixed(1)}% | Speed: ↓${downSpeed} KB/s ↑${upSpeed} MB/s | Peers: ${torrent.numPeers}`);
    });

    torrent.on("upload", () => {
      setUploadSpeed(Math.round(torrent.uploadSpeed / 1024 / 1024 * 10) / 10);
    });

    torrent.on("wire", () => {
      setPeers(torrent.numPeers);
    });

    torrent.on("error", (error: any) => {
      console.error("Torrent error:", error);
    });

    currentTorrent.current = torrent;
  }, [client]);

  const createTorrent = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!client) {
        reject(new Error("WebTorrent client not available"));
        return;
      }

      client.seed(file, (torrent: any) => {
        console.log("Torrent created:", torrent.magnetURI);
        setIsSeeding(true);
        resolve(torrent.magnetURI);
      });
    });
  }, [client]);

  return {
    client,
    downloadProgress,
    uploadSpeed,
    peers,
    isSeeding,
    isLoading,
    loadTorrent,
    createTorrent,
  };
}
