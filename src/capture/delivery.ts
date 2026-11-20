import type { DeliveryPlan } from '../ledger/types'
import { formatNaira } from '../verify/money'
import type { OrderFields } from './orderFields'
import type { ShopRules } from './shopRules'

const OWN_RIDER =
  /\b(my|our) (own )?(rider|dispatch|driver|courier)\b|\bsend (my|a|our) (rider|dispatch|driver|person|someone)\b|\bi('ll| will) send (someone|a rider|my)\b/i

const same = (a: string, b: string) => {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  return x !== '' && y !== '' && (x.includes(y) || y.includes(x))
}

// States, and the cities people name instead of them, outside Lagos. Lagos
// is home; anywhere here means a park delivery.
const ELSEWHERE = [
  'akwa ibom',
  'cross river',
  'port harcourt',
  'abia',
  'adamawa',
  'anambra',
  'bauchi',
  'bayelsa',
  'benue',
  'borno',
  'delta',
  'ebonyi',
  'edo',
  'ekiti',
  'enugu',
  'gombe',
  'imo',
  'jigawa',
  'kaduna',
  'kano',
  'katsina',
  'kebbi',
  'kogi',
  'kwara',
  'nasarawa',
  'niger',
  'ogun',
  'ondo',
  'osun',
  'oyo',
  'plateau',
  'rivers',
  'sokoto',
  'taraba',
  'yobe',
  'zamfara',
  'fct',
  'abuja',
  'ibadan',
  'benin',
  'owerri',
  'jos',
  'calabar',
  'uyo',
  'warri',
  'abeokuta',
  'ilorin',
  'onitsha',
  'asaba',
  'akure',
  'aba',
  'nsukka',
  'makurdi',
  'minna',
]

const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Whole words only: "Ogun" is not in "Ogunlana Drive".
function findWord(word: string, text: string): string {
  const w = word.trim()
  if (!w) return ''
  return new RegExp(`\\b${escape(w)}\\b`, 'i').exec(text)?.[0] ?? ''
}

// The first place outside Lagos named in these texts, as written.
function placeElsewhere(...texts: string[]): string {
  for (const t of texts) {
    for (const p of ELSEWHERE) {
      const hit = findWord(p, t)
      if (hit) return hit
    }
  }
  return ''
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
  const grounded = (x: string) =>
    !chat ? x.trim() : findWord(x, chat) ? x.trim() : ''
  const named = grounded(f.state)
  const state =
    (named && !/lagos/i.test(named) ? named : '') ||
    placeElsewhere(f.area, f.address)
  const park = grounded(f.park)
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
    const parks = rules.parks.filter((p) => same(p.state, state))
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
    const parks = rules.parks.filter((p) => same(p.state, plan.state))
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
    plan.feeKobo === null ? 'fee to confirm' : formatNaira(plan.feeKobo)
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
      : ` Give the breakdown: items ${formatNaira(itemsKobo)} + delivery ${formatNaira(fee)} = ${formatNaira(itemsKobo + fee)}.`
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
      const parks = rules.parks.filter((p) => same(p.state, plan.state))
      if (!plan.park && parks.length > 1) {
        return [
          `Delivery to ${plan.state} goes to a park. Ask which park they want: ${parks.map((p) => `${p.park} (${formatNaira(p.feeKobo)})`).join(', ')}.`,
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
            `Delivery to ${to} costs ${formatNaira(plan.feeKobo)}.${breakdown(plan.feeKobo)}`,
          ]
        : [`Delivery to ${to} costs ${formatNaira(plan.feeKobo)}.${onDelivery}`]
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
            `Delivery${to} ${by} costs ${formatNaira(plan.feeKobo)}.${breakdown(plan.feeKobo)}`,
          ]
        : [
            `Delivery${to} ${by} costs ${formatNaira(plan.feeKobo)}.${onDelivery}`,
          ]
    }
  }
}
