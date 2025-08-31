import { useState, useRef, useEffect } from 'react';

export default function TorrentTest() {
  const [magnetUrl, setMagnetUrl] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);

  useEffect(() => {
    // Check MediaSource API support first
    console.log('🔍 Browser capability check:');
    console.log('MediaSource supported:', 'MediaSource' in window);
    console.log('WebRTC supported:', 'RTCPeerConnection' in window);
    console.log('MP4 support:', MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'));
    console.log('🎯 Using WebTorrent @latest with appendTo (like instant.io)');
    
    // Load WebTorrent latest version
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js';
    
    console.log('🌐 Loading WebTorrent script from:', script.src);
    
    script.onload = () => {
      console.log('📦 WebTorrent script loaded successfully');
      console.log('🔍 Available WebTorrent:', typeof window.WebTorrent);
      console.log('🔍 Global scope check:', Object.keys(window).filter(key => key.toLowerCase().includes('torrent')));
      
      // @ts-ignore
      if (window.WebTorrent) {
        try {
          clientRef.current = new window.WebTorrent();
          setStatus('WebTorrent client ready');
          console.log('✅ WebTorrent client created successfully');
        } catch (error) {
          console.error('❌ Error creating WebTorrent client:', error);
          setStatus('Error creating WebTorrent client');
        }
      } else {
        console.error('❌ WebTorrent not found on window object');
        setStatus('WebTorrent not available');
      }
    };
    
    script.onerror = (error) => {
      console.error('❌ Failed to load WebTorrent script:', error);
      setStatus('Failed to load WebTorrent script');
    };
    document.head.appendChild(script);

    return () => {
      if (clientRef.current) {
        clientRef.current.destroy();
      }
      document.head.removeChild(script);
    };
  }, []);

  const loadTorrent = () => {
    if (!clientRef.current || !magnetUrl || !videoContainerRef.current) {
      setStatus('Missing client, URL, or video container');
      return;
    }

    setStatus('Loading torrent...');
    
    const torrent = clientRef.current.add(magnetUrl, (torrent: any) => {
      setStatus(`Torrent loaded: ${torrent.name}`);
      
      // Find the video file
      const videoFile = torrent.files.find((file: any) => 
        file.name.match(/\.(mp4|webm|avi|mov|mkv)$/i)
      );
      
      if (videoFile && videoContainerRef.current) {
        setStatus(`Setting up video: ${videoFile.name}`);
        
        // Clear previous video elements
        videoContainerRef.current.innerHTML = '';
        
        // Use appendTo exactly like instant.io
        videoFile.appendTo(videoContainerRef.current, {
          maxBlobLength: 2 * 1000 * 1000 * 1000  // 2 GB exactly like instant.io
        }, (err: any, videoElement: HTMLVideoElement) => {
          if (err) {
            setStatus(`Error: ${err.message}`);
            console.error('❌ appendTo failed:', err);
          } else {
            setStatus('📺 Video ready (instant.io exact config)');
            console.log('✅ appendTo SUCCESS - exact instant.io config');
            
            // Apply styling and controls to the WebTorrent-created video element
            videoElement.className = 'w-full max-w-2xl';
            videoElement.controls = true;
            
            // Log streaming strategy - but DON'T trigger play()
            const isMediaSource = videoElement.src?.includes('mediasource');
            console.log('🎯 Streaming strategy:', isMediaSource ? 'MediaSource (Progressive)' : 'Blob URL');
            console.log('📊 Duration:', videoElement.duration || 'Loading...');
            console.log('🚫 No automatic playback - user must click play (like instant.io)');
          }
        });
      } else {
        setStatus('No video file found in torrent');
      }
    });

    torrent.on('download', () => {
      setProgress(torrent.progress * 100);
    });

    torrent.on('error', (err: any) => {
      setStatus(`Torrent error: ${err.message}`);
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">WebTorrent Simple Test</h1>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Magnet URI:
          </label>
          <input
            type="text"
            value={magnetUrl}
            onChange={(e) => setMagnetUrl(e.target.value)}
            placeholder="magnet:?xt=urn:btih:..."
            className="w-full p-2 border border-gray-300 rounded-md bg-white text-black dark:bg-gray-800 dark:text-white dark:border-gray-600"
          />
        </div>
        
        <button
          onClick={loadTorrent}
          disabled={!magnetUrl || !clientRef.current}
          className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:opacity-50"
        >
          Load Torrent
        </button>
        
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Status: {status}
        </div>
        
        {progress > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Download Progress: {progress.toFixed(1)}%
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}
        
        <div
          ref={videoContainerRef}
          className="w-full max-w-2xl min-h-[200px] border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800 flex items-center justify-center"
        >
          <div className="text-gray-500 dark:text-gray-400">
            Video will appear here after loading torrent
          </div>
        </div>
      </div>
      
      <div className="mt-8 p-4 bg-gray-100 rounded-md">
        <h3 className="font-medium mb-2">Test with this magnet URL:</h3>
        <code className="text-xs break-all">
          magnet:?xt=urn:btih:c53da4fa28aa2edc1faa91861cce38527414d874&dn=Sintel.mp4&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com
        </code>
      </div>
    </div>
  );
}