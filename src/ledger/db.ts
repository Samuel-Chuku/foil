import type { Credit } from '../verify/types'
import type { ShopRules } from '../capture/shopRules'
import type { Brand } from '../capture/brand'
import type {
  ChatNote,
  Customer,
  Drop,
  GmailSettings,
  Order,
  Product,
  Settlement,
} from './types'

// Customers, orders and credits stay in this browser's IndexedDB. Only books
// entries (see books.ts) ever leave the device.

type Stores = {
  orders: Order
  customers: Customer
  credits: Credit
  settlements: Settlement
  products: Product
  drops: Drop
  chats: ChatNote
  // One record per setting: the shop's rules, the Gmail accounts to read.
  settings:
    | ({ id: 'shop-rules' } & ShopRules)
    | ({ id: 'gmail' } & GmailSettings)
    // How receipts look: logo, colour and font.
    | ({ id: 'brand' } & Brand)
    // Numbers the vendor gave for saved WhatsApp contacts, by contact name.
    | { id: 'contacts'; byName: Record<string, string> }
    // The Google Sheet the desk made for this shop, and when it was last sent.
    | { id: 'google'; sheetId: string; sheetUrl: string; sentAt: number | null }
}
export type StoreName = keyof Stores

const NAME = 'vendor-desk'
const VERSION = 6
const STORES: StoreName[] = [
  'orders',
  'customers',
  'credits',
  'settlements',
  'settings',
  'products',
  'drops',
  'chats',
]

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION)
    // Version 2 added settlements, 3 settings, 4 products, 5 drops and 6 chats; existing stores are kept.
    req.onupgradeneeded = () => {
      for (const store of STORES) {
        if (!req.result.objectStoreNames.contains(store)) {
          req.result.createObjectStore(store, { keyPath: 'id' })
        }
      }
    }
    req.onsuccess = () => {
      // Let go when another tab upgrades or deletes the database, instead of
      // blocking it; the next call reopens.
      req.result.onversionchange = () => {
        req.result.close()
        opening = null
      }
      resolve(req.result)
    }
    req.onerror = () => {
      opening = null
      reject(req.error)
    }
  })
  return opening
}

async function run<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    // Power cuts are routine for Lagos vendors; strict durability makes a
    // saved order survive one at the cost of a few milliseconds per write.
    const tx = db.transaction(
      stores,
      mode,
      mode === 'readwrite' ? { durability: 'strict' } : undefined,
    )
    const req = work(tx)
    tx.oncomplete = () => resolve(req ? req.result : undefined)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function getAll<K extends StoreName>(
  store: K,
): Promise<Stores[K][]> {
  const rows = await run([store], 'readonly', (tx) =>
    tx.objectStore(store).getAll(),
  )
  return (rows ?? []) as Stores[K][]
}

export async function get<K extends StoreName>(
  store: K,
  id: string,
): Promise<Stores[K] | undefined> {
  const row = await run([store], 'readonly', (tx) =>
    tx.objectStore(store).get(id),
  )
  return row as Stores[K] | undefined
}

// One transaction, so a verdict and the orders it changes land together or not at all.
export async function putAll(rows: {
  [K in StoreName]?: Stores[K][]
}): Promise<void> {
  const stores = (Object.keys(rows) as StoreName[]).filter(
    (s) => rows[s]?.length,
  )
  if (stores.length === 0) return
  await run(stores, 'readwrite', (tx) => {
    for (const s of stores) {
      for (const row of rows[s] ?? []) tx.objectStore(s).put(row)
    }
  })
}

export async function remove(store: StoreName, id: string): Promise<void> {
  await run([store], 'readwrite', (tx) => {
    tx.objectStore(store).delete(id)
  })
}

// Empties every store on this device, for the demo's reset and for a shop
// laptop the vendor shares.
export async function clearAll(): Promise<void> {
  await run(STORES, 'readwrite', (tx) => {
    for (const s of STORES) tx.objectStore(s).clear()
  })
}
