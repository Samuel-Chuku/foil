import { describe, expect, it } from 'vitest'
import { MARKETS } from './market'
import {
  answerLanguage,
  answerLanguages,
  pickVoice,
  voicesFor,
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
  it('keeps the vendor’s pick, else one on this computer, else online', () => {
    expect(pickVoice(voices, 'en-NG', 'Remote UK')?.name).toBe('Remote UK')
    expect(pickVoice(voices, 'en-NG', '')?.name).toBe('Local UK')
    expect(
      pickVoice(voices.slice(0, 1).concat(voices[2]!), 'en-NG', '')?.name,
    ).toBe('Nigeria')
  })
  it('keeps this computer’s voices that give no language, for English only', () => {
    const linux = [
      { name: 'English (Great Britain)', lang: '', localService: true },
      { name: 'Google US English', lang: 'en-US', localService: false },
    ]
    expect(pickVoice(linux, 'en-NG', '')?.name).toBe('English (Great Britain)')
    expect(voicesFor(linux, 'en-NG').local).toHaveLength(1)
    expect(voicesFor(linux, 'yo-NG').local).toHaveLength(0)
  })
  it('prefers a natural voice on this computer to a basic one', () => {
    const linux = [
      { name: 'eSpeak English', lang: 'en-GB', localService: true },
      { name: 'Piper Alba', lang: 'en-GB', localService: true },
      { name: 'Google UK English Female', lang: 'en-GB', localService: false },
    ]
    expect(pickVoice(linux, 'en-GB', '')?.name).toBe('Piper Alba')
    expect(pickVoice(linux.slice(0, 1), 'en-GB', '')?.name).toBe(
      'eSpeak English',
    )
  })
  it('finds none rather than the wrong language', () => {
    expect(pickVoice(voices, 'yo-NG', '')).toBeNull()
  })
})
