import type { CalendarEvent } from './calendar'
import type { Table } from './sheet'

// The vendor's own Google Sheets and Calendar, called straight from the
// browser with their token. The drive.file scope lets the desk see only the
// sheet it made, nothing else in their Drive.

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
]

export class GoogleError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function call<T>(token: string, url: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new GoogleError(
      'Google could not be reached. Check your connection and try again.',
      0,
    )
  }
  if (res.ok) return (await res.json()) as T
  throw new GoogleError(
    res.status === 401
      ? 'Your Google sign-in has run out. Connect again in Settings.'
      : res.status === 403
        ? 'Google refused this. Check that the desk may use Sheets and Calendar, then connect again.'
        : res.status === 404
          ? 'That sheet is gone from your Drive.'
          : res.status === 429
            ? 'Google is busy. Try again in a minute.'
            : 'Google could not take this. Try again.',
    res.status,
  )
}

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'

export type Tab = { title: string; table: Table }

export async function createSheet(
  token: string,
  title: string,
  tabs: string[],
): Promise<{ id: string; url: string }> {
  const r = await call<{ spreadsheetId: string; spreadsheetUrl: string }>(
    token,
    SHEETS,
    {
      properties: { title },
      sheets: tabs.map((t) => ({ properties: { title: t } })),
    },
  )
  return { id: r.spreadsheetId, url: r.spreadsheetUrl }
}

// Replaces each tab's contents, so sending again never doubles a row.
export async function writeTabs(
  token: string,
  id: string,
  tabs: Tab[],
): Promise<void> {
  const base = `${SHEETS}/${encodeURIComponent(id)}/values`
  await call(token, `${base}:batchClear`, {
    ranges: tabs.map((t) => `'${t.title}'`),
  })
  await call(token, `${base}:batchUpdate`, {
    valueInputOption: 'RAW',
    data: tabs.map((t) => ({ range: `'${t.title}'!A1`, values: t.table })),
  })
}

export async function addEvent(
  token: string,
  event: CalendarEvent,
): Promise<{ url: string }> {
  const r = await call<{ htmlLink: string }>(
    token,
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    event,
  )
  return { url: r.htmlLink }
}
