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
        console.log('Setting up video streaming...', videoFile.name, 'File size:', videoFile.length);
        
        // Clear any existing src first
        videoElement.src = '';
        videoElement.load();
        
        try {
          // Select the file for prioritized download
          videoFile.select();
          console.log('File selected for priority download');
          
          // Use streamTo for progressive streaming - this is the correct method
          console.log('Setting up streamTo for progressive playback...');
          videoFile.streamTo(videoElement, {
            autoplay: true, // Enable autoplay for progressive streaming
            controls: false,
            muted: true    // Muted autoplay is more likely to work
          });
          console.log('✓ streamTo initiated with autoplay - should enable progressive playback');
          
          // Also try appendTo as additional method
          try {
            videoFile.appendTo(videoElement);
            console.log('✓ appendTo also applied for better compatibility');
          } catch (e) {
            console.log('appendTo not available, using streamTo only');
          }
          
          // Monitor if streamTo actually sets the src
          setTimeout(() => {
            if (!videoElement.src || videoElement.src === window.location.href) {
              console.log('⚠️ streamTo did not set src, using getBlobURL as backup...');
              videoFile.getBlobURL((err: any, url: string) => {
                if (!err && url) {
                  console.log('✓ Backup blob URL created:', url.substring(0, 50) + '...');
                  videoElement.src = url;
                  videoElement.load();
                } else {
                  console.error('✗ Backup getBlobURL also failed:', err);
                }
              });
            } else {
              console.log('✓ streamTo successfully set src:', videoElement.src.substring(0, 50) + '...');
            }
          }, 1000); // Check after 1 second
          
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
      
      // Check progressive playback availability at key milestones
      if (progress >= 2 && progress <= 3) { // Check once when reaching 2-3%
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
          
          // Try to trigger video loading
          if (videoElement.src && videoElement.readyState === 0) {
            console.log('🔄 Triggering video load...');
            videoElement.load();
          }
          
          // If streamTo didn't work, create a progressive blob URL
          if (!videoElement.src || videoElement.src === window.location.href) {
            console.log('🔧 Creating progressive video stream...');
            const videoFile = torrent.files.find((f: any) => f.name.match(/\.(mp4|webm|ogg|avi|mov)$/i));
            if (videoFile) {
              try {
                // Create a progressive readable stream
                const stream = videoFile.createReadStream();
                const response = new Response(stream);
                const blob = response.blob();
                
                blob.then(blobData => {
                  const url = URL.createObjectURL(blobData);
                  console.log('✅ Progressive stream URL created!');
                  videoElement.src = url;
                  videoElement.load();
                  
                  // Try to play immediately when enough data is buffered
                  const tryPlay = () => {
                    if (videoElement.readyState >= 2) {
                      console.log('🎉 Auto-starting progressive playback!');
                      videoElement.play().catch(e => {
                        console.log('Auto-play prevented by browser, user needs to click play');
                      });
                    }
                  };
                  
                  videoElement.addEventListener('canplay', tryPlay, { once: true });
                  setTimeout(tryPlay, 2000); // Also try after 2 seconds
                });
                
              } catch (error) {
                console.log('Progressive stream failed, falling back to getBlobURL');
                // Fallback to original method
                videoFile.getBlobURL((err: any, url: string) => {
                  if (!err && url) {
                    videoElement.src = url;
                    videoElement.load();
                  }
                });
              }
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
