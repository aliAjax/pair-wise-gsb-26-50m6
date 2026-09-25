import type {
  CaseRecord,
  ContentVersion,
  DataBundle,
  LocalDraft,
  ReviewRecord,
} from "./types";

/**
 * 四个对象库分开维护：
 *  cases             个案与当前会谈登记
 *  reviews           督导复核记录（逐条意见）
 *  archiveVersions   归档版本快照
 *  localDrafts       本机未提交的编辑，仅当前浏览器可见
 */
const DB_NAME = "hxwl-12-review-desk";
const DB_VERSION = 1;
export const STORES = ["cases", "reviews", "archiveVersions", "localDrafts"] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export async function putItem<T extends { id: string }>(store: StoreName, item: T): Promise<void> {
  await tx(store, "readwrite", (s) => s.put(item) as IDBRequest<IDBValidKey>);
}

export async function deleteItem(store: StoreName, id: string): Promise<void> {
  await tx(store, "readwrite", (s) => s.delete(id));
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return tx(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
}

export async function getOne<T>(store: StoreName, id: string): Promise<T | undefined> {
  return tx(store, "readonly", (s) => s.get(id) as IDBRequest<T | undefined>);
}

export async function loadBundle(): Promise<DataBundle> {
  const [cases, reviews, versions, drafts] = await Promise.all([
    getAll<CaseRecord>("cases"),
    getAll<ReviewRecord>("reviews"),
    getAll<ContentVersion>("archiveVersions"),
    getAll<LocalDraft>("localDrafts"),
  ]);
  return { cases, reviews, versions, drafts };
}

/** 清空全部四个库（演示用：恢复示例数据） */
export async function resetAll(): Promise<void> {
  const db = await openDb();
  await Promise.all(
    STORES.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = db.transaction(name, "readwrite").objectStore(name).clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
    )
  );
}

export async function isSeeded(): Promise<boolean> {
  const count = await tx("cases", "readonly", (s) => s.count());
  return count > 0;
}
