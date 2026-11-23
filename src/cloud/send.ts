import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type GenerateContentResult,
  type GenerationConfig,
  type GenerativeModel,
} from 'firebase/ai'
import type { Source } from '../ai/run'
import { appConfig } from '../config/active'
import { ai } from '../firebase'
import { partsOf, type Approved } from './approval'
import { errorMessage } from './errors'

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
export function sendApproved(
  model: GenerativeModel,
  request: Approved,
): Promise<{ text: string; source: Source; ms: number }> {
  return timed(() => model.generateContent(partsOf(request)))
}

async function timed(
  call: () => Promise<GenerateContentResult>,
): Promise<{ text: string; source: Source; ms: number }> {
  const started = performance.now()
  const result = await call()
  return {
    text: result.response.text(),
    source:
      result.response.inferenceSource === InferenceSource.ON_DEVICE
        ? 'On device'
        : 'Cloud',
    ms: Math.round(performance.now() - started),
  }
}

// Cloud failures in plain words; see errors.ts.
export const cloudErrorText = (e: unknown): string =>
  errorMessage(e, navigator.onLine)
