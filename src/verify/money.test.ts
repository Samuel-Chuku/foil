import { describe, expect, it } from 'vitest'
import { MARKETS } from '../config/market'
import { formatMoney, parseMoney } from './money'

describe('money in each market', () => {
  it('reads and writes rupees, with Indian digit grouping', () => {
    const m = MARKETS.in
    expect(parseMoney('₹1,850', m)).toBe(185_000)
    expect(parseMoney('Rs. 1,85,000.50', m)).toBe(18_500_050)
    expect(parseMoney('INR 499', m)).toBe(49_900)
    expect(formatMoney(18_500_000, m)).toBe('₹1,85,000')
  })

  it('reads and writes reais, with a decimal comma', () => {
    const m = MARKETS.br
    expect(parseMoney('R$ 1.234,56', m)).toBe(123_456)
    expect(parseMoney('R$ 89,90', m)).toBe(8_990)
    expect(parseMoney('R$ 150', m)).toBe(15_000)
    expect(formatMoney(123_456, m)).toBe('R$ 1.234,56')
  })

  it('keeps naira as it was', () => {
    expect(parseMoney('N18,500', MARKETS.ng)).toBe(1_850_000)
    expect(formatMoney(1_850_000, MARKETS.ng)).toBe('₦18,500')
  })
})

describe('two amounts in one field', () => {
  it('reads as no single amount, so the items are summed instead', () => {
    expect(parseMoney('₹2,499 + ₹120', MARKETS.in)).toBeNull()
    expect(parseMoney('15000 plus 1500 delivery', MARKETS.ng)).toBeNull()
    expect(parseMoney('−₦5,000', MARKETS.ng)).toBe(500_000)
  })
})
