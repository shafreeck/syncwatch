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
          
          // Try renderTo method for progressive streaming
          console.log('Testing renderTo method...');
          let streamCreated = false;
          
          const createVideoStream = () => {
            console.log('Creating new video stream...');
            try {
              // Clear existing source to avoid conflicts
              videoElement.src = '';
              videoElement.load();
              
              videoFile.renderTo(videoElement, (err: any) => {
                if (err) {
                  console.log('❌ renderTo error:', err);
                  
                  // If renderTo fails, try getBlobURL as fallback
                  console.log('Trying getBlobURL fallback...');
                  videoFile.getBlobURL((blobErr: any, url: string) => {
                    if (!blobErr && url) {
                      console.log('✓ Fallback: getBlobURL success');
                      videoElement.src = url;
                      videoElement.load();
                    } else {
                      console.log('❌ Both methods failed');
                    }
                  });
                } else {
                  console.log('✓ renderTo called successfully');
                  streamCreated = true;
                }
              });
            } catch (e) {
              console.log('✗ renderTo failed:', e);
            }
          };
          
          createVideoStream();
          
          // Add comprehensive video event listeners to debug the issue
          console.log('Setting up video event listeners for debugging...');
          
          videoElement.addEventListener('loadstart', () => {
            console.log('🎬 Video loadstart fired');
          });
          
          videoElement.addEventListener('loadedmetadata', () => {
            console.log('🎬 Video loadedmetadata fired, duration:', videoElement.duration);
          });
          
          videoElement.addEventListener('loadeddata', () => {
            console.log('🎬 Video loadeddata fired, readyState:', videoElement.readyState);
          });
          
          videoElement.addEventListener('canplay', () => {
            console.log('🎬 Video canplay fired! Attempting play...');
            videoElement.play().then(() => {
              console.log('✅ SUCCESS: Video started playing!');
            }).catch(e => {
              console.log('❌ Play failed:', e.message, e.name);
              console.log('Video error object:', videoElement.error);
            });
          });
          
          videoElement.addEventListener('canplaythrough', () => {
            console.log('🎬 Video canplaythrough fired!');
          });
          
          videoElement.addEventListener('play', () => {
            console.log('✅ Video play event fired!');
            
            // Listen for the pipe error in console and handle it
            const originalConsoleError = console.error;
            console.error = (...args) => {
              const message = args.join(' ');
              if (message.includes('Can only pipe to one destination')) {
                console.log('🔧 Detected pipe error, recreating stream...');
                // Recreate the stream
                setTimeout(() => {
                  createVideoStream();
                  // Try to resume playback
                  setTimeout(() => {
                    if (videoElement.paused) {
                      videoElement.play().catch(e => {
                        console.log('Retry play failed:', e.message);
                      });
                    }
                  }, 1000);
                }, 100);
              }
              originalConsoleError.apply(console, args);
            };
          });
          
          videoElement.addEventListener('playing', () => {
            console.log('✅ Video playing event fired!');
          });
          
          videoElement.addEventListener('error', (e) => {
            console.log('❌ Video error event:', e);
            console.log('❌ Video error details:', videoElement.error);
            if (videoElement.error) {
              console.log('❌ Error code:', videoElement.error.code);
              console.log('❌ Error message:', videoElement.error.message);
            }
          });
          
          videoElement.addEventListener('stalled', () => {
            console.log('⚠️ Video stalled');
          });
          
          videoElement.addEventListener('waiting', () => {
            console.log('⏳ Video waiting for data');
            
            // If we're waiting and no stream is created, try to recreate
            if (!streamCreated) {
              console.log('🔄 Video waiting but no stream, recreating...');
              setTimeout(() => {
                createVideoStream();
              }, 1000);
            }
          });
          
          // Check video state and force canplay check
          const checkVideoReadiness = () => {
            console.log('=== VIDEO STATE CHECK ===');
            console.log('readyState:', videoElement.readyState);
            console.log('networkState:', videoElement.networkState);
            console.log('has src:', !!videoElement.src);
            console.log('duration:', videoElement.duration);
            console.log('paused:', videoElement.paused);
            console.log('ended:', videoElement.ended);
            console.log('error:', videoElement.error);
            console.log('current time:', videoElement.currentTime);
            
            // Force fire canplay event if conditions are met
            if (videoElement.readyState >= 2 && videoElement.duration > 0) {
              console.log('🎯 Video has enough data, manually triggering canplay logic...');
              videoElement.play().then(() => {
                console.log('✅ Manual play SUCCESS!');
              }).catch(e => {
                console.log('❌ Manual play FAILED:', e.message, e.name);
              });
            } else if (videoElement.readyState >= 1 && videoElement.duration > 0) {
              console.log('⏳ Video has metadata but waiting for more data...');
              
              // Check how much has been downloaded
              if (torrent && torrent.progress > 0.25) {
                console.log('🏁 25%+ downloaded. Trying direct buffer streaming...');
                
                const videoFile = torrent.files.find((f: any) => f.name.match(/\.(mp4|webm|ogg|avi|mov)$/i));
                
                if (videoFile) {
                  console.log('💾 Attempting direct buffer streaming approach...');
                  
                  try {
                    console.log('🔧 Checking if videoFile has getBuffer method...');
                    
                    // Try to get partial buffer directly
                    if (typeof videoFile.getBuffer === 'function') {
                      console.log('✅ getBuffer method available, requesting partial data...');
                      
                      // Request partial buffer (first 25% should be enough for video headers)
                      videoFile.getBuffer((err: any, buffer: ArrayBuffer) => {
                        console.log('🔍 getBuffer callback fired');
                        console.log('Error:', err);
                        console.log('Buffer:', buffer);
                        console.log('Buffer type:', typeof buffer);
                        console.log('Buffer size:', buffer ? buffer.byteLength : 'undefined/null');
                        
                        if (!err && buffer && buffer.byteLength > 0) {
                          console.log('✅ Got buffer! Size:', buffer.byteLength, 'bytes');
                          
                          // Create blob from buffer
                          const blob = new Blob([buffer], { type: 'video/mp4' });
                          const blobUrl = URL.createObjectURL(blob);
                          
                          console.log('🎬 Created blob URL from buffer:', blobUrl.substring(0, 60) + '...');
                          
                          // Clear and set new source
                          videoElement.src = '';
                          videoElement.load();
                          videoElement.src = blobUrl;
                          videoElement.load();
                          
                          console.log('📹 Video source set to buffer-based blob URL');
                          
                          // Attempt to play
                          setTimeout(() => {
                            videoElement.play().then(() => {
                              console.log('🎉 AMAZING SUCCESS! Buffer-based video playing!');
                            }).catch(playErr => {
                              console.log('❌ Buffer video play failed:', playErr.message);
                            });
                          }, 1000);
                          
                        } else {
                          console.log('❌ getBuffer failed or returned empty:', err?.message || 'No buffer');
                        }
                      });
                    } else {
                      console.log('❌ getBuffer method not available on videoFile');
                      console.log('Available methods:', Object.getOwnPropertyNames(videoFile.__proto__));
                      
                      // Fallback: try to force stream connection
                      console.log('🔄 Fallback: forcing new renderTo connection...');
                      
                      // Clear completely and try fresh renderTo
                      videoElement.pause();
                      videoElement.src = '';
                      videoElement.load();
                      
                      setTimeout(() => {
                        console.log('🎬 Attempting fresh renderTo after cleanup...');
                        try {
                          videoFile.renderTo(videoElement, {}, (err: any) => {
                            if (err) {
                              console.log('❌ Fresh renderTo failed:', err.message);
                            } else {
                              console.log('✅ Fresh renderTo connection established');
                              
                              // Force play attempt
                              setTimeout(() => {
                                videoElement.play().then(() => {
                                  console.log('🎉 Fresh renderTo SUCCESS!');
                                }).catch(e => console.log('❌ Fresh renderTo play failed:', e.message));
                              }, 1500);
                            }
                          });
                        } catch (freshErr) {
                          console.log('❌ Fresh renderTo exception:', freshErr);
                        }
                      }, 500);
                    }
                    
                  } catch (bufferErr) {
                    console.log('❌ Buffer streaming exception:', bufferErr);
                  }
                }
              } else {
                console.log('Will check again in 2 seconds...');
                setTimeout(checkVideoReadiness, 2000);
              }
            } else {
              console.log('⚠️ Video not ready yet, will retry...');
              setTimeout(checkVideoReadiness, 3000);
            }
          };
          
          // Start checking after initial setup
          setTimeout(checkVideoReadiness, 3000);
          
          // Also check periodically during download
          const progressChecker = setInterval(() => {
            if (videoElement.readyState >= 2 && !videoElement.error) {
              console.log('🔄 Periodic check: Video ready for playback!');
              clearInterval(progressChecker);
            }
          }, 5000);
          
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
