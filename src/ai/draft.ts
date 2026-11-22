import type { Approved, CloudRequest } from '../cloud/approval'
import { cloudModel, sendApproved } from '../cloud/send'
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

// Replies in a language Chrome's built-in model does not support (its
// documented languages are English, Japanese, Spanish, German and French)
// are written in the cloud, only after the vendor approves exactly what is
// sent, with names and numbers swapped out.
const cloud = cloudModel()

export function draftRequest(
  prompt: string,
  language: string,
  replaced: string[],
): CloudRequest {
  return {
    feature: 'Draft a reply',
    reason: `Replies in ${language} are written by the cloud model, because the model on this computer does not support ${language} yet.`,
    texts: [prompt],
    replaced,
  }
}

export async function writeCloudDraft(
  approved: Approved,
): Promise<Reading<string>> {
  const { text, source, ms } = await sendApproved(cloud(), approved)
  return { fields: tidyDraft(text), source, ms }
}
