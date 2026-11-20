// Small readers for what WhatsApp Web shows, kept free of the DOM so they
// can be tested. WhatsApp changes its page often; everything that depends on
// its markup is in whatsapp.ts and this file.

// The message box is labelled "Type a message to +234 803 000 0000" when the
// chat has no saved name; a saved name shows there instead.
export function phoneFromText(text: string | null | undefined): string | null {
  const m = /\+?\d[\d\s-]{7,}\d/.exec(text ?? '')
  return m ? m[0].replace(/[\s-]/g, '') : null
}

// "17:58", "5:58 pm" or "5:58 PM" from a message's footer.
export function timeFrom(text: string | null | undefined): string {
  const m = /\b(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i.exec(text ?? '')
  if (!m) return ''
  let h = Number(m[1])
  const pm = m[3]?.toLowerCase().startsWith('p')
  const am = m[3]?.toLowerCase().startsWith('a')
  if (pm && h < 12) h += 12
  if (am && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

// WhatsApp labels the vendor's own messages "You:" for screen readers.
export const sentByVendor = (label: string | null | undefined) =>
  /^\s*you\s*:?\s*$/i.test(label ?? '')
