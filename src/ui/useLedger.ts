import { useCallback, useEffect, useState } from 'react'
import { appConfig } from '../config/active'
import { syncBook, vendorId } from '../ledger/books'
import { clearAll, getAll, putAll, remove } from '../ledger/db'
import { applyReversals, freshCredits, matcherLedger } from '../ledger/ledger'
import { applyRefunds, settle } from '../ledger/settle'
import type { Customer, Order, Settlement } from '../ledger/types'
import { parseAlert, type AlertEmail, type AlertResult } from '../verify/alerts'
import {
  historyCredits,
  newHistoryCredits,
  type RawHistoryRow,
} from '../verify/history'
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
  settlements: Settlement[]
}

// Fixed for the session: Remote Config is applied before the first render.
const verifyConfig = () => appConfig().verify

// Read straight from IndexedDB, so a step that waited seconds on the model
// decides against the records as they are now.
async function load(): Promise<LedgerData> {
  const [orders, credits, customers, settlements] = await Promise.all([
    getAll('orders'),
    getAll('credits'),
    getAll('customers'),
    getAll('settlements'),
  ])
  // Latest change first, so an order whose payment just landed rises to the top.
  orders.sort((a, b) => b.updatedAt - a.updatedAt)
  return { orders, credits, customers, settlements }
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

  // New money can cancel an order's payment (a reversal) or confirm a refund
  // the vendor owed, so both are re-checked whenever credits arrive.
  const addCredits = useCallback(
    async (before: LedgerData, credits: Credit[]) => {
      const all = [
        ...before.credits.filter((c) => !credits.some((n) => n.id === c.id)),
        ...credits,
      ]
      const now = Date.now()
      const reversed = matcherLedger([], all, verifyConfig()).reversedCredits
      const unpaid = applyReversals(before.orders, reversed, now)
      const refunded = applyRefunds(
        before.settlements,
        all,
        verifyConfig(),
        now,
      )
      await putAll({ credits, orders: unpaid, settlements: refunded })
      await reload()
      syncBooks(unpaid)
    },
    [reload, syncBooks],
  )

  const importAlerts = useCallback(
    async (emails: AlertEmail[]): Promise<AlertResult[]> => {
      const before = await load()
      const results = emails.map((e) => parseAlert(e, verifyConfig()))
      const credits = freshCredits(
        before.credits,
        results.flatMap((r) => (r.status === 'parsed' ? [r.credit] : [])),
      )
      await addCredits(before, credits)
      return results
    },
    [addCredits],
  )

  // Rows from a bank-app screenshot. Rows the alerts or an earlier screenshot
  // already showed are left out. Returns the credits that were new.
  const importHistory = useCallback(
    async (
      rows: RawHistoryRow[],
      opts: { bank: string | null; day: number },
    ) => {
      const before = await load()
      const credits = newHistoryCredits(
        before.credits,
        historyCredits(rows, { ...opts, screenshotId: `h${Date.now()}` }),
      )
      await addCredits(before, credits)
      return credits
    },
    [addCredits],
  )

  // The vendor's decision about money that pays no order. A refund owed is
  // confirmed at once if the transfer out was already in the alerts.
  const settleCredit = useCallback(
    async (
      creditId: string,
      state: Settlement['state'],
      customerId: string | null,
    ) => {
      const before = await load()
      const credit = before.credits.find((c) => c.id === creditId)
      if (!credit) return
      const now = Date.now()
      const decided = settle(credit, state, customerId, now)
      const others = before.settlements.filter((x) => x.id !== creditId)
      const confirmed = applyRefunds(
        [...others, decided],
        before.credits,
        verifyConfig(),
        now,
      ).find((x) => x.id === creditId)
      await putAll({ settlements: [confirmed ?? decided] })
      await reload()
    },
    [reload],
  )

  // Takes back a refund or credit decision; the money is undecided again.
  const unsettle = useCallback(
    async (creditId: string) => {
      await remove('settlements', creditId)
      await reload()
    },
    [reload],
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
    importHistory,
    settleCredit,
    unsettle,
    reset,
    config: verifyConfig(),
  }
}

export type LedgerApi = ReturnType<typeof useLedger>
