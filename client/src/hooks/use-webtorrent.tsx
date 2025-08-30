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

    const torrent = client.add(magnetUri, {
      strategy: 'sequential'  // Download pieces in order for progressive playback
    }, (torrent: any) => {
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
        
        // Use renderTo for immediate streaming while downloading
        try {
          videoFile.renderTo(videoElement, {
            autoplay: false,
            controls: false,
            muted: false
          });
          
          console.log('Video render started - can play while downloading');
          
          // Monitor buffering progress
          const checkBuffer = () => {
            if (videoElement.buffered.length > 0) {
              const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
              const duration = videoElement.duration || 0;
              if (duration > 0) {
                const bufferedPercent = (bufferedEnd / duration) * 100;
                console.log(`Video buffered: ${bufferedPercent.toFixed(1)}%`);
              }
            }
          };
          
          videoElement.addEventListener('progress', checkBuffer);
          videoElement.addEventListener('loadeddata', () => {
            console.log('Video data loaded - ready for playback');
          });
          
        } catch (error) {
          console.error('renderTo failed, trying streamTo:', error);
          // Fallback to streamTo
          videoFile.streamTo(videoElement);
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
