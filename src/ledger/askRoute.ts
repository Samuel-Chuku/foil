import { shopWords } from '../config/marketWords'
import { CHART_IDS } from './charts'
import { DEVICE_ASK_MAX_CHARS, type Exchange } from './snapshot'
import { toolMenu, TOOL_NAMES, withoutNotes, type ToolResult } from './tools'

// The prompts and checks around Ask Foil's tools, kept free of Firebase
// so they can be tested. See ai/deskTools.ts for the calls.

// `language` is the answer language the owner chose, as prompts name it.
export function toolInstructions(language?: string): string {
  const w = shopWords()
  return `You are the assistant for ${w.shop}. Answer the owner's questions about their business. Use the tools to look facts up before you answer, and answer only from what they return: never guess an order number, an amount or a count. Write short, plain, practical ${language ?? w.language}, with ${w.money}, and refer to orders by number, copied exactly. Write plain text with no markdown, asterisks or bullet symbols; when you list orders, put each on its own line with its items and where it goes. An order is ready to send only once it is paid; an unpaid order is waiting for payment, not for sending. When an action would help, use a suggest_ tool so the owner gets a button, for example to open an unpaid order's chat. Lists of orders to send or on the way already come with their buttons. Mention a button only when a tool result says one is shown, and never say you have done something yourself. Use show_chart when a picture helps. You do not know customers' names, phone numbers or addresses; if a question needs them, say those details stay on the shop's computer. Never call a payment or a customer fake or a fraud. Do not give financial, tax, loan or investment advice.`
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
          area: { type: 'string' },
        },
        required: [
          'tool',
          'which',
          'number',
          'product',
          'chart',
          'step',
          'area',
        ],
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
      ['which', 'number', 'product', 'chart', 'step', 'area'].flatMap((k) =>
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
  language?: string,
): string {
  const recent = history
    .slice(-2)
    .map((e) => `Owner asked: ${e.question}\nYou answered: ${e.answer}`)
    .join('\n')
  const head = [
    toolInstructions(language),
    `Quick answers, worked out from the records and correct:\n${quick.join('\n')}`,
  ]
  const tail = [
    ...(recent ? [`Earlier:\n${recent}`] : []),
    `Question: ${question}\nIn "answer", reply to the owner in one or more full sentences, even when the answer is that there are none. In "chart", name a chart only if one helps, otherwise "none".`,
  ]
  // The lookups share what room is left, so a long one, such as the whole
  // stock list, cannot push the request past the device's limit.
  const fixed = [...head, ...tail].join('\n\n').length
  const share = Math.floor(
    (DEVICE_ASK_MAX_CHARS - fixed) / Math.max(1, results.length),
  )
  return [
    ...head,
    ...results.map((r) => fitLines(`${r.step}:\n${r.text}`, share)),
    ...tail,
  ].join('\n\n')
}

// Whole lines up to `max` characters. A list cut short says so, so the model
// never presents part of it as all of it.
export function fitLines(text: string, max: number): string {
  if (text.length <= max) return text
  const lines = text.split('\n')
  const kept: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length + 1 > max - 80) break
    kept.push(line)
    used += line.length + 1
  }
  const left = lines.length - kept.length
  return `${kept.join('\n')}\n(${left} more line${left === 1 ? '' : 's'} not shown. Say the list is longer than shown here.)`
}

// An answer too thin to read, such as "none" or "0", which a small model
// sometimes gives for an empty lookup.
export function thinAnswer(text: string): boolean {
  const t = text.trim()
  return (
    /^(none|nothing|n\/?a|null|no|0|-)?\.?$/i.test(t) ||
    t.split(/\s+/).length < 3
  )
}

// The lookups' own words, which are already sentences, in place of a thin
// answer.
export function answerFromResults(results: ToolResult[]): string {
  return results
    .map((r) => withoutNotes(r.text))
    .filter(Boolean)
    .join('\n')
}
