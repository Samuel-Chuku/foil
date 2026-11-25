import { describe, expect, it } from 'vitest'
import {
  answerFromResults,
  deviceAnswerPrompt,
  fitLines,
  readPicks,
  routePrompt,
  thinAnswer,
} from './askRoute'
import { DEVICE_ASK_MAX_CHARS } from './snapshot'
import { BUTTON_NOTE, withoutNotes, type ToolResult } from './tools'

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
            area: '',
          },
        ],
      }),
    ).toEqual([{ tool: 'list_orders', args: { which: 'unpaid' } }])
  })

  it('drops unknown tools, repeats and anything past two', () => {
    const p = {
      which: '',
      number: '',
      product: '',
      chart: '',
      step: '',
      area: '',
    }
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

describe('thin answers', () => {
  it('spots answers too thin to read', () => {
    expect(thinAnswer('none')).toBe(true)
    expect(thinAnswer(' None. ')).toBe(true)
    expect(thinAnswer('0')).toBe(true)
    expect(thinAnswer('')).toBe(true)
    expect(thinAnswer('No orders are waiting to be sent.')).toBe(false)
  })

  it('falls back to the lookups, without the button note', () => {
    expect(
      answerFromResults([
        {
          text: `#12 gown, Lekki\n${BUTTON_NOTE}`,
          step: 'Looked up orders to send (1)',
        },
        {
          text: 'No orders on the way.',
          step: 'Looked up orders on the way (0)',
        },
      ]),
    ).toBe('#12 gown, Lekki\nNo orders on the way.')
  })
})

describe('notes for the model', () => {
  it('are taken out of an answer that repeats them', () => {
    expect(
      withoutNotes(
        'Orders 77 and 81 are ready.\nA button to move each of these along is already shown to the owner.',
      ),
    ).toBe('Orders 77 and 81 are ready.')
  })
})

describe('the on-device answer prompt', () => {
  it('stays under the device limit however long a lookup is', () => {
    const long = Array.from(
      { length: 2000 },
      (_, n) => `#${n} gown, ₦18,500, Lekki`,
    ).join('\n')
    const prompt = deviceAnswerPrompt(
      'What should I restock?',
      ['Paid today: 3'],
      [{ step: 'Looked up stock', text: long } as ToolResult],
      [],
    )
    expect(prompt.length).toBeLessThanOrEqual(DEVICE_ASK_MAX_CHARS)
    expect(prompt).toMatch(/more lines not shown/)
    expect(prompt).toMatch(/Question: What should I restock\?/)
  })

  it('keeps a short lookup whole', () => {
    expect(fitLines('a\nb', 100)).toBe('a\nb')
  })
})
