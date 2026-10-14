// The phone's storage for saved page data: the browser's IndexedDB, database
// "groundwork-offline". Null when the browser has none or refuses it (private
// browsing, blocked site data): then nothing is saved and the app works online
// as before. Browser only.

import type { OfflineStore } from "@/lib/offline/persist";
import type { SavedEntry, Who } from "@/lib/offline/saved";

const DB = "groundwork-offline";
const SAVED = "saved";
const META = "meta";

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

function open(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(SAVED, { keyPath: "id" });
    request.result.createObjectStore(META);
  };
  return done(request);
}

export function idbStore(): OfflineStore | null {
  if (typeof indexedDB === "undefined") return null;
  let opened: Promise<IDBDatabase> | null = null;
  const db = () => (opened ??= open());
  const write = async (names: string[], job: (tx: IDBTransaction) => void) => {
    const tx = (await db()).transaction(names, "readwrite");
    job(tx);
    await finished(tx);
  };
  return {
    async readWho() {
      const tx = (await db()).transaction(META, "readonly");
      return ((await done(tx.objectStore(META).get("who"))) as Who | undefined) ?? null;
    },
    writeWho: (who) => write([META], (tx) => void tx.objectStore(META).put(who, "who")),
    async all() {
      const tx = (await db()).transaction(SAVED, "readonly");
      return (await done(tx.objectStore(SAVED).getAll())) as SavedEntry[];
    },
    put: (entry) => write([SAVED], (tx) => void tx.objectStore(SAVED).put(entry)),
    remove: (ids) =>
      write([SAVED], (tx) => {
        for (const id of ids) tx.objectStore(SAVED).delete(id);
      }),
    clear: () =>
      write([SAVED, META], (tx) => {
        tx.objectStore(SAVED).clear();
        tx.objectStore(META).clear();
      }),
  };
}
