import { describe, expect, it } from 'vitest'
import {
  alertQuery,
  htmlToText,
  messageText,
  senderAddress,
  toAlertEmail,
  tokenFromRedirect,
  type GmailMessage,
} from './gmail'

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

describe('alertQuery', () => {
  it('searches only the chosen label', () => {
    expect(alertQuery({ label: 'Bank alerts' }, 1_700_000_000.7)).toBe(
      'label:"Bank alerts" after:1700000000',
    )
  })

  it('or only the known bank senders', () => {
    expect(
      alertQuery({ senders: ['gens@gtbank.com', 'no-reply@kuda.com'] }, 5),
    ).toBe('from:(gens@gtbank.com OR no-reply@kuda.com) after:5')
  })
})

describe('htmlToText', () => {
  it('keeps a label and its cell value on one line', () => {
    const html = `<html><head><style>td{}</style></head><body>
      <table><tr><td>Amount</td><td>NGN 18,500.00</td></tr>
      <tr><td>Sender&#39;s Name</td><td>ADAEZE&nbsp;OKAFOR</td></tr></table>
      <p>Thank you &amp; regards</p></body></html>`
    expect(htmlToText(html)).toBe(
      "Amount\tNGN 18,500.00\nSender's Name\tADAEZE OKAFOR\nThank you & regards",
    )
  })
})

describe('messageText', () => {
  it('prefers the plain-text part, in any nesting', () => {
    expect(
      messageText({
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/html', body: { data: b64url('<p>html</p>') } },
          {
            mimeType: 'multipart/related',
            parts: [
              { mimeType: 'text/plain', body: { data: b64url('Credit ₦5') } },
            ],
          },
        ],
      }),
    ).toBe('Credit ₦5')
  })

  it('falls back to the HTML part as text', () => {
    expect(
      messageText({
        mimeType: 'text/html',
        body: { data: b64url('<div>Txn Type: Credit</div>') },
      }),
    ).toBe('Txn Type: Credit')
  })

  it('is empty when there is no text', () => {
    expect(messageText({ mimeType: 'image/png', body: {} })).toBe('')
  })
})

describe('toAlertEmail', () => {
  it('takes the sender address, arrival time and spam label', () => {
    const m: GmailMessage = {
      id: 'abc',
      labelIds: ['INBOX', 'SPAM'],
      internalDate: '1700000000000',
      payload: {
        mimeType: 'text/plain',
        headers: [{ name: 'From', value: 'GTBank <GENS@gtbank.com>' }],
        body: { data: b64url('hello') },
      },
    }
    expect(toAlertEmail(m)).toEqual({
      id: 'gmail-abc',
      from: 'gens@gtbank.com',
      body: 'hello',
      receivedAt: 1_700_000_000_000 + 3_600_000,
      inSpam: true,
    })
  })

  it('reads a bare address too', () => {
    expect(senderAddress(' no-reply@kuda.com ')).toBe('no-reply@kuda.com')
  })
})

describe('tokenFromRedirect', () => {
  const base = 'https://id.chromiumapp.org/#'

  it('reads the token and when it lapses', () => {
    expect(
      tokenFromRedirect(
        `${base}access_token=t1&expires_in=3599&state=s`,
        's',
        1000,
      ),
    ).toEqual({ accessToken: 't1', expiresAt: 1000 + 3539 * 1000 })
  })

  it('refuses a redirect with the wrong state', () => {
    expect(tokenFromRedirect(`${base}access_token=t1&state=x`, 's', 0)).toEqual(
      { error: 'state_mismatch' },
    )
  })

  it("passes on Google's error", () => {
    expect(
      tokenFromRedirect(`${base}error=interaction_required&state=s`, 's', 0),
    ).toEqual({ error: 'interaction_required' })
  })
})
