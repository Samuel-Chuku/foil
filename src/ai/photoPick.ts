import { Schema } from 'firebase/ai'
import { privateModels, TEXT_AND_IMAGE } from './device'
import { generateJson, pickStrings, type Reading } from './run'

// Breaks a close call between stock photos. Code first finds the two or
// three photos nearest a customer's picture; only then does the on-device
// model look at them side by side. The vendor can change its pick.

type Image = { mimeType: string; base64: string }

const CHOICES = ['1', '2', '3', 'none'] as const

const onDeviceSchema = {
  type: 'object',
  properties: { choice: { type: 'string', enum: [...CHOICES] } },
  required: ['choice'],
  additionalProperties: false,
}

const model = privateModels({
  createOptions: TEXT_AND_IMAGE,
  onDeviceSchema,
  cloudConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema.object({
      properties: { choice: Schema.enumString({ enum: [...CHOICES] }) },
    }),
  },
})

const part = (image: Image) => ({
  type: 'inlineData' as const,
  inlineData: { mimeType: image.mimeType, data: image.base64 },
})

// Returns the 0-based index of the matching stock photo, or null.
export async function pickPhoto(
  customer: Image,
  stock: Image[],
  cloudConsent: boolean,
): Promise<Reading<number | null>> {
  const options = stock.slice(0, 3)
  const { json, source, ms } = await generateJson(model(cloudConsent), [
    "The first picture is what a customer showed a shop: possibly a small, cropped copy of a photo the shop posted. The pictures after it are the shop's own photos, numbered 1, 2 and so on in order.",
    part(customer),
    ...options.flatMap((image, n) => [`Photo ${n + 1}:`, part(image)]),
    'Which numbered photo shows the same item as the first picture? Judge by the item itself: its shape, colours and pattern. Answer "none" if none of them is clearly the same item.',
  ])
  const choice = pickStrings(json, ['choice'] as const).choice
  const n = Number.parseInt(choice, 10)
  return {
    fields: n >= 1 && n <= options.length ? n - 1 : null,
    source,
    ms,
  }
}
