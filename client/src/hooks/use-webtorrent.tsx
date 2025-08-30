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
    script.src = "https://cdn.jsdelivr.net/npm/webtorrent@1.8.25/webtorrent.min.js";
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
          uploadLimit: -1,
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

    // Check if we're already loading this same torrent
    if (currentTorrent.current && currentTorrent.current.magnetURI === magnetUri) {
      console.log('Same torrent already loaded, skipping duplicate load:', magnetUri);
      return;
    }

    // Remove existing torrent to prevent conflicts
    if (currentTorrent.current) {
      console.log('Removing existing torrent to prevent pipe conflicts');
      client.remove(currentTorrent.current);
      currentTorrent.current = null;
    }

    console.log('Adding new torrent:', magnetUri);
    const torrent = client.add(magnetUri, (torrent: any) => {
      console.log("Torrent loaded:", torrent.name);
      setIsSeeding(true);

      // Find video file
      const videoFile = torrent.files.find((file: any) => 
        file.name.match(/\.(mp4|webm|ogg|avi|mov)$/i)
      );

      if (videoFile && videoElement) {
        console.log('Setting up progressive video streaming...');
        
        // Clear existing video src
        if (videoElement.src) {
          videoElement.src = '';
          videoElement.load();
        }
        
        // Select the file for download
        videoFile.select();
        
        // Use renderTo with progressive streaming configuration
        videoFile.renderTo(videoElement, { 
          maxBlobLength: 200 * 1024 * 1024,  // 200MB threshold
          autoplay: false,
          controls: true
        }, (err: any) => {
          if (err) {
            console.error('❌ renderTo failed:', err);
          } else {
            console.log('✅ Progressive streaming setup complete');
            
            const isMediaSource = videoElement.src?.includes('mediasource');
            console.log('🎯 Strategy:', isMediaSource ? 'MediaSource (Progressive)' : 'Blob URL');
            
            // Auto-play when metadata is loaded
            videoElement.addEventListener('loadedmetadata', () => {
              console.log('📹 Metadata loaded, starting playback...');
              videoElement.play().catch(err => {
                console.log('❌ Autoplay failed (browser policy):', err.message);
              });
            });
          }
        });
      }

      // Track progress and stats
      torrent.on('download', () => {
        setDownloadProgress(torrent.progress * 100);
        setUploadSpeed(torrent.uploadSpeed);
        setPeers(torrent.numPeers);
      });

      torrent.on('upload', () => {
        setUploadSpeed(torrent.uploadSpeed);
        setPeers(torrent.numPeers);
      });

      currentTorrent.current = torrent;
    });

    torrent.on('error', (err: any) => {
      console.error('WebTorrent torrent error:', err);
    });
  }, [client]);

  const seedFile = useCallback((file: File) => {
    if (!client) {
      console.error("WebTorrent client not available");
      return Promise.reject(new Error("WebTorrent client not available"));
    }

    return new Promise((resolve, reject) => {
      // Remove existing torrent to prevent conflicts
      if (currentTorrent.current) {
        console.log('Removing existing torrent before seeding new file');
        client.remove(currentTorrent.current);
        currentTorrent.current = null;
      }

      const torrent = client.seed(file, (torrent: any) => {
        console.log("Seeding started:", torrent.name);
        setIsSeeding(true);

        // Track upload progress
        const updateProgress = () => {
          setUploadSpeed(torrent.uploadSpeed);
          setPeers(torrent.numPeers);
        };

        torrent.on('upload', updateProgress);
        torrent.on('wire', updateProgress);
        
        currentTorrent.current = torrent;
        resolve(torrent);
      });

      torrent.on('error', (err: any) => {
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

    const torrent = client.add(magnetUri, (torrent: any) => {
      const file = torrent.files[0];
      if (file) {
        file.getBlobURL((err: any, url: string) => {
          if (err) {
            console.error('Error getting blob URL:', err);
            return;
          }
          
          // Create download link
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
      }
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
    seedFile,
    downloadFile,
  };
}