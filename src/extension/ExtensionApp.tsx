import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { get, putAll } from '../ledger/db'
import { normalisePhone } from '../ledger/ledger'
import { SetupCard } from './SetupCard'
import { Panel } from '../ui/Panel'
import type { OpenChat, PanelHost, PanelRequest } from '../ui/host'
import { useDevice } from '../ui/useDevice'
import { useLedger } from '../ui/useLedger'
import { useShopRules } from '../ui/useShopRules'
import { lagosFromEpoch } from '../verify/time'
import { isFromChat, isOpened, type DraftReply, type ToChat } from './bridge'
import { GmailCard } from './GmailCard'
import { useGmail } from './useGmail'

const byNameKey = (chat: OpenChat | null) =>
  chat?.phone.startsWith('name:') ? chat.contactName : null

// The chat arrives from WhatsApp Web only when the vendor clicks one of the
// desk's buttons there, and drafts go back to that tab's message box.
export default function ExtensionApp() {
  const ledger = useLedger()
  const device = useDevice()
  const shop = useShopRules()
  const gmail = useGmail(ledger)
  const [chat, setChat] = useState<OpenChat | null>(null)
  const [tabId, setTabId] = useState<number | null>(null)
  const [request, setRequest] = useState<PanelRequest | null>(null)
  // Saved contacts show a name, not a number, in WhatsApp Web. The number is
  // learnt once, from the Contact info panel or from the vendor, and kept on
  // the device.
  const [byName, setByName] = useState<Record<string, string>>({})
  // The same list for the message listener, which is set up once.
  const known = useRef<Record<string, string>>({})
  const [typed, setTyped] = useState('')

  useEffect(() => {
    void get('settings', 'contacts').then((row) => {
      if (row?.id !== 'contacts') return
      known.current = row.byName
      setByName(row.byName)
    })
  }, [])

  const { rekeyCustomer } = ledger
  async function remember(name: string, phone: string) {
    if (known.current[name] === phone) return
    const next = { ...known.current, [name]: phone }
    known.current = next
    setByName(next)
    await putAll({ settings: [{ id: 'contacts', byName: next }] })
    // Orders saved under the contact's name move to the number.
    const to = normalisePhone(phone)
    if (to) await rekeyCustomer(`name:${name}`, to)
  }

  const learn = useEffectEvent(
    (name: string, phone: string) => void remember(name, phone),
  )

  useEffect(() => {
    const listen = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
    ): void => {
      if (sender.tab?.id === undefined) return
      // Switching chats: show that customer's order, without their messages.
      if (isOpened(message)) {
        const tab = sender.tab.id
        setChat((current) =>
          current?.phone === message.chat.phone ? current : message.chat,
        )
        setTabId(tab)
        return
      }
      if (!isFromChat(message)) return
      const name = byNameKey(message.chat)
      // A number shown in Contact info is learnt without asking.
      if (name && message.chat.shownPhone) {
        learn(name, message.chat.shownPhone)
      }
      setChat(message.chat)
      setTabId(sender.tab.id)
      const nonce = Date.now()
      setRequest(
        message.action !== 'capture' && message.messageId
          ? { action: message.action, messageId: message.messageId, nonce }
          : { action: 'capture', nonce },
      )
    }
    chrome.runtime.onMessage.addListener(listen)
    return () => chrome.runtime.onMessage.removeListener(listen)
  }, [])

  // The panel files the customer under the number; drafts still go to the
  // chat as WhatsApp knows it.
  const resolve = (c: OpenChat | null): OpenChat | null => {
    const n = byNameKey(c)
    const number = n ? (c?.shownPhone ?? byName[n]) : undefined
    return c && number ? { ...c, phone: number } : c
  }
  const name = byNameKey(chat)
  const learnt = name ? (chat?.shownPhone ?? byName[name]) : undefined
  const shown = resolve(chat)

  const host: PanelHost = {
    insertDraft: async (phone, text) => {
      if (tabId === null || !chat) {
        throw new Error('Open the chat in WhatsApp Web first.')
      }
      const message: ToChat = {
        kind: 'insert-draft',
        phone: phone === shown?.phone ? chat.phone : phone,
        text,
      }
      const reply = (await chrome.tabs.sendMessage(tabId, message)) as
        DraftReply | undefined
      if (!reply) {
        throw new Error('WhatsApp Web did not answer. Reload it and try again.')
      }
      if (!reply.ok) throw new Error(reply.reason)
    },
    now: () => lagosFromEpoch(Date.now()),
    // A panel button on a chat the panel only knows by name: read it now,
    // on that click.
    readChat: async () => {
      if (tabId === null) return null
      const message: ToChat = { kind: 'read-chat' }
      const read = (await chrome.tabs.sendMessage(tabId, message)) as
        OpenChat | null | undefined
      if (!read) return null
      const n = byNameKey(read)
      if (n && read.shownPhone) void remember(n, read.shownPhone)
      setChat(read)
      return resolve(read)
    },
  }

  return (
    <>
      <h1 className="visually-hidden">Payment desk</h1>
      <SetupCard />
      {name && !learnt && (
        <details className="card number-ask">
          <summary>Add {name}&apos;s number (optional)</summary>
          <p className="hint">
            WhatsApp shows saved contacts by name, so the desk files {name}{' '}
            under that name for now. To add the number, click their name at the
            top of the chat to open Contact info and use any desk button, or
            type it here. Earlier orders move to the number.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const phone = normalisePhone(typed)
              if (!phone) return
              void remember(name, `+${phone}`)
              setTyped('')
            }}
          >
            <label>
              Phone number{' '}
              <input
                inputMode="tel"
                value={typed}
                placeholder="0803 000 0000"
                onChange={(e) => setTyped(e.target.value)}
              />
            </label>{' '}
            <button type="submit" disabled={!normalisePhone(typed)}>
              Save number
            </button>
          </form>
        </details>
      )}
      <Panel
        chat={shown}
        request={request}
        ledger={ledger}
        device={device}
        host={host}
        shop={shop}
        inbox={
          <GmailCard
            gmail={gmail}
            bankName={(id) =>
              ledger.config.banks.find((b) => b.id === id)?.name ?? id
            }
          />
        }
      />
    </>
  )
}
