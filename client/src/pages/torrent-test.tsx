import { useState, useRef, useEffect } from 'react';
import getWebTorrent from '@/lib/wt-esm';

export default function TorrentTest() {
  const [magnetUrl, setMagnetUrl] = useState('magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com');
  const [status, setStatus] = useState('Initializing...');
  const [progress, setProgress] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);
  const streamedRef = useRef(false);
  const streamedInfoHashRef = useRef<string | null>(null);

  useEffect(() => {
    // Browser capability checks
    console.log('🔍 Browser capability check:');
    console.log('MediaSource supported:', 'MediaSource' in window);
    console.log('WebRTC supported:', 'RTCPeerConnection' in window);
    console.log('MP4 support:', MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'));
    console.log('🎯 Using WebTorrent v2.x (official ESM + SW)');

    (async () => {
      try {
        // Import WebTorrent constructor via centralized loader
        const WebTorrent = await getWebTorrent();
        const WSS = [
          'wss://tracker.btorrent.xyz',
          'wss://tracker.openwebtorrent.com',
          'wss://tracker.webtorrent.dev'
        ];
        // Force browser-only discovery path; avoid Node tracker that requires `port`
        clientRef.current = new WebTorrent({
          tracker: { announce: WSS },
          dht: false,
          lsd: false,
          utPex: false,
          natUpnp: false,
          natPmp: false,
        });

        // Ensure our SW is registered and activated, then wire BrowserServer
        const reg = await navigator.serviceWorker
          .register('/sw.min.js', { scope: '/' })
          .then((r) => new Promise<ServiceWorkerRegistration>((resolve) => {
            const w = r.active || r.waiting || r.installing;
            const ok = (sw: ServiceWorker | null | undefined) => sw && sw.state === 'activated';
            if (ok(w)) return resolve(r);
            w?.addEventListener('statechange', () => { if (ok(w)) resolve(r); });
          }));
        // Ensure this page is controlled by our SW (fetch interception)
        if (!navigator.serviceWorker.controller) {
          await new Promise<void>((resolve) => {
            const onCtrl = () => { resolve(); };
            navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true } as any);
          });
        }

        try {
          if (typeof clientRef.current.createServer === 'function') {
            clientRef.current.createServer({ controller: reg });
          }
        } catch (e) {
          console.error('createServer failed:', e, {
            scope: reg.scope,
            scriptURL: reg.active?.scriptURL,
            state: reg.active?.state
          });
          throw e;
        }

        console.log('✅ WebTorrent client created successfully (browser bundle)');
        setStatus('✅ Ready to load torrents');
      } catch (error) {
        console.error('❌ Failed to create WebTorrent client:', error);
        setStatus('❌ Failed to initialize WebTorrent');
      }
    })();

    return () => { try { clientRef.current?.destroy?.(); } catch {} };
  }, []);

  const loadTorrent = () => {
    if (!clientRef.current || !magnetUrl || !videoContainerRef.current) {
      setStatus('Missing client, URL, or video container');
      return;
    }

    setStatus('Loading torrent...');
    setHasVideo(false);
    
    // Handler when torrent is ready
    const onReady = (t: any) => {
      setStatus(`Torrent loaded: ${t.name}`);
      
      // Find the video file
      const videoFile = t.files.find((file: any) => 
        file.name.match(/\.(mp4|webm|avi|mov|mkv)$/i)
      );
      
      if (videoFile && videoContainerRef.current) {
        // If already streamed for this torrent, don't rebind
        if (streamedRef.current && streamedInfoHashRef.current === t.infoHash) {
          setStatus('📺 Video already ready');
          return;
        }
        setStatus(`Setting up video: ${videoFile.name}`);

        // Clear previous content (container has no React children)
        videoContainerRef.current.innerHTML = '';
        // Create dedicated video element
        const videoEl = document.createElement('video');
        videoEl.className = 'w-full max-w-2xl';
        videoEl.controls = true;
        videoContainerRef.current.appendChild(videoEl);

        // Prioritize and stream via BrowserServer
        try { videoFile.select(); } catch {}
        try {
          videoFile.streamTo(videoEl);
          setHasVideo(true);
          streamedRef.current = true;
          streamedInfoHashRef.current = t.infoHash;
          setStatus('📺 Video ready');
        } catch (err: any) {
          console.error('❌ streamTo failed:', err);
          if (String(err?.message || err).includes('No worker registered')) {
            // One-off hard reload so the SW controls this tab without extra waiting logic
            if (!sessionStorage.getItem('wt-test-sw-reloaded')) {
              sessionStorage.setItem('wt-test-sw-reloaded', '1');
              location.reload();
              return;
            }
          }
          setStatus(`Error: ${err?.message || err}`);
        }
      } else {
        setStatus('No video file found in torrent');
      }
    };

    // Official tutorial: always use add() callback (let the environment decide trackers)
    const WSS = [
      'wss://tracker.btorrent.xyz',
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.webtorrent.dev'
    ];
    clientRef.current.add(magnetUrl, { announce: WSS }, (t: any) => {
      // progress updates (best-effort)
      if (t && typeof t.on === 'function') {
        t.on('download', () => setProgress(t.progress * 100));
        t.on('error', (err: any) => {
          const message = typeof err === 'string' ? err : err.message;
          setStatus(`Torrent error: ${message}`);
          console.error('❌ Torrent error:', err);
        });
      }
      onReady(t);
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
            className="w-full p-2 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground"
          />
        </div>
        
        <button
          onClick={loadTorrent}
          disabled={!magnetUrl || !clientRef.current}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          Load Torrent
        </button>
        
        <div className="p-4 bg-secondary/30 rounded border border-border">
          <p><strong>Status:</strong> {status}</p>
          <p><strong>Progress:</strong> {progress.toFixed(1)}%</p>
        </div>
        
        <div className="mt-4 min-h-64 border-2 border-dashed rounded-lg bg-secondary/20">
          {!hasVideo && (
            <div className="w-full h-full p-6 text-center text-muted-foreground">
              <p className="text-sm">Video will appear here after loading.</p>
              <p className="text-xs mt-1">Paste a magnet URI above and click Load Torrent.</p>
            </div>
          )}
          <div ref={videoContainerRef} className="w-full h-full flex items-center justify-center" />
        </div>
      </div>
    </div>
  );
}
