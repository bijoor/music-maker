// Recorded samples on this device, in IndexedDB (too large for local storage), keyed by sound name.

const DB = 'music-maker-samples', STORE = 'samples';

function open(): Promise<IDBDatabase> {
  return new Promise((ok, bad) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => bad(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((ok, bad) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => bad(req.error);
  });
}

export const putSample = (voice: string, wav: Blob) => run('readwrite', (s) => s.put(wav, voice));
export const getSample = (voice: string) => run<Blob | undefined>('readonly', (s) => s.get(voice));
export const deleteSample = (voice: string) => run('readwrite', (s) => s.delete(voice));
