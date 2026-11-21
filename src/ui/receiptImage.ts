import {
  receiptTime,
  receiptTitle,
  type CustomerReceipt,
} from '../capture/customerReceipt'
import { formatNaira } from '../verify/money'

// Draws the customer's receipt as a PNG card on this computer, for the vendor
// to paste into the chat or save. Neutral styling until the design system.

const W = 420
const PAD = 28
const SCALE = 2

const INK = '#1f1f1f'
const MUTED = '#5e5e5e'
const PAPER = '#f4f1ea'
const RULE = '#d6d1c4'
const GOOD = '#1b7a3a'
const OWED = '#9a5b00'

function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

export function drawCustomerReceipt(r: CustomerReceipt): HTMLCanvasElement {
  // Drawn on a canvas taller than needed, then cropped to what was drawn.
  const H = 400 + r.lines.length * 30
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const g = canvas.getContext('2d')
  if (!g) throw new Error('This browser cannot draw the receipt.')
  g.scale(SCALE, SCALE)
  const font = (weight: number, size: number) =>
    `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`
  const right = (text: string, y: number) => {
    g.textAlign = 'right'
    g.fillText(text, W - PAD, y)
    g.textAlign = 'left'
  }
  const rule = (y: number, dashed: boolean) => {
    g.strokeStyle = RULE
    g.lineWidth = 1
    g.setLineDash(dashed ? [4, 4] : [])
    g.beginPath()
    g.moveTo(PAD, y)
    g.lineTo(W - PAD, y)
    g.stroke()
    g.setLineDash([])
  }

  g.fillStyle = PAPER
  g.fillRect(0, 0, W, H)

  let y = PAD + 18
  g.fillStyle = INK
  g.font = font(700, 20)
  g.fillText(fit(g, r.shop || 'Receipt', W - PAD * 2 - 90), PAD, y)
  g.fillStyle = MUTED
  g.font = font(500, 14)
  right(`Order ${r.orderCode}`, y)

  // The paid mark: a filled circle with a tick, drawn rather than an emoji
  // so it looks the same on every machine.
  y += 44
  const colour = r.owedKobo > 0 ? OWED : GOOD
  g.fillStyle = colour
  g.beginPath()
  g.arc(PAD + 14, y - 6, 14, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = PAPER
  g.lineWidth = 3
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(PAD + 7, y - 6)
  g.lineTo(PAD + 12, y - 1)
  g.lineTo(PAD + 21, y - 12)
  g.stroke()
  g.fillStyle = colour
  g.font = font(700, 18)
  g.fillText(receiptTitle(r), PAD + 38, y)
  if (r.paidAt !== null) {
    g.fillStyle = MUTED
    g.font = font(400, 13)
    g.fillText(receiptTime(r.paidAt), PAD + 38, y + 20)
  }
  y += 28
  if (r.customer) {
    y += 22
    g.fillStyle = MUTED
    g.font = font(400, 13)
    g.fillText(fit(g, `For ${r.customer}`, W - PAD * 2), PAD, y)
  }

  y += 20
  rule(y, true)
  y += 8
  g.font = font(400, 15)
  for (const l of r.lines) {
    y += 30
    g.fillStyle = INK
    g.fillText(fit(g, l.label, W - PAD * 2 - 110), PAD, y)
    right(l.kobo === null ? '' : formatNaira(l.kobo), y)
  }
  y += 18
  rule(y, false)

  y += 30
  g.fillStyle = INK
  g.font = font(700, 16)
  g.fillText('Total', PAD, y)
  right(formatNaira(r.totalKobo), y)
  y += 30
  g.font = font(500, 15)
  g.fillStyle = GOOD
  g.fillText('Paid', PAD, y)
  right(formatNaira(r.paidKobo), y)
  if (r.owedKobo > 0) {
    y += 30
    g.fillStyle = OWED
    g.font = font(700, 15)
    g.fillText('Still to pay', PAD, y)
    right(formatNaira(r.owedKobo), y)
  }
  g.fillStyle = MUTED
  g.font = font(400, 13)
  if (r.riderNote) {
    y += 28
    g.fillText(fit(g, r.riderNote, W - PAD * 2), PAD, y)
  }
  if (r.refEnding) {
    y += 24
    g.fillText(`Transfer ref ending ${r.refEnding}`, PAD, y)
  }

  y += 24
  rule(y, true)
  y += 30
  g.fillStyle = INK
  g.font = font(500, 14)
  g.textAlign = 'center'
  g.fillText(
    fit(
      g,
      r.shop
        ? `Thank you for shopping with ${r.shop}!`
        : 'Thank you for your order!',
      W - PAD * 2,
    ),
    W / 2,
    y,
  )
  g.textAlign = 'left'

  const out = document.createElement('canvas')
  out.width = W * SCALE
  out.height = Math.ceil((y + PAD) * SCALE)
  out.getContext('2d')?.drawImage(canvas, 0, 0)
  return out
}

export function receiptBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error('The receipt picture could not be made.')),
      'image/png',
    ),
  )
}
