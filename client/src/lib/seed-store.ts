// Minimal IndexedDB store for seeding file handles
// Stores entries keyed by infoHash with the FileSystemFileHandle

export interface SeedEntry {
  infoHash: string;
  roomId: string;
  name?: string;
  handle: any; // FileSystemFileHandle (typed as any to avoid lib variance)
}

const DB_NAME = 'syncwatch-seeds';
const STORE = 'seeds';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'infoHash' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSeedHandle(entry: SeedEntry): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      store.put(entry);
    });
  } catch (e) {
    console.warn('Failed to persist seed handle:', e);
  }
}

export async function getAllSeeds(): Promise<SeedEntry[]> {
  const db = await openDB();
  return await new Promise<SeedEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as SeedEntry[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeSeed(infoHash: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(infoHash);
    });
  } catch {}
}

