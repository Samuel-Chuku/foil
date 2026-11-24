import { describe, expect, it } from 'vitest'
import {
  chatAction,
  deskActions,
  toPanelRequest,
  type DeskChat,
} from './deskActions'

const chat: DeskChat = {
  receipts: [
    { id: 'r1', time: '09:00' },
    { id: 'r2', time: '09:05' },
    { id: 'r3', time: '09:10' },
  ],
  voiceNotes: [
    { id: 'v1', time: '08:00' },
    { id: 'v2', time: '08:30' },
  ],
}

const kinds = (items: ReturnType<typeof deskActions>) =>
  items.map((i) => i.action.kind)

describe('deskActions', () => {
  it('offers only Ask Foil when no chat is open', () => {
    expect(kinds(deskActions(null, { replyOnDevice: true }))).toEqual(['ask'])
  })

  it('lists the two newest receipts first, newest on top', () => {
    const items = deskActions(chat, { replyOnDevice: true })
    expect(items.slice(0, 2).map((i) => i.action)).toEqual([
      { kind: 'verify', messageId: 'r3' },
      { kind: 'verify', messageId: 'r2' },
    ])
    expect(kinds(items).slice(2)).toEqual([
      'capture',
      'voice',
      'draft',
      'translate',
      'ask',
    ])
  })

  it('marks the draft where the market writes replies', () => {
    const draft = (replyOnDevice: boolean) =>
      deskActions(chat, { replyOnDevice }).find(
        (i) => i.action.kind === 'draft',
      )?.where
    expect(draft(true)).toEqual(['device'])
    expect(draft(false)).toEqual(['cloud'])
  })

  it('reads the note the vendor played, else asks them to play the newest', () => {
    const voice = (c: DeskChat) =>
      deskActions(c, { replyOnDevice: true }).find(
        (i) => i.action.kind === 'voice',
      )
    const newest = voice(chat)
    expect(newest?.action).toEqual({ kind: 'voice', messageId: 'v2' })
    expect(newest?.sub).toMatch(/^Play it first/)
    const played = voice({
      ...chat,
      voiceNotes: [
        { id: 'v1', time: '08:00', played: true },
        chat.voiceNotes[1]!,
      ],
    })
    expect(played?.action).toEqual({ kind: 'voice', messageId: 'v1' })
    expect(played?.where).toEqual(['cloud'])
  })

  it('leaves out the voice item when the chat has no notes', () => {
    const items = deskActions(
      { ...chat, voiceNotes: [] },
      { replyOnDevice: true },
    )
    expect(kinds(items)).not.toContain('voice')
  })
})

describe('requests', () => {
  it('carry the message id only for receipts and notes', () => {
    expect(toPanelRequest({ kind: 'verify', messageId: 'r1' }, 7)).toEqual({
      action: 'verify',
      messageId: 'r1',
      nonce: 7,
    })
    expect(toPanelRequest({ kind: 'draft' }, 8)).toEqual({
      action: 'draft',
      nonce: 8,
    })
  })

  it('rebuild a chat action from the bridge, refusing a missing id', () => {
    expect(chatAction('voice', 'v1')).toEqual({
      kind: 'voice',
      messageId: 'v1',
    })
    expect(chatAction('verify')).toBeNull()
    expect(chatAction('translate')).toEqual({ kind: 'translate' })
  })
})
