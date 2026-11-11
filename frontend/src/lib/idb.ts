// Tiny promise wrapper around IndexedDB for guest data.

const DB = 'krevaya-app'
const VERSION = 1

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('designs')) db.createObjectStore('designs', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbp
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const idb = {
  get: <T>(store: string, id: string) => run<T | undefined>(store, 'readonly', (s) => s.get(id)),
  all: <T>(store: string) => run<T[]>(store, 'readonly', (s) => s.getAll()),
  put: <T>(store: string, value: T) => run<IDBValidKey>(store, 'readwrite', (s) => s.put(value)),
  del: (store: string, id: string) => run<undefined>(store, 'readwrite', (s) => s.delete(id)),
}
