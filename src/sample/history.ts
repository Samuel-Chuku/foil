import type { ShopRules } from '../capture/shopRules'
import type { DeliveryPlan, Order, Product, Settlement } from '../ledger/types'
import type { Credit } from '../verify/types'
import { SAMPLE_PRODUCTS, SAMPLE_SHOP_RULES } from './pack'

// Two weeks of synthetic trading before the sample day, so the demo's
// charts and review have trends to show. Orders carry no customer and
// credits no sender: the books never need to know who. Generated from a
// fixed seed, so every visit sees the same history.

const DAY = 86_400_000
const NO_PLAN: DeliveryPlan = {
  method: null,
  area: '',
  state: '',
  park: '',
  feeKobo: null,
  paidTo: null,
}
const BANKS = ['gtbank', 'opay', 'moniepoint', 'kuda', 'access']
// Orders on a typical Sunday to Saturday; Saturday is the shop's big day.
const BY_WEEKDAY = [2, 3, 4, 4, 5, 6, 8]
// Status sales and evenings are when customers order.
const HOURS = [9, 10, 11, 12, 12, 13, 13, 14, 16, 17, 18, 19, 19, 20, 20, 21]
// The shop's best sellers come up more often.
const POPULAR = [
  'headwrap',
  'headwrap',
  'headwrap',
  'sneakers',
  'jeans',
  'necklace',
  'scarf',
  'scarf',
  'green-gown',
  'cap',
  'sandals',
  'bag',
  'abaya',
]

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648
    return s / 2_147_483_648
  }
}

// Another market's shop for the history: its stock, rider areas and banks.
export type HistoryShop = {
  products: Product[]
  areaFees: ShopRules['areaFees']
  banks: string[]
}

export function sampleHistory(
  // The sample day at midnight, local wall-clock milliseconds.
  dayMs: number,
  days: number,
  // Turns a local wall-clock time into the clock orders are stamped with.
  toEpoch: (lagosMs: number) => number,
  // Lagos when absent.
  shop?: HistoryShop,
): { orders: Order[]; credits: Credit[]; settlements: Settlement[] } {
  const rand = seeded(20261121)
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)]!
  const orders: Order[] = []
  const credits: Credit[] = []
  const settlements: Settlement[] = []
  let code = 0
  // Where orders go: the shop's own rider areas, pickup, and the odd park.
  const pickPlan = (): DeliveryPlan => {
    const r = rand()
    if (r < 0.2) return { ...NO_PLAN, method: 'pickup' }
    // Park deliveries to other states are a Nigerian way of shipping.
    if (r < 0.28 && !shop) {
      return {
        ...NO_PLAN,
        method: 'nationwide',
        state: 'Abuja',
        park: 'Jabi',
        feeKobo: 600_000,
        paidTo: 'shop',
      }
    }
    const area = pick(shop?.areaFees ?? SAMPLE_SHOP_RULES.areaFees)
    return {
      ...NO_PLAN,
      method: 'own-rider',
      area: area.area,
      feeKobo: area.feeKobo,
      paidTo: 'rider',
    }
  }

  for (let back = days; back >= 1; back--) {
    const start = dayMs - back * DAY
    const weekday = new Date(start).getUTCDay()
    // The last six days are busier than the week before, so there is a
    // trend to see.
    const growth = back <= 6 ? 3 : 0
    const count = BY_WEEKDAY[weekday]! + growth + Math.floor(rand() * 2)
    for (let n = 0; n < count; n++) {
      code += 1
      const lagosAt =
        start + pick(HOURS) * 3_600_000 + Math.floor(rand() * 60) * 60_000
      const lines = 1 + (rand() < 0.3 ? 1 : 0)
      const items = [...Array(lines).keys()].map(() => {
        // Drawn once, outside the search, so each item costs one random draw.
        const wanted = shop ? null : `sample-${pick(POPULAR)}`
        const p = shop
          ? pick(shop.products)
          : SAMPLE_PRODUCTS.find((x) => x.id === wanted)!
        return {
          name: p.name,
          qty: p.id === 'sample-headwrap' ? 1 + Math.floor(rand() * 3) : 1,
          priceKobo: p.priceKobo,
        }
      })
      const amountKobo = items.reduce(
        (s, i) => s + (i.priceKobo ?? 0) * i.qty,
        0,
      )
      const plan = pickPlan()
      // The transfer covers a delivery fee the shop collects.
      const dueKobo =
        amountKobo + (plan.paidTo === 'shop' ? (plan.feeKobo ?? 0) : 0)
      const createdAt = toEpoch(lagosAt)
      // Most pay within the hour; a few take a day; the newest may not
      // have paid yet.
      const r = rand()
      const unpaid = back <= 2 && r < 0.35
      const waitMin =
        r < 0.45
          ? 3 + rand() * 12
          : r < 0.75
            ? 15 + rand() * 45
            : r < 0.92
              ? 60 + rand() * 180
              : 300 + rand() * 1200
      const id = `sample-hist-${code}`
      const base: Order = {
        id,
        code: String(code),
        mode: 'everyday',
        customerId: null,
        items,
        amountKobo,
        payment: {
          state: unpaid
            ? r < 0.15
              ? 'not yet credited'
              : 'awaiting'
            : 'matched',
          reason: null,
          creditId: null,
          sessionId: null,
          candidates: [],
          topUpIds: [],
          decidedBy: unpaid ? null : 'rules',
          checkedAt: unpaid ? null : createdAt + Math.round(waitMin * 60_000),
        },
        receipt: null,
        deliveryPlan: plan,
        delivery: unpaid
          ? 'pending'
          : back <= 1
            ? rand() < 0.5
              ? 'pending'
              : 'out'
            : rand() < 0.3
              ? 'collected'
              : 'delivered',
        createdAt,
        updatedAt: createdAt,
      }
      if (!unpaid) {
        const creditId = `${id}-credit`
        credits.push({
          id: creditId,
          bank: pick(shop?.banks ?? BANKS),
          direction: 'credit',
          reversal: false,
          amountKobo: dueKobo,
          sender: '',
          narration: '',
          sessionId: null,
          reference: null,
          at: {
            ms: lagosAt + Math.round(waitMin * 60_000) - 60_000,
            precision: 'minute',
          },
          source: 'alert',
          strength: 'alert received',
        })
        base.payment.creditId = creditId
      }
      orders.push(base)
    }
  }

  // One customer paid twice last week and was refunded; one double payment
  // from yesterday is still owed back.
  const refund = (paidId: string, days: number, sent: boolean) => {
    const paid = credits.find((c) => c.id === `${paidId}-credit`)
    if (!paid?.at) return
    const extraId = `${paidId}-twice`
    credits.push({
      ...paid,
      id: extraId,
      at: { ...paid.at, ms: paid.at.ms + 120_000 },
    })
    const debitId = `${paidId}-refund`
    if (sent) {
      credits.push({
        ...paid,
        id: debitId,
        direction: 'debit',
        at: { ...paid.at, ms: paid.at.ms + days * 3_600_000 },
      })
    }
    settlements.push({
      id: extraId,
      creditId: extraId,
      amountKobo: paid.amountKobo,
      state: sent ? 'refunded' : 'refund owed',
      customerId: null,
      refundId: sent ? debitId : null,
      decidedBy: 'vendor',
      updatedAt: 0,
    })
  }
  const lastWeek = orders.find((o) => o.payment.creditId && Number(o.code) > 8)
  const yesterday = [...orders].reverse().find((o) => o.payment.creditId)
  if (lastWeek) refund(lastWeek.id, 2, true)
  if (yesterday && yesterday !== lastWeek) refund(yesterday.id, 0, false)

  return { orders, credits, settlements }
}
