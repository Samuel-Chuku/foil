import type { CloudRequest } from '../cloud/approval'
import { CHART_IDS } from '../ledger/charts'
import { pickAnswer, type Answer } from '../ledger/report'
import { privateModels, TEXT_ONLY } from './device'
import { generateJson, type Reading } from './run'

// A later question in the same chat. The lookups the model may make were
// shown with the first question.
export function followUpRequest(
  question: string,
  replaced: string[],
): CloudRequest {
  return {
    feature: 'Ask Foil',
    reason:
      'This question joins the chat. The model can still look up only what you saw with your first question.',
    texts: [`Question: ${question}`],
    replaced,
  }
}

// With Chrome's model ready, a question is answered on this computer and
// nothing is sent: one self-contained request (see deviceAskPrompt), held to
// the same answer-and-chart shape as the cloud chat.
const deviceModel = privateModels({
  createOptions: TEXT_ONLY,
  onDeviceSchema: {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      chart: { type: 'string', enum: [...CHART_IDS, 'none'] },
    },
    required: ['answer', 'chart'],
    additionalProperties: false,
  },
})

export async function askOnDevice(prompt: string): Promise<Reading<Answer>> {
  const { json, source, ms } = await generateJson(deviceModel(false), [prompt])
  return { fields: pickAnswer(json), source, ms }
}
