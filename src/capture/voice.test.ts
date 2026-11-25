import { describe, expect, it } from 'vitest'
import { toOrderFields } from './orderFields'
import {
  checkStreet,
  clarifyLine,
  numbersIn,
  pickVoice,
  voiceLine,
  voicePrompt,
} from './voice'

describe('voice note', () => {
  it('keeps the order, never a price, and flags what was unclear', () => {
    const note = pickVoice({
      items: [
        { name: 'ankara gown', quantity: '1', unsure: '' },
        { name: 'headwrap', quantity: 'two', unsure: 'yes' },
        { name: '', quantity: '3' },
      ],
      address: '4 Bode Thomas Street',
      area: 'Surulere',
      question: 'What is the total?',
      gloss:
        'Wants an ankara gown and maybe two headwraps, delivered to Surulere.',
      language: 'English',
      unsure: ['quantity', 'not-a-field', 'park', 'question'],
      total: '₦20,000',
      extra: 'ignored',
    })
    expect(note.order.items).toEqual([
      { name: 'ankara gown', quantity: '1', price: '' },
      { name: 'headwrap', quantity: 'two', price: '' },
    ])
    expect(note.order.total).toBe('')
    expect(note.unsure).toEqual(['quantity', 'headwrap'])
    expect(note.order.customerName).toBe('')
    expect(toOrderFields(note.order).items.map((i) => i.qty)).toEqual([1, 2])
    const ask = clarifyLine(note)!
    expect(ask).toContain('how many headwrap they want')
    expect(ask).toContain('how many of each item')
    expect(ask).toContain('Do not state a number for headwrap')
    expect(ask).toContain('Do not ask them to repeat')
  })

  it('takes the name they give and words the note for the draft', () => {
    const note = pickVoice({
      customerName: 'Chioma',
      gloss: 'Wants white sneakers in size 39, picking up around 6 pm.',
      question: 'Is that okay?',
    })
    expect(note.order.customerName).toBe('Chioma')
    expect(voiceLine(note)).toBe(
      '[voice note, summed up by the desk: Wants white sneakers in size 39, picking up around 6 pm. They asked: Is that okay?]',
    )
  })

  it('survives a malformed answer', () => {
    const note = pickVoice('nonsense')
    expect(note.order.items).toEqual([])
    expect(note.unsure).toEqual([])
    expect(clarifyLine(note)).toBeNull()
  })

  it('carries the shop vocabulary and no customer data', () => {
    const p = voicePrompt({
      glossary: { abeg: 'please' },
      areas: ['Yaba', 'Surulere'],
      streets: ['Bode Thomas Street'],
      products: ['plain black cap'],
    })
    expect(p).toContain('abeg = please')
    expect(p).toContain('Yaba, Surulere')
    expect(p).toContain('plain black cap')
    expect(p).toContain('Lagos streets: Bode Thomas Street')
    expect(p).toMatch(/not write out what was said word for word/)
  })
})

describe('checkStreet', () => {
  const streets = ['Bode Thomas Street', 'Admiralty Way', 'Allen Avenue']

  it('corrects a near-certain spelling of a known street', () => {
    expect(checkStreet('4 Bode Tomas Street, Surulere', streets)).toEqual({
      address: '4 Bode Thomas Street, Surulere',
      street: null,
    })
  })

  it('offers a close known street for the vendor to confirm', () => {
    expect(checkStreet('2 Admiral Way', streets).street).toEqual({
      heard: 'Admiral Way',
      suggestion: 'Admiralty Way',
    })
  })

  it('marks a street it cannot vouch for, without guessing', () => {
    expect(checkStreet('4 Potiskum Street, Surulere', streets).street).toEqual({
      heard: 'Potiskum Street',
      suggestion: null,
    })
  })

  it('leaves a bare area or landmark alone', () => {
    expect(checkStreet('Surulere', streets).street).toBeNull()
    expect(checkStreet('', streets).street).toBeNull()
  })

  it('makes an unknown street unclear, and the draft confirms it by name', () => {
    const note = pickVoice(
      {
        items: [{ name: 'Ankara gown', quantity: '1' }],
        address: '4 Potiskum Street, Surulere',
      },
      streets,
    )
    expect(note.unsure).toContain('address')
    expect(clarifyLine(note)).toContain('it sounded like "Potiskum Street"')
  })
})

describe('items checked against the customer’s own words', () => {
  it('folds a describing phrase into the item it describes', () => {
    const note = pickVoice({
      items: [
        {
          name: 'black cap',
          quantity: 'two',
          heard: 'two black caps, the plain one',
        },
        { name: 'plain cap', quantity: 'two', heard: 'the plain one' },
      ],
      area: 'Surulere',
      gloss: 'They want two black caps and two plain caps.',
    })
    expect(note.order.items).toEqual([
      { name: 'black cap', quantity: 'two', price: '' },
    ])
    expect(note.unsure).toContain('black cap')
    expect(note.gloss).toBe('They want two × black cap, for Surulere.')
    expect(clarifyLine(note)).toMatch(/which one they mean/)
  })

  it('doubts a quantity the item’s own words never said', () => {
    const note = pickVoice({
      items: [
        { name: 'headwrap', quantity: '3', heard: 'the red headwrap' },
        { name: 'gown', quantity: '1', heard: 'one ankara gown' },
      ],
    })
    expect(note.unsure).toEqual(['headwrap'])
  })

  it('doubts a quantity that disagrees with the number they said', () => {
    const note = pickVoice({
      items: [{ name: 'cap', quantity: '2', heard: 'three caps' }],
    })
    expect(note.unsure).toEqual(['cap'])
  })

  it('leaves two different things alone', () => {
    const note = pickVoice({
      items: [
        { name: 'black cap', quantity: 'two', heard: 'two black caps' },
        { name: 'headwrap', quantity: 'one', heard: 'and one headwrap' },
      ],
      gloss: 'They want two black caps and a headwrap.',
    })
    expect(note.order.items).toHaveLength(2)
    expect(note.unsure).toEqual([])
    expect(note.gloss).toBe('They want two black caps and a headwrap.')
  })

  it('folds words that point back into the item they describe', () => {
    const note = pickVoice({
      items: [
        { name: 'black cap', quantity: 'two', heard: 'two black caps' },
        { name: 'plain cap', quantity: '1', heard: 'the plain one' },
      ],
      area: 'Surulere',
    })
    expect(note.order.items).toEqual([
      { name: 'black cap (plain)', quantity: 'two', price: '' },
    ])
    expect(note.unsure).toEqual(['black cap (plain)'])
    expect(note.gloss).toBe('They want two × black cap (plain), for Surulere.')
  })

  it('treats "that one" and "the big ones" the same way', () => {
    for (const heard of ['that one', 'the big ones', 'and the same one']) {
      const note = pickVoice({
        items: [
          { name: 'gown', quantity: '1', heard: 'one ankara gown' },
          { name: 'gown', quantity: '1', heard },
        ],
      })
      expect(note.order.items).toHaveLength(1)
    }
  })

  it('keeps a new item that only sounds alike', () => {
    const note = pickVoice({
      items: [
        { name: 'black cap', quantity: 'two', heard: 'two black caps' },
        { name: 'red cap', quantity: 'three', heard: 'three red ones' },
      ],
    })
    expect(note.order.items).toHaveLength(2)
  })

  it('reads numbers as digits or words', () => {
    expect(numbersIn('2 caps and a dozen pens')).toEqual([2, 1, 12])
  })

  it('still works when the model gives no words for an item', () => {
    const note = pickVoice({
      items: [{ name: 'cap', quantity: '2' }],
    })
    expect(note.order.items).toHaveLength(1)
    expect(note.unsure).toEqual([])
  })
})
