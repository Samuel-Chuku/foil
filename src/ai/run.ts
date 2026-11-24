import {
  InferenceSource,
  type GenerateContentResult,
  type GenerativeModel,
  type Part,
} from 'firebase/ai'

export type Source = 'On device' | 'Cloud'

// 'Rules' marks a result read without any model, such as a PDF's text layer.
export type Reading<T> = { fields: T; source: Source | 'Rules'; ms: number }

// The on-device model answers one request at a time, and requests sent
// together only compete for the GPU. They run in order here, and the panel
// can show how many are waiting.
export type ModelLoad = { running: boolean; waiting: number }
let load: ModelLoad = { running: false, waiting: 0 }
let tail: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()

function setLoad(next: ModelLoad) {
  load = next
  for (const l of listeners) l()
}

export const modelLoad = {
  get: () => load,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  setLoad({ ...load, waiting: load.waiting + 1 })
  const run = tail.then(async () => {
    setLoad({ running: true, waiting: load.waiting - 1 })
    try {
      return await work()
    } finally {
      setLoad({ ...load, running: false })
    }
  })
  // A failed request must not stop the ones queued behind it.
  tail = run.catch(() => undefined)
  return run
}

// Every result carries where it ran, taken from the SDK's own field so the
// badge can never claim "On device" for a cloud answer.
export function sourceOf(response: {
  inferenceSource?: InferenceSource
}): Source {
  return response.inferenceSource === InferenceSource.ON_DEVICE
    ? 'On device'
    : 'Cloud'
}

export async function timed(
  call: () => Promise<GenerateContentResult>,
): Promise<{ text: string; source: Source; ms: number }> {
  const started = performance.now()
  const { response } = await call()
  return {
    text: response.text(),
    source: sourceOf(response),
    ms: Math.round(performance.now() - started),
  }
}

export function generateText(
  model: GenerativeModel,
  parts: (string | Part)[],
): Promise<{ text: string; source: Source; ms: number }> {
  return oneAtATime(() => timed(() => model.generateContent(parts)))
}

export async function generateJson(
  model: GenerativeModel,
  parts: (string | Part)[],
): Promise<{ json: unknown; source: Source; ms: number }> {
  const { text, ...rest } = await generateText(model, parts)
  return { json: JSON.parse(text) as unknown, ...rest }
}

// The model's JSON is untrusted input: keep only the expected keys, as text.
export function pickStrings<K extends string>(
  json: unknown,
  keys: readonly K[],
): Record<K, string> {
  const source = (json && typeof json === 'object' ? json : {}) as Record<
    string,
    unknown
  >
  return Object.fromEntries(
    keys.map((k) => {
      const v = source[k]
      return [
        k,
        typeof v === 'string' || typeof v === 'number' ? String(v) : '',
      ]
    }),
  ) as Record<K, string>
}
