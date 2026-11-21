import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { deviceState, warmUp, type DeviceState } from '../ai/device'
import { modelLoad } from '../ai/run'
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
  // Whether the model has been loaded into memory since the panel opened.
  const [warm, setWarm] = useState<'no' | 'warming' | 'yes'>('no')
  const load = useSyncExternalStore(modelLoad.subscribe, modelLoad.get)

  useEffect(() => {
    let live = true
    void deviceState().then((s) => {
      if (!live) return
      setState(s)
      if (s !== 'available') return
      setWarm('warming')
      // A failed warm-up only means the first click is slower.
      void warmUp()
        .catch(() => undefined)
        .then(() => live && setWarm('yes'))
    })
    return () => {
      live = false
    }
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
    if (consent) {
      // The cloud fallback cannot help without a connection.
      if (!navigator.onLine && (await deviceState()) !== 'available') {
        throw new Error(
          'You are offline and this computer has no on-device model, so this step needs the internet.',
        )
      }
      return
    }
    const now = await deviceState()
    setState(now)
    if (now === 'unavailable') {
      setAsking(true)
      throw new NeedsConsent()
    }
    if (now !== 'available') {
      if (!navigator.onLine) {
        throw new Error(
          'The on-device model has not finished downloading. Connect to the internet once to download it; after that this works offline.',
        )
      }
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
    warm,
    // A model step is running; buttons that start another wait for it.
    busy: load.running || load.waiting > 0,
    waiting: load.waiting,
  }
}

export type DeviceApi = ReturnType<typeof useDevice>
