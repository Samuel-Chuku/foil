import {
  getGenerativeModel,
  InferenceMode,
  Schema,
  type ChatSession,
  type FunctionCall,
  type FunctionDeclarationsTool,
  type GenerativeModel,
  type Part,
} from 'firebase/ai'
import { partsOf, type Approved, type CloudRequest } from '../cloud/approval'
import { appConfig } from '../config/active'
import { ai } from '../firebase'
import type { ChartId } from '../ledger/charts'
import type { Answer } from '../ledger/report'
import { answerLines, type Exchange } from '../ledger/snapshot'
import {
  runTool,
  TOOLS,
  type DeskData,
  type Proposal,
  type ToolResult,
} from '../ledger/tools'
import { askOnDevice } from './books'
import {
  deviceAnswerPrompt,
  readPicks,
  ROUTE_SCHEMA,
  routePrompt,
  toolInstructions,
} from '../ledger/askRoute'
import { privateModels, TEXT_ONLY } from './device'
import { generateJson, type Reading, type Source } from './run'

// Ask the desk with tools. In the cloud the model calls the desk's functions
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

let cloud: GenerativeModel | undefined
const toolModel = () =>
  (cloud ??= getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: appConfig().cloudModel,
      tools: [declarations],
    },
  }))

export function toolChat(): ChatSession {
  return toolModel().startChat()
}

// The first question of a cloud chat. The owner sees the instructions, the
// question and, as what the tools may return, every lookup in full: the cloud
// is sent at most that, and only the parts it asks for.
export function toolRequest(
  question: string,
  preview: string,
  replaced: string[],
): CloudRequest {
  return {
    feature: 'Ask the desk',
    reason:
      'Chat answers come from the cloud model, which looks up what it needs with the desk’s tools. Your question goes now; a lookup’s result goes only if the model asks for it. Lookups hold orders by number, items, stock, money and rules, never customers’ names, phones or addresses.',
    texts: [toolInstructions(), `Question: ${question}`],
    mayReturn: preview,
    replaced,
  }
}

// Rounds of tool calls allowed for one question, so a confused model cannot
// loop forever.
const MAX_ROUNDS = 4

const gather = (results: ToolResult[]) => ({
  chart: results.findLast((r) => r.chart)?.chart ?? null,
  proposals: results.flatMap((r) => (r.proposal ? [r.proposal] : [])),
})

export async function askCloudWithTools(
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
  return {
    text: response.text(),
    ...gather(results),
    steps: results.map((r) => ({ label: r.step, source: 'Cloud' as const })),
    source: 'Cloud',
    ms: Math.round(performance.now() - started),
  }
}

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
  const results = picks.map((p) => runTool(p.tool, p.args, data))
  const answer = await askOnDevice(
    deviceAnswerPrompt(
      question,
      answerLines(data.orders, data.credits, data.products),
      results,
      history,
    ),
  )
  const picked = answer.fields
  const g = gather(results)
  return {
    text: picked.text,
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
