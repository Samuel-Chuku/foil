import { describe, expect, it } from 'vitest'
import { approve, base64Bytes, partsOf, redact, sizeText } from './approval'

describe('redact', () => {
  it('replaces names, phones, account numbers, references and emails', () => {
    const r = redact(
      'Femi Adeyemi (+234 803 123 4567, 08031234567) paid to 0123456789, ref 090405261121163012448302716594, femi@example.com. Thanks Femi.',
      [{ name: 'Femi Adeyemi', label: 'the customer' }],
    )
    expect(r.text).toBe(
      'the customer ((phone number), (phone number)) paid to (account number), ref (reference), (email). Thanks the customer.',
    )
    expect(r.replaced.sort()).toEqual(
      [
        'account numbers',
        'email addresses',
        'names',
        'phone numbers',
        'transfer references',
      ].sort(),
    )
  })

  it('leaves amounts, dates and words that only contain a name', () => {
    const r = redact('₦12,500 on 21/11/2026 for Adaeze, Adaezeh and Ada.', [
      { name: 'Ada', label: 'the customer' },
    ])
    expect(r.text).toBe(
      '₦12,500 on 21/11/2026 for Adaeze, Adaezeh and the customer.',
    )
  })

  it('reports nothing when nothing changed', () => {
    expect(redact('Two caps to Surulere.').replaced).toEqual([])
  })
})

describe('approved request', () => {
  it('sends exactly the approved texts and attachment', () => {
    const a = approve({
      feature: 'Read a voice note',
      reason: 'Audio needs the cloud.',
      texts: ['prompt'],
      attachment: {
        kind: 'audio',
        mimeType: 'audio/ogg',
        base64: 'AAAA',
        label: 'Voice note',
      },
      replaced: [],
    })
    expect(partsOf(a)).toEqual([
      'prompt',
      {
        type: 'inlineData',
        inlineData: { mimeType: 'audio/ogg', data: 'AAAA' },
      },
    ])
    expect(Object.isFrozen(a)).toBe(true)
  })

  it('sizes base64 data', () => {
    expect(base64Bytes('AAAA')).toBe(3)
    expect(base64Bytes('AA==')).toBe(1)
    expect(sizeText(2048)).toBe('2 KB')
    expect(sizeText(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
