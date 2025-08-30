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
    console.log('🎯 Using WebTorrent v1.8.25 (pipe error fix)');
    
    // Load WebTorrent v1.8.25 (fixed version without pipe errors)
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@1.8.25/webtorrent.min.js';
    script.onload = () => {
      // @ts-ignore
      clientRef.current = new WebTorrent();
      setStatus('WebTorrent client ready');
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
        
        const handleVideoReady = (err: any, videoElement: HTMLVideoElement) => {
          if (err) {
            setStatus(`Error: ${err.message}`);
            console.error('❌ Video setup failed:', err);
          } else {
            setStatus('Video ready for streaming - click play!');
            console.log('✅ Video setup SUCCESS');
            console.log('Video src:', videoElement.src);
            console.log('Video readyState:', videoElement.readyState);
            console.log('SRC type analysis:', {
              isBlob: videoElement.src?.startsWith('blob:'),
              isMediaSource: videoElement.src?.startsWith('blob:') && videoElement.src.includes('mediasource'),
              fullSrc: videoElement.src
            });
            
            // Apply styling to the created video element
            videoElement.className = 'w-full max-w-2xl';
            
            videoElement.addEventListener('loadedmetadata', () => {
              console.log('✅ Metadata loaded - duration:', videoElement.duration);
            });
            videoElement.addEventListener('canplay', () => {
              console.log('✅ Can play - readyState:', videoElement.readyState);
            });
            videoElement.addEventListener('canplaythrough', () => {
              console.log('✅ Can play through - enough data for smooth playback');
            });
            videoElement.addEventListener('error', (e) => {
              console.error('❌ Video error:', e);
              console.error('Video error details:', videoElement.error);
            });
          }
        };
        
        // Try streamTo method first for better streaming
        try {
          console.log('🔄 Trying streamTo method...');
          videoFile.streamTo(videoContainerRef.current, {
            autoplay: false,
            controls: true
          }, (err: any, videoElement: HTMLVideoElement) => {
            if (err) {
              console.log('❌ streamTo failed, falling back to appendTo');
              // Fallback to appendTo if streamTo fails
              videoFile.appendTo(videoContainerRef.current, {
                autoplay: false, 
                controls: true,
                maxBlobLength: 200 * 1000 * 1000  // 200MB threshold
              }, handleVideoReady);
            } else {
              console.log('✅ streamTo SUCCESS');
              handleVideoReady(null, videoElement);
            }
          });
        } catch (e) {
          console.log('❌ streamTo not available, using appendTo');
          videoFile.appendTo(videoContainerRef.current, {
            autoplay: false,
            controls: true,
            maxBlobLength: 200 * 1000 * 1000  // 200MB threshold
          }, handleVideoReady);
        }
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