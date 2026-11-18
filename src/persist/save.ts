import { SAVE_VERSION, type WorldState } from '../sim/state';

/**
 * Сохранение мира в IndexedDB. Хранится одна запись «autosave».
 */
const DB_NAME = 'dom';
const STORE = 'saves';
const KEY = 'autosave';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export interface SaveRecord {
  version: number;
  savedAt: number; // реальное время сохранения (только для информации)
  state: WorldState;
}

export async function loadWorld(): Promise<SaveRecord | null> {
  try {
    const rec = await tx<SaveRecord | undefined>('readonly', (s) => s.get(KEY));
    if (!rec || rec.version !== SAVE_VERSION || rec.state?.version !== SAVE_VERSION) return null;
    return rec;
  } catch (e) {
    console.warn('[save] не удалось загрузить', e);
    return null;
  }
}

export async function saveWorld(state: WorldState): Promise<void> {
  const rec: SaveRecord = { version: SAVE_VERSION, savedAt: Date.now(), state: structuredClone(state) };
  await tx('readwrite', (s) => s.put(rec, KEY));
}

export async function clearWorld(): Promise<void> {
  await tx('readwrite', (s) => s.delete(KEY));
}
