// Matches a customer's picture of an item (a status reply's thumbnail, a
// forwarded photo) to the shop's own stock photos, in plain code: no model,
// and nothing leaves the device. Each photo becomes a small fingerprint of
// its light-and-dark layout and its colours.

export type Pixels = { data: ArrayLike<number>; width: number; height: number }

type Print = {
  // 64-bit difference hash as 16 hex digits: how brightness changes across
  // a 9 x 8 grid. Survives resizing and JPEG blur.
  hash: string
  // Mean red, green and blue of a 4 x 4 grid, 48 numbers from 0 to 255.
  colours: number[]
}

export type Fingerprint = {
  // The centre square, as WhatsApp crops a status into a reply thumbnail.
  square: Print
  // The whole picture, for a photo forwarded uncropped.
  whole: Print
}

// Mean colour of each cell when the region is split into cols x rows.
function cells(
  p: Pixels,
  region: { x: number; y: number; w: number; h: number },
  cols: number,
  rows: number,
): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(region.x + (c * region.w) / cols)
      const x1 = Math.max(
        x0 + 1,
        Math.floor(region.x + ((c + 1) * region.w) / cols),
      )
      const y0 = Math.floor(region.y + (r * region.h) / rows)
      const y1 = Math.max(
        y0 + 1,
        Math.floor(region.y + ((r + 1) * region.h) / rows),
      )
      let red = 0
      let green = 0
      let blue = 0
      let n = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * p.width + x) * 4
          red += p.data[i]!
          green += p.data[i + 1]!
          blue += p.data[i + 2]!
          n++
        }
      }
      out.push([red / n, green / n, blue / n])
    }
  }
  return out
}

// Brightness steps smaller than this count as flat.
const FLAT = 4

function print(
  p: Pixels,
  region: { x: number; y: number; w: number; h: number },
): Print {
  const grey = cells(p, region, 9, 8).map(
    ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b,
  )
  let hash = ''
  for (let row = 0; row < 8; row++) {
    let nibble = 0
    let bits = 0
    for (let col = 0; col < 8; col++) {
      // Flat areas such as a plain backdrop would otherwise flip on noise.
      const brighter = grey[row * 9 + col]! > grey[row * 9 + col + 1]! + FLAT
      nibble = (nibble << 1) | (brighter ? 1 : 0)
      bits++
      if (bits === 4) {
        hash += nibble.toString(16)
        nibble = 0
        bits = 0
      }
    }
  }
  const colours = cells(p, region, 4, 4).flatMap((c) => c.map(Math.round))
  return { hash, colours }
}

export function fingerprint(p: Pixels): Fingerprint {
  const side = Math.min(p.width, p.height)
  return {
    square: print(p, {
      x: Math.floor((p.width - side) / 2),
      y: Math.floor((p.height - side) / 2),
      w: side,
      h: side,
    }),
    whole: print(p, { x: 0, y: 0, w: p.width, h: p.height }),
  }
}

function hammingHex(a: string, b: string): number {
  let d = 0
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)
    while (x) {
      d += x & 1
      x >>= 1
    }
  }
  return d
}

// 0 for the same picture, towards 1 for unrelated ones. Shape and colour
// count equally, so two items cut alike but in different fabrics differ.
function printDistance(a: Print, b: Print): number {
  const shape = hammingHex(a.hash, b.hash) / 64
  let colour = 0
  for (let i = 0; i < a.colours.length; i++) {
    colour += Math.abs(a.colours[i]! - b.colours[i]!)
  }
  colour /= a.colours.length * 255
  return 0.5 * shape + 0.5 * Math.min(1, colour * 2)
}

export function distance(a: Fingerprint, b: Fingerprint): number {
  return Math.min(
    printDistance(a.square, b.square),
    printDistance(a.whole, b.whole),
  )
}

// A match is taken only when it is close and clearly closer than the next
// photo; otherwise the vendor picks from the closest few. Set from synthetic
// photos; Remote Config can tune them for real ones.
export type PhotoThresholds = { sure: number; gap: number; likely: number }
export const DEFAULT_PHOTO_THRESHOLDS: PhotoThresholds = {
  sure: 0.12,
  gap: 0.06,
  likely: 0.3,
}

export type PhotoMatch<T> =
  | { kind: 'sure'; item: T; distance: number }
  | { kind: 'unsure'; candidates: T[] }
  | { kind: 'none' }

export function matchPhoto<T>(
  picture: Fingerprint,
  stock: { item: T; print: Fingerprint }[],
  t: PhotoThresholds = DEFAULT_PHOTO_THRESHOLDS,
): PhotoMatch<T> {
  const ranked = stock
    .map((s) => ({ item: s.item, d: distance(picture, s.print) }))
    .sort((a, b) => a.d - b.d)
  const [best, next] = ranked
  if (!best || best.d > t.likely) return { kind: 'none' }
  if (best.d <= t.sure && (!next || next.d - best.d >= t.gap)) {
    return { kind: 'sure', item: best.item, distance: best.d }
  }
  return {
    kind: 'unsure',
    candidates: ranked
      .filter((r) => r.d <= t.likely)
      .slice(0, 3)
      .map((r) => r.item),
  }
}
