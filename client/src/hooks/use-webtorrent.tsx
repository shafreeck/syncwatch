import { useState, useEffect, useCallback, useRef } from "react";
// @ts-ignore
import WebTorrent from 'webtorrent/dist/webtorrent.min.js';

export function useWebTorrent() {
  const [client, setClient] = useState<any>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [peers, setPeers] = useState(0);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const currentTorrent = useRef<any>(null);

  useEffect(() => {
    try {
      // Create WebTorrent client using pre-built bundle
      const webTorrentClient = new WebTorrent({
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
      console.log("WebTorrent client initialized for progressive streaming (pre-built bundle)");
      
    } catch (err) {
      console.error("Failed to create WebTorrent client:", err);
      setIsLoading(false);
    }

    return () => {
      if (client) {
        client.destroy();
      }
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
    const torrent = client.add(magnetUri, (torrent: WebTorrent.Torrent) => {
      console.log("Torrent loaded:", torrent.name);
      setIsSeeding(true);

      // Find video file
      const videoFile = torrent.files.find((file: WebTorrent.TorrentFile) => 
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
        }, (err: Error | undefined) => {
          if (err) {
            console.error('❌ renderTo failed:', err);
          } else {
            console.log('✅ Progressive streaming setup complete');
            
            const isMediaSource = videoElement.src?.includes('mediasource');
            console.log('🎯 Strategy:', isMediaSource ? 'MediaSource (Progressive)' : 'Blob URL');
            
            videoElement.addEventListener('loadedmetadata', () => {
              console.log('📹 Metadata ready - starting video');
              videoElement.play();
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

    torrent.on('error', (err: string | Error) => {
      console.error('WebTorrent torrent error:', err);
    });
  }, [client]);

  const seedFile = useCallback((file: File) => {
    if (!client) {
      console.error("WebTorrent client not available");
      return Promise.reject(new Error("WebTorrent client not available"));
    }

    return new Promise<WebTorrent.Torrent>((resolve, reject) => {
      // Remove existing torrent to prevent conflicts
      if (currentTorrent.current) {
        console.log('Removing existing torrent before seeding new file');
        client.remove(currentTorrent.current);
        currentTorrent.current = null;
      }

      const torrent = client.seed(file, (torrent: WebTorrent.Torrent) => {
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

    const torrent = client.add(magnetUri, (torrent: WebTorrent.Torrent) => {
      const file = torrent.files[0];
      if (file) {
        file.getBlobURL((err: Error | undefined, url?: string) => {
          if (err) {
            console.error('Error getting blob URL:', err);
            return;
          }
          
          if (url) {
            // Create download link
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
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