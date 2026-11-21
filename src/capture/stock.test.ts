import { describe, expect, it } from 'vitest'
import { newOrder } from '../ledger/ledger'
import type { Order, Product } from '../ledger/types'
import {
  alternatives,
  askedFor,
  findProduct,
  leftOf,
  mergeProducts,
  parsePriceList,
  productsInChat,
  stockFacts,
  withListPrices,
} from './stock'

const product = (
  id: string,
  name: string,
  priceKobo: number | null,
  qty: number | null,
  countedAt = 0,
): Product => ({ id, name, priceKobo, qty, countedAt, updatedAt: 0 })

const products = [
  product('gown', 'Ankara gown', 1_500_000, 1),
  product('green', 'Green ankara gown', 950_000, 2),
  product('wrap', 'Headwrap', 350_000, 10),
  product('cap', 'Plain black cap', 1_100_000, 5),
  product('bag', 'Brown leather bag', 1_850_000, 1),
  product('red', 'Red handbag', 2_000_000, 0),
  product('scarf', 'Silk scarf', 500_000, null),
]

function paid(
  items: { name: string; qty: number }[],
  at: number,
  state: Order['payment']['state'] = 'matched',
): Order {
  const o = newOrder(
    [],
    {
      mode: 'everyday',
      customerId: null,
      items: items.map((i) => ({ ...i, priceKobo: null })),
      amountKobo: null,
    },
    at,
  )
  return { ...o, payment: { ...o.payment, state, checkedAt: at } }
}

describe('findProduct', () => {
  it('finds the product a line names, with extra words around it', () => {
    expect(findProduct('the ankara gown in size 14', products)?.id).toBe('gown')
    expect(findProduct('Plain black caps', products)?.id).toBe('cap')
  })

  it('prefers the longest name the line covers', () => {
    expect(findProduct('green ankara gown, size 12', products)?.id).toBe(
      'green',
    )
  })

  it('takes a short line only when one product fits it', () => {
    expect(findProduct('scarf', products)?.id).toBe('scarf')
    expect(findProduct('gown', products)).toBeNull()
    expect(findProduct('shoes', products)).toBeNull()
    expect(findProduct('', products)).toBeNull()
  })
})

describe('leftOf', () => {
  it('takes away what paid orders since the count took', () => {
    const orders = [
      paid([{ name: 'black cap', qty: 2 }], 10),
      paid([{ name: 'Plain black caps', qty: 1 }], 20),
    ]
    expect(leftOf(products[3]!, orders, products)).toBe(2)
  })

  it('ignores unpaid orders and orders paid before the count', () => {
    const counted = product('cap', 'Plain black cap', null, 5, 100)
    const list = [counted]
    const orders = [
      paid([{ name: 'plain black cap', qty: 2 }], 50),
      paid([{ name: 'plain black cap', qty: 1 }], 150, 'not yet credited'),
      paid([{ name: 'plain black cap', qty: 1 }], 200),
    ]
    expect(leftOf(counted, orders, list)).toBe(4)
  })

  it("leaves the customer's own order out", () => {
    const mine = paid([{ name: 'ankara gown size 14', qty: 1 }], 10)
    expect(leftOf(products[0]!, [mine], products)).toBe(0)
    expect(leftOf(products[0]!, [mine], products, mine.id)).toBe(1)
  })

  it('is null for a product the shop does not count', () => {
    expect(leftOf(products[6]!, [], products)).toBeNull()
  })
})

describe('productsInChat', () => {
  it('finds whole names in what the customer wrote', () => {
    expect(
      productsInChat(
        'Is the ankara gown still available? And the silk scarf?',
        products,
      ).map((p) => p.id),
    ).toEqual(['gown', 'scarf'])
  })

  it('drops a name inside a longer one that matched', () => {
    expect(
      productsInChat('I want the green ankara gown', products).map((p) => p.id),
    ).toEqual(['green'])
  })
})

describe('stockFacts', () => {
  const left = (p: Product) => leftOf(p, [], products)

  it('says a sold-out item is sold out and offers like ones in stock', () => {
    const [fact] = stockFacts(
      [{ product: products[5]!, qty: 1 }],
      products,
      left,
    )
    expect(fact).toContain('About the Red handbag: it is sold out')
    expect(fact).toContain('Brown leather bag (₦18,500)')
  })

  it('asks for something else when nothing like it is in stock', () => {
    const soldGown = [paid([{ name: 'ankara gown', qty: 1 }], 1)]
    const l = (p: Product) => leftOf(p, soldGown, products)
    const only = products.filter((p) => p.id !== 'green')
    expect(stockFacts([{ product: only[0]!, qty: 1 }], only, l)[0]).toContain(
      'ask whether they would like something else',
    )
  })

  it('says how many are left when fewer than asked', () => {
    expect(
      stockFacts([{ product: products[3]!, qty: 7 }], products, left)[0],
    ).toContain('About the Plain black cap: only 5 are left')
  })

  it('gives the price when the item is in stock', () => {
    expect(
      stockFacts([{ product: products[6]!, qty: 1 }], products, left)[0],
    ).toBe('About the Silk scarf: it is available (₦5,000).')
  })
})

describe('photo-only products', () => {
  it('are called the item in their picture and never offered by name', () => {
    const piece = { ...product('p', '', 800_000, 0), photo: undefined }
    const list = [...products, piece]
    const l = (p: Product) => leftOf(p, [], list)
    expect(stockFacts([{ product: piece, qty: 1 }], list, l)[0]).toBe(
      'About the item in their picture: it is sold out. Say so honestly and ask whether they would like something else.',
    )
    expect(alternatives(products[1]!, list, l).some((p) => p.id === 'p')).toBe(
      false,
    )
  })
})

describe('alternatives', () => {
  it('skips sold-out products and the product itself', () => {
    const l = (p: Product) => leftOf(p, [], products)
    expect(alternatives(products[4]!, products, l).map((p) => p.id)).toEqual([])
  })
})

describe('askedFor', () => {
  it("uses the order's lines when there is an order", () => {
    expect(
      askedFor(
        [{ name: 'plain black caps', qty: 2, priceKobo: null }],
        'anything',
        products,
      ),
    ).toEqual([{ product: products[3], qty: 2 }])
  })

  it('reads the chat when there is no order yet', () => {
    expect(
      askedFor([], 'Do you have the red handbag?', products).map(
        (a) => a.product.id,
      ),
    ).toEqual(['red'])
  })
})

describe('withListPrices', () => {
  it('fills only prices the chat did not give', () => {
    expect(
      withListPrices(
        [
          { name: 'headwrap', qty: 1, priceKobo: null },
          { name: 'silk scarf', qty: 1, priceKobo: 450_000 },
          { name: 'shoes', qty: 1, priceKobo: null },
        ],
        products,
      ).map((i) => i.priceKobo),
    ).toEqual([350_000, 450_000, null])
  })
})

describe('parsePriceList', () => {
  it('reads common price list lines', () => {
    expect(
      parsePriceList(
        [
          'Ankara gown - ₦15,000 - 3 left',
          '2. Silk scarf 5k (10)',
          '• Blue jeans, size 32: N12000',
          'White sneakers size 39 = 9,000 x2',
          'Red handbag #20,000 sold out',
          'T-shirt 4500 qty: 6',
          '',
          'Beaded necklace',
        ].join('\n'),
      ),
    ).toEqual([
      { name: 'Ankara gown', priceKobo: 1_500_000, qty: 3 },
      { name: 'Silk scarf', priceKobo: 500_000, qty: 10 },
      { name: 'Blue jeans, size 32', priceKobo: 1_200_000, qty: null },
      { name: 'White sneakers size 39', priceKobo: 900_000, qty: 2 },
      { name: 'Red handbag', priceKobo: 2_000_000, qty: 0 },
      { name: 'T-shirt', priceKobo: 450_000, qty: 6 },
      { name: 'Beaded necklace', priceKobo: null, qty: null },
    ])
  })

  it('skips lines with no name', () => {
    expect(parsePriceList('₦5,000\n---')).toEqual([])
  })
})

describe('mergeProducts', () => {
  it('updates a product with the same name and adds new ones', () => {
    const next = mergeProducts(
      [product('cap', 'Plain black cap', 1_100_000, 5, 0)],
      [
        { name: 'plain black caps', priceKobo: null, qty: 8 },
        { name: 'Silk scarf', priceKobo: 500_000, qty: null },
      ],
      99,
    )
    expect(next[0]).toMatchObject({
      id: 'cap',
      priceKobo: 1_100_000,
      qty: 8,
      countedAt: 99,
    })
    expect(next[1]).toMatchObject({ name: 'Silk scarf', qty: null })
  })
})
