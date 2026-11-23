import { describe, expect, it } from 'vitest'
import { MARKETS } from '../config/market'
import {
  lostNumbers,
  numbersIn,
  protect,
  readsAsEnglish,
  rewritePrompt,
  rewriteStyles,
} from './rewrite'

describe('rewrite styles', () => {
  it('offers Lagos its languages, with only English and Pidgin on the device', () => {
    const s = rewriteStyles(MARKETS.ng)
    expect(s.map((x) => x.id)).toEqual([
      'friendlier',
      'formal',
      'shorter',
      'spelling',
      'pidgin',
      'english',
      'yoruba',
      'igbo',
      'hausa',
    ])
    expect(s.filter((x) => !x.onDevice).map((x) => x.id)).toEqual([
      'yoruba',
      'igbo',
      'hausa',
    ])
  })

  it('runs São Paulo’s tone changes in the cloud, since the device has no Portuguese', () => {
    expect(
      rewriteStyles(MARKETS.br)
        .filter((x) => x.id === 'friendlier')
        .map((x) => x.onDevice),
    ).toEqual([false])
  })

  it('asks the model to keep the numbers it must not lose', () => {
    const style = rewriteStyles(MARKETS.ng)[0]!
    const p = rewritePrompt('It is ₦9,500', style, MARKETS.ng, ['9500'])
    expect(p).toContain('must appear exactly as written: 9500')
    expect(p).toContain('Message:\nIt is ₦9,500')
  })
})

describe('numbers survive a rewrite', () => {
  it('reads amounts with or without separators as the same number', () => {
    expect(numbersIn('₦18,500 for 2 items')).toEqual(['18500', '2'])
  })

  it('finds a number the rewrite dropped or changed', () => {
    expect(lostNumbers('It is ₦9,500, size 41', 'Na 9500 o, size 41')).toEqual(
      [],
    )
    expect(lostNumbers('It is ₦9,500, size 41', 'It is ₦9,000')).toEqual([
      '9500',
      '41',
    ])
  })
})

describe('protect', () => {
  it('swaps names and long numbers out and puts them back', () => {
    const p = protect('Ada, send to 0123456789 at GTBank', ['Ada Obi'])
    expect(p.text).toBe('⟦2⟧, send to ⟦1⟧ at GTBank')
    expect(p.replaced).toEqual(['account and phone numbers', 'names'])
    expect(p.restore('⟦2⟧, fi ranṣẹ si ⟦1⟧')).toBe(
      'Ada, fi ranṣẹ si 0123456789',
    )
    // Brackets the model wrapped around its own words are dropped.
    expect(p.restore('Bawo ⟦2⟧, ⟦fi ranṣẹ⟧')).toBe('Bawo Ada, fi ranṣẹ')
  })
})

describe('readsAsEnglish', () => {
  it('keeps English and Pidgin on the device', () => {
    expect(readsAsEnglish('How much is the black abaya?')).toBe(true)
    expect(readsAsEnglish('Abeg how much for this one?')).toBe(true)
  })

  it('sends other languages to the cloud', () => {
    expect(readsAsEnglish('Ẹ jọ̀ọ́, èló ni aṣọ dúdú yìí?')).toBe(false)
    expect(readsAsEnglish('Nawa ne kudin wannan riga?')).toBe(false)
  })
})
