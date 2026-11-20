import {
  getGenerativeModel,
  InferenceMode,
  type GenerationConfig,
  type GenerativeModel,
} from 'firebase/ai'
import { DEFAULTS } from '../config/defaults'
import { ai } from '../firebase'

export type DeviceState =
  'unavailable' | 'downloadable' | 'downloading' | 'available'

type CreateOptions = {
  expectedInputs: { type: 'text' | 'image'; languages?: string[] }[]
  expectedOutputs: { type: 'text'; languages: string[] }[]
}

declare global {
  // Chrome's built-in model. Used here only to report its state; every
  // inference goes through Firebase AI Logic.
  var LanguageModel:
    { availability(options?: CreateOptions): Promise<DeviceState> } | undefined
}

export const TEXT_AND_IMAGE: CreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
}

export const TEXT_ONLY: CreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
}

export async function deviceState(): Promise<DeviceState> {
  if (!globalThis.LanguageModel) return 'unavailable'
  try {
    return await globalThis.LanguageModel.availability(TEXT_AND_IMAGE)
  } catch {
    return 'unavailable'
  }
}

// Each private feature gets two instances: one that can never leave the
// device, and one for a vendor who consented to the cloud when this machine
// has no model. Which one runs is decided per call, from the consent.
export function privateModels(options: {
  createOptions: CreateOptions
  // A JSON schema for the on-device constraint; omitted for free text.
  onDeviceSchema?: object
  cloudConfig?: GenerationConfig
}): { onDevice: GenerativeModel; consented: GenerativeModel } {
  const onDeviceParams = {
    createOptions: options.createOptions,
    ...(options.onDeviceSchema && {
      promptOptions: { responseConstraint: options.onDeviceSchema },
    }),
  }
  return {
    onDevice: getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams,
    }),
    consented: getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams,
      inCloudParams: {
        model: DEFAULTS.cloudModel,
        ...(options.cloudConfig && { generationConfig: options.cloudConfig }),
      },
    }),
  }
}
