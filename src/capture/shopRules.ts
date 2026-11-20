import { formatNaira, parseNairaKobo } from '../verify/money'
import { clean } from '../verify/receiptFields'

// The shop's own terms, entered by the vendor or read from their documents.
// Kept on the device; drafts quote them so the model never invents a fee, an
// hour or a policy.

export const DELIVERY_METHODS = [
  'own-rider',
  'courier',
  'customer-rider',
  'pickup',
  'nationwide',
] as const
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number]

export const METHOD_LABEL: Record<DeliveryMethod, string> = {
  'own-rider': 'My own rider, with fixed fees by area',
  courier: 'A courier I book for each order (price varies)',
  'customer-rider': 'The customer sends their own rider or courier',
  pickup: 'Pickup from my shop',
  nationwide: 'Nationwide, to a park in another state',
}

export type AreaFee = { area: string; feeKobo: number }
export type ParkFee = { state: string; park: string; feeKobo: number }

export type ShopRules = {
  methods: DeliveryMethod[]
  areaFees: AreaFee[]
  // Own-rider fee for areas not listed; null when quoted each time.
  otherAreasFeeKobo: number | null
  parks: ParkFee[]
  pickupAddress: string
  pickupHours: string
  // How long to wait for a transfer before suggesting the customer checks
  // with their bank.
  paymentWaitMin: number
  refundTerms: string
  // Anything else, typed or taken from uploaded files and screenshots.
  policies: string
  // Fields filled from an upload that the vendor has not yet checked.
  fromFile: string[]
}

export const EMPTY_RULES: ShopRules = {
  methods: [],
  areaFees: [],
  otherAreasFeeKobo: null,
  parks: [],
  pickupAddress: '',
  pickupHours: '',
  paymentWaitMin: 60,
  refundTerms: '',
  policies: '',
  fromFile: [],
}

// Uploaded documents can be long; this much policy text is kept.
export const MAX_POLICY_CHARS = 20_000

// Rules saved by an earlier version, or partly filled, come back complete.
export function normaliseRules(raw: unknown): ShopRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const list = <T>(x: unknown, ok: (v: unknown) => v is T): T[] =>
    Array.isArray(x) ? x.filter(ok) : []
  const isArea = (v: unknown): v is AreaFee =>
    !!v &&
    typeof (v as AreaFee).area === 'string' &&
    typeof (v as AreaFee).feeKobo === 'number'
  const isPark = (v: unknown): v is ParkFee =>
    !!v &&
    typeof (v as ParkFee).state === 'string' &&
    typeof (v as ParkFee).park === 'string' &&
    typeof (v as ParkFee).feeKobo === 'number'
  const text = (x: unknown) => (typeof x === 'string' ? x : '')
  // Version one called area fees "deliveryFees" and had no methods.
  const areaFees = list(r.areaFees ?? r.deliveryFees, isArea)
  const methods = list(r.methods, (m): m is DeliveryMethod =>
    DELIVERY_METHODS.includes(m as DeliveryMethod),
  )
  return {
    methods:
      methods.length > 0 || 'methods' in r
        ? methods
        : [
            ...(areaFees.length > 0 ? (['own-rider'] as const) : []),
            ...(text(r.pickupHours) ? (['pickup'] as const) : []),
          ],
    areaFees,
    otherAreasFeeKobo:
      typeof r.otherAreasFeeKobo === 'number' ? r.otherAreasFeeKobo : null,
    parks: list(r.parks, isPark),
    pickupAddress: text(r.pickupAddress),
    pickupHours: text(r.pickupHours),
    paymentWaitMin:
      typeof r.paymentWaitMin === 'number' && r.paymentWaitMin > 0
        ? r.paymentWaitMin
        : EMPTY_RULES.paymentWaitMin,
    refundTerms: text(r.refundTerms),
    policies: text(r.policies),
    fromFile: list(r.fromFile, (f): f is string => typeof f === 'string'),
  }
}

// What the model copies from a policy document or screenshot, as written.
export type RawRules = {
  methods: string
  areaFees: { area: string; fee: string }[]
  otherAreasFee: string
  parks: { state: string; park: string; fee: string }[]
  pickupAddress: string
  pickupHours: string
  paymentWait: string
  refundTerms: string
  otherRules: string
}

function methodsFrom(text: string): DeliveryMethod[] {
  const t = text.toLowerCase()
  const found: DeliveryMethod[] = []
  if (/own rider|our rider|dispatch rider|we deliver|delivery within/.test(t))
    found.push('own-rider')
  if (/courier|gig|kwik|bolt|indrive|logistics/.test(t)) found.push('courier')
  if (/your (own )?rider|send (your|a) rider|customer'?s rider/.test(t))
    found.push('customer-rider')
  if (/pick ?up|collect from/.test(t)) found.push('pickup')
  if (/nationwide|interstate|other states|park|waybill/.test(t))
    found.push('nationwide')
  return found
}

// The model sometimes copies a name with its price ("Yaba N1,500").
function withoutPrice(text: string): string {
  return text
    .replace(/\s*[-:–(]?\s*(?:₦|ngn|#|n)\s?\d[\d,]*(?:\.\d+)?\)?\s*$/i, '')
    .trim()
}

// Fills only what the vendor has left empty, so nothing they typed is
// overwritten, and records which fields came from the upload.
export function mergeRead(rules: ShopRules, read: RawRules): ShopRules {
  const next: ShopRules = { ...rules, fromFile: [...rules.fromFile] }
  const mark = (field: string) => {
    if (!next.fromFile.includes(field)) next.fromFile.push(field)
  }
  const methods = methodsFrom(`${read.methods} ${read.otherRules}`)
  if (rules.methods.length === 0 && methods.length > 0) {
    next.methods = methods
    mark('methods')
  }
  const areas = read.areaFees.flatMap((a) => {
    const feeKobo = parseNairaKobo(clean(a.fee))
    const area = withoutPrice(clean(a.area))
    return area && feeKobo !== null ? [{ area, feeKobo }] : []
  })
  if (rules.areaFees.length === 0 && areas.length > 0) {
    next.areaFees = areas
    mark('areaFees')
    if (!next.methods.includes('own-rider')) next.methods.push('own-rider')
  }
  const other = parseNairaKobo(clean(read.otherAreasFee))
  if (rules.otherAreasFeeKobo === null && other !== null) {
    next.otherAreasFeeKobo = other
    mark('otherAreasFeeKobo')
  }
  const parks = read.parks.flatMap((p) => {
    const feeKobo = parseNairaKobo(clean(p.fee))
    const state = withoutPrice(clean(p.state))
    return state && feeKobo !== null
      ? [{ state, park: withoutPrice(clean(p.park)), feeKobo }]
      : []
  })
  if (rules.parks.length === 0 && parks.length > 0) {
    next.parks = parks
    mark('parks')
    if (!next.methods.includes('nationwide')) next.methods.push('nationwide')
  }
  const fill = (
    field: 'pickupAddress' | 'pickupHours' | 'refundTerms',
    value: string,
  ) => {
    const v = clean(value)
    if (!rules[field] && v) {
      next[field] = v
      mark(field)
    }
  }
  fill('pickupAddress', read.pickupAddress)
  fill('pickupHours', read.pickupHours)
  fill('refundTerms', read.refundTerms)
  if (
    (next.pickupAddress || next.pickupHours) &&
    !next.methods.includes('pickup')
  ) {
    next.methods.push('pickup')
  }
  const wait = /(\d+)\s*(hour|hr|h\b)/i.exec(read.paymentWait)
  const minutes = wait
    ? Number(wait[1]) * 60
    : Number(/(\d+)/.exec(read.paymentWait)?.[1] ?? NaN)
  if (rules.paymentWaitMin === EMPTY_RULES.paymentWaitMin && minutes > 0) {
    next.paymentWaitMin = minutes
    mark('paymentWaitMin')
  }
  return next
}

// A long document is read in parts small enough for the on-device model,
// split at paragraph breaks.
export function chunkText(text: string, size = 5000): string[] {
  const parts: string[] = []
  let current = ''
  for (const para of text.split(/\n\s*\n/)) {
    if (current && current.length + para.length + 2 > size) {
      parts.push(current)
      current = ''
    }
    current = current ? `${current}\n\n${para}` : para
    while (current.length > size) {
      parts.push(current.slice(0, size))
      current = current.slice(size)
    }
  }
  if (current.trim()) parts.push(current)
  return parts
}

const STOP = new Set(
  'the and for are but not you your with this that have has was were will can from they them our out its what when how who which there their about into than then also just only any all per a an to of in on at by or is it be as i we me my do so if no yes ok'.split(
    ' ',
  ),
)

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  )
}

// The on-device request is small, so only the policy paragraphs that share
// words with the chat go into a draft, best first, within the budget.
export function relevantPolicy(
  policies: string,
  chat: string,
  budget: number,
): string {
  const want = words(chat)
  const scored = policies
    .split(/\n\s*\n|\n(?=\s*(?:[-*•]|\d+[.)])\s)/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, n) => {
      const have = words(p)
      let score = 0
      for (const w of have) if (want.has(w)) score++
      return { p, n, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.n - b.n)
  const picked: { p: string; n: number }[] = []
  let used = 0
  for (const x of scored) {
    // Each paragraph after the first also costs its joining newline.
    const cost = x.p.length + (picked.length > 0 ? 1 : 0)
    if (used + cost > budget) continue
    picked.push(x)
    used += cost
  }
  return picked
    .sort((a, b) => a.n - b.n)
    .map((x) => x.p)
    .join('\n')
}

// The shop's delivery options, for a draft to offer when the customer has
// not chosen yet.
export function deliveryOptions(rules: ShopRules): string[] {
  const lines: string[] = []
  for (const m of rules.methods) {
    if (m === 'own-rider') {
      const fees = rules.areaFees
        .map((f) => `${f.area} ${formatNaira(f.feeKobo)}`)
        .join(', ')
      const other =
        rules.otherAreasFeeKobo !== null
          ? `other areas ${formatNaira(rules.otherAreasFeeKobo)}`
          : ''
      lines.push(
        `Delivery by the shop's rider${fees || other ? `: ${[fees, other].filter(Boolean).join('; ')}` : ''}.`,
      )
    }
    if (m === 'courier')
      lines.push(
        'Delivery by courier: the fee is quoted for each order, paid to the shop or to the rider on delivery.',
      )
    if (m === 'customer-rider')
      lines.push('The customer may send their own rider to collect.')
    if (m === 'pickup')
      lines.push(
        `Pickup from the shop${rules.pickupAddress ? ` at ${rules.pickupAddress}` : ''}${rules.pickupHours ? `, ${rules.pickupHours}` : ''}.`,
      )
    if (m === 'nationwide')
      lines.push(
        `Delivery to other states, to a park the customer chooses${
          rules.parks.length
            ? `: ${rules.parks
                .map(
                  (p) =>
                    `${p.state}${p.park ? ` (${p.park})` : ''} ${formatNaira(p.feeKobo)}`,
                )
                .join(', ')}`
            : ''
        }.`,
      )
  }
  return lines
}

// The rules a reply may need, as plain lines: delivery options, refunds, and
// the policy paragraphs that relate to this chat.
export function rulesForDraft(
  rules: ShopRules,
  chat: string,
  policyBudget = 1200,
): string[] {
  const lines = deliveryOptions(rules)
  if (rules.refundTerms.trim()) {
    lines.push(`Refunds and exchanges: ${rules.refundTerms.trim()}`)
  }
  const policy = relevantPolicy(rules.policies, chat, policyBudget)
  if (policy) lines.push(`Other shop policies:\n${policy}`)
  return lines
}
