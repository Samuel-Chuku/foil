import { oddWording, tidyDraft } from '../capture/draft'
import { privateModels, TEXT_ONLY } from './device'
import { generateText, type Reading } from './run'

// The draft is built from the customer's chat, so it is written on the device
// unless the vendor has consented to the cloud.
const model = privateModels({ createOptions: TEXT_ONLY })

export async function writeDraft(
  prompt: string,
  cloudConsent: boolean,
): Promise<Reading<string>> {
  const first = await generateText(model(cloudConsent), [prompt])
  const draft = tidyDraft(first.text)
  const odd = oddWording(draft)
  if (!odd) return { fields: draft, source: first.source, ms: first.ms }
  // One more try, told what to avoid; the second answer stands either way so
  // the vendor is never left without a draft to edit.
  const again = await generateText(model(cloudConsent), [
    `${prompt}\n\nDo not write "${odd}".`,
  ])
  return {
    fields: tidyDraft(again.text),
    source: again.source,
    ms: first.ms + again.ms,
  }
}
