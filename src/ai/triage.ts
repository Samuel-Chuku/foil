import { Schema, type GenerativeModel } from 'firebase/ai'
import type { MessageLabel } from '../ledger/types'
import {
  BATCH,
  parseTriage,
  triagePattern,
  triagePrompt,
} from '../queue/triage'
import { privateModels, TEXT_ONLY } from './device'
import { generateText, type Source } from './run'

// One model per batch size: the on-device constraint fixes how many numbers
// the answer has. The regex is passed to Chrome as-is through promptOptions
// (see local notes); the cloud path, used only with consent, answers JSON.
const models = new Map<number, (consent: boolean) => GenerativeModel>()

function modelFor(n: number) {
  let m = models.get(n)
  if (!m) {
    m = privateModels({
      createOptions: TEXT_ONLY,
      onDeviceSchema: triagePattern(n),
      cloudConfig: {
        responseMimeType: 'application/json',
        responseSchema: Schema.array({
          items: Schema.enumString({ enum: ['O', 'P', 'Q', 'C', 'X'] }),
        }),
      },
    })
    models.set(n, m)
  }
  return m
}

export type TriageResult = {
  labels: (MessageLabel | null)[]
  source: Source | null
  ms: number
}

// Labels each text, in batches. A batch whose answer cannot be read leaves
// its texts unlabelled rather than guessing.
export async function triage(
  texts: string[],
  cloudConsent: boolean,
): Promise<TriageResult> {
  const labels: (MessageLabel | null)[] = []
  let source: Source | null = null
  let ms = 0
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const r = await generateText(modelFor(batch.length)(cloudConsent), [
      triagePrompt(batch),
    ])
    source ??= r.source
    ms += r.ms
    const parsed = parseTriage(r.text, batch.length)
    labels.push(...(parsed ?? batch.map(() => null)))
  }
  return { labels, source, ms }
}
