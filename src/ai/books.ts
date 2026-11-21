import type { ChatSession } from 'firebase/ai'
import type { Approved, CloudRequest } from '../cloud/approval'
import { cloudModel, sendInChat } from '../cloud/send'
import { BOOKS_INSTRUCTIONS } from '../ledger/dayBooks'
import type { Reading } from './run'

// Multi-turn chat is cloud only on the web, so the books chat never relies
// on fallback. It is given the day's totals and the vendor's questions.
const model = cloudModel()

export function booksChat(): ChatSession {
  return model().startChat()
}

export function booksRequest(
  totals: string,
  question: string,
  replaced: string[],
): CloudRequest {
  return {
    feature: 'Ask about your books',
    reason:
      'Chat answers come from the cloud model; the computer cannot hold a conversation yet. Only totals and order numbers are sent, never who paid.',
    texts: [BOOKS_INSTRUCTIONS, totals, `Question: ${question}`],
    replaced,
  }
}

// A later question in the same chat: the totals were sent with the first.
export function followUpRequest(
  question: string,
  replaced: string[],
): CloudRequest {
  return {
    feature: 'Ask about your books',
    reason: 'This question joins the chat about the totals you already sent.',
    texts: [`Question: ${question}`],
    replaced,
  }
}

export async function askBooks(
  chat: ChatSession,
  approved: Approved,
): Promise<Reading<string>> {
  const { text, source, ms } = await sendInChat(chat, approved)
  return { fields: text.trim(), source, ms }
}
