import { describe, expect, it } from 'vitest'
import { readPicks, routePrompt } from './askRoute'

describe('readPicks', () => {
  it('keeps known tools and only the arguments given', () => {
    expect(
      readPicks({
        picks: [
          {
            tool: 'list_orders',
            which: 'unpaid',
            number: '',
            product: '',
            chart: '',
            step: '',
          },
        ],
      }),
    ).toEqual([{ tool: 'list_orders', args: { which: 'unpaid' } }])
  })

  it('drops unknown tools, repeats and anything past two', () => {
    const p = { which: '', number: '', product: '', chart: '', step: '' }
    expect(
      readPicks({
        picks: [
          { ...p, tool: 'delete_everything' },
          { ...p, tool: 'todays_money' },
          { ...p, tool: 'todays_money' },
        ],
      }),
    ).toEqual([{ tool: 'todays_money', args: {} }])
    expect(
      readPicks({
        picks: [
          { ...p, tool: 'todays_money' },
          { ...p, tool: 'week_trends' },
          { ...p, tool: 'shop_rules' },
        ],
      }).map((x) => x.tool),
    ).toEqual(['todays_money', 'week_trends'])
  })

  it('reads junk as no picks', () => {
    expect(readPicks(null)).toEqual([])
    expect(readPicks({ picks: 'all' })).toEqual([])
  })
})

describe('routePrompt', () => {
  it('lists the tools and the question, and stays small', () => {
    const p = routePrompt('Which orders are unpaid?', [])
    expect(p).toContain('list_orders')
    expect(p).toContain('Question: Which orders are unpaid?')
    // Well under the device's 9,216-token limit (about 4 characters a token).
    expect(p.length).toBeLessThan(6000)
  })
})
