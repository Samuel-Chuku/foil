import type { DeliveryPlan } from '../ledger/types'
import { formatMoney } from '../verify/money'
import type { OrderFields } from './orderFields'
import { chatNames, placeIn, sameState, stateOf, type State } from './places'
import { homeOf, type ShopRules } from './shopRules'

const OWN_RIDER =
  /\b(my|our) (own )?(rider|dispatch|driver|courier)\b|\bsend (my|a|our) (rider|dispatch|driver|person|someone)\b|\bi('ll| will) send (someone|a rider|my)\b/i

const same = (a: string, b: string) => {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  return x !== '' && y !== '' && (x.includes(y) || y.includes(x))
}

const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Whole words only: "Ogun" is not in "Ogunlana Drive".
function findWord(word: string, text: string): string {
  const w = word.trim()
  if (!w) return ''
  return new RegExp(`\\b${escape(w)}\\b`, 'i').exec(text)?.[0] ?? ''
}

// The plan the chat supports, using the shop's own rules for fees. Returns
// null when the customer has said nothing about delivery yet, and always for
// a shop that does not deliver (services, digital goods, in-person sales).
export function planDelivery(
  f: Pick<
    OrderFields,
    | 'address'
    | 'area'
    | 'deliveryChoice'
    | 'state'
    | 'park'
    | 'payOnDelivery'
    | 'pickup'
  >,
  rules: ShopRules,
  // The chat itself: a state or park the model names must appear in it, so
  // an invented place is dropped.
  chat?: string,
): DeliveryPlan | null {
  if (rules.methods.length === 0) return null
  const park = !chat || findWord(f.park, chat) ? f.park.trim() : ''
  // The first place the customer named, in the model's fields or the address,
  // that the chat really mentions ("PH" counts for Rivers).
  let found: State | null = null
  for (const text of [f.state, park, f.area, f.address, f.deliveryChoice]) {
    const place = placeIn(text)
    if (place && (!chat || chatNames(place.state, chat))) {
      found = place.state
      break
    }
  }
  // Another state than the shop's own means a park. With no home known, a
  // state the shop sends parks to is taken as another state.
  const home = homeOf(rules)
  const away =
    found !== null &&
    (home
      ? found !== home
      : rules.parks.some((p) => stateOf(p.state) === found))
  const state = away && found ? (found === 'FCT' ? 'Abuja' : found) : ''
  const plan: DeliveryPlan = {
    method: null,
    area: f.area,
    state: '',
    park: '',
    feeKobo: null,
    paidTo: f.payOnDelivery ? 'rider' : null,
  }
  if (f.pickup) return { ...plan, method: 'pickup', area: '', paidTo: null }
  if (OWN_RIDER.test(f.deliveryChoice)) {
    return { ...plan, method: 'customer-rider', paidTo: null }
  }
  if (state || park) {
    const parks = rules.parks.filter((p) => sameState(p.state, state))
    const chosen = park ? parks.find((p) => same(p.park, park)) : undefined
    // With no park chosen yet, the fee is still known if every park in that
    // state costs the same.
    const prices = new Set(parks.map((p) => p.feeKobo))
    const feeKobo =
      chosen?.feeKobo ?? (prices.size === 1 ? [...prices][0]! : null)
    return {
      ...plan,
      method: 'nationwide',
      area: '',
      state,
      park: chosen?.park ?? park,
      feeKobo,
      paidTo: plan.paidTo ?? (feeKobo !== null ? 'shop' : null),
    }
  }
  const where = `${f.area} ${f.address}`
  if (!f.address && !f.area) {
    return plan.paidTo ? plan : null
  }
  const areaFee = rules.areaFees.find(
    (a) => same(a.area, where) || same(a.area, f.area),
  )
  if (rules.methods.includes('own-rider') && areaFee) {
    return {
      ...plan,
      method: 'own-rider',
      area: areaFee.area,
      feeKobo: areaFee.feeKobo,
      paidTo: plan.paidTo ?? 'shop',
    }
  }
  if (rules.methods.includes('courier')) return { ...plan, method: 'courier' }
  if (rules.methods.includes('own-rider')) {
    const fee = rules.otherAreasFeeKobo
    return {
      ...plan,
      method: 'own-rider',
      feeKobo: fee,
      paidTo: plan.paidTo ?? (fee !== null ? 'shop' : null),
    }
  }
  return plan
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

// Before an order is captured, the place the customer named is enough to
// plan delivery by the shop's rules, so a draft is never left to guess a
// park or a fee. `said` is the customer's own lines only.
export function planFromChat(
  said: string,
  rules: ShopRules,
  chat: string,
): DeliveryPlan | null {
  const place = placeIn(said)
  if (!place) return null
  return planDelivery(
    {
      address: '',
      area: titleCase(place.said),
      deliveryChoice: '',
      state: place.state,
      park: '',
      payOnDelivery: false,
      pickup: false,
    },
    rules,
    chat,
  )
}

// The shop's set price for a plan, if it has one: an area fee for its own
// rider, or a park price. Couriers and the customer's rider have none.
export function ruleFee(
  plan: Pick<DeliveryPlan, 'method' | 'area' | 'state' | 'park'>,
  rules: ShopRules,
): number | null {
  if (plan.method === 'own-rider') {
    return (
      rules.areaFees.find((a) => same(a.area, plan.area))?.feeKobo ??
      rules.otherAreasFeeKobo
    )
  }
  if (plan.method === 'nationwide') {
    const parks = rules.parks.filter(
      (p) => sameState(p.state, plan.state) || same(p.state, plan.state),
    )
    const chosen = plan.park
      ? parks.find((p) => same(p.park, plan.park))
      : undefined
    const prices = new Set(parks.map((p) => p.feeKobo))
    return chosen?.feeKobo ?? (prices.size === 1 ? [...prices][0]! : null)
  }
  return null
}

// The delivery fee the shop collects on top of the items, if any.
export function deliveryDueKobo(plan: DeliveryPlan | null): number {
  return plan?.paidTo === 'shop' ? (plan.feeKobo ?? 0) : 0
}

export function describePlan(plan: DeliveryPlan | null): string {
  if (!plan || !plan.method) return 'Not discussed yet'
  const fee =
    plan.feeKobo === null ? 'fee to confirm' : formatMoney(plan.feeKobo)
  const paid =
    plan.paidTo === 'shop'
      ? ', paid to you'
      : plan.paidTo === 'rider'
        ? ', paid to the rider on delivery'
        : ''
  switch (plan.method) {
    case 'pickup':
      return 'Pickup from the shop'
    case 'customer-rider':
      return "Customer's own rider collects"
    case 'own-rider':
      return `Your rider${plan.area ? ` to ${plan.area}` : ''}, ${fee}${paid}`
    case 'courier':
      return `Courier${plan.area ? ` to ${plan.area}` : ''}, ${fee}${paid}`
    case 'nationwide':
      return `${plan.park ? `${plan.park} park, ` : ''}${plan.state || 'another state'}, ${fee}${paid}`
  }
}

// What a reply must say about delivery, decided by the plan, never by the
// model. Gives the customer a breakdown when the shop collects the fee.
export function deliveryFacts(
  plan: DeliveryPlan | null,
  rules: ShopRules,
  itemsKobo: number | null,
): string[] {
  if (!plan || !plan.method) return []
  const breakdown = (fee: number) =>
    itemsKobo === null
      ? ''
      : ` Give the breakdown: items ${formatMoney(itemsKobo)} + delivery ${formatMoney(fee)} = ${formatMoney(itemsKobo + fee)}.`
  const onDelivery =
    plan.paidTo === 'rider'
      ? ' The delivery fee is paid to the rider on delivery, not to the shop.'
      : ''
  switch (plan.method) {
    case 'pickup':
      return [
        `The customer will pick up from the shop${rules.pickupAddress ? ` at ${rules.pickupAddress}` : ''}${rules.pickupHours ? `, ${rules.pickupHours}` : ''}.`,
      ]
    case 'customer-rider':
      return [
        `The customer's own rider will collect the order${rules.pickupAddress ? ` from ${rules.pickupAddress}` : ''}; the customer pays their rider.`,
      ]
    case 'nationwide': {
      const parks = rules.parks.filter(
        (p) => sameState(p.state, plan.state) || same(p.state, plan.state),
      )
      if (!plan.park && parks.length > 1) {
        const fees = new Set(parks.map((p) => p.feeKobo))
        if (fees.size === 1 && plan.paidTo !== 'rider') {
          const fee = parks[0]!.feeKobo
          return [
            `Delivery to ${plan.state} costs ${formatMoney(fee)}, sent to a park. Ask which park they want: ${parks.map((p) => p.park).join(' or ')}.${breakdown(fee)}`,
          ]
        }
        return [
          `Delivery to ${plan.state} goes to a park. Ask which park they want: ${parks.map((p) => `${p.park} (${formatMoney(p.feeKobo)})`).join(', ')}.`,
        ]
      }
      if (plan.feeKobo === null) {
        return [
          `The shop has no set price for ${plan.state || 'that state'}. Say the delivery fee will be confirmed.`,
        ]
      }
      const to = `${plan.park ? `the ${plan.park} park in ` : ''}${plan.state}`
      return plan.paidTo === 'shop'
        ? [
            `Delivery to ${to} costs ${formatMoney(plan.feeKobo)}.${breakdown(plan.feeKobo)}`,
          ]
        : [`Delivery to ${to} costs ${formatMoney(plan.feeKobo)}.${onDelivery}`]
    }
    case 'own-rider':
    case 'courier': {
      const by =
        plan.method === 'courier' ? 'by courier' : "by the shop's rider"
      const to = plan.area ? ` to ${plan.area}` : ''
      if (plan.feeKobo === null) {
        return [
          plan.method === 'courier'
            ? `Delivery${to} is ${by}. Say the shop will send the delivery quote shortly, and it can be paid to the shop or to the rider on delivery.`
            : `Delivery${to} is ${by}. Say the delivery fee will be confirmed.`,
        ]
      }
      return plan.paidTo === 'shop'
        ? [
            `Delivery${to} ${by} costs ${formatMoney(plan.feeKobo)}.${breakdown(plan.feeKobo)}`,
          ]
        : [
            `Delivery${to} ${by} costs ${formatMoney(plan.feeKobo)}.${onDelivery}`,
          ]
    }
  }
}
