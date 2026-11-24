import type { Approved } from '../cloud/approval'
import { cloudModel, sendApproved } from '../cloud/send'
import { draftProblem, tidyDraft } from '../capture/draft'
import {
  lostNumbers,
  protect,
  readsAsEnglish,
  rewritePrompt,
  rewriteStyles,
  translatePrompt,
  unmark,
} from '../capture/rewrite'
import type { Market } from '../config/market'
import { privateModels, TEXT_ONLY } from './device'
import type { Plan } from './job'
import { generateText, type Reading } from './run'

// Rewording the vendor's reply and putting a customer's message into English.
// English and Pidgin run on this computer (or the cloud, if the vendor
// consented and has no model); other languages go to the cloud after the
// vendor sees exactly what is sent, with names and numbers swapped out. The
// side panel and the extension's background writer both plan jobs here, so
// the two can never word or check a rewrite differently.
const device = privateModels({ createOptions: TEXT_ONLY })
const cloud = cloudModel()

async function onDevice(
  prompt: string,
  cloudConsent: boolean,
): Promise<Reading<string>> {
  const r = await generateText(device(cloudConsent), [prompt])
  return { fields: unmark(tidyDraft(r.text)), source: r.source, ms: r.ms }
}

async function inCloud(approved: Approved): Promise<Reading<string>> {
  const r = await sendApproved(cloud(), approved)
  return { fields: tidyDraft(r.text), source: r.source, ms: r.ms }
}

export type WriteJob =
  | { op: 'rewrite'; style: string; text: string; names: string[] }
  | { op: 'translate'; lines: string[]; names: string[] }

export type WritePlan = Plan<Reading<string>>

const named = (names: string[]) =>
  names.map((n) => n.trim()).filter((n) => n && n !== 'Customer')

function checked(reading: Reading<string>): Reading<string> {
  const problem = draftProblem(reading.fields)
  if (problem) throw new Error(`${problem} Your text was left as it is.`)
  return reading
}

export function planWrite(job: WriteJob, m: Market): WritePlan {
  if (job.op === 'translate') {
    if (job.lines.every(readsAsEnglish)) {
      return {
        where: 'device',
        run: (cloudConsent) =>
          onDevice(translatePrompt(job.lines), cloudConsent),
      }
    }
    const safe = protect(job.lines.join('\n'), named(job.names))
    return {
      where: 'cloud',
      request: {
        feature: 'Translate their messages',
        reason:
          'Their messages look like a language the model on this computer cannot read yet, so the cloud model puts them into English. Only these messages go, with names and long numbers swapped out.',
        texts: [translatePrompt(safe.text.split('\n'))],
        replaced: safe.replaced,
      },
      run: async (approved) => {
        const r = await inCloud(approved)
        return { ...r, fields: safe.restore(r.fields) }
      },
    }
  }

  const style = rewriteStyles(m).find((s) => s.id === job.style)
  if (!style) throw new Error('That rewrite is not offered for this shop.')
  const { text } = job
  if (style.onDevice) {
    return {
      where: 'device',
      run: async (cloudConsent) => {
        const first = await onDevice(
          rewritePrompt(text, style, m),
          cloudConsent,
        )
        // A number the model dropped is asked for once more by name.
        const missing = lostNumbers(text, first.fields)
        if (!missing.length) return checked(first)
        const again = await onDevice(
          rewritePrompt(text, style, m, missing),
          cloudConsent,
        )
        return checked({ ...again, ms: first.ms + again.ms })
      },
    }
  }
  const safe = protect(text, named(job.names))
  return {
    where: 'cloud',
    request: {
      feature: 'Rewrite your reply',
      reason: `Writing in ${style.language ?? 'this language'} is done by the cloud model, because the model on this computer cannot write it yet. Only your typed text goes, with names and long numbers swapped out; they are put back when it returns.`,
      texts: [rewritePrompt(safe.text, style, m)],
      replaced: safe.replaced,
    },
    run: async (approved) => {
      const r = await inCloud(approved)
      return checked({ ...r, fields: safe.restore(r.fields) })
    },
  }
}
