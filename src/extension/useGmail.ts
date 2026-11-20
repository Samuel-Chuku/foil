import { useCallback, useEffect, useRef, useState } from 'react'
import { alertQuery, toAlertEmail, type Token } from '../inbox/gmail'
import {
  getMessage,
  GmailAuthError,
  listMessageIds,
  profileEmail,
} from '../inbox/gmailApi'
import { get, putAll } from '../ledger/db'
import type { GmailSettings } from '../ledger/types'
import type { LedgerApi } from '../ui/useLedger'
import { gmailToken, SignInNeeded } from './gmailAuth'

// How often the inbox is checked while the panel is open.
const EVERY_MS = 45_000
// Each check looks back this far, so an alert that arrived while the panel
// was closed is still read.
const LOOK_BACK_SEC = 2 * 24 * 3600

export type AccountStatus =
  | { state: 'checking' }
  | {
      state: 'ok'
      checkedAt: number
      // Bank alerts read by the rules since the panel opened.
      read: number
      // Alerts from a trusted bank in a layout the rules do not know yet.
      unread: number
      unreadBanks: string[]
    }
  | { state: 'signed-out' }
  | { state: 'error'; message: string }

// No setup needed: with no label, the known bank alert addresses are searched.
const DEFAULTS: GmailSettings = { accounts: [], label: '' }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useGmail(ledger: LedgerApi) {
  const [settings, setSettings] = useState<GmailSettings | null>(null)
  const [status, setStatus] = useState<Record<string, AccountStatus>>({})
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tokens = useRef(new Map<string, Token>())
  // Messages already handed to the rules this session, so each check only
  // downloads what is new.
  const seen = useRef(new Set<string>())
  // Alerts read per account since the panel opened.
  const totals = useRef(
    new Map<string, { read: number; unread: number; unreadBanks: string[] }>(),
  )
  const { importAlerts } = ledger

  useEffect(() => {
    let live = true
    get('settings', 'gmail').then(
      (row) => {
        if (!live) return
        setSettings(
          row && row.id === 'gmail'
            ? { accounts: row.accounts, label: row.label }
            : DEFAULTS,
        )
      },
      (e: unknown) => live && setError(message(e)),
    )
    return () => {
      live = false
    }
  }, [])

  const save = useCallback(async (next: GmailSettings) => {
    await putAll({ settings: [{ id: 'gmail', ...next }] })
    setSettings(next)
  }, [])

  const tokenFor = useCallback(async (email: string) => {
    const held = tokens.current.get(email)
    if (held && held.expiresAt > Date.now()) return held.accessToken
    const t = await gmailToken({ email, interactive: false })
    tokens.current.set(email, t)
    return t.accessToken
  }, [])

  const checkAccount = useCallback(
    async (email: string, s: GmailSettings, senders: string[]) => {
      setStatus((x) => ({ ...x, [email]: { state: 'checking' } }))
      try {
        const token = await tokenFor(email)
        const scope = s.label.trim() ? { label: s.label.trim() } : { senders }
        const ids = await listMessageIds(
          token,
          alertQuery(scope, Date.now() / 1000 - LOOK_BACK_SEC),
        )
        const fresh = ids.filter((id) => !seen.current.has(id))
        const emails = []
        for (const id of fresh) {
          emails.push(toAlertEmail(await getMessage(token, id)))
        }
        const results = emails.length ? await importAlerts(emails) : []
        for (const id of fresh) seen.current.add(id)
        const before = totals.current.get(email) ?? {
          read: 0,
          unread: 0,
          unreadBanks: [],
        }
        const total = {
          read:
            before.read + results.filter((r) => r.status === 'parsed').length,
          unread:
            before.unread +
            results.filter((r) => r.status === 'unknown-format').length,
          unreadBanks: [
            ...new Set([
              ...before.unreadBanks,
              ...results.flatMap((r) =>
                r.status === 'unknown-format' ? [r.bank] : [],
              ),
            ]),
          ],
        }
        totals.current.set(email, total)
        setStatus((x) => ({
          ...x,
          [email]: { state: 'ok', checkedAt: Date.now(), ...total },
        }))
      } catch (e) {
        if (e instanceof GmailAuthError) tokens.current.delete(email)
        setStatus((x) => ({
          ...x,
          [email]:
            e instanceof SignInNeeded || e instanceof GmailAuthError
              ? { state: 'signed-out' }
              : { state: 'error', message: message(e) },
        }))
      }
    },
    [importAlerts, tokenFor],
  )

  const checkAll = useCallback(async () => {
    if (!settings) return
    const senders = ledger.config.banks.flatMap((b) => b.alertSenders)
    for (const a of settings.accounts) {
      await checkAccount(a.email, settings, senders)
    }
  }, [checkAccount, ledger.config.banks, settings])

  // Checks on open and then on a timer, only while the panel is visible.
  const latest = useRef(checkAll)
  useEffect(() => {
    latest.current = checkAll
  }, [checkAll])
  const ready = settings !== null && settings.accounts.length > 0
  useEffect(() => {
    if (!ready) return
    void latest.current()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void latest.current()
    }, EVERY_MS)
    return () => clearInterval(timer)
  }, [ready])

  // Adds an account, or signs one in again, with Google's account chooser.
  const connect = useCallback(
    async (email?: string) => {
      if (!settings) return
      setConnecting(true)
      setError(null)
      try {
        const t = await gmailToken({ email, interactive: true })
        const address = await profileEmail(t.accessToken)
        tokens.current.set(address, t)
        const next = settings.accounts.some((a) => a.email === address)
          ? settings
          : {
              ...settings,
              accounts: [...settings.accounts, { email: address }],
            }
        await save(next)
        const senders = ledger.config.banks.flatMap((b) => b.alertSenders)
        await checkAccount(address, next, senders)
      } catch (e) {
        setError(message(e))
      } finally {
        setConnecting(false)
      }
    },
    [checkAccount, ledger.config.banks, save, settings],
  )

  const disconnect = useCallback(
    async (email: string) => {
      if (!settings) return
      tokens.current.delete(email)
      setStatus(({ [email]: _gone, ...rest }) => rest)
      await save({
        ...settings,
        accounts: settings.accounts.filter((a) => a.email !== email),
      })
    },
    [save, settings],
  )

  const setLabel = useCallback(
    async (label: string) => {
      if (!settings) return
      // A new search scope may match mail the old one skipped.
      seen.current.clear()
      await save({ ...settings, label })
    },
    [save, settings],
  )

  return {
    settings,
    status,
    connecting,
    error,
    connect,
    disconnect,
    setLabel,
    checkAll,
  }
}

export type GmailApi = ReturnType<typeof useGmail>
