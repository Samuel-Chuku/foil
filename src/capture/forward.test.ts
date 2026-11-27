import { describe, expect, it } from 'vitest'
import { askAbout, listSaid, mergeForwarded, type ForwardFill } from './forward'

const form = {
  customerName: 'Ada',
  address: '',
  landmark: '',
  area: 'Yaba',
  amount: '7000',
  items: [
    { name: 'Plain black cap', qty: '1', price: '7000', productId: 'p1' },
  ],
}

const fill = (over: Partial<ForwardFill>): ForwardFill => ({
  customerName: '',
  address: '',
  landmark: '',
  area: '',
  items: [],
  ...over,
})

describe('mergeForwarded', () => {
  it('fills a place the form was missing and says so', () => {
    const r = mergeForwarded(
      form,
      fill({
        address: '12 Herbert Macaulay Way',
        landmark: 'Opposite the bank',
      }),
    )
    expect(r.form.address).toBe('12 Herbert Macaulay Way')
    expect(r.form.landmark).toBe('Opposite the bank')
    expect(r.added).toEqual(['the address', 'the landmark'])
  })

  it('replaces a place, as the vendor forwarded it on purpose', () => {
    const r = mergeForwarded(
      { ...form, address: 'Old street', addressFromLast: true },
      fill({ address: 'New street' }),
    )
    expect(r.form.address).toBe('New street')
    expect(r.form.addressFromLast).toBeUndefined()
  })

  it('leaves a place that only differs in case alone', () => {
    const r = mergeForwarded(form, fill({ area: 'yaba' }))
    expect(r.added).toEqual([])
    expect(r.form.area).toBe('Yaba')
  })

  it('adds new items once and updates a priced total', () => {
    const r = mergeForwarded(
      form,
      fill({
        items: [
          {
            name: 'Plain black cap',
            qty: 1,
            priceKobo: 700000,
            productId: 'p1',
          },
          { name: 'Tote bag', qty: 2, priceKobo: 300000, productId: 'p2' },
        ],
      }),
    )
    expect(r.form.items.map((i) => i.name)).toEqual([
      'Plain black cap',
      'Tote bag',
    ])
    expect(r.form.amount).toBe('13000')
    expect(r.added).toEqual(['Tote bag × 2'])
  })

  it('keeps the stated total when a new item has no price', () => {
    const r = mergeForwarded(
      form,
      fill({ items: [{ name: 'Mystery hat', qty: 1, priceKobo: null }] }),
    )
    expect(r.form.amount).toBe('7000')
    expect(r.form.items).toHaveLength(2)
  })

  it('drops a blank row when real items arrive', () => {
    const r = mergeForwarded(
      { ...form, items: [{ name: '', qty: '1', price: '' }] },
      fill({ items: [{ name: 'Cap', qty: 1, priceKobo: 500000 }] }),
    )
    expect(r.form.items).toEqual([{ name: 'Cap', qty: '1', price: '5000' }])
  })

  it('fills the name only when the form has none', () => {
    expect(
      mergeForwarded(form, fill({ customerName: 'Adaeze' })).added,
    ).toEqual([])
    const r = mergeForwarded(
      { ...form, customerName: '' },
      fill({ customerName: 'Adaeze' }),
    )
    expect(r.form.customerName).toBe('Adaeze')
  })
})

describe('listSaid', () => {
  it('joins with commas and "and"', () => {
    expect(listSaid([])).toBe('')
    expect(listSaid(['the area'])).toBe('the area')
    expect(listSaid(['a', 'b', 'c'])).toBe('a, b and c')
  })
})

describe('askAbout', () => {
  it('quotes the message on one line and names who sent it', () => {
    expect(
      askAbout(
        { text: 'Send am\n to Yaba', from: 'customer', time: '' },
        'Ada',
      ),
    ).toBe('About this message from Ada: "Send am to Yaba". ')
    expect(
      askAbout({ text: 'It is ₦7,000', from: 'vendor', time: '' }, 'Ada'),
    ).toBe('About my message: "It is ₦7,000". ')
  })

  it('cuts a long message at a word', () => {
    const text =
      'Good morning. Is the ankara gown in size 14 still available for delivery today?'
    expect(askAbout({ text, from: 'customer', time: '' }, 'Ada')).toBe(
      'About this message from Ada: "Good morning. Is the ankara gown in size 14 still available…". ',
    )
  })
})
