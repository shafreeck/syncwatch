import { useState, useRef, useEffect } from 'react';
import WebTorrent from 'webtorrent';

export default function TorrentTest() {
  const [magnetUrl, setMagnetUrl] = useState('magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com');
  const [status, setStatus] = useState('Initializing...');
  const [progress, setProgress] = useState(0);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);

  useEffect(() => {
    // Browser capability checks
    console.log('🔍 Browser capability check:');
    console.log('MediaSource supported:', 'MediaSource' in window);
    console.log('WebRTC supported:', 'RTCPeerConnection' in window);
    console.log('MP4 support:', MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'));
    console.log('🎯 Using WebTorrent v2.8.4 (pre-built dist bundle)');
    
    try {
      // Create WebTorrent client using pre-built bundle
      clientRef.current = new WebTorrent({
        tracker: {
          rtcConfig: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' }
            ]
          }
        }
      });
      
      console.log('✅ WebTorrent client created successfully (pre-built bundle)');
      setStatus('✅ Ready to load torrents');
      
    } catch (error) {
      console.error('❌ Failed to create WebTorrent client:', error);
      setStatus('❌ Failed to initialize WebTorrent');
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.destroy();
      }
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
        }, (err: any, videoElement?: HTMLVideoElement) => {
          if (err) {
            setStatus(`Error: ${err.message}`);
            console.error('❌ appendTo failed:', err);
          } else if (videoElement) {
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
      const message = typeof err === 'string' ? err : err.message;
      setStatus(`Torrent error: ${message}`);
      console.error('❌ Torrent error:', err);
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">WebTorrent Test (Local Bundle)</h1>
      
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
            className="w-full p-2 border border-gray-300 rounded"
          />
        </div>
        
        <button
          onClick={loadTorrent}
          disabled={!magnetUrl || !clientRef.current}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          Load Torrent
        </button>
        
        <div className="p-4 bg-gray-100 rounded">
          <p><strong>Status:</strong> {status}</p>
          <p><strong>Progress:</strong> {progress.toFixed(1)}%</p>
        </div>
        
        <div ref={videoContainerRef} className="mt-4">
          {/* Video will be appended here */}
        </div>
      </div>
    </div>
  );
}