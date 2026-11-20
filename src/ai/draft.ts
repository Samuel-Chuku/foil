import { privateModels, TEXT_ONLY } from './device'
import { generateText, type Reading } from './run'

// The draft is built from the customer's chat, so it is written on the device
// unless the vendor has consented to the cloud.
const model = privateModels({ createOptions: TEXT_ONLY })

export async function writeDraft(
  prompt: string,
  cloudConsent: boolean,
): Promise<Reading<string>> {
  const { text, source, ms } = await generateText(model(cloudConsent), [prompt])
  return { fields: text.trim(), source, ms }
}
