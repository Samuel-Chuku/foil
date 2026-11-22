import { describe, expect, it } from 'vitest'
import { newOrder } from '../ledger/ledger'
import type { ChatNote, Order } from '../ledger/types'
import type { Credit } from '../verify/types'
import { buildQueue, latestAsk, noteFrom } from './queue'
import { parseTriage, triagePattern, triagePrompt } from './triage'

const order = (key: string, extra: Partial<Order> = {}): Order => ({
  ...newOrder(
    [],
    {
      mode: 'everyday',
      customerId: key,
      items: [{ name: 'Blue jeans', qty: 1, priceKobo: 1_200_000 }],
      amountKobo: 1_200_000,
    },
    1000,
  ),
  ...extra,
})

const paid = (o: Order, creditId: string): Order => ({
  ...o,
  payment: { ...o.payment, state: 'matched', creditId, checkedAt: 2000 },
})

const credit = (id: string, naira: number): Credit => ({
  id,
  bank: 'gtbank',
  direction: 'credit',
  reversal: false,
  amountKobo: naira * 100,
  sender: '',
  narration: '',
  sessionId: null,
  reference: null,
  at: null,
  source: 'alert',
  strength: 'alert received',
})

const note = (
  id: string,
  lastFrom: ChatNote['lastFrom'],
  label?: ChatNote['label'],
): ChatNote => ({
  id,
  name: id,
  recent: [{ from: lastFrom, time: '10:00', text: 'hi' }],
  lastFrom,
  readAt: 0,
  ...(label && { label }),
})

const base = {
  credits: [credit('c1', 12_000), credit('c2', 5_000)],
  customers: [],
  drops: [],
  products: [],
  delivers: true,
  now: 5000,
}

describe('buildQueue', () => {
  it('puts each customer in the one section that most needs the vendor', () => {
    const q = buildQueue({
      ...base,
      orders: [
        order('ade'),
        paid(order('bisi'), 'c1'),
        paid(
          order('chi', {
            deliveryPlan: {
              method: 'pickup',
              area: '',
              state: '',
              park: '',
              feeKobo: null,
              paidTo: null,
            },
          }),
          'c1',
        ),
        paid(order('dayo'), 'c2'),
      ],
      chats: [note('efe', 'customer', 'complaint'), note('fola', 'customer')],
    })
    expect(q.map((e) => [e.key, e.section])).toEqual([
      ['efe', 'complaint'],
      ['ade', 'unpaid'],
      ['dayo', 'unpaid'],
      ['bisi', 'details'],
      ['fola', 'reply'],
      ['chi', 'ready'],
    ])
    expect(q.find((e) => e.key === 'dayo')?.why).toContain('balance')
  })

  it('skips delivery details for a shop that does not deliver', () => {
    const q = buildQueue({
      ...base,
      delivers: false,
      orders: [paid(order('bisi'), 'c1')],
      chats: [],
    })
    expect(q[0]?.section).toBe('ready')
  })

  it('drops a complaint once the vendor has answered it', () => {
    const q = buildQueue({
      ...base,
      orders: [],
      chats: [note('efe', 'vendor', 'complaint')],
    })
    expect(q).toEqual([])
  })
})

describe('noteFrom', () => {
  it('keeps the last text messages and who spoke last', () => {
    const n = noteFrom(
      'k',
      'Kunle',
      [
        { from: 'customer', time: '10:00', text: 'Hello' },
        { from: 'vendor', time: '10:01', text: 'Hi, how can I help?' },
        { from: 'customer', time: '10:02', text: 'My order never came' },
        { from: 'customer', time: '10:03' },
      ],
      9,
    )!
    expect(n.lastFrom).toBe('customer')
    expect(n.recent).toHaveLength(3)
    expect(latestAsk(n)).toBe('My order never came')
  })

  it('keeps a label only while the latest words are the same', () => {
    const msgs = [
      { from: 'customer' as const, time: '1', text: 'Where is it?' },
    ]
    const first = noteFrom('k', 'K', msgs, 1)!
    const labelled = {
      ...first,
      label: 'complaint' as const,
      labelledText: 'Where is it?',
    }
    expect(noteFrom('k', 'K', msgs, 2, labelled)?.label).toBe('complaint')
    const more = [
      ...msgs,
      { from: 'customer' as const, time: '2', text: 'Thanks, it came' },
    ]
    expect(noteFrom('k', 'K', more, 3, labelled)?.label).toBeUndefined()
  })
})

describe('triage', () => {
  it('numbers messages and never includes ids', () => {
    const p = triagePrompt(['I want the blue jeans', 'Abeg where my order?'])
    expect(p).toContain('1. I want the blue jeans')
    expect(p).toContain('2. Abeg where my order?')
  })

  it('constrains the answer to one letter per number', () => {
    expect(triagePattern(2).test('1:O,2:C')).toBe(true)
    expect(triagePattern(2).test('1:O')).toBe(false)
  })

  it('reads the letters, and the cloud JSON forms', () => {
    expect(parseTriage('1:O,2:C,3:X', 3)).toEqual([
      'order',
      'complaint',
      'other',
    ])
    expect(parseTriage('{"1":"P","2":"Q"}', 2)).toEqual(['payment', 'question'])
    expect(parseTriage('["Q","O"]', 2)).toEqual(['question', 'order'])
  })

  it('refuses a half answer', () => {
    expect(parseTriage('1:O', 2)).toBeNull()
    expect(parseTriage('1:Z,2:O', 2)).toBeNull()
  })
})

describe('noteFrom with voice notes', () => {
  it('counts a voice note as something the customer said', () => {
    const note = noteFrom(
      'k',
      'Sample',
      [
        { from: 'vendor', time: '10:00', text: 'Hello' },
        { from: 'customer', time: '10:05', voice: { seconds: 9 } },
      ],
      0,
    )
    expect(note?.lastFrom).toBe('customer')
    expect(latestAsk(note!)).toBe('[sent a voice note]')
  })
})
