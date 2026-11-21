import { describe, expect, it } from 'vitest'
import {
  draftProblem,
  draftPrompt,
  oddWording,
  tidyDraft,
  writesPidgin,
} from './draft'
import { pickOrder, toOrderFields } from './orderFields'
import { transcript } from './transcript'
import { toRefundTo } from './refundDetails'
import { DEFAULT_VERIFY as config } from '../config/defaults'

describe('transcript', () => {
  it('labels speakers and stands in for images', () => {
    expect(
      transcript([
        { from: 'customer', time: '10:48', text: 'Is the gown available?' },
        { from: 'vendor', time: '10:50', text: 'Yes.' },
        { from: 'customer', time: '11:03', image: true },
      ]),
    ).toBe(
      'Customer (10:48): Is the gown available?\nYou (10:50): Yes.\nCustomer (11:03): [sent an image]',
    )
  })

  it('drops the oldest lines first', () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({
      from: 'customer' as const,
      time: '10:00',
      text: `message ${i}`,
    }))
    const t = transcript(lines, 100)
    expect(t.length).toBeLessThanOrEqual(100)
    expect(t.endsWith('message 49')).toBe(true)
  })
})

describe('order fields', () => {
  it('keeps only the expected shape from model output', () => {
    expect(
      pickOrder({
        items: [{ name: 'Gown', quantity: 1, extra: 'x' }],
        area: 7,
      }),
    ).toEqual({
      items: [{ name: 'Gown', quantity: '1', price: '' }],
      total: '',
      customerName: '',
      address: '',
      landmark: '',
      area: '7',
      deliveryChoice: '',
      state: '',
      park: '',
      payOnDelivery: '',
    })
    expect(pickOrder('nonsense').items).toEqual([])
    expect(pickOrder({ customerName: 'null' }).customerName).toBe('')
    expect(pickOrder({ area: 'unknown', landmark: 'absent' })).toMatchObject({
      area: '',
      landmark: '',
    })
  })

  it('recognises pickup however it is phrased', () => {
    for (const choice of [
      'pickup',
      "I'll pick them up at your shop",
      'I will pick it up tomorrow',
      'I go pick am up',
    ]) {
      expect(
        toOrderFields({ ...pickOrder({}), deliveryChoice: choice }).pickup,
      ).toBe(true)
    }
    expect(
      toOrderFields({ ...pickOrder({}), deliveryChoice: 'deliver to Yaba' })
        .pickup,
    ).toBe(false)
  })

  it('prefers the stated total', () => {
    const f = toOrderFields({
      ...pickOrder({}),
      items: [
        { name: 'Ankara gown', quantity: '1', price: '₦15,000' },
        { name: 'Headwrap', quantity: '', price: '3,500' },
      ],
      total: '₦18,500',
    })
    expect(f.amountKobo).toBe(1_850_000)
    expect(f.items[1]).toEqual({ name: 'Headwrap', qty: 1, priceKobo: 350_000 })
  })

  it('treats a pickup written as an address as no address', () => {
    const f = toOrderFields({
      ...pickOrder({}),
      address: 'pick up at your shop',
    })
    expect(f.address).toBe('')
  })

  it('sums only when every item has a price', () => {
    const items = [
      { name: 'Jeans', quantity: '2', price: '12k' },
      { name: 'Belt', quantity: '1', price: '' },
    ]
    expect(toOrderFields({ ...pickOrder({}), items }).amountKobo).toBeNull()
    expect(
      toOrderFields({ ...pickOrder({}), items: items.slice(0, 1) }).amountKobo,
    ).toBe(2_400_000)
  })

  it('reads quantities written as words', () => {
    const items = ['two', 'Three ', 'a dozen', 'some', '0'].map((quantity) => ({
      name: 'Cap',
      quantity,
      price: '',
    }))
    expect(
      toOrderFields({ ...pickOrder({}), items }).items.map((i) => i.qty),
    ).toEqual([2, 3, 12, 1, 1])
  })
})

describe('draft', () => {
  const facts = {
    payment: 'not yet credited' as const,
    amountKobo: 1_200_000,
    items: [{ name: 'Blue jeans', qty: 1, priceKobo: 1_200_000 }],
    pickup: false,
  }

  it('states the decision without inviting a judgement', () => {
    const p = draftPrompt(facts, 'Customer (12:46): Don pay.')
    expect(p).toContain('has not reached the shop')
    expect(p).toContain('₦12,000')
    expect(p).not.toMatch(/fake|fraud/i)
  })

  it('tells the customer what happens to money they sent twice', () => {
    const p = draftPrompt(
      {
        ...facts,
        payment: 'matched',
        extra: [{ state: 'refund owed', amountKobo: 500_000 }],
      },
      'Customer (15:25): I send again.',
    )
    expect(p).toContain('extra ₦5,000')
    expect(p).toContain('account number, bank and account name')
    expect(p).toContain('keep it as credit')
  })

  it('confirms the refund once the customer has given an account', () => {
    const p = draftPrompt(
      {
        ...facts,
        payment: 'matched',
        extra: [
          { state: 'refund owed', amountKobo: 500_000, hasAccount: true },
        ],
      },
      'Customer (15:25): Refund am to my OPay.',
    )
    expect(p).toContain('sent back to the account they gave')
    expect(p).not.toContain('Ask for the account')
  })

  it('asks for the balance when a payment fell short', () => {
    const p = draftPrompt(
      {
        ...facts,
        payment: 'matched',
        amountKobo: 1_850_000,
        shortKobo: 50_000,
      },
      'Customer (11:03): Sent.',
    )
    expect(p).toContain('₦500 short')
    expect(p).not.toContain('has arrived in the shop')
  })

  it('asks only for the delivery fee once the items are paid', () => {
    const p = draftPrompt(
      { ...facts, payment: 'matched', shortKobo: 150_000, deliveryOwed: true },
      'Customer (16:31): Done.',
    )
    expect(p).toContain('payment for the items has arrived')
    expect(p).toContain('delivery fee of ₦1,500')
    expect(p).not.toContain('short of the total')
  })

  it("gives the shop's rules and forbids inventing others", () => {
    const p = draftPrompt(
      { ...facts, rules: ['Delivery to Ikeja costs ₦2,000.'] },
      'Customer (12:47): How much is delivery?',
    )
    expect(p).toContain('Delivery to Ikeja costs ₦2,000.')
    expect(p).toContain('fees, hours or promises that are not given here')
  })

  it('removes quotation marks around the whole reply only', () => {
    expect(tidyDraft('"Thank you, it don land."')).toBe(
      'Thank you, it don land.',
    )
    expect(tidyDraft('“Thank you.”')).toBe('Thank you.')
    expect(tidyDraft('She said "yes" today.')).toBe('She said "yes" today.')
  })

  it('answers a customer who has not paid yet without mentioning it', () => {
    const p = draftPrompt(
      { ...facts, payment: null, amountKobo: 950_000 },
      'Customer (18:06): Una fit send am come?',
    )
    expect(p).toContain('give the price of ₦9,500')
    expect(p).toContain('Do not say that they have not paid')
  })

  it('throws away accusing drafts', () => {
    expect(draftProblem('This receipt is fake.')).not.toBeNull()
    expect(draftProblem('Thank you, e don land!')).toBeNull()
    expect(draftProblem('  ')).not.toBeNull()
  })

  it('catches wording no Lagos vendor would send', () => {
    expect(oddWording('Ahoy! Your order is ready.')).toBe('Ahoy')
    expect(oddWording('Salamat for your order!')).toBe('Salamat')
    expect(oddWording('e don reach my eekoo yet')).toBe('eekoo')
    expect(oddWording('No problem, my brother/sister!')).toBe('brother/sister')
    expect(oddWording('Hello [customer name], thank you.')).toBe(
      '[customer name]',
    )
    expect(
      oddWording('Paid 21/11, ₦12,500 received. Abeg wait small.'),
    ).toBeNull()
  })
})

describe('refund details', () => {
  it('keeps a ten-digit account and names the bank', () => {
    expect(
      toRefundTo(
        {
          accountNumber: '900 000 0006',
          bank: 'my opay',
          accountName: 'Oluwakemi Johnson',
        },
        config,
      ),
    ).toEqual({
      accountNumber: '9000000006',
      bank: 'OPay',
      accountName: 'Oluwakemi Johnson',
    })
  })

  it('leaves a doubtful account number blank instead of guessing', () => {
    expect(
      toRefundTo(
        { accountNumber: '90000006', bank: 'unknown', accountName: 'none' },
        config,
      ),
    ).toEqual({ accountNumber: '', bank: '', accountName: '' })
  })
})

describe('complaint drafts', () => {
  it('asks for a calm reply and no promises the rules do not make', () => {
    const p = draftPrompt(
      { payment: null, amountKobo: null, items: [], complaint: true },
      'Customer: The headwrap has a tear. I am not happy.',
    )
    expect(p).toContain('Reply warmly and calmly')
    expect(p).toContain('a photo of the problem')
    expect(p).toContain('Do not promise a refund')
    expect(
      draftPrompt({ payment: null, amountKobo: null, items: [] }, 'Hi'),
    ).not.toContain('warmly and calmly')
  })
})

describe('writesPidgin', () => {
  it("reads only the customer's lines", () => {
    expect(writesPidgin('Customer (12:30): Bros abeg the jeans dey?')).toBe(
      true,
    )
    expect(writesPidgin('Customer (12:30): Is the jeans available?')).toBe(
      false,
    )
    expect(
      writesPidgin('You (12:31): E dey.\nCustomer (12:32): Great, thanks'),
    ).toBe(false)
  })

  it('gives Pidgin chats the style guide', () => {
    const facts = { payment: null, amountKobo: null, items: [] }
    expect(draftPrompt(facts, 'Customer (1:00): Abeg how much?')).toContain(
      'Lagos Pidgin',
    )
    expect(draftPrompt(facts, 'Customer (1:00): How much?')).not.toContain(
      'Lagos Pidgin',
    )
  })
})

describe('writesPidgin in English chats', () => {
  it('is not fooled by English words', () => {
    expect(
      writesPidgin('Customer (9:00): Will the size 12 fit me? Don said so.'),
    ).toBe(false)
  })
})
