import type { PanelRequest } from './host'

// What the floating desk offers for the open chat. The extension draws it on
// WhatsApp Web and the demo draws it in its simulated chat, so the two menus
// list the same actions with the same words and the same marks for where each
// one runs. Kept free of React and the DOM: the WhatsApp content script
// imports it.

export type Where = 'device' | 'cloud'

export const WHERE_SAID: Record<Where, string> = {
  device: 'on this computer',
  cloud: "in Google's cloud, after you approve",
}

export const whereSaid = (where: Where[]): string =>
  `Runs ${where.map((w) => WHERE_SAID[w]).join(' or ')}`

export type DeskAction =
  | { kind: 'verify'; messageId: string }
  | { kind: 'voice'; messageId: string }
  | { kind: 'capture' }
  | { kind: 'draft' }
  | { kind: 'translate' }
  | { kind: 'ask' }

export type DeskIcon = 'receipt' | 'bag' | 'mic' | 'reply' | 'globe' | 'spark'

export type DeskItem = {
  icon: DeskIcon
  label: string
  sub: string
  where: Where[]
  action: DeskAction
}

// What the open chat holds that the desk can act on.
export type DeskChat = {
  receipts: { id: string; time: string }[]
  // `played`: the note the vendor last pressed play on, whose sound the
  // desk can read.
  voiceNotes: { id: string; time: string; played?: boolean }[]
}

const ask: DeskItem = {
  icon: 'spark',
  label: 'Ask Foil',
  sub: 'About orders, stock or money',
  where: ['device', 'cloud'],
  action: { kind: 'ask' },
}

// `replyOnDevice`: whether this shop's market writes replies on this
// computer; other languages are written in the cloud.
export function deskActions(
  chat: DeskChat | null,
  opts: { replyOnDevice: boolean },
): DeskItem[] {
  if (!chat) return [ask]
  const receipts = chat.receipts
    .slice(-2)
    .reverse()
    .map((r): DeskItem => ({
      icon: 'receipt',
      label: 'Verify the payment',
      sub: `Picture at ${r.time || 'the end'}`,
      where: ['device'],
      action: { kind: 'verify', messageId: r.id },
    }))
  // The note just played, which the desk can hear; else the newest, with a
  // reminder to play it first.
  const played = chat.voiceNotes.find((v) => v.played)
  const note = played ?? chat.voiceNotes.at(-1)
  const voice: DeskItem[] = note
    ? [
        {
          icon: 'mic',
          label: 'Read the voice note',
          sub: played
            ? `The one you played, from ${note.time || 'this chat'}`
            : `Play it first. Newest is from ${note.time || 'this chat'}`,
          where: ['cloud'],
          action: { kind: 'voice', messageId: note.id },
        },
      ]
    : []
  return [
    ...receipts,
    {
      icon: 'bag',
      label: 'Capture the order',
      sub: 'Items, delivery and amount',
      where: ['device'],
      action: { kind: 'capture' },
    },
    ...voice,
    {
      icon: 'reply',
      label: 'Draft a reply',
      sub: 'Placed in the box, never sent',
      where: [opts.replyOnDevice ? 'device' : 'cloud'],
      action: { kind: 'draft' },
    },
    {
      icon: 'globe',
      label: 'Translate their messages',
      sub: 'Their latest messages, into English',
      where: ['device', 'cloud'],
      action: { kind: 'translate' },
    },
    ask,
  ]
}

// The panel's request for an action. Each click carries a new nonce so the
// same request is never run twice.
export function toPanelRequest(a: DeskAction, nonce: number): PanelRequest {
  return a.kind === 'verify' || a.kind === 'voice'
    ? { action: a.kind, messageId: a.messageId, nonce }
    : { action: a.kind, nonce }
}

// An action that reads the chat's messages, as the content script sends it
// to the panel with the chat. Asking needs no chat, so it travels apart.
export type ChatAction = Exclude<DeskAction, { kind: 'ask' }>

export function chatAction(
  kind: ChatAction['kind'],
  messageId?: string,
): ChatAction | null {
  if (kind === 'verify' || kind === 'voice') {
    return messageId ? { kind, messageId } : null
  }
  return { kind }
}
