import { describe, expect, it } from 'vitest'
import { balanceKobo, newOrder } from '../ledger/ledger'
import type { Order } from '../ledger/types'
import type { Credit } from '../verify/types'
import {
  deliveryFacts,
  describePlan,
  planDelivery,
  planFromChat,
} from './delivery'
import { EMPTY_RULES, type ShopRules } from './shopRules'

const rules: ShopRules = {
  ...EMPTY_RULES,
  methods: ['own-rider', 'courier', 'pickup', 'nationwide'],
  areaFees: [{ area: 'Yaba', feeKobo: 150_000 }],
  parks: [
    { state: 'Abuja', park: 'Jabi', feeKobo: 600_000 },
    { state: 'Abuja', park: 'Utako', feeKobo: 650_000 },
    { state: 'Enugu', park: 'Holy Ghost', feeKobo: 500_000 },
  ],
  pickupAddress: '3 Herbert Macaulay Way, Yaba',
}

const said = (over: Partial<Parameters<typeof planDelivery>[0]> = {}) => ({
  address: '',
  area: '',
  deliveryChoice: '',
  state: '',
  park: '',
  payOnDelivery: false,
  pickup: false,
  ...over,
})

describe('planDelivery', () => {
  it('adds nothing until delivery comes up', () => {
    expect(planDelivery(said(), rules)).toBeNull()
  })

  it('never plans delivery for a shop that does not deliver', () => {
    const none = { ...rules, methods: [] }
    expect(
      planDelivery(said({ address: '12 Hughes Avenue, Yaba' }), none),
    ).toBeNull()
    expect(
      planDelivery(said({ pickup: true, state: 'Abuja' }), none),
    ).toBeNull()
  })

  it("uses the shop's rider fee for a listed area, paid to the shop", () => {
    expect(
      planDelivery(
        said({ address: '12 Hughes Avenue, Yaba', area: 'Yaba' }),
        rules,
      ),
    ).toMatchObject({
      method: 'own-rider',
      area: 'Yaba',
      feeKobo: 150_000,
      paidTo: 'shop',
    })
  })

  it('sends an unlisted area by courier, fee to be quoted', () => {
    expect(
      planDelivery(
        said({ address: '9 Admiralty Way, Lekki', area: 'Lekki' }),
        rules,
      ),
    ).toMatchObject({ method: 'courier', feeKobo: null, paidTo: null })
  })

  it('marks pay on delivery when the customer says so', () => {
    expect(
      planDelivery(said({ area: 'Lekki', payOnDelivery: true }), rules),
    ).toMatchObject({ method: 'courier', paidTo: 'rider' })
  })

  it('reads pickup and the customer sending their own rider', () => {
    expect(planDelivery(said({ pickup: true }), rules)?.method).toBe('pickup')
    expect(
      planDelivery(said({ deliveryChoice: "I'll send my rider" }), rules)
        ?.method,
    ).toBe('customer-rider')
  })

  it('prices a park in another state, and waits for a park choice', () => {
    expect(planDelivery(said({ state: 'Enugu' }), rules)).toMatchObject({
      method: 'nationwide',
      feeKobo: 500_000,
      paidTo: 'shop',
    })
    expect(planDelivery(said({ state: 'Abuja' }), rules)).toMatchObject({
      method: 'nationwide',
      park: '',
      feeKobo: null,
    })
    expect(
      planDelivery(said({ state: 'FCT Abuja', park: 'Utako park' }), rules),
    ).toMatchObject({ park: 'Utako', feeKobo: 650_000 })
  })
})

describe('places the model reads', () => {
  it('drops a state that is not in the chat', () => {
    const chat = 'Please send it to 3 Ogunlana Drive, Surulere.'
    expect(
      planDelivery(
        said({
          address: '3 Ogunlana Drive, Surulere',
          area: 'Surulere',
          state: 'Ogun',
        }),
        rules,
        chat,
      )?.method,
    ).toBe('courier')
  })

  it('treats a city outside Lagos named as the area as a park delivery', () => {
    const chat = "I'm in Abuja. Can you send it?"
    expect(planDelivery(said({ area: 'Abuja' }), rules, chat)).toMatchObject({
      method: 'nationwide',
      state: 'Abuja',
    })
  })
})

describe("the shop's own state", () => {
  it('sends a customer in Ph to a park when the shop is in Lagos', () => {
    const chat = 'Abeg send am to Ph, Rumuokoro side.'
    expect(
      planDelivery(said({ area: 'Ph', address: 'Rumuokoro' }), rules, chat),
    ).toMatchObject({ method: 'nationwide', state: 'Rivers' })
  })

  it('treats Lagos as another state for a shop in Abuja', () => {
    const abuja = {
      ...rules,
      homeState: 'FCT' as const,
      areaFees: [{ area: 'Wuse', feeKobo: 100_000 }],
      parks: [{ state: 'Lagos', park: 'Jibowu', feeKobo: 800_000 }],
    }
    expect(
      planDelivery(
        said({ area: 'Lag', address: 'Yaba' }),
        abuja,
        'I dey Lag, Yaba',
      ),
    ).toMatchObject({ method: 'nationwide', state: 'Lagos', feeKobo: 800_000 })
    expect(
      planDelivery(said({ area: 'Wuse 2' }), abuja, 'Wuse 2 abeg'),
    ).toMatchObject({ method: 'own-rider', feeKobo: 100_000 })
  })

  it('works out the home state from the pickup address when not chosen', () => {
    // rules has no homeState but its pickup address is in Yaba, Lagos.
    expect(
      planDelivery(said({ area: 'Mowe' }), rules, 'Send it to Mowe'),
    ).toMatchObject({ method: 'nationwide', state: 'Ogun' })
  })

  it('ignores a state the chat never mentions', () => {
    expect(
      planDelivery(
        said({ state: 'Rivers', area: 'Yaba' }),
        rules,
        'Deliver to Yaba',
      ),
    ).toMatchObject({ method: 'own-rider', area: 'Yaba' })
  })
})

describe('delivery in drafts and balances', () => {
  const plan = planDelivery(said({ area: 'Yaba' }), rules)

  it('gives a breakdown when the shop collects the fee', () => {
    expect(deliveryFacts(plan, rules, 1_850_000)).toEqual([
      "Delivery to Yaba by the shop's rider costs ₦1,500. Give the breakdown: items ₦18,500 + delivery ₦1,500 = ₦20,000.",
    ])
  })

  it('asks which park when a state has more than one', () => {
    const p = planDelivery(said({ state: 'Abuja' }), rules)
    expect(deliveryFacts(p, rules, 1_000_000)[0]).toContain(
      'Ask which park they want: Jabi (₦6,000), Utako (₦6,500).',
    )
  })

  it('says the fee goes to the rider on delivery', () => {
    const p = { ...plan!, paidTo: 'rider' as const }
    expect(deliveryFacts(p, rules, 1_850_000)[0]).toContain(
      'paid to the rider on delivery',
    )
    expect(describePlan(p)).toBe(
      'Your rider to Yaba, ₦1,500, paid to the rider on delivery',
    )
  })

  it('owes the delivery fee after the items are paid, only if the shop collects it', () => {
    const credit = { id: 'c1', amountKobo: 1_850_000 } as Credit
    const base = newOrder(
      [],
      {
        mode: 'everyday',
        customerId: null,
        items: [],
        amountKobo: 1_850_000,
        deliveryPlan: plan,
      },
      0,
    )
    const paid: Order = {
      ...base,
      payment: { ...base.payment, state: 'matched', creditId: 'c1' },
    }
    expect(balanceKobo(paid, [credit])).toBe(150_000)
    expect(
      balanceKobo({ ...paid, deliveryPlan: { ...plan!, paidTo: 'rider' } }, [
        credit,
      ]),
    ).toBe(0)
    expect(balanceKobo({ ...paid, deliveryPlan: null }, [credit])).toBe(0)
  })
})

describe('planFromChat', () => {
  const shop: ShopRules = { ...rules, homeState: 'Lagos' }
  const parks: ShopRules = {
    ...shop,
    parks: [
      { state: 'Abuja', park: 'Jabi', feeKobo: 600_000 },
      { state: 'Abuja', park: 'Utako', feeKobo: 600_000 },
    ],
  }

  it('quotes a state whose parks share a price and asks which park', () => {
    const said =
      "I'm in Abuja. Can you send it to me here? How much will it cost?"
    const plan = planFromChat(said, parks, said)
    expect(plan).toMatchObject({
      method: 'nationwide',
      state: 'Abuja',
      park: '',
    })
    const [fact] = deliveryFacts(plan, parks, 1_600_000)
    expect(fact).toContain('₦6,000')
    expect(fact).toContain('Jabi or Utako')
    expect(fact).toContain('₦22,000')
  })

  it('says the fee will be confirmed for a state with no park price', () => {
    const said = 'Oya. I dey for Ph, Rumuokoro side. Una fit send am come?'
    const plan = planFromChat(said, shop, said)
    expect(plan).toMatchObject({ method: 'nationwide', state: 'Rivers' })
    expect(deliveryFacts(plan, shop, 950_000)[0]).toContain(
      'no set price for Rivers',
    )
  })

  it("uses the shop's rider fee for a listed Lagos area", () => {
    const said = 'Can you deliver to Yaba?'
    expect(planFromChat(said, shop, said)).toMatchObject({
      method: 'own-rider',
      area: 'Yaba',
      feeKobo: 150_000,
    })
  })

  it('plans nothing when no place is named', () => {
    const said = 'How much is the black abaya?'
    expect(planFromChat(said, shop, said)).toBeNull()
  })
})
