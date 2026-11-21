import { Schema } from 'firebase/ai'
import { privateModels, TEXT_AND_IMAGE } from './device'
import { generateJson, pickStrings, type Reading } from './run'

// Suggests a short name for an item a vendor sells by photo, such as a
// thrift piece. The vendor can change it; matching never relies on it.

const onDeviceSchema = {
  type: 'object',
  properties: { label: { type: 'string', maxLength: 40 } },
  required: ['label'],
  additionalProperties: false,
}

const model = privateModels({
  createOptions: TEXT_AND_IMAGE,
  onDeviceSchema,
  cloudConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema.object({ properties: { label: Schema.string() } }),
  },
})

const PROMPT = `This is a photo of one item a small shop sells. Name it in two to five plain words a customer would use, with its main colour, such as "Blue denim jacket" or "Brown leather handbag". No brand names, prices or sizes.`

export async function suggestLabel(
  image: { mimeType: string; base64: string },
  cloudConsent: boolean,
): Promise<Reading<string>> {
  const { json, source, ms } = await generateJson(model(cloudConsent), [
    PROMPT,
    {
      type: 'inlineData',
      inlineData: { mimeType: image.mimeType, data: image.base64 },
    },
  ])
  const label = pickStrings(json, ['label'] as const)
    .label.replace(/["“”.]/g, '')
    .trim()
    .slice(0, 40)
  return { fields: label, source, ms }
}
