import { useMemo } from 'react'
import { jobRunner, type Gate, type RunJob } from '../ai/job'
import type { DeviceApi } from './useDevice'

// Connects the job runner to this screen's model state and approval dialog.
export function useModelJobs(device: DeviceApi, ask: Gate['ask']): RunJob {
  const { consent, ready } = device
  return useMemo(
    () =>
      jobRunner({
        cloudConsent: () => consent,
        ready,
        online: () => navigator.onLine,
        ask,
      }),
    [consent, ready, ask],
  )
}
