import { Schema, type ChatSession } from 'firebase/ai'
import type { Approved, CloudRequest } from '../cloud/approval'
import { cloudModel, sendInChat } from '../cloud/send'
import { CHART_IDS, chartMenu } from '../ledger/charts'
import { BOOKS_INSTRUCTIONS } from '../ledger/dayBooks'
import { pickAnswer, type Answer } from '../ledger/report'
import type { Reading } from './run'

// Multi-turn chat is cloud only on the web, so the books chat never relies
// on fallback. Each reply is the words plus at most one of the desk's charts,
// named by id, so a chart's numbers always come from the device.
const model = cloudModel({
  responseMimeType: 'application/json',
  responseSchema: Schema.object({
    properties: {
      answer: Schema.string(),
      chart: Schema.enumString({ enum: [...CHART_IDS, 'none'] }),
    },
  }),
})

export function booksChat(): ChatSession {
  return model().startChat()
}

export function booksRequest(
  books: string,
  trends: string,
  question: string,
  replaced: string[],
): CloudRequest {
  return {
    feature: 'Ask about your books',
    reason:
      'Chat answers come from the cloud model; the computer cannot hold a conversation yet. Only totals and order numbers are sent, never who paid.',
    texts: [
      BOOKS_INSTRUCTIONS,
      chartMenu(),
      books,
      trends,
      `Question: ${question}`,
    ],
    replaced,
  }
}

// A later question in the same chat: the books were sent with the first.
export function followUpRequest(
  question: string,
  replaced: string[],
): CloudRequest {
  return {
    feature: 'Ask about your books',
    reason: 'This question joins the chat about the books you already sent.',
    texts: [`Question: ${question}`],
    replaced,
  }
}

export async function askBooks(
  chat: ChatSession,
  approved: Approved,
): Promise<Reading<Answer>> {
  const { text, source, ms } = await sendInChat(chat, approved)
  return { fields: pickAnswer(JSON.parse(text) as unknown), source, ms }
}
