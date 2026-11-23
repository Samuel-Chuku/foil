import { useCallback, useEffect, useRef, useState } from 'react'
import { appConfig } from '../config/active'
import { verifyFor } from '../config/marketBanks'
import { dropMoney, syncBook, syncMoney, vendorId } from '../ledger/books'
import { clearAll, getAll, putAll, remove } from '../ledger/db'
import {
  applyReversals,
  freshCredits,
  matcherLedger,
  recheckOrders,
} from '../ledger/ledger'
import { applyRefunds, settle, type ExtraRow } from '../ledger/settle'
import { latestAsk, noteFrom } from '../queue/queue'
import type {
  ChatNote,
  Customer,
  Drop,
  Order,
  Product,
  RefundTo,
  Settlement,
} from '../ledger/types'
import { parseAlert, type AlertEmail, type AlertResult } from '../verify/alerts'
import {
  historyCredits,
  newHistoryCredits,
  supersededRows,
  type RawHistoryRow,
} from '../verify/history'
import type { Credit } from '../verify/types'
import { prefs, withWindows } from './prefs'

export type BooksSync =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'synced' }
  // Saved on the device; the books update once the connection is back.
  | { state: 'offline' }
  | { state: 'failed'; message: string }

export type LedgerData = {
  orders: Order[]
  credits: Credit[]
  customers: Customer[]
  settlements: Settlement[]
  products: Product[]
  drops: Drop[]
  chats: ChatNote[]
}

// Remote Config is applied before the first render; the vendor's own
// matching windows, from Settings, are laid over it on every read.
const verifyConfig = () => withWindows(verifyFor(appConfig().verify), prefs())

// Read straight from IndexedDB, so a step that waited seconds on the model
// decides against the records as they are now.
async function load(): Promise<LedgerData> {
  const [orders, credits, customers, settlements, products, drops, chats] =
    await Promise.all([
      getAll('orders'),
      getAll('credits'),
      getAll('customers'),
      getAll('settlements'),
      getAll('products'),
      getAll('drops'),
      getAll('chats'),
    ])
  // Latest change first, so an order whose payment just landed rises to the top.
  orders.sort((a, b) => b.updatedAt - a.updatedAt)
  // Records saved before balances and part refunds existed lack those fields.
  return {
    orders: orders.map((o) => ({
      ...o,
      payment: { ...o.payment, topUpIds: o.payment.topUpIds ?? [] },
      receipt: o.receipt ?? null,
    })),
    credits,
    customers,
    settlements: settlements.flatMap((x) => {
      if (x.creditId) return [x]
      const c = credits.find((cr) => cr.id === x.id)
      return c ? [{ ...x, creditId: c.id, amountKobo: c.amountKobo }] : []
    }),
    // The vendor's own order first, then by name for anything unplaced.
    products: products.sort(
      (a, b) =>
        (a.dropNo ?? 0) - (b.dropNo ?? 0) ||
        (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
        a.name.localeCompare(b.name),
    ),
    drops: drops.sort((a, b) => b.createdAt - a.createdAt),
    chats,
  }
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
  // Orders that turned paid on their own when new money arrived, until the
  // vendor has seen them.
  const [justPaid, setJustPaid] = useState<string[]>([])

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

  // The screen never waits on the cloud: records are saved on the device
  // first and the books catch up whenever Firestore can be reached. Orders
  // and money decisions whose books entry has not reached the cloud yet are
  // kept here, so they can be sent again when the connection returns.
  const unsent = useRef(new Set<string>())
  const syncBooks = useCallback(
    (change: {
      orders?: Order[]
      settlements?: Settlement[]
      dropped?: string[]
    }) => {
      const orders = change.orders ?? []
      const settlements = change.settlements ?? []
      const dropped = change.dropped ?? []
      const keys = [
        ...orders.map((o) => `order:${o.id}`),
        ...settlements.map((x) => `money:${x.id}`),
        ...dropped.map((id) => `dropped:${id}`),
      ]
      if (keys.length === 0) return
      for (const k of keys) unsent.current.add(k)
      // Offline, Firestore queues the write on the device and sends it later;
      // its promise only settles then, so the screen says so instead of
      // showing "updating" for as long as the outage lasts.
      setBooks(navigator.onLine ? { state: 'syncing' } : { state: 'offline' })
      // The books need the credits to say how much of each order has arrived.
      Promise.all([vendorId(), load()])
        .then(([uid, d]) =>
          Promise.all([
            ...orders.map((o) => syncBook(uid, o, d.credits)),
            ...settlements.map((x) => syncMoney(uid, x, d.credits)),
            ...dropped.map((id) => dropMoney(uid, id)),
          ]),
        )
        .then(() => {
          for (const k of keys) unsent.current.delete(k)
          if (unsent.current.size === 0) setBooks({ state: 'synced' })
        })
        .catch((error: unknown) =>
          setBooks(
            navigator.onLine
              ? { state: 'failed', message: syncProblem(error) }
              : { state: 'offline' },
          ),
        )
    },
    [],
  )

  // Back online: anything that could not even be queued, such as a first
  // sign-in that needed the network, is sent now.
  useEffect(() => {
    const retry = () => {
      if (unsent.current.size === 0) return
      const waiting = [...unsent.current]
      const ids = (prefix: string) =>
        waiting.flatMap((k) =>
          k.startsWith(prefix) ? [k.slice(prefix.length)] : [],
        )
      void load().then((d) =>
        syncBooks({
          orders: d.orders.filter((o) => ids('order:').includes(o.id)),
          settlements: d.settlements.filter((x) =>
            ids('money:').includes(x.id),
          ),
          dropped: ids('dropped:'),
        }),
      )
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [syncBooks])

  const saveOrder = useCallback(
    async (order: Order, customer?: Customer) => {
      await putAll({ orders: [order], customers: customer ? [customer] : [] })
      await reload()
      syncBooks({ orders: [order] })
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
      const afterReversals = before.orders.map(
        (o) => unpaid.find((u) => u.id === o.id) ?? o,
      )
      const rechecked = recheckOrders(
        afterReversals,
        all,
        verifyConfig(),
        before.settlements,
        now,
      )
      const changed = [
        ...unpaid.filter((u) => !rechecked.some((r) => r.id === u.id)),
        ...rechecked,
      ]
      const refunded = applyRefunds(
        before.settlements,
        all,
        verifyConfig(),
        now,
      )
      await putAll({ credits, orders: changed, settlements: refunded })
      await reload()
      syncBooks({ orders: changed, settlements: refunded })
      const paid = rechecked
        .filter((o) => o.payment.state === 'matched')
        .map((o) => o.id)
      if (paid.length > 0) {
        setJustPaid((ids) => [...new Set([...ids, ...paid])])
      }
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
      // Screenshot rows for the same money give way to the alert, unless an
      // order or a decision already rests on them.
      const day = matcherLedger(
        before.orders,
        before.credits,
        verifyConfig(),
        undefined,
        before.settlements,
      )
      const replaced = supersededRows(before.credits, credits).filter(
        (id) =>
          !day.claimedCredits.has(id) &&
          !before.settlements.some((s) => s.creditId === id),
      )
      for (const id of replaced) await remove('credits', id)
      await addCredits(
        {
          ...before,
          credits: before.credits.filter((c) => !replaced.includes(c.id)),
        },
        credits,
      )
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
      row: Pick<ExtraRow, 'key' | 'credit' | 'amountKobo'>,
      state: Settlement['state'],
      customerId: string | null,
    ) => {
      const before = await load()
      const credit = before.credits.find((c) => c.id === row.credit.id)
      if (!credit) return
      const now = Date.now()
      const decided = settle(credit, state, customerId, now, {
        id: row.key,
        amountKobo: row.amountKobo,
      })
      const others = before.settlements.filter((x) => x.id !== row.key)
      const confirmed = applyRefunds(
        [...others, decided],
        before.credits,
        verifyConfig(),
        now,
      ).find((x) => x.id === row.key)
      await putAll({ settlements: [confirmed ?? decided] })
      await reload()
      syncBooks({ settlements: [confirmed ?? decided] })
    },
    [reload, syncBooks],
  )

  // Records where the customer wants a refund sent, after the vendor checked it.
  const setRefundTo = useCallback(
    async (key: string, refundTo: RefundTo) => {
      const before = await load()
      const s = before.settlements.find((x) => x.id === key)
      if (!s) return
      await putAll({
        settlements: [{ ...s, refundTo, updatedAt: Date.now() }],
      })
      await reload()
    },
    [reload],
  )

  // Takes back a refund or credit decision; the money is undecided again.
  const unsettle = useCallback(
    async (key: string) => {
      await remove('settlements', key)
      await reload()
      syncBooks({ dropped: [key] })
    },
    [reload, syncBooks],
  )

  // Checks waiting orders against the credits now, without new money: the
  // vendor's "Check again".
  const recheck = useCallback(async () => {
    await addCredits(await load(), [])
  }, [addCredits])

  const seen = useCallback(
    (orderId: string) => setJustPaid((ids) => ids.filter((x) => x !== orderId)),
    [],
  )

  // The vendor's whole stock list, as edited; rows left out are removed.
  const saveProducts = useCallback(
    async (next: Product[]) => {
      const before = await getAll('products')
      // Drop items are managed in their drop, not in this list.
      for (const p of before) {
        if (p.dropId) continue
        if (!next.some((x) => x.id === p.id)) await remove('products', p.id)
      }
      await putAll({ products: next })
      await reload()
    },
    [reload],
  )

  // A customer filed under a contact name moves to their number once it is
  // known, so their earlier orders and decisions stay together.
  const rekeyCustomer = useCallback(
    async (from: string, to: string) => {
      const d = await load()
      const orders = d.orders
        .filter((o) => o.customerId === from)
        .map((o) => ({ ...o, customerId: to }))
      const settlements = d.settlements
        .filter((x) => x.customerId === from)
        .map((x) => ({ ...x, customerId: to }))
      const old = d.customers.find((c) => c.id === from)
      const kept = d.customers.find((c) => c.id === to)
      const customers = old
        ? [{ ...old, ...(kept ?? {}), name: kept?.name || old.name, id: to }]
        : []
      if (!orders.length && !settlements.length && !old) return
      await putAll({ orders, settlements, customers })
      if (old) await remove('customers', from)
      await reload()
    },
    [reload],
  )

  // Ready-made records, such as the demo's sample history, saved as they are.
  const addRecords = useCallback(
    async (rows: Pick<LedgerData, 'orders' | 'credits' | 'settlements'>) => {
      await putAll(rows)
      await reload()
    },
    [reload],
  )

  // A drop and its numbered items, saved together.
  const startDrop = useCallback(
    async (drop: Drop, items: Product[]) => {
      await putAll({ drops: [drop], products: items })
      await reload()
    },
    [reload],
  )

  const updateDrop = useCallback(
    async (drop: Drop) => {
      await putAll({ drops: [drop] })
      await reload()
    },
    [reload],
  )

  const endDrop = useCallback(
    async (drop: Drop) => {
      await putAll({ drops: [{ ...drop, endedAt: Date.now() }] })
      await reload()
    },
    [reload],
  )

  // Where an order has got to: sent out, delivered, collected, or back to
  // not sent if the vendor marked it by mistake.
  const setDelivery = useCallback(
    async (orderId: string, delivery: Order['delivery']) => {
      const d = await load()
      const o = d.orders.find((x) => x.id === orderId)
      if (!o || o.delivery === delivery) return
      const next = { ...o, delivery, updatedAt: Date.now() }
      await putAll({ orders: [next] })
      await reload()
      syncBooks({ orders: [next] })
    },
    [reload, syncBooks],
  )

  // The vendor ends a hold early; the next in line holds from now.
  const releaseHold = useCallback(
    async (orderId: string) => {
      const d = await load()
      const o = d.orders.find((x) => x.id === orderId)
      if (!o) return
      const now = Date.now()
      await putAll({ orders: [{ ...o, releasedAt: now, updatedAt: now }] })
      await reload()
    },
    [reload],
  )

  // What the desk last read of a chat, for the waiting queue.
  const noteChat = useCallback(
    async (
      key: string,
      name: string,
      messages: Parameters<typeof noteFrom>[2],
    ) => {
      const before = (await getAll('chats')).find((c) => c.id === key)
      const next = noteFrom(key, name, messages, Date.now(), before)
      if (!next) return
      await putAll({ chats: [next] })
      await reload()
    },
    [reload],
  )

  const labelChats = useCallback(
    async (labelled: { id: string; label: ChatNote['label'] }[]) => {
      const all = await getAll('chats')
      const next = labelled.flatMap(({ id, label }) => {
        const c = all.find((x) => x.id === id)
        return c && label ? [{ ...c, label, labelledText: latestAsk(c) }] : []
      })
      await putAll({ chats: next })
      await reload()
    },
    [reload],
  )

  const reset = useCallback(async () => {
    setJustPaid([])
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
    setRefundTo,
    unsettle,
    justPaid,
    seen,
    recheck,
    saveProducts,
    rekeyCustomer,
    startDrop,
    addRecords,
    updateDrop,
    endDrop,
    releaseHold,
    setDelivery,
    noteChat,
    labelChats,
    reset,
    config: verifyConfig(),
  }
}

export type LedgerApi = ReturnType<typeof useLedger>
