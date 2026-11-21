import { describe, expect, it } from 'vitest'
import { toOrderFields } from './orderFields'
import { clarifyLine, pickVoice, voiceLine, voicePrompt } from './voice'

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
      '[voice note: Wants white sneakers in size 39, picking up around 6 pm. They asked: Is that okay?]',
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
