import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY as config } from '../config/defaults'
import {
  historyCredits,
  newHistoryCredits,
  sessionPrefix,
  supersededRows,
  type RawHistoryRow,
} from './history'
import { verifyReceipt, type Ledger } from './match'
import type { Credit, Receipt } from './types'

// Synthetic rows only. 21 Nov 2026, Lagos wall-clock.
const DAY = Date.UTC(2026, 10, 21)
const at = (h: number, m: number, s = 0) => Date.UTC(2026, 10, 21, h, m, s)
const MONIEPOINT_ID = '090405261121163012448302716594'

const row = (over: Partial<RawHistoryRow> = {}): RawHistoryRow => ({
  amountText: '+₦22,000.00',
  direction: 'Credit',
  description: '090405261121163012448…',
  dateTime: '4:31 PM',
  ...over,
})

const read = (rows: RawHistoryRow[]) =>
  historyCredits(rows, { screenshotId: 'h1', bank: 'gtbank', day: DAY })

const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  amountKobo: 2_200_000,
  sender: 'FEMI ADEYEMI',
  senderBank: 'moniepoint',
  reference: MONIEPOINT_ID,
  at: { ms: at(16, 30), precision: 'minute' },
  status: 'successful',
  ...over,
})

const ledger = (credits: Credit[]): Ledger => ({
  credits,
  claimedCredits: new Map(),
  usedSessionIds: new Map(),
  reversedCredits: new Set(),
})

describe('history rows', () => {
  it('turns rows into bank-app credits and debits', () => {
    const [credit, debit] = read([
      row(),
      row({
        amountText: '-₦5,000.00',
        direction: '',
        description: 'TRF TO OLUWAKEMI JOHNSON',
        dateTime: '21 Nov 2026 16:05',
      }),
    ])
    expect(credit).toMatchObject({
      id: 'h1-1',
      direction: 'credit',
      amountKobo: 2_200_000,
      sender: '',
      source: 'history',
      strength: 'bank app',
      at: { ms: at(16, 31), precision: 'minute' },
    })
    expect(debit).toMatchObject({ direction: 'debit', amountKobo: 500_000 })
  })

  it('drops rows with no readable amount or direction', () => {
    expect(
      read([
        row({ amountText: 'unknown' }),
        row({ amountText: '22,000', direction: '' }),
      ]),
    ).toEqual([])
  })

  it('reads a truncated session ID prefix, not a short reference', () => {
    expect(sessionPrefix('090405261121163012448…')).toBe(
      '090405261121163012448',
    )
    expect(sessionPrefix('MOBILE TRF 0123456789')).toBeNull()
  })

  it('skips rows the alerts already showed', () => {
    const [app] = read([row()])
    const alert: Credit = {
      ...app!,
      id: 'e9',
      sessionId: MONIEPOINT_ID,
      source: 'alert',
      strength: 'alert received',
      at: { ms: at(16, 30, 40), precision: 'second' },
    }
    expect(newHistoryCredits([alert], [app!])).toEqual([])
    const nameOnly = { ...alert, sessionId: null, narration: 'FEMI ADEYEMI' }
    expect(newHistoryCredits([nameOnly], [app!])).toEqual([])
    const later = {
      ...nameOnly,
      at: { ms: at(16, 40), precision: 'minute' as const },
    }
    expect(newHistoryCredits([later], [app!])).toEqual([app])
    const garbled = read([row({ description: '0904052611216301…' })])
    expect(newHistoryCredits([alert], garbled)).toEqual([])
  })

  it('still recognises a row whose ID was read with one digit slipped', () => {
    const alert = (sessionId: string): Credit => ({
      ...read([row()])[0]!,
      id: 'e9',
      sessionId,
      narration: '',
      source: 'alert',
      strength: 'alert received',
    })
    // A dropped zero and an extra 1, as the model was seen to read them.
    const dropped = read([row({ description: '09405261121163012448…' })])
    const added = read([row({ description: '0904052611211163012448…' })])
    expect(newHistoryCredits([alert(MONIEPOINT_ID)], dropped)).toEqual([])
    expect(newHistoryCredits([alert(MONIEPOINT_ID)], added)).toEqual([])
    expect(verifyReceipt(receipt(), ledger(added), config)).toMatchObject({
      kind: 'matched',
    })
  })
})

describe('verifyReceipt with bank-app rows', () => {
  it('matches a nameless row by the start of the session ID', () => {
    const v = verifyReceipt(receipt(), ledger(read([row()])), config)
    expect(v).toMatchObject({ kind: 'matched', creditId: 'h1-1' })
    expect(v.kind === 'matched' && v.notes.join(' ')).toContain('bank app')
  })

  it('skips a row whose prefix belongs to another transfer', () => {
    const other = row({ description: '090405261121155900113…' })
    expect(verifyReceipt(receipt(), ledger(read([other])), config).kind).toBe(
      'not yet credited',
    )
  })

  it('asks the vendor about a nameless row with nothing to tie it', () => {
    const plain = row({ description: 'Via Airt Via' })
    const v = verifyReceipt(receipt(), ledger(read([plain])), config)
    expect(v).toMatchObject({ kind: 'check', candidates: ['h1-1'] })
  })
})

describe('alerts after a screenshot', () => {
  it('replace the screenshot row for the same money, and only that row', () => {
    const [appRow, other] = read([
      row(),
      row({
        amountText: '+₦9,000.00',
        description: 'MOBILE TRF',
        dateTime: '1:11 PM',
      }),
    ])
    const alert: Credit = {
      ...appRow!,
      id: 'e9',
      sender: 'FEMI ADEYEMI',
      sessionId: MONIEPOINT_ID,
      source: 'alert',
      strength: 'alert received',
      at: { ms: at(16, 30, 40), precision: 'second' },
    }
    expect(supersededRows([appRow!, other!], [alert])).toEqual([appRow!.id])
  })
})
