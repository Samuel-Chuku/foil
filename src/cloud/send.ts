import {
  getGenerativeModel,
  InferenceMode,
  type GenerationConfig,
  type GenerativeModel,
  type Tool,
} from 'firebase/ai'
import { timed, type Source } from '../ai/run'
import { appConfig } from '../config/active'
import { ai } from '../firebase'
import { partsOf, type Approved } from './approval'
import { errorMessage } from './errors'
import { isOnline } from '../ui/network'

// Cloud-only jobs (voice notes, the books chat, other languages, Maps) never
// rely on automatic fallback, so each uses an explicit cloud-only instance,
// made on first use after Remote Config has named the model.
export function cloudModel(
  config?: GenerationConfig,
  tools?: Tool[],
): () => GenerativeModel {
  let model: GenerativeModel | undefined
  return () => {
    model ??= getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: appConfig().cloudModel,
        ...(config && { generationConfig: config }),
        ...(tools && { tools }),
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

// Cloud failures in plain words; see errors.ts.
export const cloudErrorText = (e: unknown): string =>
  errorMessage(e, isOnline())
