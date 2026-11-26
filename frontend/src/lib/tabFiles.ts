import { apiClient, isTabFormat, MAX_TAB_BYTES, type TabFileDto, type TabFormat, type TabSongDto } from './apiClient';
import { auth } from './auth';

interface CachedTab {
  uid: string;
  songId: string;
  fileName: string;
  format: TabFormat;
  sizeBytes: number;
  used: number;
  bytes: ArrayBuffer;
}

let database: Promise<IDBDatabase> | undefined;
let pending = Promise.resolve();

function openCache(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('ulp-tab-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: ['uid', 'songId'] });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('TAB cache is blocked'));
  });
}

function cache<T>(run: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T | undefined> {
  const task = pending.then(async () => {
    const db = await openCache();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error);
      run(tx.objectStore('files'), (next) => { value = next; });
    });
  }).catch(() => undefined);
  pending = task.then(() => undefined);
  return task;
}

export function clearOtherTabAccounts(uid: string | null): Promise<void | undefined> {
  return cache<void>((store) => {
    const request = store.openKeyCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const [owner] = cursor.key as [string, string];
      if (owner !== uid) store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

export function evictTab(uid: string, songId: string): Promise<void | undefined> {
  return cache<void>((store) => { store.delete([uid, songId]); });
}

function owns(uid: string, signal: AbortSignal): boolean {
  return !signal.aborted && auth.getUser()?.id === uid;
}

function sameFile(entry: CachedTab, meta: TabFileDto): boolean {
  return entry.fileName === meta.fileName && entry.format === meta.format &&
    entry.sizeBytes === meta.sizeBytes && entry.bytes.byteLength === meta.sizeBytes;
}

function readTab(uid: string, songId: string, meta: TabFileDto, signal: AbortSignal) {
  return cache<ArrayBuffer>((store, result) => {
    if (!owns(uid, signal)) return;
    const request = store.get([uid, songId]);
    request.onsuccess = () => {
      const entry: CachedTab | undefined = request.result;
      if (!entry || !owns(uid, signal)) return;
      if (!sameFile(entry, meta)) { store.delete([uid, songId]); return; }
      store.put({ ...entry, used: Date.now() });
      result(entry.bytes);
    };
  });
}

export function rememberTab(uid: string, song: TabSongDto, bytes: ArrayBuffer, signal: AbortSignal) {
  return cache<void>((store) => {
    if (!owns(uid, signal) || bytes.byteLength !== song.tabFileSize) return;
    const request = store.getAll(IDBKeyRange.bound([uid], [uid, []], false, true));
    request.onsuccess = () => {
      if (!owns(uid, signal)) return;
      const entries: CachedTab[] = request.result;
      const others = entries.filter((entry) => entry.songId !== song.id).sort((a, b) => b.used - a.used);
      for (const entry of others.slice(1)) store.delete([uid, entry.songId]);
      store.put({
        uid, songId: song.id, bytes, sizeBytes: bytes.byteLength, used: Date.now(),
        fileName: song.tabFileName, format: song.tabFormat,
      } satisfies CachedTab);
    };
  });
}

function validateMeta(meta: TabFileDto): URL {
  if (!meta || typeof meta.url !== 'string' || meta.expiresIn !== 300 ||
      typeof meta.fileName !== 'string' || !meta.fileName || !isTabFormat(meta.format) ||
      !Number.isSafeInteger(meta.sizeBytes) || meta.sizeBytes < 1 || meta.sizeBytes > MAX_TAB_BYTES) {
    throw new Error('Invalid TAB metadata');
  }
  const url = new URL(meta.url);
  const storage = new URL(window.ULEVELP_CONFIG?.supabaseUrl || '');
  if (url.protocol !== 'https:' || url.origin !== storage.origin || url.username || url.password) {
    throw new Error('Invalid TAB storage origin');
  }
  return url;
}

async function readBytes(response: Response, size: number): Promise<ArrayBuffer> {
  if (!response.body) throw new Error('Missing TAB body');
  const reader = response.body.getReader();
  const bytes = new Uint8Array(size);
  let offset = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (offset + chunk.value.byteLength > size) throw new Error('Invalid TAB size');
      bytes.set(chunk.value, offset);
      offset += chunk.value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (offset !== size) throw new Error('Incomplete TAB file');
  return bytes.buffer;
}

export async function fetchTabBytes(uid: string, song: TabSongDto, signal: AbortSignal): Promise<ArrayBuffer> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!owns(uid, signal)) throw new DOMException('Obsolete TAB selection', 'AbortError');
    const meta = await apiClient.songs.getTabFile(song.id, signal).catch(async (error) => {
      if (error.status === 404) await evictTab(uid, song.id);
      throw error;
    });
    const url = validateMeta(meta);
    if (meta.fileName !== song.tabFileName || meta.format !== song.tabFormat || meta.sizeBytes !== song.tabFileSize) {
      await evictTab(uid, song.id);
      throw new Error('TAB metadata changed');
    }
    if (attempt === 0) {
      const hit = await readTab(uid, song.id, meta, signal);
      if (!owns(uid, signal)) throw new DOMException('Obsolete TAB selection', 'AbortError');
      if (hit) return hit;
    }
    const response = await fetch(url, {
      credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
    });
    if ((response.status === 401 || response.status === 403) && attempt === 0) {
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('TAB download failed');
    }
    return readBytes(response, meta.sizeBytes);
  }
  throw new Error('TAB download failed');
}
