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
          console.log('🎬 Using proper WebTorrent appendTo method for streaming...');
          let streamCreated = false;
          
          const createVideoStream = () => {
            console.log('Creating new video stream with appendTo...');
            try {
              // Clear existing source to avoid conflicts
              videoElement.pause();
              videoElement.src = '';
              videoElement.load();
              
              console.log('🧹 Video element cleared, starting appendTo...');
              
              // Use WebTorrent's official appendTo method for streaming
              // According to docs, appendTo should receive a container, not an existing video element
              const videoContainer = videoElement.parentElement;
              if (!videoContainer) {
                throw new Error('Video element has no parent container');
              }
              
              console.log('📦 Found video container:', videoContainer);
              
              // Remove existing video element to avoid conflicts
              videoElement.remove();
              
              // Let appendTo create a new video element
              videoFile.appendTo(videoContainer, {
                autoplay: false,  // We'll handle play manually
                muted: true,
                controls: true
              }, (err: any, element: HTMLVideoElement) => {
                if (err) {
                  console.log('❌ appendTo error:', err);
                  
                  // If appendTo fails, recreate video element and try renderTo as fallback
                  console.log('🔄 Trying renderTo fallback...');
                  
                  // Recreate video element since we removed it
                  const newVideoElement = document.createElement('video');
                  newVideoElement.setAttribute('data-testid', 'video-player');
                  newVideoElement.controls = true;
                  newVideoElement.style.width = '100%';
                  newVideoElement.style.height = 'auto';
                  videoContainer.appendChild(newVideoElement);
                  
                  console.log('🔧 Recreated video element for renderTo fallback');
                  
                  videoFile.renderTo(newVideoElement, (renderErr: any) => {
                    if (renderErr) {
                      console.log('❌ renderTo fallback also failed:', renderErr);
                    } else {
                      console.log('✓ Fallback: renderTo success');
                      streamCreated = true;
                    }
                  });
                } else {
                  console.log('✅ appendTo SUCCESS! Video file attached to element');
                  console.log('📹 Video element ready:', {
                    readyState: element.readyState,
                    networkState: element.networkState,
                    duration: element.duration,
                    src: element.src?.substring(0, 60) + '...'
                  });
                  streamCreated = true;
                  
                  // Set up metadata loaded handler
                  const onMetadataLoaded = () => {
                    console.log('🎯 Video metadata loaded via appendTo!');
                    console.log('Video specs:', {
                      duration: element.duration,
                      videoWidth: element.videoWidth,
                      videoHeight: element.videoHeight,
                      readyState: element.readyState
                    });
                    
                    element.removeEventListener('loadedmetadata', onMetadataLoaded);
                  };
                  
                  // Listen for metadata loaded
                  element.addEventListener('loadedmetadata', onMetadataLoaded);
                  
                  // If metadata already available, call immediately
                  if (element.readyState >= 1) {
                    console.log('🏃‍♂️ Metadata already available via appendTo');
                    onMetadataLoaded();
                  }
                }
              });
            } catch (e: any) {
              console.log('❌ appendTo failed with exception:', e);
              console.log('❌ Exception details:', {
                name: e?.name,
                message: e?.message,
                stack: e?.stack?.substring(0, 200)
              });
              console.log('🔄 Falling back to renderTo...');
              
              // Final fallback to renderTo - recreate video element if it was removed
              try {
                const videoContainer = document.querySelector('[data-testid="video-player"]')?.parentElement;
                if (!videoContainer) {
                  console.log('❌ Cannot find video container for final fallback');
                  return;
                }
                
                // Create new video element for final fallback
                const finalVideoElement = document.createElement('video');
                finalVideoElement.setAttribute('data-testid', 'video-player');
                finalVideoElement.controls = true;
                finalVideoElement.style.width = '100%';
                finalVideoElement.style.height = 'auto';
                videoContainer.appendChild(finalVideoElement);
                
                console.log('🔧 Created final video element for renderTo');
                
                videoFile.renderTo(finalVideoElement, (err: any) => {
                  if (err) {
                    console.log('❌ Final renderTo fallback failed:', err);
                  } else {
                    console.log('✓ Final renderTo fallback success');
                    streamCreated = true;
                  }
                });
              } catch (renderErr) {
                console.log('❌ Final renderTo exception:', renderErr);
              }
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
              if (torrent && torrent.progress > 0.05) {
                console.log('🏁 5%+ downloaded. Using proper WebTorrent appendTo method...');
                
                const videoFile = torrent.files.find((f: any) => f.name.match(/\.(mp4|webm|ogg|avi|mov)$/i));
                
                if (videoFile) {
                  console.log('🎬 Using official WebTorrent appendTo method for streaming...');
                  
                  try {
                    // Clear the current video element completely
                    videoElement.pause();
                    videoElement.src = '';
                    videoElement.load();
                    
                    console.log('🧹 Video element cleared, starting appendTo...');
                    
                    // Use the proper WebTorrent appendTo method
                    // This creates a streaming connection that works immediately
                    videoFile.appendTo(videoElement, {
                      autoplay: false,  // We'll handle play manually
                      muted: true,
                      controls: true
                    }, (err: any, element: HTMLVideoElement) => {
                      if (err) {
                        console.log('❌ appendTo failed:', err.message);
                        return;
                      }
                      
                      console.log('✅ appendTo SUCCESS! Video file attached to element');
                      console.log('📹 Video element ready:', {
                        readyState: element.readyState,
                        networkState: element.networkState,
                        duration: element.duration,
                        src: element.src?.substring(0, 60) + '...'
                      });
                      
                      // Wait for loadedmetadata event
                      const onMetadataLoaded = () => {
                        console.log('🎯 Video metadata loaded via appendTo!');
                        console.log('Video specs:', {
                          duration: element.duration,
                          videoWidth: element.videoWidth,
                          videoHeight: element.videoHeight,
                          readyState: element.readyState
                        });
                        
                        element.removeEventListener('loadedmetadata', onMetadataLoaded);
                        
                        // Try to play the streaming video
                        setTimeout(() => {
                          console.log('▶️ Attempting to play streaming video...');
                          element.play().then(() => {
                            console.log('🎉 MASSIVE SUCCESS! Streaming video is playing via appendTo!');
                            console.log('🚀 This is the correct WebTorrent streaming implementation!');
                          }).catch(playErr => {
                            console.log('❌ appendTo video play failed:', playErr.message);
                            
                            // Try click-to-play as fallback
                            console.log('🖱️ Setting up click-to-play fallback...');
                            element.addEventListener('click', () => {
                              element.play().then(() => {
                                console.log('✅ Click-to-play SUCCESS!');
                              }).catch(e => console.log('❌ Click-to-play failed:', e));
                            });
                          });
                        }, 500);
                      };
                      
                      // Listen for metadata loaded
                      element.addEventListener('loadedmetadata', onMetadataLoaded);
                      
                      // If metadata already available, call immediately
                      if (element.readyState >= 1) {
                        console.log('🏃‍♂️ Metadata already available, triggering immediately');
                        onMetadataLoaded();
                      }
                    });
                    
                  } catch (appendErr) {
                    console.log('❌ appendTo exception:', appendErr);
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
