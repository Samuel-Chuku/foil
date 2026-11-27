import {
  Schema,
  type ChatSession,
  type FunctionCall,
  type FunctionDeclarationsTool,
  type Part,
} from 'firebase/ai'
import {
  partsOf,
  redact,
  type Approved,
  type CloudRequest,
} from '../cloud/approval'
import { cloudModel } from '../cloud/send'
import type { ChartId } from '../ledger/charts'
import type { Answer } from '../ledger/report'
import { productsAsked } from '../capture/stock'
import { answerLines, stockAnswer, type Exchange } from '../ledger/snapshot'
import {
  runTool,
  TOOLS,
  withoutNotes,
  type DeskData,
  type Proposal,
  type ToolResult,
} from '../ledger/tools'
import { askOnDevice, followUpRequest } from './books'
import type { CloudPlan } from './job'
import {
  answerFromResults,
  deviceAnswerPrompt,
  thinAnswer,
  readPicks,
  ROUTE_SCHEMA,
  routePrompt,
  toolInstructions,
} from '../ledger/askRoute'
import { privateModels, TEXT_ONLY } from './device'
import { generateJson, sourceOf, type Reading, type Source } from './run'

// Ask Foil with tools. In the cloud the model calls the desk's functions
// through Firebase AI Logic's function calling; on this computer, where the
// SDK takes no tools, the model picks the lookups through structured output,
// the code runs them, and the model answers from what they returned. Either
// way every lookup runs here and is shown to the owner as a step.

export type DeskAnswer = {
  text: string
  chart: ChartId | null
  steps: { label: string; source: Source }[]
  proposals: Proposal[]
  source: Source
  ms: number
}

const declarations: FunctionDeclarationsTool = {
  functionDeclarations: TOOLS.map((t) => {
    const keys = Object.keys(t.params)
    return {
      name: t.name,
      description: t.description,
      ...(keys.length > 0 && {
        parameters: Schema.object({
          properties: Object.fromEntries(
            keys.map((k) => {
              const p = t.params[k]!
              return [
                k,
                p.enum
                  ? Schema.enumString({
                      enum: [...p.enum],
                      description: p.description,
                    })
                  : Schema.string({ description: p.description }),
              ]
            }),
          ),
          // A product name narrows the stock list; without it, the whole list.
          optionalProperties: keys.filter((k) => k === 'product'),
        }),
      }),
    }
  }),
}

const toolModel = cloudModel(undefined, [declarations])

export function toolChat(): ChatSession {
  return toolModel().startChat()
}

// The first question of a cloud chat. The owner sees the instructions, the
// question and, as what the tools may return, every lookup in full: the cloud
// is sent at most that, and only the parts it asks for.
function toolRequest(
  question: string,
  preview: string,
  replaced: string[],
  language?: string,
): CloudRequest {
  return {
    feature: 'Ask Foil',
    reason:
      'Chat answers come from the cloud model, which looks up what it needs with Foil’s tools. Your question goes now; a lookup’s result goes only if the model asks for it. Lookups hold orders by number, items, stock, money and rules, never customers’ names, phones or addresses.',
    texts: [toolInstructions(language), `Question: ${question}`],
    mayReturn: preview,
    replaced,
  }
}

// Rounds of tool calls allowed for one question, so a confused model cannot
// loop forever.
const MAX_ROUNDS = 4

const gather = (results: ToolResult[]) => ({
  chart: results.findLast((r) => r.chart)?.chart ?? null,
  // Each button once, whether the model asked for it or a list brought it.
  proposals: results
    .flatMap((r) => [...(r.proposal ? [r.proposal] : []), ...(r.buttons ?? [])])
    .filter(
      (p, i, all) =>
        all.findIndex((q) => JSON.stringify(q) === JSON.stringify(p)) === i,
    ),
})

async function askCloudWithTools(
  chat: ChatSession,
  approved: Approved,
  data: () => DeskData,
): Promise<DeskAnswer> {
  const started = performance.now()
  const results: ToolResult[] = []
  let response = (await chat.sendMessage(partsOf(approved))).response
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const calls: FunctionCall[] = response.functionCalls() ?? []
    if (calls.length === 0) break
    // Parallel calls all run, and all their results go back together.
    const replies: Part[] = calls.map((call) => {
      const r = runTool(call.name, call.args, data())
      results.push(r)
      return {
        type: 'functionResponse',
        functionResponse: {
          ...(call.id && { id: call.id }),
          name: call.name,
          response: { result: r.text },
        },
      }
    })
    response = (await chat.sendMessage(replies)).response
  }
  const source = sourceOf(response)
  return {
    text: withoutNotes(response.text()),
    ...gather(results),
    steps: results.map((r) => ({ label: r.step, source })),
    source,
    ms: Math.round(performance.now() - started),
  }
}

// A cloud question in the Ask chat. Names the vendor typed are swapped out.
// The first question of a chat shows every lookup the model may make; a
// later one the vendor typed with nothing swapped out is already on screen
// exactly as it goes, so their Ask click is the approval.
export function planCloudAsk(o: {
  typed: string
  names: string[]
  // Every lookup in full for the first question; null for a later one.
  preview: string | null
  language?: string
  session: () => ChatSession
  data: () => DeskData
}): { asked: string; plan: CloudPlan<DeskAnswer> } {
  const { text, replaced } = redact(
    o.typed,
    o.names.map((name) => ({ name, label: '(customer)' })),
  )
  return {
    asked: text,
    plan: {
      where: 'cloud',
      request:
        o.preview !== null
          ? toolRequest(text, o.preview, replaced, o.language)
          : followUpRequest(text, replaced),
      shown: o.preview === null && replaced.length === 0,
      run: (approved) => askCloudWithTools(o.session(), approved, o.data),
    },
  }
}

// More products than this and the question is a broad one, for the model.
const STOCK_ANSWER_MAX = 4

// On this computer: first pick at most two tools, then answer from them.
const routeModel = privateModels({
  createOptions: TEXT_ONLY,
  onDeviceSchema: ROUTE_SCHEMA,
})

export async function askOnDeviceWithTools(
  question: string,
  history: Exchange[],
  data: DeskData,
  // When no tool fits, the question is answered from the whole fact sheet.
  wholeSheet: () => Promise<Reading<Answer>>,
  language?: string,
): Promise<DeskAnswer> {
  const route = await generateJson(routeModel(false), [
    routePrompt(question, history),
  ])
  const picks = readPicks(route.json)
  if (picks.length === 0) {
    const read = await wholeSheet()
    return {
      text: read.fields.text,
      chart: read.fields.chart,
      proposals: [],
      steps: [{ label: 'Read the whole fact sheet', source: route.source }],
      source: read.source === 'Rules' ? 'On device' : read.source,
      ms: route.ms + read.ms,
    }
  }
  // "Is this cap still available?" is answered from the count itself: the
  // model once read "10 left" as not available.
  const asked =
    picks.length === 1 && picks[0]!.tool === 'check_stock'
      ? productsAsked(question, data.products)
      : []
  if (asked.length > 0 && asked.length <= STOCK_ANSWER_MAX) {
    return {
      text: stockAnswer(asked, data.products, data.orders),
      chart: null,
      proposals: [],
      steps: [
        { label: 'Chose what to look up', source: route.source },
        {
          label: `Checked stock for ${asked.map((p) => `"${p.name.trim()}"`).join(', ')}`,
          source: route.source,
        },
      ],
      source: route.source,
      ms: route.ms,
    }
  }
  const results = picks.map((p) => runTool(p.tool, p.args, data))
  const answer = await askOnDevice(
    deviceAnswerPrompt(
      question,
      answerLines(data.orders, data.credits, data.products),
      results,
      history,
      language,
    ),
  )
  const picked = answer.fields
  const g = gather(results)
  return {
    text: thinAnswer(picked.text)
      ? answerFromResults(results)
      : withoutNotes(picked.text),
    chart: g.chart ?? picked.chart,
    proposals: g.proposals,
    steps: [
      { label: 'Chose what to look up', source: route.source },
      ...results.map((r) => ({ label: r.step, source: route.source })),
    ],
    source: answer.source === 'Rules' ? 'On device' : answer.source,
    ms: route.ms + answer.ms,
  }
}
