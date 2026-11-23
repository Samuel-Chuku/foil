import { shopWords } from '../config/marketWords'
import { CHART_IDS } from './charts'
import type { Exchange } from './snapshot'
import { toolMenu, TOOL_NAMES, type ToolResult } from './tools'

// The prompts and checks around Ask the desk's tools, kept free of Firebase
// so they can be tested. See ai/deskTools.ts for the calls.

export function toolInstructions(): string {
  const w = shopWords()
  return `You are the assistant for ${w.shop}. Answer the owner's questions about their business. Use the tools to look facts up before you answer, and answer only from what they return: never guess an order number, an amount or a count. Write short, plain, practical ${w.language}, with ${w.money}, and refer to orders by number, copied exactly. Write plain text with no markdown, asterisks or bullet symbols; when you list orders, put each on its own line with its items and where it goes. An order is ready to send only once it is paid; an unpaid order is waiting for payment, not for sending. When an action would help, use a suggest_ tool so the owner gets a button: for paid orders waiting to go out, suggest marking each out for delivery; for an unpaid order the owner asks about, suggest opening its chat. Never say you have done something yourself; say the button is below. Use show_chart when a picture helps. You do not know customers' names, phone numbers or addresses; if a question needs them, say those details stay on the shop's computer. Never call a payment or a customer fake or a fraud. Do not give financial, tax, loan or investment advice.`
}

// On this computer: first pick at most two tools, then answer from them.
export const ROUTE_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        properties: {
          tool: { type: 'string', enum: TOOL_NAMES },
          which: {
            type: 'string',
            enum: ['unpaid', 'to_send', 'on_the_way', 'all_open', ''],
          },
          number: { type: 'string' },
          product: { type: 'string' },
          chart: { type: 'string', enum: [...CHART_IDS, ''] },
          step: { type: 'string', enum: ['out', 'delivered', 'collected', ''] },
        },
        required: ['tool', 'which', 'number', 'product', 'chart', 'step'],
        additionalProperties: false,
      },
    },
  },
  required: ['picks'],
  additionalProperties: false,
}

type Pick = { tool: string; args: Record<string, string> }

// The router's JSON is untrusted: keep known tools, at most two, no repeats.
export function readPicks(json: unknown): Pick[] {
  const raw = (json as { picks?: unknown } | null)?.picks
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.slice(0, 2).flatMap((p: unknown) => {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
    const tool = typeof o.tool === 'string' ? o.tool : ''
    if (!TOOL_NAMES.includes(tool)) return []
    const args = Object.fromEntries(
      ['which', 'number', 'product', 'chart', 'step'].flatMap((k) =>
        typeof o[k] === 'string' && o[k] ? [[k, o[k] as string]] : [],
      ),
    )
    const key = `${tool}:${JSON.stringify(args)}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ tool, args }]
  })
}

export function routePrompt(question: string, history: Exchange[]): string {
  const recent = history
    .slice(-2)
    .map((e) => `Owner asked: ${e.question}\nYou answered: ${e.answer}`)
    .join('\n')
  return [
    "You choose which of the shop desk's tools to run to answer the owner. Pick one or two. Fill only the arguments the tool takes; leave the rest empty.",
    `Tools:\n${toolMenu()}`,
    ...(recent ? [`Earlier:\n${recent}`] : []),
    `Question: ${question}`,
  ].join('\n\n')
}

export function deviceAnswerPrompt(
  question: string,
  quick: string[],
  results: ToolResult[],
  history: Exchange[],
): string {
  const recent = history
    .slice(-2)
    .map((e) => `Owner asked: ${e.question}\nYou answered: ${e.answer}`)
    .join('\n')
  return [
    toolInstructions(),
    `Quick answers, worked out from the records and correct:\n${quick.join('\n')}`,
    ...results.map((r) => `${r.step}:\n${r.text}`),
    ...(recent ? [`Earlier:\n${recent}`] : []),
    `Question: ${question}\nAnswer in "answer"; name a chart in "chart" only if one helps, otherwise "none".`,
  ].join('\n\n')
}
