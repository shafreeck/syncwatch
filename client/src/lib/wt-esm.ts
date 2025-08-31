// Centralized loader that returns the WebTorrent constructor (ESM dynamic import).
let ctor: any | null = null;
let loading: Promise<any> | null = null;

export default async function getWebTorrent(): Promise<any> {
  if (ctor) return ctor;
  if (loading) return loading;
  const g = window as any;

  const sources = [
    // Local dev/prod route served by our Express server
    '/vendor/webtorrent.min.js',
    // CDN fallbacks (ESM-compatible)
    'https://unpkg.com/webtorrent@latest/dist/webtorrent.min.js',
    'https://cdn.jsdelivr.net/npm/webtorrent@latest/dist/webtorrent.min.js',
  ];

  loading = (async () => {
    // If a global already exists (unlikely for ESM, but safe), use it
    if (g.WebTorrent) return g.WebTorrent;

    for (const src of sources) {
      try {
        const mod: any = await import(/* @vite-ignore */ src);
        return mod?.default || mod;
      } catch (e) {
        // try next
      }
    }
    throw new Error('WebTorrent constructor not found (ESM load failed).');
  })();

  ctor = await loading;
  return ctor;
}
