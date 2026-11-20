// مخزن محلي (IndexedDB) لنصوص التفسير والترجمات المنزَّلة للاستخدام دون إنترنت.
// لا يُرسل شيء إلى خادم، ولا يُعاد توزيع المحتوى: تخزين شخصي على الجهاز.
export type OfflineKind = 'tafsir' | 'translation';

export type PackMeta = {
  key: string;
  kind: OfflineKind;
  id: number;
  name: string;
  language: string;
  status: 'idle' | 'downloading' | 'done' | 'error';
  chapters: number[];
  entries: number;
  bytes: number;
  updatedAt: string;
  error?: string;
};

const DB_NAME = 'rabbani-quran-offline';
const DB_VERSION = 1;
const ENTRY_STORE = 'entries';
const PACK_STORE = 'packs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const pending: Promise<IDBDatabase> = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('التخزين المحلي غير متاح في هذا المتصفح.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        const store = db.createObjectStore(ENTRY_STORE, {keyPath: 'key'});
        store.createIndex('pack', ['kind', 'id']);
      }
      if (!db.objectStoreNames.contains(PACK_STORE)) db.createObjectStore(PACK_STORE, {keyPath: 'key'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('تعذر فتح التخزين المحلي.'));
  }).catch(error => { dbPromise = null; throw error; });
  dbPromise = pending;
  return pending;
}

export const packKey = (kind: OfflineKind, id: number) => `${kind}:${id}`;
const entryKey = (kind: OfflineKind, id: number, verseKey: string) => `${kind}:${id}:${verseKey}`;

function requestDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** يعيد النص المنزَّل، أو undefined إن لم يُنزَّل هذا الموضع بعد. */
export async function getOfflineEntry(kind: OfflineKind, id: number, verseKey: string): Promise<string | null | undefined> {
  try {
    const db = await openDb();
    const record = await requestDone<{text: string} | undefined>(db.transaction(ENTRY_STORE, 'readonly').objectStore(ENTRY_STORE).get(entryKey(kind, id, verseKey)));
    return record ? record.text : undefined;
  } catch { return undefined; }
}

export async function getPack(kind: OfflineKind, id: number): Promise<PackMeta | undefined> {
  try {
    const db = await openDb();
    return await requestDone<PackMeta | undefined>(db.transaction(PACK_STORE, 'readonly').objectStore(PACK_STORE).get(packKey(kind, id)));
  } catch { return undefined; }
}

export async function listPacks(): Promise<PackMeta[]> {
  try {
    const db = await openDb();
    const packs = await requestDone<PackMeta[]>(db.transaction(PACK_STORE, 'readonly').objectStore(PACK_STORE).getAll());
    return packs ?? [];
  } catch { return []; }
}

export async function startPack(meta: PackMeta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PACK_STORE, 'readwrite');
  tx.objectStore(PACK_STORE).put(meta);
  await txDone(tx);
}

/** يخزّن نصوص سورة واحدة مرة واحدة، ويعيد الحجم التقديري بالبايت. */
export async function putChapter(kind: OfflineKind, id: number, chapter: number, items: {verseKey: string; text: string}[]): Promise<{bytes: number; entries: number}> {
  const db = await openDb();
  const tx = db.transaction(ENTRY_STORE, 'readwrite');
  const store = tx.objectStore(ENTRY_STORE);
  let bytes = 0;
  for (const item of items) {
    store.put({key: entryKey(kind, id, item.verseKey), kind, id, chapter, verseKey: item.verseKey, text: item.text});
    bytes += new Blob([item.text]).size;
  }
  await txDone(tx);
  return {bytes, entries: items.length};
}

export async function deletePack(kind: OfflineKind, id: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([ENTRY_STORE, PACK_STORE], 'readwrite');
  const entries = tx.objectStore(ENTRY_STORE);
  const index = entries.index('pack');
  const cursorRequest = index.openKeyCursor(IDBKeyRange.only([kind, id]));
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) { resolve(); return; }
      entries.delete(cursor.primaryKey);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
  tx.objectStore(PACK_STORE).delete(packKey(kind, id));
  await txDone(tx);
}

/** حجم التخزين التقريبي المستخدم (للعرض فقط). */
export async function storageEstimate(): Promise<number | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const {usage} = await navigator.storage.estimate();
    return typeof usage === 'number' ? usage : null;
  } catch { return null; }
}
