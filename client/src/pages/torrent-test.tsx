import { useState, useRef, useEffect } from 'react';

export default function TorrentTest() {
  const [magnetUrl, setMagnetUrl] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<any>(null);

  useEffect(() => {
    // Load WebTorrent dynamically
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js';
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
    if (!clientRef.current || !magnetUrl || !videoRef.current) {
      setStatus('Missing client, URL, or video element');
      return;
    }

    setStatus('Loading torrent...');
    
    const torrent = clientRef.current.add(magnetUrl, (torrent: any) => {
      setStatus(`Torrent loaded: ${torrent.name}`);
      
      // Find the video file
      const videoFile = torrent.files.find((file: any) => 
        file.name.match(/\.(mp4|webm|avi|mov|mkv)$/i)
      );
      
      if (videoFile && videoRef.current) {
        setStatus(`Setting up video: ${videoFile.name}`);
        
        // Use appendTo with maxBlobLength: 0 to force streaming and avoid blob URLs
        const container = document.createElement('div');
        videoRef.current.parentNode?.insertBefore(container, videoRef.current);
        videoRef.current.remove();
        
        videoFile.appendTo(container, { 
          autoplay: false,
          controls: true,
          maxBlobLength: 0  // Force skip blob strategy - this is the key!
        }, (err: any, video: HTMLVideoElement) => {
          if (err) {
            setStatus(`Error: ${err.message}`);
          } else {
            setStatus('Video ready for streaming - click play!');
            console.log('✅ appendTo SUCCESS with streaming strategy');
            console.log('Video src:', video.src);
            console.log('Video readyState:', video.readyState);
            console.log('SRC type:', video.src?.startsWith('blob:') ? 'BLOB_URL (BAD)' : 'STREAMING (GOOD)');
            
            // Update ref to new video element (use object assignment to bypass readonly)
            (videoRef as any).current = video;
            video.className = 'w-full max-w-2xl';
            
            video.addEventListener('loadedmetadata', () => console.log('✅ Metadata loaded'));
            video.addEventListener('canplay', () => console.log('✅ Can play'));
            video.addEventListener('error', (e) => console.error('❌ Video error:', e));
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
        
        <video
          ref={videoRef}
          controls
          className="w-full max-w-2xl"
          onLoadedMetadata={() => console.log('Metadata loaded')}
          onCanPlay={() => console.log('Can play')}
          onError={(e) => console.error('Video error:', e)}
        >
          Your browser does not support the video tag.
        </video>
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