import { describe, expect, it } from 'vitest'
import { MARKETS } from './market'
import {
  answerLanguage,
  answerLanguages,
  pickVoice,
  speakable,
  speechLangs,
} from './speech'

describe('speechLangs', () => {
  it('tries nearby English variants after the market’s own', () => {
    expect(speechLangs('en-NG')).toEqual(['en-NG', 'en-GB', 'en-US'])
    expect(speechLangs('en-GB')).toEqual(['en-GB', 'en-US'])
  })

  it('keeps other languages as they are', () => {
    expect(speechLangs('pt-BR')).toEqual(['pt-BR'])
  })
})

describe('answer languages', () => {
  it('answers Lagos in English or Pidgin on the device, the rest in the cloud', () => {
    const all = answerLanguages(MARKETS.ng)
    expect(all.filter((l) => l.onDevice).map((l) => l.id)).toEqual([
      'english',
      'pidgin',
    ])
    expect(answerLanguage(MARKETS.ng, '').id).toBe('english')
    expect(answerLanguage(MARKETS.ng, 'yoruba').onDevice).toBe(false)
    // A choice from another market falls back to this market's own.
    expect(answerLanguage(MARKETS.br, 'pidgin').id).toBe('portuguese')
  })
})

describe('speakable', () => {
  it('says amounts and order numbers the way people do', () => {
    expect(speakable('Order #77 is ₦9,500, paid.', MARKETS.ng)).toBe(
      'Order 77 is 9,500 naira, paid.',
    )
    expect(speakable('Total R$ 150,00', MARKETS.br)).toBe('Total 150,00 reais')
    expect(speakable('* #81 waiting', MARKETS.ng)).toBe('order 81 waiting')
  })
})

describe('pickVoice', () => {
  const voices = [
    { name: 'Remote UK', lang: 'en-GB', localService: false },
    { name: 'Local UK', lang: 'en-GB', localService: true },
    { name: 'Nigeria', lang: 'en-NG', localService: false },
  ]
  it('keeps the vendor’s pick, else the exact language, else the same language', () => {
    expect(pickVoice(voices, 'en-NG', 'Remote UK')?.name).toBe('Remote UK')
    expect(pickVoice(voices, 'en-NG', '')?.name).toBe('Nigeria')
    expect(pickVoice(voices, 'en-US', '')?.name).toBe('Local UK')
  })
  it('finds none rather than the wrong language', () => {
    expect(pickVoice(voices, 'yo-NG', '')).toBeNull()
  })
})
