import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type GenerationConfig,
  type GenerativeModel,
} from 'firebase/ai'
import type { Source } from '../ai/run'
import { appConfig } from '../config/active'
import { ai } from '../firebase'
import { partsOf, type Approved } from './approval'

// Cloud-only jobs (voice notes, the books chat, other languages, Maps) never
// rely on automatic fallback, so each uses an explicit cloud-only instance,
// made on first use after Remote Config has named the model.
export function cloudModel(config?: GenerationConfig): () => GenerativeModel {
  let model: GenerativeModel | undefined
  return () => {
    model ??= getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: appConfig().cloudModel,
        ...(config && { generationConfig: config }),
      },
    })
    return model
  }
}

// Cloud calls do not wait behind the on-device queue: they use no GPU.
export async function sendApproved(
  model: GenerativeModel,
  request: Approved,
): Promise<{ text: string; source: Source; ms: number }> {
  const started = performance.now()
  const result = await model.generateContent(partsOf(request))
  return {
    text: result.response.text(),
    source:
      result.response.inferenceSource === InferenceSource.ON_DEVICE
        ? 'On device'
        : 'Cloud',
    ms: Math.round(performance.now() - started),
  }
}

// Plain words for the failures a free-tier cloud call meets.
export function cloudErrorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (!navigator.onLine) return 'You are offline. Nothing was sent.'
  if (/429|quota|resource.?exhausted/i.test(raw)) {
    return 'The free cloud allowance is used up for now. Try again in a minute; everything on this computer still works.'
  }
  if (/403|app.?check|permission/i.test(raw)) {
    return 'The cloud refused this app. Reload the panel and try again.'
  }
  if (/413|too large|size/i.test(raw)) {
    return 'That file is too large to send. Try a shorter one.'
  }
  if (/safety|blocked/i.test(raw)) {
    return 'The cloud declined to answer this one.'
  }
  return 'The cloud request did not go through. Try again.'
}
