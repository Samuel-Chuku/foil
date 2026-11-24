import { approve, type Approved, type CloudRequest } from '../cloud/approval'

// Every model job in Foil runs through here, so the privacy promise is kept
// in one place: a device job never opens the approval dialog and gets the
// vendor's cloud consent only from the gate, and a cloud job sends nothing
// until the vendor approves exactly what goes. Each feature says where its
// job runs and builds its own request (it knows which names to swap out);
// this module decides nothing about features.

// Runs on this computer, or in the cloud only if the vendor consented to the
// cloud standing in for a missing model.
export type DevicePlan<R> = {
  where: 'device'
  run: (cloudConsent: boolean) => Promise<R>
}

// Runs in the cloud with exactly the approved request.
export type CloudPlan<R> = {
  where: 'cloud'
  request: CloudRequest
  // The vendor already sees this request on screen exactly as it goes, such
  // as a follow-up they typed with nothing swapped out, so their own click
  // is the approval.
  shown?: boolean
  run: (approved: Approved) => Promise<R>
}

export type Plan<R> = DevicePlan<R> | CloudPlan<R>

export type Gate = {
  cloudConsent: () => boolean
  // Checks the on-device model and asks for consent or a download when it is
  // missing; throws rather than quietly using the cloud.
  ready: () => Promise<void>
  online: () => boolean
  // Resolves with the approved request, or null when the vendor cancels.
  ask: (request: CloudRequest) => Promise<Approved | null>
}

export const OFFLINE = 'You are offline. Nothing was sent.'

// A device job always has a result; a cloud job is null when cancelled.
export type RunJob = {
  <R>(plan: DevicePlan<R>): Promise<R>
  <R>(plan: Plan<R>): Promise<R | null>
}

export function jobRunner(gate: Gate): RunJob {
  async function run<R>(plan: Plan<R>): Promise<R | null> {
    if (plan.where === 'device') {
      await gate.ready()
      return plan.run(gate.cloudConsent())
    }
    if (!gate.online()) throw new Error(OFFLINE)
    const approved = plan.shown
      ? approve(plan.request)
      : await gate.ask(plan.request)
    if (!approved) return null
    return plan.run(approved)
  }
  return run as RunJob
}

export const onDevice = <R>(
  run: (cloudConsent: boolean) => Promise<R>,
): DevicePlan<R> => ({ where: 'device', run })

// For a screen with no approval dialog, which only runs device jobs.
export const noCloud: Gate['ask'] = () =>
  Promise.reject(new Error('This screen cannot ask to use the cloud.'))

// Lets a screen show "sending" only once the vendor has approved.
export const whenApproved = <R>(
  plan: CloudPlan<R>,
  approved: () => void,
): CloudPlan<R> => ({
  ...plan,
  run: (a) => {
    approved()
    return plan.run(a)
  },
})
