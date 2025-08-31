import { useEffect, useRef, useState } from 'react';
import getWebTorrent from '@/lib/wt-esm';

const MAGNET = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.webtorrent.dev';

export default function WebTorrentSelfTest() {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Starting…');
  const videoRef = useRef<HTMLVideoElement>(null);

  const log = (msg: string) => {
    console.log('[WT-TEST]', msg);
    setLogs((l) => [...l, msg]);
  };

  useEffect(() => {
    (async () => {
      try {
        log('Step 1: Checking Service Worker support');
        if (!('serviceWorker' in navigator)) {
          setStatus('No ServiceWorker support');
          return;
        }

        log('Step 2: Registering root SW /sw.min.js');
        // Register and then wait for the activated registration instance
        await navigator.serviceWorker.register('/sw.min.js', { scope: '/' });
        const readyReg = await navigator.serviceWorker.ready;
        log(`SW ready. scope=${readyReg.scope}`);

        const ctrl = navigator.serviceWorker.controller;
        log(`controller=${ctrl ? (ctrl as any).scriptURL : 'null (will rely on reg.active)'}`);

        log('Step 3: Loading WebTorrent constructor');
        const WebTorrent = await getWebTorrent();
        const WSS = [
          'wss://tracker.btorrent.xyz',
          'wss://tracker.openwebtorrent.com',
          'wss://tracker.webtorrent.dev'
        ];
        const client = new WebTorrent({
          tracker: { announce: WSS },
          dht: false,
          lsd: false,
          utPex: false,
          natUpnp: false,
          natPmp: false,
        });

        // Ensure page is actually controlled before wiring BrowserServer
        if (!navigator.serviceWorker.controller) {
          await new Promise<void>((resolve) => {
            const onCtrl = () => resolve();
            navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true } as any);
          });
        }

        log('Step 4: createServer with ServiceWorkerRegistration');
        if (typeof client.createServer === 'function') {
          client.createServer({ controller: readyReg });
        } else {
          log('createServer not available on client');
        }

        log('Step 5: Adding torrent');
        client.add(MAGNET, { announce: WSS }, (t: any) => {
          log(`Torrent ready: ${t.name}`);
          const f = t.files.find((x: any) => /\.(mp4|webm|ogg)$/i.test(x.name));
          if (!f) {
            setStatus('No playable file found');
            return;
          }
          const el = videoRef.current!;
          try {
            f.streamTo(el, (err: any) => {
              if (err) {
                log(`streamTo error: ${err?.message || err}`);
                setStatus('FAIL: ' + (err?.message || err));
              } else {
                log('streamTo OK');
                setStatus('PASS');
              }
            });
          } catch (e: any) {
            log(`streamTo threw: ${e?.message || e}`);
            setStatus('FAIL: ' + (e?.message || e));
          }
        });
      } catch (e: any) {
        log('Fatal error: ' + (e?.message || e));
        setStatus('FAIL: ' + (e?.message || e));
      }
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">WebTorrent Self Test</h1>
      <p>Status: {status}</p>
      <video ref={videoRef} controls className="w-full aspect-video bg-black" />
      <div className="p-3 bg-secondary/30 rounded border text-xs whitespace-pre-wrap">
        {logs.join('\n')}
      </div>
    </div>
  );
}
