import { formatMoney } from '../verify/money'
import { market, type Market } from './market'

// How prompts describe the shop: its city, how it is paid, how it writes
// money, and the language answers come back in.
export function shopWords(m: Market = market()) {
  const paidBy = {
    nip: 'bank transfer',
    upi: 'UPI',
    pix: 'Pix',
  }[m.rail]
  return {
    shop: `a small ${m.city} shop that sells on WhatsApp and is paid by ${paidBy}`,
    city: m.city,
    money: `amounts written like ${formatMoney(1_850_000, m)}`,
    language: m.id === 'br' ? 'Brazilian Portuguese' : 'English',
  }
}
