import { describe, expect, it } from 'vitest'
import {
  contrast,
  inkOn,
  isPlain,
  logoColors,
  parseBrand,
  PLAIN_BRAND,
  readableOn,
  tint,
} from './brand'

const px = (...rgba: [number, number, number, number][]) =>
  new Uint8ClampedArray(rgba.flat())

describe('parseBrand', () => {
  it('falls back to the plain style for anything missing or odd', () => {
    expect(parseBrand(undefined)).toEqual(PLAIN_BRAND)
    expect(
      parseBrand({
        logo: 'http://x',
        color: 'red',
        font: { kind: 'builtin', id: 'comic' },
      }),
    ).toEqual(PLAIN_BRAND)
    expect(isPlain(parseBrand(null))).toBe(true)
  })

  it('keeps a valid logo, colour and font', () => {
    const b = parseBrand({
      logo: 'data:image/png;base64,AAA',
      color: '#1D3B53',
      font: {
        kind: 'file',
        name: 'Shop.ttf',
        dataUrl: 'data:font/ttf;base64,AA',
      },
    })
    expect(b.color).toBe('#1D3B53')
    expect(b.font).toEqual({
      kind: 'file',
      name: 'Shop.ttf',
      dataUrl: 'data:font/ttf;base64,AA',
    })
    expect(isPlain(b)).toBe(false)
  })
})

describe('contrast', () => {
  it('matches the WCAG extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('picks white on dark colours and dark on light ones', () => {
    expect(inkOn('#1d3b53')).toBe('#ffffff')
    expect(inkOn('#f5d000')).toBe('#1f1f1f')
  })

  it('swaps a pale brand colour for the fallback on paper', () => {
    expect(readableOn('#f5d000', '#f4f1ea', '#1b7a3a')).toBe('#1b7a3a')
    expect(readableOn('#1d3b53', '#f4f1ea', '#1b7a3a')).toBe('#1d3b53')
  })
})

describe('logoColors', () => {
  it('finds the brand colours and skips background, outline and grey', () => {
    const navy: [number, number, number, number] = [29, 59, 83, 255]
    const gold: [number, number, number, number] = [230, 170, 20, 255]
    const pixels = px(
      ...Array(40).fill(navy),
      ...Array(12).fill(gold),
      ...Array(30).fill([255, 255, 255, 255]),
      ...Array(8).fill([0, 0, 0, 255]),
      ...Array(8).fill([128, 128, 128, 255]),
      ...Array(8).fill([200, 0, 0, 0]),
      // One edge pixel blended into the white background.
      [168, 109, 149, 255],
    )
    expect(logoColors(pixels)).toEqual(['#1d3b53', '#e6aa14'])
  })
})

describe('tint', () => {
  it('mixes the brand into the paper and keeps dark text readable', () => {
    expect(tint('#000000', '#ffffff', 0.5)).toBe('#808080')
    for (const brand of ['#7a1f5c', '#1d3b53', '#f5d000', '#e34948']) {
      expect(contrast('#1f1f1f', tint(brand, '#fbfaf6', 0.1))).toBeGreaterThan(
        12,
      )
    }
  })

  it('shows the order number unless the shop turned it off', () => {
    expect(parseBrand({}).showOrderNumber).toBe(true)
    expect(parseBrand({ showOrderNumber: false }).showOrderNumber).toBe(false)
  })
})
