import { describe, expect, it } from 'vitest'
import { phoneFromText, sentByVendor, timeFrom } from './waParse'

describe('phoneFromText', () => {
  it('reads a number from the message box label', () => {
    expect(phoneFromText('Type a message to +234 800 000 0011')).toBe(
      '+2348000000011',
    )
    expect(phoneFromText('Type a message to +2348000000011')).toBe(
      '+2348000000011',
    )
  })

  it('is null for a saved name', () => {
    expect(phoneFromText('Type a message to Tola')).toBeNull()
    expect(phoneFromText(null)).toBeNull()
  })
})

describe('timeFrom', () => {
  it('reads 24-hour and am/pm times', () => {
    expect(timeFrom('17:58')).toBe('17:58')
    expect(timeFrom('5:58 pm')).toBe('17:58')
    expect(timeFrom('12:05 AM')).toBe('00:05')
    expect(timeFrom('edited 9:03')).toBe('09:03')
    expect(timeFrom('')).toBe('')
  })
})

describe('sentByVendor', () => {
  it('knows the vendor by the "You:" label', () => {
    expect(sentByVendor('You:')).toBe(true)
    expect(sentByVendor('Tola:')).toBe(false)
    expect(sentByVendor(null)).toBe(false)
  })
})
