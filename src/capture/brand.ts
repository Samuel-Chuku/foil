// How the shop's receipts look: its logo, colour and font, all optional.
// Kept on this computer; with none set, receipts use the plain style.

export const BUILTIN_FONTS = {
  simple: {
    label: 'Simple',
    stack: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  classic: {
    label: 'Classic',
    stack: 'Georgia, "Times New Roman", serif',
  },
  rounded: {
    label: 'Rounded',
    stack:
      'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif',
  },
  typewriter: {
    label: 'Typewriter',
    stack: 'ui-monospace, "Courier New", monospace',
  },
} as const
export type BuiltinFont = keyof typeof BUILTIN_FONTS

export type BrandFont =
  | { kind: 'builtin'; id: BuiltinFont }
  // A font file the vendor added, kept as a data URL so it works offline.
  | { kind: 'file'; name: string; dataUrl: string }

export type Brand = {
  // A small PNG data URL, shrunk on this computer.
  logo: string | null
  // "#1d3b53", or null for the plain style.
  color: string | null
  font: BrandFont
  // Whether receipts show the order number; some shops keep it internal.
  showOrderNumber: boolean
}

export const PLAIN_BRAND: Brand = {
  logo: null,
  color: null,
  font: { kind: 'builtin', id: 'simple' },
  showOrderNumber: true,
}

const HEX = /^#[0-9a-f]{6}$/i

export function parseBrand(raw: unknown): Brand {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const f = (r.font && typeof r.font === 'object' ? r.font : {}) as Record<
    string,
    unknown
  >
  const font: BrandFont =
    f.kind === 'file' &&
    typeof f.dataUrl === 'string' &&
    f.dataUrl.startsWith('data:')
      ? {
          kind: 'file',
          name: typeof f.name === 'string' ? f.name : 'Your font',
          dataUrl: f.dataUrl,
        }
      : f.kind === 'builtin' &&
          typeof f.id === 'string' &&
          f.id in BUILTIN_FONTS
        ? { kind: 'builtin', id: f.id as BuiltinFont }
        : PLAIN_BRAND.font
  return {
    logo:
      typeof r.logo === 'string' && r.logo.startsWith('data:image/')
        ? r.logo
        : null,
    color: typeof r.color === 'string' && HEX.test(r.color) ? r.color : null,
    font,
    showOrderNumber: r.showOrderNumber !== false,
  }
}

export const isPlain = (b: Brand) =>
  !b.logo && !b.color && b.font.kind === 'builtin' && b.font.id === 'simple'

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

// WCAG relative luminance and contrast ratio.
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

// The text colour for words printed on the brand colour: whichever of white
// or near-black reads better.
export const inkOn = (color: string): string =>
  contrast(color, '#ffffff') >= contrast(color, '#1f1f1f')
    ? '#ffffff'
    : '#1f1f1f'

// The brand colour where it is also used as text on the receipt's paper,
// if it is dark enough to read there (WCAG AA for large text); otherwise
// the fallback.
export const readableOn = (color: string, paper: string, fallback: string) =>
  contrast(color, paper) >= 3 ? color : fallback

// A few distinct colours from a logo's pixels, most used first. Near-white,
// near-black, grey and see-through pixels are skipped: they are the
// background and outlines, not the brand.
export function logoColors(pixels: Uint8ClampedArray, max = 4): string[] {
  const buckets = new Map<
    string,
    { n: number; r: number; g: number; b: number }
  >()
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const [r, g, b, a] = [
      pixels[i]!,
      pixels[i + 1]!,
      pixels[i + 2]!,
      pixels[i + 3]!,
    ]
    if (a < 128) continue
    const hi = Math.max(r, g, b)
    const lo = Math.min(r, g, b)
    if (hi > 235 && lo > 235) continue
    if (hi < 25) continue
    if (hi - lo < 24) continue
    // Coarse buckets, so shades of one colour count together.
    const key = `${r >> 5},${g >> 5},${b >> 5}`
    const s = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    s.n += 1
    s.r += r
    s.g += g
    s.b += b
    buckets.set(key, s)
  }
  // Anti-aliased edges blend the brand into the background; a colour that
  // covers only a sliver of the logo is one of those blends.
  const total = [...buckets.values()].reduce((sum, b) => sum + b.n, 0)
  const ranked = [...buckets.values()]
    .filter((b) => b.n >= total * 0.04)
    .sort((x, y) => y.n - x.n)
    .map((s) => toHex(s.r / s.n, s.g / s.n, s.b / s.n))
  const picked: string[] = []
  for (const c of ranked) {
    // Skip a colour too close to one already picked.
    const near = picked.some((p) => {
      const [a, b] = [channels(p), channels(c)]
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 60
    })
    if (!near) picked.push(c)
    if (picked.length === max) break
  }
  return picked
}

// The brand colour mixed into the paper, so the whole receipt carries the
// brand while text stays readable on it.
export function tint(color: string, paper: string, amount: number): string {
  const [a, b] = [channels(color), channels(paper)]
  return toHex(
    a[0] * amount + b[0] * (1 - amount),
    a[1] * amount + b[1] * (1 - amount),
    a[2] * amount + b[2] * (1 - amount),
  )
}
