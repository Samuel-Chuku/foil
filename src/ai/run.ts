import { InferenceSource, type GenerativeModel, type Part } from 'firebase/ai'

export type Source = 'On device' | 'Cloud'

// 'Rules' marks a result read without any model, such as a PDF's text layer.
export type Reading<T> = { fields: T; source: Source | 'Rules'; ms: number }

// Every result carries where it ran, taken from the SDK's own field so the
// badge can never claim "On device" for a cloud answer.
export async function generateJson(
  model: GenerativeModel,
  parts: (string | Part)[],
): Promise<{ json: unknown; source: Source; ms: number }> {
  const started = performance.now()
  const result = await model.generateContent(parts)
  return {
    json: JSON.parse(result.response.text()) as unknown,
    source:
      result.response.inferenceSource === InferenceSource.ON_DEVICE
        ? 'On device'
        : 'Cloud',
    ms: Math.round(performance.now() - started),
  }
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
