import type { Approved, CloudRequest } from '../cloud/approval'
import { cloudModel, sendApproved } from '../cloud/send'
import { tidyDraft } from '../capture/draft'
import { privateModels, TEXT_ONLY } from './device'
import { generateText, type Reading } from './run'

// Rewording the vendor's reply and putting a customer's message into English.
// English and Pidgin run on this computer (or the cloud, if the vendor
// consented and has no model); other languages go to the cloud after the
// vendor sees exactly what is sent, with names and numbers swapped out.
const device = privateModels({ createOptions: TEXT_ONLY })
const cloud = cloudModel()

export async function onDevice(
  prompt: string,
  cloudConsent: boolean,
): Promise<Reading<string>> {
  const r = await generateText(device(cloudConsent), [prompt])
  return { fields: tidyDraft(r.text), source: r.source, ms: r.ms }
}

export function writingRequest(
  feature: string,
  reason: string,
  prompt: string,
  replaced: string[],
): CloudRequest {
  return { feature, reason, texts: [prompt], replaced }
}

export async function inCloud(approved: Approved): Promise<Reading<string>> {
  const r = await sendApproved(cloud(), approved)
  return { fields: tidyDraft(r.text), source: r.source, ms: r.ms }
}
