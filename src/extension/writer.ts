import { deviceState, storedConsent } from '../ai/device'
import { planWrite, type WriteJob, type WritePlan } from '../ai/rewrite'
import { approve } from '../cloud/approval'
import { errorMessage } from '../cloud/errors'
import { lostNumbers, rewriteStyles } from '../capture/rewrite'
import { market } from '../config/market'
import { loadAppConfig } from '../config/remote'
import { startMarket } from '../ui/marketChoice'
import { isToWriter, type WriteAnswer, type WriteAsk } from './bridge'

// The desk's hidden writer page (an offscreen document). It rewrites the
// vendor's own text on WhatsApp without the side panel being open, through
// the same Firebase AI Logic models and checks the panel uses. A cloud job
// goes back to WhatsApp to be shown in full and runs only once the vendor
// clicks Send there.

const configured = loadAppConfig()
// A cloud job waiting for the vendor's click, by id. Only the newest is kept:
// a vendor who asks again has moved on from the last one.
let waiting: {
  id: string
  plan: Extract<WritePlan, { where: 'cloud' }>
  // The text it started from, to check the result's numbers against.
  from: string
} | null = null

const original = (job: WriteJob) =>
  job.op === 'rewrite' ? job.text : job.lines.join('\n')

async function deviceProblem(): Promise<WriteAnswer | null> {
  const state = await deviceState()
  if (storedConsent()) {
    return state !== 'available' && !navigator.onLine
      ? {
          kind: 'error',
          message:
            'You are offline and this computer has no on-device model, so this needs the internet.',
        }
      : null
  }
  if (state === 'available') return null
  return {
    kind: 'error',
    openDesk: true,
    message:
      state === 'unavailable'
        ? 'This computer has no model for writing help yet. Open Foil to choose the cloud instead.'
        : 'The model on this computer is not downloaded yet. Open Foil to download it.',
  }
}

async function handle(ask: WriteAsk): Promise<WriteAnswer> {
  await configured
  // The vendor may have changed the shop's market in the panel since.
  startMarket()
  const m = market()
  if (ask.op === 'styles') {
    return {
      kind: 'styles',
      styles: rewriteStyles(m).map(({ id, label, onDevice }) => ({
        id,
        label,
        onDevice,
      })),
    }
  }
  if (ask.op === 'decline') {
    if (waiting?.id === ask.id) waiting = null
    return { kind: 'declined' }
  }
  if (ask.op === 'approve') {
    const job = waiting?.id === ask.id ? waiting : null
    waiting = null
    if (!job) {
      return { kind: 'error', message: 'That request has expired. Ask again.' }
    }
    const r = await job.plan.run(approve(job.plan.request))
    return {
      kind: 'done',
      text: r.fields,
      where: 'cloud',
      ms: r.ms,
      lost: lostNumbers(job.from, r.fields),
    }
  }
  const plan = planWrite(ask.job, m, storedConsent())
  if (plan.where === 'cloud') {
    const id = crypto.randomUUID()
    waiting = { id, plan, from: original(ask.job) }
    const { feature, reason, texts, replaced } = plan.request
    return {
      kind: 'approve',
      id,
      request: { feature, reason, texts, replaced },
    }
  }
  const problem = await deviceProblem()
  if (problem) return problem
  const r = await plan.run()
  return {
    kind: 'done',
    text: r.fields,
    where: r.source === 'On device' ? 'device' : 'cloud',
    ms: r.ms,
    lost: lostNumbers(original(ask.job), r.fields),
  }
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (!isToWriter(message)) return
  void handle(message.ask).then(reply, (e: unknown) =>
    reply({
      kind: 'error',
      message: errorMessage(e, navigator.onLine),
    } satisfies WriteAnswer),
  )
  // Keeps the channel open for the answer above.
  return true
})
