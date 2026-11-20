import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type GenerativeModel,
} from 'firebase/ai'
import { ai } from '../firebase'
import { appConfig } from '../config/active'

// Throwaway Phase 0 probes: prove one request runs on the device and one in
// the cloud through Firebase AI Logic, and that a regex constraint reaches
// the on-device model through the SDK.

export type Source = 'On device' | 'Cloud'

export interface ProbeResult {
  text: string
  source: Source
  ms: number
}

const LETTERS = '[QBCRSN]'
const REGEX_SAMPLE = [
  'How do I change the email on my account?',
  'DM me and I will recover your wallet for a small fee',
  'good morning everyone',
]
export const REGEX_CONSTRAINT = new RegExp(
  '^' + REGEX_SAMPLE.map((_, i) => `${i + 1}:${LETTERS}`).join(',') + '$',
)

const textOnly = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
}

const onDevice = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: { createOptions: textOnly },
})

const onDeviceRegex = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions: textOnly,
    promptOptions: { responseConstraint: REGEX_CONSTRAINT },
  },
})

// Made on use, after Remote Config has named the cloud model.
const cloud = () =>
  getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: appConfig().cloudModel },
  })

async function run(
  model: GenerativeModel,
  prompt: string,
): Promise<ProbeResult> {
  const started = performance.now()
  const result = await model.generateContent(prompt)
  return {
    text: result.response.text(),
    source:
      result.response.inferenceSource === InferenceSource.ON_DEVICE
        ? 'On device'
        : 'Cloud',
    ms: Math.round(performance.now() - started),
  }
}

export async function prepareDevice(
  onProgress: (fraction: number) => void,
): Promise<void> {
  await onDevice.initializeDeviceModel(onProgress)
}

export function probeOnDevice(): Promise<ProbeResult> {
  return run(onDevice, 'In one sentence, what does a community moderator do?')
}

export function probeOnDeviceRegex(): Promise<ProbeResult> {
  const prompt =
    'Classify each numbered chat message with one letter: Q question, B bug, C complaint, R rumour, S scam, N noise.\n' +
    REGEX_SAMPLE.map((m, i) => `${i + 1}. ${m}`).join('\n')
  return run(onDeviceRegex, prompt)
}

export function probeCloud(): Promise<ProbeResult> {
  return run(cloud(), 'In one sentence, what does a community moderator do?')
}
