import { useCallback, useEffect, useState } from 'react'
import type { Approved, CloudRequest } from '../cloud/approval'
import { addEvent, createSheet, GoogleError, writeTabs } from '../google/api'
import type { CalendarEvent } from '../google/calendar'
import { tableText, type SheetTab } from '../google/sheet'
import { market } from '../config/market'
import { get, putAll } from '../ledger/db'
import type { PanelHost } from './host'

// The vendor's own Google Sheet and Calendar. Every send shows exactly what
// goes first; the demo, which cannot sign in, shows the same preview and
// sends nothing.

type Sheet = { sheetId: string; sheetUrl: string; sentAt: number | null }

export type GoogleStatus =
  | { kind: 'busy'; note: string }
  | { kind: 'done'; text: string; url?: string }
  | { kind: 'error'; message: string }

// The sheet carries the shop's name, so it is easy to find in Drive.
const sheetTitle = (shop: string) =>
  shop.trim() ? `${shop.trim()}: orders` : 'Shop orders'

export function useGoogle(
  host: PanelHost,
  ask: (request: CloudRequest) => Promise<Approved | null>,
) {
  const canSign = Boolean(host.googleToken)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [connected, setConnected] = useState(false)
  // Each place that sends shows its own outcome, keyed by what it sent.
  const [status, setStatus] = useState<Record<string, GoogleStatus>>({})
  const mark = (key: string, s: GoogleStatus) =>
    setStatus((all) => ({ ...all, [key]: s }))

  useEffect(() => {
    let live = true
    void get('settings', 'google').then(
      (row) => {
        if (live && row && row.id === 'google') setSheet(row)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [])

  // Silent first; Google's window only when the session has lapsed.
  const token = useCallback(async () => {
    const t = host.googleToken
    if (!t) throw new Error('Sign-in is only in the extension.')
    let value: string
    try {
      value = await t(false)
    } catch {
      value = await t(true)
    }
    setConnected(true)
    return value
  }, [host])

  const connect = useCallback(async () => {
    mark('connect', { kind: 'busy', note: 'Waiting for Google…' })
    try {
      await host.googleToken?.(true)
      setConnected(true)
      mark('connect', { kind: 'done', text: 'Connected.' })
    } catch (e) {
      mark('connect', {
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }, [host])

  const disconnect = useCallback(async () => {
    host.forgetGoogle?.()
    setConnected(false)
    setSheet(null)
    await putAll({
      settings: [{ id: 'google', sheetId: '', sheetUrl: '', sentAt: null }],
    })
  }, [host])

  async function run(
    key: string,
    request: CloudRequest,
    work: (token: string) => Promise<{ text: string; url?: string }>,
  ) {
    const approved = await ask(request)
    if (!approved) return
    if (!canSign) {
      mark(key, {
        kind: 'done',
        text: `The demo sends nothing. In the extension, this goes to your own ${request.to}.`,
      })
      return
    }
    mark(key, { kind: 'busy', note: `Sending to ${request.to}…` })
    try {
      mark(key, { kind: 'done', ...(await work(await token())) })
    } catch (e) {
      mark(key, {
        kind: 'error',
        message:
          e instanceof GoogleError || e instanceof Error
            ? e.message
            : String(e),
      })
    }
  }

  const sendSheet = (
    key: string,
    tabs: SheetTab[],
    now: number,
    shop: string,
  ) => {
    const symbol = market().currency.symbol
    const title = sheetTitle(shop)
    return run(
      key,
      {
        feature: 'Send your orders',
        reason:
          'Your orders and daily totals are written to a sheet Foil keeps in your Google Drive. Sending again replaces them, so nothing is doubled.',
        texts: tabs.map((t) => tableText(t, symbol)),
        to: 'Google Sheets',
        replaced: [],
      },
      async (t) => {
        let s = sheet?.sheetId ? sheet : null
        const write = async (target: Sheet) => {
          await writeTabs(t, target.sheetId, tabs, { title, symbol })
          const saved = { ...target, sentAt: now }
          setSheet(saved)
          await putAll({ settings: [{ id: 'google', ...saved }] })
          return saved
        }
        if (!s) {
          const made = await createSheet(
            t,
            title,
            tabs.map((x) => x.title),
          )
          s = { sheetId: made.id, sheetUrl: made.url, sentAt: null }
        }
        let done: Sheet
        try {
          done = await write(s)
        } catch (e) {
          // The vendor deleted the sheet: make a new one.
          if (!(e instanceof GoogleError && e.status === 404)) throw e
          const made = await createSheet(
            t,
            title,
            tabs.map((x) => x.title),
          )
          done = await write({
            sheetId: made.id,
            sheetUrl: made.url,
            sentAt: null,
          })
        }
        const rows = (tabs[0]?.table.length ?? 1) - 1
        return {
          text: `Sent ${rows} order${rows === 1 ? '' : 's'} to your sheet.`,
          url: done.sheetUrl,
        }
      },
    )
  }

  const addToCalendar = (key: string, event: CalendarEvent, what: string) =>
    run(
      key,
      {
        feature: what,
        reason: 'One event is added to your main Google Calendar.',
        texts: [
          event.summary,
          `${event.start.dateTime.replace('T', ' ').slice(0, 16)} to ${event.end.dateTime.slice(11, 16)} (${event.start.timeZone})`,
          event.description,
        ],
        to: 'Google Calendar',
        replaced: [],
      },
      async (t) => {
        const { url } = await addEvent(t, event)
        return { text: 'Added to your calendar.', url }
      },
    )

  return {
    canSign,
    connected,
    sheet: sheet?.sheetId ? sheet : null,
    status,
    connect,
    disconnect,
    sendSheet,
    addToCalendar,
  }
}

export type GoogleApi = ReturnType<typeof useGoogle>
