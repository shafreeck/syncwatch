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
              'wss://tracker.openwebtorrent.com'
            ]
          },
          dht: false,
          webSeeds: false,
          maxConns: 55,
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
        
        // Use appendTo for progressive streaming
        try {
          videoFile.appendTo(videoElement);
          console.log('Video appendTo completed - should start streaming');
          
          // Add event listeners for monitoring
          videoElement.addEventListener('loadstart', () => {
            console.log('Video loading started');
          });
          
          videoElement.addEventListener('canplay', () => {
            console.log('Video can play - enough data buffered');
          });
          
          videoElement.addEventListener('loadeddata', () => {
            console.log('Video first frame loaded');
          });
          
          videoElement.addEventListener('progress', () => {
            if (videoElement.buffered.length > 0) {
              const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
              const duration = videoElement.duration || 0;
              if (duration > 0) {
                const bufferedPercent = (bufferedEnd / duration) * 100;
                console.log(`Video buffered: ${bufferedPercent.toFixed(1)}%`);
              }
            }
          });
          
        } catch (error) {
          console.error('appendTo failed:', error);
          // Final fallback - try creating blob URL when enough data is available
          const tryBlobUrl = () => {
            videoFile.getBlobURL((err: any, url: string) => {
              if (!err && url) {
                console.log('Using blob URL as fallback:', url);
                videoElement.src = url;
                videoElement.load();
              }
            });
          };
          
          // Try blob URL after some download progress
          torrent.on('download', () => {
            if (torrent.progress > 0.05) { // 5% downloaded
              tryBlobUrl();
            }
          });
        }
      }
    });

    torrent.on("download", () => {
      const progress = (torrent.downloaded / torrent.length) * 100;
      setDownloadProgress(progress);
      setUploadSpeed(Math.round(torrent.uploadSpeed / 1024 / 1024 * 10) / 10);
      setPeers(torrent.numPeers);
      
      // Log progressive download status
      if (progress > 0 && progress < 100) {
        console.log(`Progressive download: ${progress.toFixed(1)}% - ${Math.round(torrent.downloadSpeed / 1024)} KB/s`);
      }
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
