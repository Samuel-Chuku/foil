import { describe, expect, it } from 'vitest'
import { distance, fingerprint, matchPhoto, type Pixels } from './imageMatch'

type RGB = [number, number, number]

// Draws a synthetic "product photo": a background and a few shapes.
function photo(
  width: number,
  height: number,
  background: RGB,
  shapes: { colour: RGB; inside: (x: number, y: number) => boolean }[],
): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width
      const v = y / height
      const colour =
        shapes.findLast((s) => s.inside(u, v))?.colour ?? background
      const i = (y * width + x) * 4
      data.set([...colour, 255], i)
    }
  }
  return { data, width, height }
}

// What WhatsApp does to a status: a centre square, shrunk, with JPEG-like
// noise.
function thumbnail(p: Pixels, side: number, noise = 12): Pixels {
  const sq = Math.min(p.width, p.height)
  const x0 = Math.floor((p.width - sq) / 2)
  const y0 = Math.floor((p.height - sq) / 2)
  const data = new Uint8ClampedArray(side * side * 4)
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const sx = x0 + Math.floor((x * sq) / side)
      const sy = y0 + Math.floor((y * sq) / side)
      const s = (sy * p.width + sx) * 4
      const i = (y * side + x) * 4
      for (let c = 0; c < 3; c++) {
        data[i + c] = p.data[s + c]! + rand() * noise
      }
      data[i + 3] = 255
    }
  }
  return { data, width: side, height: side }
}

const cream: RGB = [240, 232, 214]
const dress = (colour: RGB) =>
  photo(300, 450, cream, [
    {
      colour,
      inside: (u, v) =>
        v > 0.2 && v < 0.9 && Math.abs(u - 0.5) < 0.1 + v * 0.25,
    },
  ])
const bag = photo(
  300,
  450,
  [250, 250, 250],
  [
    {
      colour: [120, 70, 30],
      inside: (u, v) => (u - 0.5) ** 2 + (v - 0.55) ** 2 < 0.06,
    },
  ],
)
const jacket = photo(
  400,
  400,
  [60, 60, 70],
  [
    { colour: [40, 90, 200], inside: (u, v) => u > 0.2 && u < 0.8 && v > 0.15 },
    {
      colour: [60, 60, 70],
      inside: (u, v) => Math.abs(u - 0.5) < 0.04 && v > 0.15,
    },
  ],
)

const stock = [
  { item: 'red dress', print: fingerprint(dress([200, 30, 40])) },
  { item: 'green dress', print: fingerprint(dress([30, 150, 60])) },
  { item: 'brown bag', print: fingerprint(bag) },
  { item: 'blue jacket', print: fingerprint(jacket) },
]

describe('fingerprint', () => {
  it('is 64 bits of shape and 48 colour numbers', () => {
    const f = fingerprint(bag)
    expect(f.square.hash).toMatch(/^[0-9a-f]{16}$/)
    expect(f.whole.colours).toHaveLength(48)
  })

  it('puts a shrunk, noisy copy close and a different item far', () => {
    const original = fingerprint(jacket)
    expect(distance(original, fingerprint(thumbnail(jacket, 64)))).toBeLessThan(
      0.1,
    )
    expect(distance(original, fingerprint(bag))).toBeGreaterThan(0.3)
  })
})

describe('matchPhoto', () => {
  it("matches a status reply's thumbnail to its stock photo", () => {
    for (const [picture, expected] of [
      [bag, 'brown bag'],
      [jacket, 'blue jacket'],
      [dress([200, 30, 40]), 'red dress'],
    ] as const) {
      const m = matchPhoto(fingerprint(thumbnail(picture, 72)), stock)
      expect(m).toMatchObject({ kind: 'sure', item: expected })
    }
  })

  it('tells two items cut alike apart by colour', () => {
    const m = matchPhoto(
      fingerprint(thumbnail(dress([30, 150, 60]), 72)),
      stock,
    )
    expect(m).toMatchObject({ kind: 'sure', item: 'green dress' })
  })

  it('offers the closest few when two photos are near alike', () => {
    const near = [
      { item: 'red dress', print: fingerprint(dress([200, 30, 40])) },
      { item: 'darker red dress', print: fingerprint(dress([190, 35, 45])) },
    ]
    const m = matchPhoto(fingerprint(thumbnail(dress([195, 32, 42]), 72)), near)
    expect(m.kind).toBe('unsure')
    if (m.kind === 'unsure') {
      expect(m.candidates).toEqual(
        expect.arrayContaining(['red dress', 'darker red dress']),
      )
    }
  })

  it('matches nothing for a picture unlike any stock, such as a receipt', () => {
    const receipt = photo(
      300,
      600,
      [255, 255, 255],
      [
        {
          colour: [20, 20, 20],
          inside: (u, v) => u > 0.1 && u < 0.7 && Math.floor(v * 30) % 3 === 0,
        },
        { colour: [30, 60, 110], inside: (_u, v) => v < 0.08 },
      ],
    )
    expect(matchPhoto(fingerprint(receipt), stock)).toEqual({ kind: 'none' })
  })

  it('cannot tell a thin belt apart, so it asks (the model breaks the tie)', () => {
    const plain = dress([179, 38, 58])
    const belted = photo(300, 450, cream, [
      {
        colour: [179, 38, 58],
        inside: (u, v) =>
          v > 0.2 && v < 0.9 && Math.abs(u - 0.5) < 0.1 + v * 0.25,
      },
      {
        colour: [255, 255, 255],
        inside: (u, v) => v > 0.47 && v < 0.485 && Math.abs(u - 0.5) < 0.2,
      },
    ])
    const m = matchPhoto(fingerprint(thumbnail(plain, 96)), [
      { item: 'plain', print: fingerprint(plain) },
      { item: 'belted', print: fingerprint(belted) },
    ])
    expect(m.kind).toBe('unsure')
  })

  it('matches nothing when the shop has no photos', () => {
    expect(matchPhoto(fingerprint(bag), [])).toEqual({ kind: 'none' })
  })
})
