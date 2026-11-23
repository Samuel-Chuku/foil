import { describe, expect, it } from 'vitest'
import { speechLangs } from './speech'

describe('speechLangs', () => {
  it('tries nearby English variants after the market’s own', () => {
    expect(speechLangs('en-NG')).toEqual(['en-NG', 'en-GB', 'en-US'])
    expect(speechLangs('en-GB')).toEqual(['en-GB', 'en-US'])
  })

  it('keeps other languages as they are', () => {
    expect(speechLangs('pt-BR')).toEqual(['pt-BR'])
  })
})
