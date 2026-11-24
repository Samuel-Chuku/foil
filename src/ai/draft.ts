import { redact, type Approved, type CloudRequest } from '../cloud/approval'
import { cloudModel, sendApproved } from '../cloud/send'
import { echoesCustomer, oddWording, tidyDraft } from '../capture/draft'
import { privateModels, TEXT_ONLY } from './device'
import { onDevice, type Plan } from './job'
import { generateText, type Reading } from './run'

// The draft is built from the customer's chat, so it is written on the device
// unless the vendor has consented to the cloud.
const model = privateModels({ createOptions: TEXT_ONLY })

async function writeDraft(
  prompt: string,
  cloudConsent: boolean,
  // The chat as the prompt gives it, to catch a draft that repeats the
  // customer.
  chat = '',
): Promise<Reading<string>> {
  const first = await generateText(model(cloudConsent), [prompt])
  const draft = tidyDraft(first.text)
  const odd = oddWording(draft)
  const echo = echoesCustomer(draft, chat)
  if (!odd && !echo) {
    return { fields: draft, source: first.source, ms: first.ms }
  }
  // One more try, told what to avoid; the second answer stands either way so
  // the vendor is never left without a draft to edit.
  const again = await generateText(model(cloudConsent), [
    `${prompt}\n\n${
      echo
        ? `Your last try repeated the customer's own words: "${draft}". Write the shop's answer to them instead.`
        : `Do not write "${odd}".`
    }`,
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

function draftRequest(
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

async function writeCloudDraft(approved: Approved): Promise<Reading<string>> {
  const { text, source, ms } = await sendApproved(cloud(), approved)
  return { fields: tidyDraft(text), source, ms }
}

// The market says where replies are written. In the cloud the chat's names and
// numbers are swapped out, and the vendor sees exactly what goes.
export function planDraft(
  prompt: string,
  chat: string,
  opts: { onDevice: boolean; language: string; names: string[] },
): Plan<Reading<string>> {
  if (opts.onDevice) {
    return onDevice((cloudConsent) => writeDraft(prompt, cloudConsent, chat))
  }
  const { text, replaced } = redact(
    prompt,
    opts.names
      .filter((n) => n && n !== 'Customer')
      .map((name) => ({ name, label: '(customer)' })),
  )
  return {
    where: 'cloud',
    request: draftRequest(text, opts.language, replaced),
    run: writeCloudDraft,
  }
}
