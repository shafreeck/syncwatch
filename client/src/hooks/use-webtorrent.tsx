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
          uploadLimit: -1,
          // Worker will be loaded separately with loadWorker()
        });
        // Initialize client first, then try to load worker
        setClient(webTorrentClient);
        setIsLoading(false);
        console.log("WebTorrent client initialized for progressive streaming");
        
        // Try to load worker for streamTo support (optional)
        try {
          webTorrentClient.loadWorker(() => {
            console.log('WebTorrent worker loaded successfully - streamTo available');
          });
        } catch (e) {
          console.log('Worker loading failed (non-critical):', e, '- will use alternative methods');
        }
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

    // Remove existing torrent and clear any existing video sources
    if (currentTorrent.current) {
      client.remove(currentTorrent.current);
    }
    
    // Clear existing video source to prevent conflicts
    if (videoElement) {
      videoElement.src = '';
      videoElement.load();
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
        console.log('Setting up video streaming...', videoFile.name, 'File size:', videoFile.length);
        
        // Clear any existing src first
        videoElement.src = '';
        videoElement.load();
        
        try {
          // Select the file for prioritized download
          videoFile.select();
          console.log('File selected for priority download');
          
          // Test: Try simple renderTo without options first
          console.log('Testing renderTo method...');
          try {
            videoFile.renderTo(videoElement);
            console.log('✓ renderTo called successfully');
          } catch (e) {
            console.log('✗ renderTo failed:', e);
          }
          
          // Since renderTo worked, let's check if we can trigger autoplay
          console.log('Checking if video is ready for autoplay...');
          
          // Wait a bit for renderTo to set up the video source
          setTimeout(() => {
            console.log('Video readyState:', videoElement.readyState);
            console.log('Video has src:', !!videoElement.src);
            console.log('Video duration:', videoElement.duration);
            
            if (videoElement.readyState >= 2) { // HAVE_CURRENT_DATA
              console.log('✓ Video has enough data! Attempting autoplay...');
              videoElement.play().then(() => {
                console.log('✓ SUCCESS: Video is now playing!');
              }).catch(e => {
                console.log('Autoplay blocked by browser policy - user needs to click play:', e.message);
              });
            } else if (videoElement.readyState >= 1) { // HAVE_METADATA
              console.log('✓ Video metadata loaded, waiting for more data...');
              
              // Listen for when we have enough data
              const handleCanPlay = () => {
                console.log('✓ Video can now play! Attempting autoplay...');
                videoElement.play().then(() => {
                  console.log('✓ SUCCESS: Video is now playing!');
                }).catch(e => {
                  console.log('Autoplay blocked - user can click play:', e.message);
                });
              };
              
              videoElement.addEventListener('canplay', handleCanPlay, { once: true });
            } else {
              console.log('Video not ready yet, readyState:', videoElement.readyState);
            }
          }, 2000);
          
          // Monitor if streamTo actually sets the src
          // renderTo should work immediately for progressive streaming
          console.log('✓ renderTo should enable immediate progressive playback');
          
          // Monitor video element state
          const logVideoState = () => {
            console.log('Video state:', {
              src: videoElement.src.substring(0, 50),
              readyState: videoElement.readyState,
              networkState: videoElement.networkState,
              duration: videoElement.duration,
              currentTime: videoElement.currentTime,
              buffered: videoElement.buffered.length
            });
          };
          
          videoElement.addEventListener('loadstart', () => {
            console.log('Video: loadstart');
            logVideoState();
          });
          
          videoElement.addEventListener('loadedmetadata', () => {
            console.log('Video: metadata loaded, duration:', videoElement.duration);
            logVideoState();
          });
          
          videoElement.addEventListener('canplay', () => {
            console.log('Video: can play!');
            logVideoState();
          });
          
          videoElement.addEventListener('error', (e) => {
            console.error('Video error:', e, videoElement.error);
            logVideoState();
          });
          
        } catch (error) {
          console.error('Video setup failed:', error);
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
      
      // Check progressive playback availability with better timing
      if (progress >= 5 && progress <= 5.1) { // Check once when reaching 5%
        console.log(`🎬 ${progress.toFixed(1)}% downloaded - Progressive playback should be available!`);
        
        // Find video element from the current video player
        const videoElement = document.querySelector('video[data-testid="video-player"]') as HTMLVideoElement;
        if (videoElement) {
          console.log('Video element status:', {
            src: videoElement.src ? 'HAS SRC ✓' : 'NO SRC ✗',
            readyState: videoElement.readyState,
            networkState: videoElement.networkState,
            duration: isNaN(videoElement.duration) ? 'Loading...' : videoElement.duration
          });
          
          // If no video source set yet, wait a bit more for the main setup to complete
          if (!videoElement.src || videoElement.src === window.location.href) {
            console.log('⚠️ Video source not set yet at 2%, main renderTo/getBlobURL should handle this');
          } else {
            console.log('✓ Video source already set:', videoElement.src.substring(0, 50) + '...');
            if (videoElement.readyState === 0) {
              console.log('🔄 Triggering video load...');
              videoElement.load();
            }
          }
        } else {
          console.log('⚠️ Video element not found for progressive playback check');
        }
      }
      
      // Log progressive download status less frequently
      if (progress < 100 && Math.floor(progress) % 10 === 0) {
        console.log(`Download: ${progress.toFixed(1)}% | Speed: ↓${downSpeed} KB/s ↑${upSpeed} MB/s | Peers: ${torrent.numPeers}`);
      }
      
      // Manual check for testing
      if (progress >= 5 && progress <= 5.5) {
        console.log('🔍 Manual progressive playback check at 5%...');
        const videoElement = document.querySelector('video[data-testid="video-player"]') as HTMLVideoElement;
        if (videoElement) {
          console.log('✓ Video element found:', {
            src: videoElement.src ? 'HAS SRC' : 'NO SRC',
            readyState: videoElement.readyState
          });
        } else {
          console.log('✗ Video element not found');
        }
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
