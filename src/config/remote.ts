import {
  activate,
  ensureInitialized,
  fetchConfig,
  getAll,
  getRemoteConfig,
  isSupported,
} from 'firebase/remote-config'
import { firebaseApp } from '../firebase'
import { setAppConfig } from './active'
import { parseAppConfig, remoteDefaults } from './parse'

// How long a fetched template stays fresh before the next fetch.
const FETCH_INTERVAL_MS = 60 * 60 * 1000
// Startup never waits on the network for longer than this.
const STARTUP_LIMIT_MS = 1500

function within<T>(ms: number, work: Promise<T>): Promise<T | undefined> {
  return Promise.race([
    work,
    new Promise<undefined>((resolve) => setTimeout(resolve, ms)),
  ])
}

// Activates the values fetched on an earlier visit, which are stored on the
// device and need no network, then fetches fresh ones in the background for
// the next visit. On any failure the in-code defaults stay in force.
export async function loadAppConfig(): Promise<void> {
  try {
    if (!(await within(STARTUP_LIMIT_MS, isSupported()))) return
    const rc = getRemoteConfig(firebaseApp)
    rc.defaultConfig = remoteDefaults()
    rc.settings.minimumFetchIntervalMillis = FETCH_INTERVAL_MS
    await within(
      STARTUP_LIMIT_MS,
      ensureInitialized(rc).then(() => activate(rc)),
    )
    const values = Object.fromEntries(
      Object.entries(getAll(rc)).map(([k, v]) => [k, v.asString()]),
    )
    setAppConfig(parseAppConfig(values))
    void fetchConfig(rc).catch(() => undefined)
  } catch {
    // Offline, blocked storage or a console problem: the defaults hold.
  }
}
