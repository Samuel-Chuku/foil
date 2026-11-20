import { describe, expect, it } from 'vitest'
import { draftProblem, draftPrompt } from './draft'
import { pickOrder, toOrderFields } from './orderFields'
import { transcript } from './transcript'

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
    })
    expect(pickOrder('nonsense').items).toEqual([])
    expect(pickOrder({ customerName: 'null' }).customerName).toBe('')
    expect(pickOrder({ area: 'unknown', landmark: 'absent' })).toMatchObject({
      area: '',
      landmark: '',
    })
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
    expect(p).toContain('sent back')
  })

  it('throws away accusing drafts', () => {
    expect(draftProblem('This receipt is fake.')).not.toBeNull()
    expect(draftProblem('Thank you, e don land!')).toBeNull()
    expect(draftProblem('  ')).not.toBeNull()
  })
})
