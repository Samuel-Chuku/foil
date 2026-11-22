import {
  receiptTime,
  receiptTitle,
  type CustomerReceipt,
} from '../capture/customerReceipt'
import {
  BUILTIN_FONTS,
  inkOn,
  readableOn,
  tint,
  type Brand,
  type BrandFont,
} from '../capture/brand'
import { formatMoney } from '../verify/money'

// Draws the customer's receipt as a PNG card on this computer, for the vendor
// to paste into the chat or save, in the shop's own look when it has one.

const W = 420
const PAD = 28
const SCALE = 2

const INK = '#1f1f1f'
const MUTED = '#5e5e5e'
const PAPER = '#f4f1ea'
// A brighter base for brand tints, so the colour reads clearly.
const BRAND_PAPER = '#fbfaf6'
const RULE = '#d6d1c4'
const GOOD = '#1b7a3a'
const OWED = '#9a5b00'

function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

// What drawing needs from the brand, ready to use: the font loaded and the
// logo decoded.
export type ReceiptLook = {
  family: string
  logo: HTMLImageElement | null
  color: string | null
}

export const PLAIN_LOOK: ReceiptLook = {
  family: BUILTIN_FONTS.simple.stack,
  logo: null,
  color: null,
}

const LOGO = 48

export function drawCustomerReceipt(
  r: CustomerReceipt,
  look: ReceiptLook = PLAIN_LOOK,
): HTMLCanvasElement {
  // Drawn on a canvas taller than needed, then cropped to what was drawn.
  const H = 460 + r.lines.length * 30
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const g = canvas.getContext('2d')
  if (!g) throw new Error('This browser cannot draw the receipt.')
  g.scale(SCALE, SCALE)
  const font = (weight: number, size: number) =>
    `${weight} ${size}px ${look.family}`
  const brand = look.color
  // With a brand colour, the whole receipt carries it: tinted paper, brand
  // rules, a brand total bar and footer. Text colours are chosen to stay
  // readable on each surface; the paid mark keeps its green.
  const paper = brand ? tint(brand, BRAND_PAPER, 0.1) : PAPER
  const accent = brand ? readableOn(brand, paper, INK) : INK
  const ruleColour = brand ? tint(brand, paper, 0.45) : RULE
  const right = (text: string, y: number) => {
    g.textAlign = 'right'
    g.fillText(text, W - PAD, y)
    g.textAlign = 'left'
  }
  const rule = (y: number, dashed: boolean) => {
    g.strokeStyle = ruleColour
    g.lineWidth = brand && !dashed ? 1.5 : 1
    g.setLineDash(dashed ? [4, 4] : [])
    g.beginPath()
    g.moveTo(PAD, y)
    g.lineTo(W - PAD, y)
    g.stroke()
    g.setLineDash([])
  }

  g.fillStyle = paper
  g.fillRect(0, 0, W, H)

  // The header: a band in the brand colour when there is one, with the logo
  // on a paper tile so any logo shows on any colour.
  const headerH = brand ? LOGO + 32 : look.logo ? LOGO + 4 : 22
  const top = brand ? 0 : PAD - 4
  if (brand) {
    g.fillStyle = brand
    g.fillRect(0, 0, W, headerH)
  }

  // A faint watermark behind the items: the logo, or the shop's initial.
  if (look.logo || brand) {
    g.save()
    // Multiply drops a logo's white background, so only its colours show.
    g.globalCompositeOperation = 'multiply'
    g.globalAlpha = 0.09
    const cy = headerH + 190
    if (look.logo) {
      const box = 210
      const sc = Math.min(box / look.logo.width, box / look.logo.height)
      const w = look.logo.width * sc
      const h = look.logo.height * sc
      g.drawImage(look.logo, (W - w) / 2, cy - h / 2, w, h)
    } else if (r.shop) {
      g.fillStyle = brand!
      g.font = font(700, 220)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(r.shop.trim()[0]!.toUpperCase(), W / 2, cy)
    }
    g.restore()
  }

  let textX = PAD
  if (look.logo) {
    const box = LOGO
    const scale = Math.min(box / look.logo.width, box / look.logo.height)
    const w = look.logo.width * scale
    const h = look.logo.height * scale
    const x = PAD
    const ly = top + (headerH - box) / 2
    if (brand) {
      g.fillStyle = paper
      g.beginPath()
      g.roundRect(x - 4, ly - 4, box + 8, box + 8, 8)
      g.fill()
    }
    g.drawImage(look.logo, x + (box - w) / 2, ly + (box - h) / 2, w, h)
    textX = PAD + box + 16
  }
  const headInk = brand ? inkOn(brand) : INK
  const mid = top + headerH / 2 + 7
  g.fillStyle = headInk
  g.font = font(700, 20)
  const orderSpace = r.orderCode ? 90 : 0
  g.fillText(
    fit(g, r.shop || 'Receipt', W - textX - PAD - orderSpace),
    textX,
    mid,
  )
  if (r.orderCode) {
    g.fillStyle = brand ? headInk : MUTED
    g.globalAlpha = brand ? 0.85 : 1
    g.font = font(500, 14)
    right(`Order ${r.orderCode}`, mid)
    g.globalAlpha = 1
  }
  let y = top + headerH - 4

  // The paid mark: a filled circle with a tick, drawn rather than an emoji
  // so it looks the same on every machine.
  y += 44
  const colour = r.owedKobo > 0 ? OWED : GOOD
  g.fillStyle = colour
  g.beginPath()
  g.arc(PAD + 14, y - 6, 14, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = paper
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
    right(l.kobo === null ? '' : formatMoney(l.kobo), y)
  }
  y += 18
  rule(y, false)

  y += 30
  if (brand) {
    g.fillStyle = brand
    g.beginPath()
    g.roundRect(PAD - 12, y - 23, W - PAD * 2 + 24, 34, 10)
    g.fill()
    g.fillStyle = inkOn(brand)
  } else {
    g.fillStyle = accent
  }
  g.font = font(700, 16)
  g.fillText('Total', PAD, y)
  right(formatMoney(r.totalKobo), y)
  y += 32
  g.font = font(500, 15)
  g.fillStyle = GOOD
  g.fillText('Paid', PAD, y)
  right(formatMoney(r.paidKobo), y)
  if (r.owedKobo > 0) {
    y += 30
    g.fillStyle = OWED
    g.font = font(700, 15)
    g.fillText('Still to pay', PAD, y)
    right(formatMoney(r.owedKobo), y)
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

  const thanks = r.shop
    ? `Thank you for shopping with ${r.shop}!`
    : 'Thank you for your order!'
  let end: number
  if (brand) {
    // A footer band to match the header.
    y += 26
    g.fillStyle = brand
    g.fillRect(0, y, W, 50)
    g.fillStyle = inkOn(brand)
    g.font = font(600, 14)
    g.textAlign = 'center'
    g.fillText(fit(g, thanks, W - PAD * 2), W / 2, y + 30)
    g.textAlign = 'left'
    end = y + 50
  } else {
    y += 24
    rule(y, true)
    y += 30
    g.fillStyle = INK
    g.font = font(500, 14)
    g.textAlign = 'center'
    g.fillText(fit(g, thanks, W - PAD * 2), W / 2, y)
    g.textAlign = 'left'
    end = y + PAD
  }

  const out = document.createElement('canvas')
  out.width = W * SCALE
  out.height = Math.ceil(end * SCALE)
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

const fonts = new Map<string, Promise<string>>()

// The CSS font family for a brand font, loading an uploaded file once per
// visit. A file that will not load falls back to the simple style.
export function fontFamily(font: BrandFont): Promise<string> {
  if (font.kind === 'builtin')
    return Promise.resolve(BUILTIN_FONTS[font.id].stack)
  let loading = fonts.get(font.dataUrl)
  if (!loading) {
    const name = `ShopBrand${fonts.size + 1}`
    const face = new FontFace(name, `url(${font.dataUrl})`)
    loading = face.load().then(
      (loaded) => {
        document.fonts.add(loaded)
        return `"${name}", ${BUILTIN_FONTS.simple.stack}`
      },
      () => BUILTIN_FONTS.simple.stack,
    )
    fonts.set(font.dataUrl, loading)
  }
  return loading
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The logo could not be opened.'))
    img.src = src
  })
}

export async function receiptLook(brand: Brand): Promise<ReceiptLook> {
  const [family, logo] = await Promise.all([
    fontFamily(brand.font),
    brand.logo ? loadImage(brand.logo).catch(() => null) : null,
  ])
  return { family, logo, color: brand.color }
}
