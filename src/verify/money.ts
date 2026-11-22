import { market, type Market } from '../config/market'

// Amounts are kept in minor units (kobo, paise, centavos: a hundredth of the
// main unit in every market here), so sums and comparisons never meet
// floating-point error. Fields keep the name "kobo" from the first market.

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Two amounts written together ("₹2,499 + ₹120") are not one amount: joined
// up they would read as ₹24,99,120.
const TWO_AMOUNTS = /\d\s*(?:\+|\bplus\b|\band\b|&)\s*\D{0,3}\s*\d/i

export function parseMoney(text: string, m: Market = market()): number | null {
  if (TWO_AMOUNTS.test(text)) return null
  const c = m.currency
  let s = text.toLowerCase()
  // Longest marks first, so "rs." goes before "rs".
  for (const mark of [...c.marks].sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(escape(mark), 'g'), '')
  }
  s = s.replace(/[+−-]/g, '')
  // A lone currency initial before the number, as in "N18,500".
  if (c.code === 'NGN') s = s.replace(/\bn(?=\s*\d)/g, '')
  s = s.replace(/\s/g, '')
  s = c.decimalComma
    ? s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
    : s.replace(/,/g, '')
  const match = /^(\d+(?:\.\d{1,2})?)(k|m)?$/.exec(s)
  if (!match) return null
  const scale = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1
  const [whole = '0', frac = ''] = match[1]!.split('.')
  return (Number(whole) * 100 + Number(frac.padEnd(2, '0'))) * scale
}

export function formatMoney(minor: number, m: Market = market()): string {
  const c = m.currency
  const number = (minor / 100).toLocaleString(c.locale, {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `${c.symbol}${c.spaced ? ' ' : ''}${number}`
}
