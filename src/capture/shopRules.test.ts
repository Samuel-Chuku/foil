import { describe, expect, it } from 'vitest'
import {
  chunkText,
  deliveryOptions,
  EMPTY_RULES,
  mergeRead,
  normaliseRules,
  relevantPolicy,
  rulesForDraft,
  type RawRules,
  type ShopRules,
} from './shopRules'

const rules: ShopRules = {
  ...EMPTY_RULES,
  methods: ['own-rider', 'pickup', 'nationwide'],
  areaFees: [
    { area: 'Yaba', feeKobo: 150_000 },
    { area: 'Lekki', feeKobo: 300_000 },
  ],
  otherAreasFeeKobo: 250_000,
  parks: [{ state: 'Abuja', park: 'Jabi', feeKobo: 600_000 }],
  pickupAddress: '3 Herbert Macaulay Way, Yaba',
  pickupHours: 'Mon to Sat, 10am to 6pm',
  refundTerms: 'Exchanges within 3 days with the tag on.',
  policies: [
    'Custom tailoring takes 5 working days.',
    'We do not deliver on Sundays.',
  ].join('\n\n'),
}

const read = (over: Partial<RawRules> = {}): RawRules => ({
  methods: '',
  areaFees: [],
  otherAreasFee: '',
  parks: [],
  pickupAddress: '',
  pickupHours: '',
  paymentWait: '',
  refundTerms: '',
  otherRules: '',
  ...over,
})

describe('shop rules', () => {
  it('offers each delivery method the shop uses, with its prices', () => {
    expect(deliveryOptions(rules)).toEqual([
      "Delivery by the shop's rider: Yaba ₦1,500, Lekki ₦3,000; other areas ₦2,500.",
      'Pickup from the shop at 3 Herbert Macaulay Way, Yaba, Mon to Sat, 10am to 6pm.',
      'Delivery to other states, to a park the customer chooses: Abuja (Jabi) ₦6,000.',
    ])
  })

  it('includes only policy paragraphs the chat touches, within budget', () => {
    expect(
      relevantPolicy(rules.policies, 'Can you deliver on Sunday?', 500),
    ).toBe('We do not deliver on Sundays.')
    expect(relevantPolicy(rules.policies, 'Good morning', 500)).toBe('')
    const long = Array.from({ length: 50 }, (_, n) => `Delivery rule ${n}.`)
    expect(
      relevantPolicy(long.join('\n\n'), 'delivery', 100).length,
    ).toBeLessThanOrEqual(100)
  })

  it('says nothing the vendor has not set', () => {
    expect(rulesForDraft(EMPTY_RULES, 'hi')).toEqual([])
  })

  it('brings back rules saved by the first version', () => {
    const old = {
      deliveryFees: [{ area: 'Yaba', feeKobo: 150_000 }],
      pickupHours: '10 to 6',
      policies: 'x',
    }
    expect(normaliseRules(old)).toMatchObject({
      methods: ['own-rider', 'pickup'],
      areaFees: [{ area: 'Yaba', feeKobo: 150_000 }],
      parks: [],
      fromFile: [],
    })
  })
})

describe('reading rules from a file', () => {
  it('fills empty fields and marks them for checking', () => {
    const next = mergeRead(
      EMPTY_RULES,
      read({
        areaFees: [{ area: 'Ikeja', fee: '₦2,000' }],
        parks: [{ state: 'Enugu', park: 'Holy Ghost', fee: 'N7,500' }],
        pickupHours: '9am to 5pm',
        paymentWait: '2 hours',
        refundTerms: 'No refunds after use.',
      }),
    )
    expect(next.areaFees).toEqual([{ area: 'Ikeja', feeKobo: 200_000 }])
    expect(next.parks).toEqual([
      { state: 'Enugu', park: 'Holy Ghost', feeKobo: 750_000 },
    ])
    expect(next.methods).toEqual(['own-rider', 'nationwide', 'pickup'])
    expect(next.paymentWaitMin).toBe(120)
    expect(next.fromFile).toEqual([
      'areaFees',
      'parks',
      'pickupHours',
      'refundTerms',
      'paymentWaitMin',
    ])
  })

  it('drops a price copied into an area or park name', () => {
    const next = mergeRead(
      EMPTY_RULES,
      read({
        areaFees: [{ area: 'Yaba N1,500', fee: 'N1,500' }],
        parks: [{ state: 'Abuja', park: 'Jabi park (₦6,000)', fee: '₦6,000' }],
      }),
    )
    expect(next.areaFees[0]?.area).toBe('Yaba')
    expect(next.parks[0]?.park).toBe('Jabi park')
  })

  it('never overwrites what the vendor typed', () => {
    const next = mergeRead(
      rules,
      read({
        areaFees: [{ area: 'Ikeja', fee: '₦2,000' }],
        refundTerms: 'Something else',
      }),
    )
    expect(next.areaFees).toBe(rules.areaFees)
    expect(next.refundTerms).toBe(rules.refundTerms)
    expect(next.fromFile).toEqual([])
  })

  it('skips placeholders and unreadable fees', () => {
    const next = mergeRead(
      EMPTY_RULES,
      read({ areaFees: [{ area: 'Yaba', fee: 'varies' }], pickupHours: 'N/A' }),
    )
    expect(next.areaFees).toEqual([])
    expect(next.pickupHours).toBe('')
  })

  it('splits a long document at paragraph breaks', () => {
    const doc = Array.from({ length: 30 }, (_, n) => `Rule ${n}. `.repeat(20))
    const parts = chunkText(doc.join('\n\n'), 1000)
    expect(parts.length).toBeGreaterThan(3)
    expect(parts.every((p) => p.length <= 1000)).toBe(true)
    expect(parts.join('\n\n')).toBe(doc.join('\n\n'))
  })
})
