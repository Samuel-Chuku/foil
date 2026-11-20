import { describe, expect, it } from 'vitest'
import { chatNames, placeIn, sameState, stateOf } from './places'

describe('places', () => {
  it('reads short forms people use', () => {
    expect(stateOf('Send am to Ph abeg')).toBe('Rivers')
    expect(stateOf('I dey P.H.')).toBe('Rivers')
    expect(stateOf('PHC')).toBe('Rivers')
    expect(stateOf('Abj')).toBe('FCT')
    expect(stateOf('the buj')).toBe('FCT')
    expect(stateOf('Lag')).toBe('Lagos')
    expect(stateOf('Lasgidi')).toBe('Lagos')
    expect(stateOf('I stay for Ib')).toBe('Oyo')
    expect(stateOf('KD')).toBe('Kaduna')
  })

  it('maps cities and neighbourhoods to their state', () => {
    expect(stateOf('Port Harcourt')).toBe('Rivers')
    expect(stateOf('12 Aminu Kano Crescent, Wuse 2')).toBe('FCT')
    expect(stateOf('Rumuokoro junction')).toBe('Rivers')
    expect(stateOf('Bodija, near the market')).toBe('Oyo')
    expect(stateOf('Benin City')).toBe('Edo')
    expect(stateOf('Asaba')).toBe('Delta')
    expect(stateOf('Enugu')).toBe('Enugu')
  })

  it('knows the Ogun towns people think of as Lagos', () => {
    expect(stateOf('Mowe, after Berger')).toBe('Ogun')
    expect(stateOf('Sango-Ota')).toBe('Ogun')
    expect(stateOf('Ibafo')).toBe('Ogun')
    expect(stateOf('Ojodu Berger')).toBe('Lagos')
  })

  it('skips names that are part of a street', () => {
    expect(stateOf('5 Enugu Road, Yaba')).toBe('Lagos')
    expect(stateOf('Calabar Street, Surulere')).toBe('Lagos')
  })

  it('matches whole words only', () => {
    expect(placeIn('3 Ogunlana Drive, Surulere')).toEqual({
      state: 'Lagos',
      said: 'surulere',
    })
    expect(stateOf('call my phone')).toBeNull()
    expect(stateOf('my owo don finish')).toBeNull()
    expect(stateOf('')).toBeNull()
  })

  it('compares states however they are written', () => {
    expect(sameState('Abuja', 'FCT')).toBe(true)
    expect(sameState('Port Harcourt', 'Rivers')).toBe(true)
    expect(sameState('Abuja', 'Lagos')).toBe(false)
    expect(chatNames('Rivers', 'Abeg I dey Ph')).toBe(true)
    expect(chatNames('Rivers', 'I dey Surulere')).toBe(false)
  })
})
