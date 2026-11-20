import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_VERIFY } from '../config/defaults'
import { syncBook, vendorId } from '../ledger/books'
import { clearAll, getAll, putAll } from '../ledger/db'
import { applyReversals, matcherLedger } from '../ledger/ledger'
import type { Customer, Order } from '../ledger/types'
import { parseAlert, type AlertEmail, type AlertResult } from '../verify/alerts'
import type { Credit } from '../verify/types'

export type BooksSync =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'synced' }
  | { state: 'failed'; message: string }

export type LedgerData = {
  orders: Order[]
  credits: Credit[]
  customers: Customer[]
}

const config = DEFAULT_VERIFY

// Read straight from IndexedDB, so a step that waited seconds on the model
// decides against the records as they are now.
async function load(): Promise<LedgerData> {
  const [orders, credits, customers] = await Promise.all([
    getAll('orders'),
    getAll('credits'),
    getAll('customers'),
  ])
  orders.sort((a, b) => b.createdAt - a.createdAt)
  return { orders, credits, customers }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Firebase errors carry a code; the vendor gets a sentence instead.
function syncProblem(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
  if (code === 'auth/admin-restricted-operation') {
    return 'sign-in is not enabled for this project'
  }
  if (code === 'permission-denied') return 'the books refused the update'
  if (code === 'unavailable' || code === 'auth/network-request-failed') {
    return 'offline, will retry'
  }
  return errorText(error)
}

export function useLedger() {
  const [data, setData] = useState<LedgerData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [books, setBooks] = useState<BooksSync>({ state: 'idle' })

  const reload = useCallback(
    () =>
      load().then(
        (next) => {
          setData(next)
          setLoadError(null)
        },
        (error: unknown) => setLoadError(errorText(error)),
      ),
    [],
  )

  useEffect(() => {
    let live = true
    load().then(
      (next) => live && setData(next),
      (error: unknown) => live && setLoadError(errorText(error)),
    )
    return () => {
      live = false
    }
  }, [])

  // The screen never waits on the cloud: orders are saved on the device first
  // and the books catch up whenever Firestore can be reached.
  const syncBooks = useCallback((orders: Order[]) => {
    if (orders.length === 0) return
    setBooks({ state: 'syncing' })
    vendorId()
      .then((uid) => Promise.all(orders.map((o) => syncBook(uid, o))))
      .then(() => setBooks({ state: 'synced' }))
      .catch((error: unknown) =>
        setBooks({ state: 'failed', message: syncProblem(error) }),
      )
  }, [])

  const saveOrder = useCallback(
    async (order: Order, customer?: Customer) => {
      await putAll({ orders: [order], customers: customer ? [customer] : [] })
      await reload()
      syncBooks([order])
    },
    [reload, syncBooks],
  )

  const importAlerts = useCallback(
    async (emails: AlertEmail[]): Promise<AlertResult[]> => {
      const before = await load()
      const results = emails.map((e) => parseAlert(e, config))
      const credits = results.flatMap((r) =>
        r.status === 'parsed' ? [r.credit] : [],
      )
      const all = [
        ...before.credits.filter((c) => !credits.some((n) => n.id === c.id)),
        ...credits,
      ]
      const reversed = matcherLedger([], all, config).reversedCredits
      const unpaid = applyReversals(before.orders, reversed, Date.now())
      await putAll({ credits, orders: unpaid })
      await reload()
      syncBooks(unpaid)
      return results
    },
    [reload, syncBooks],
  )

  const reset = useCallback(async () => {
    await clearAll()
    setBooks({ state: 'idle' })
    await reload()
  }, [reload])

  return {
    data,
    load,
    loadError,
    books,
    saveOrder,
    importAlerts,
    reset,
    config,
  }
}

export type LedgerApi = ReturnType<typeof useLedger>
