import { useCallback, useEffect, useState } from 'react'
import { deviceState, type DeviceState } from '../ai/device'
import { prepareReceiptModel } from '../ai/receipt'

// Raised instead of quietly using the cloud when this machine has no model.
export class NeedsConsent extends Error {
  constructor() {
    super('This computer has no on-device model.')
  }
}

const CONSENT_KEY = 'cloud-consent'

function storedConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'yes'
  } catch {
    return false
  }
}

export function useDevice() {
  const [state, setState] = useState<DeviceState | 'checking'>('checking')
  const [progress, setProgress] = useState<number | null>(null)
  const [consent, setConsentState] = useState(storedConsent)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    void deviceState().then(setState)
  }, [])

  const setConsent = useCallback((yes: boolean) => {
    setConsentState(yes)
    setAsking(false)
    try {
      localStorage.setItem(CONSENT_KEY, yes ? 'yes' : 'no')
    } catch {
      // Private windows may refuse storage; the choice then lasts this visit.
    }
  }, [])

  // Called from a click, which Chrome requires before it downloads the model.
  const ready = useCallback(async () => {
    if (consent) return
    const now = await deviceState()
    setState(now)
    if (now === 'unavailable') {
      setAsking(true)
      throw new NeedsConsent()
    }
    if (now !== 'available') {
      setProgress(0)
      try {
        await prepareReceiptModel(setProgress)
      } finally {
        setProgress(null)
      }
      setState(await deviceState())
    }
  }, [consent])

  return {
    state,
    progress,
    consent,
    asking,
    setConsent,
    askConsent: () => setAsking(true),
    ready,
  }
}

export type DeviceApi = ReturnType<typeof useDevice>
