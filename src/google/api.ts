import type { CalendarEvent } from './calendar'
import type { Kind, SheetTab } from './sheet'

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

// Posts `body`, or reads when there is none.
async function call<T>(token: string, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
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
        ? 'Google refused this. Check that Foil may use Sheets and Calendar, then connect again.'
        : res.status === 404
          ? 'That sheet is gone from your Drive.'
          : res.status === 429
            ? 'Google is busy. Try again in a minute.'
            : 'Google could not take this. Try again.',
    res.status,
  )
}

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'

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

// Column widths in pixels, and how numbers show, by kind of column.
const WIDTH: Record<Kind, number> = {
  date: 130,
  order: 80,
  money: 115,
  count: 95,
  text: 170,
  long: 280,
}

function numberFormat(kind: Kind, symbol: string, cents: boolean) {
  if (kind === 'date') return { type: 'DATE', pattern: 'ddd d mmm yyyy' }
  if (kind === 'order') return { type: 'NUMBER', pattern: '"#"0' }
  if (kind === 'count') return { type: 'NUMBER', pattern: '0' }
  if (kind === 'money') {
    return {
      type: 'CURRENCY',
      pattern: `"${symbol}"#,##0${cents ? '.00' : ''}`,
    }
  }
  return null
}

// The header's fill: the desk's muted ground, so the sheet reads as its own.
const HEAD_FILL = { red: 0.91, green: 0.9, blue: 0.86 }
const PADDING = { top: 6, bottom: 6, left: 8, right: 8 }

function formatTab(sheetId: number, tab: SheetTab, symbol: string): unknown[] {
  const rows = tab.table.length
  const band = (from: number, to: number) => ({
    sheetId,
    startRowIndex: from,
    endRowIndex: to,
  })
  const columns = tab.kinds.flatMap((kind, col) => {
    const column = { sheetId, startColumnIndex: col, endColumnIndex: col + 1 }
    const cents = tab.table
      .slice(1)
      .some((r) => typeof r[col] === 'number' && !Number.isInteger(r[col]))
    const format = numberFormat(kind, symbol, cents)
    const fields = [
      ...(format ? ['numberFormat'] : []),
      ...(kind === 'long' ? ['wrapStrategy'] : []),
    ]
    return [
      {
        updateDimensionProperties: {
          range: { ...column, dimension: 'COLUMNS' },
          properties: { pixelSize: WIDTH[kind] },
          fields: 'pixelSize',
        },
      },
      ...(fields.length
        ? [
            {
              repeatCell: {
                range: { ...column, startRowIndex: 1, endRowIndex: rows },
                cell: {
                  userEnteredFormat: {
                    ...(format && { numberFormat: format }),
                    ...(kind === 'long' && { wrapStrategy: 'WRAP' }),
                  },
                },
                fields: `userEnteredFormat(${fields.join(',')})`,
              },
            },
          ]
        : []),
    ]
  })
  const bold = (from: number, to: number) => ({
    repeatCell: {
      range: band(from, to),
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true },
          backgroundColor: HEAD_FILL,
        },
      },
      fields: 'userEnteredFormat(textFormat,backgroundColor)',
    },
  })
  return [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    // A clean start for every cell, so an earlier send leaves nothing behind.
    {
      repeatCell: {
        range: band(0, rows),
        cell: {
          userEnteredFormat: {
            verticalAlignment: 'MIDDLE',
            padding: PADDING,
            wrapStrategy: 'CLIP',
          },
        },
        fields:
          'userEnteredFormat(verticalAlignment,padding,wrapStrategy,textFormat,backgroundColor,numberFormat)',
      },
    },
    bold(0, 1),
    ...(tab.totalRow ? [bold(rows - 1, rows)] : []),
    ...columns,
    // Rows grow to fit wrapped items, with the padding as spacing.
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'ROWS',
          startIndex: 0,
          endIndex: rows,
        },
      },
    },
  ]
}

// Replaces each tab's contents, so sending again never doubles a row, then
// lays the sheet out: header, widths, dates and amounts. Values go as RAW,
// so nothing a customer typed can become a formula.
export async function writeTabs(
  token: string,
  id: string,
  tabs: SheetTab[],
  opts: { title: string; symbol: string },
): Promise<void> {
  const base = `${SHEETS}/${encodeURIComponent(id)}`
  type Props = { properties: { sheetId: number; title: string } }
  const meta = await call<{ sheets: Props[] }>(
    token,
    `${base}?fields=sheets.properties(sheetId,title)`,
  )
  const ids = new Map(
    meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]),
  )
  // A tab the vendor deleted, or one added since their sheet was made.
  const missing = tabs.filter((t) => !ids.has(t.title))
  if (missing.length) {
    const added = await call<{ replies: { addSheet: Props }[] }>(
      token,
      `${base}:batchUpdate`,
      {
        requests: missing.map((t) => ({
          addSheet: { properties: { title: t.title } },
        })),
      },
    )
    for (const r of added.replies) {
      ids.set(r.addSheet.properties.title, r.addSheet.properties.sheetId)
    }
  }
  await call(token, `${base}/values:batchClear`, {
    ranges: tabs.map((t) => `'${t.title}'`),
  })
  await call(token, `${base}/values:batchUpdate`, {
    valueInputOption: 'RAW',
    data: tabs.map((t) => ({ range: `'${t.title}'!A1`, values: t.table })),
  })
  await call(token, `${base}:batchUpdate`, {
    requests: [
      {
        updateSpreadsheetProperties: {
          properties: { title: opts.title },
          fields: 'title',
        },
      },
      ...tabs.flatMap((t) => formatTab(ids.get(t.title)!, t, opts.symbol)),
    ],
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
