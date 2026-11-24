import type { ChatSession } from 'firebase/ai'
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { askOnDevice } from '../ai/books'
import { onDevice as onDeviceJob, whenApproved, type RunJob } from '../ai/job'
import {
  askOnDeviceWithTools,
  planCloudAsk,
  toolChat,
  type DeskAnswer,
} from '../ai/deskTools'
import type { Reading } from '../ai/run'
import { cloudErrorText } from '../cloud/send'
import type { ShopRules } from '../capture/shopRules'
import { market } from '../config/market'
import { chartMenu, chartSpec } from '../ledger/charts'
import { booksText, dayBooks } from '../ledger/dayBooks'
import {
  businessText,
  deskInstructions,
  deviceAskPrompt,
  repairOrderNumbers,
} from '../ledger/snapshot'
import { lookupPreview, type DeskData, type Proposal } from '../ledger/tools'
import { trends, trendsText } from '../ledger/trends'
import { Chart } from './Chart'
import type { Lagos } from './TrendsCard'
import type { LedgerApi } from './useLedger'
import { allowMic, useVoiceAsk } from './useVoiceAsk'
import { useSpeech } from './useSpeech'
import { prefsStore } from './prefs'
import { answerLanguage, speakable } from '../config/speech'
import { Icon } from './icons'

// The week to today against the week before, for "how did this week go?".
const SPAN = 7

const SUGGESTIONS = [
  'Which orders are still unpaid?',
  'Which orders still need sending?',
  'What should I restock?',
  'How did this week compare with last?',
]

type Turn = {
  question: string
  answer?: DeskAnswer
  error?: string
}

// A question that needs more of the records than the device can hold.
class NeedsCloud extends Error {}

const proposalKey = (p: Proposal) =>
  p.kind === 'delivery'
    ? `d:${p.orderId}:${p.to}`
    : p.kind === 'open-chat'
      ? `c:${p.customerKey}`
      : p.kind === 'sheet'
        ? 's'
        : `r:${p.area}`

function proposalLabel(p: Proposal): string {
  if (p.kind === 'open-chat') return `Open the chat for #${p.code}`
  if (p.kind === 'sheet') return 'Send orders to Google Sheets'
  if (p.kind === 'calendar-run') return `Add the ${p.area} run to Calendar`
  const to = {
    out: 'out for delivery',
    delivered: 'delivered',
    collected: 'collected',
  }[p.to]
  return `Mark #${p.code} ${to}`
}

// A chat about the whole business, on every tab. With Chrome's model ready,
// questions are answered on this computer and nothing leaves it. Otherwise,
// or when the vendor asks for it, the cloud answers after the vendor sees
// exactly what is sent: the shop's own facts, never a customer's name, phone
// or address.
export function AskCard(props: {
  ledger: LedgerApi
  rules: ShopRules
  today: string
  lagos: Lagos
  now: () => number
  online: boolean
  jobs: RunJob
  badge: (r: Reading<unknown>) => ReactNode
  // Whether Chrome's built-in model is ready on this computer.
  deviceReady: boolean
  // Opens a customer's chat, where the host can (the demo and WhatsApp Web).
  openChat?: (customerKey: string) => void
  // Sends to the vendor's own Google Sheet or Calendar, after approval.
  sendSheet: () => void
  addRun: (area: string, orderIds: string[]) => void
}) {
  const { data, config } = props.ledger
  const bankName = (id: string | null) =>
    config.banks.find((b) => b.id === id)?.name ?? 'Bank not known'
  const recent = data
    ? trends(props.today, SPAN, data, config, props.lagos)
    : null
  const desk: DeskData | null =
    data && recent
      ? {
          orders: data.orders,
          credits: data.credits,
          products: data.products,
          drops: data.drops,
          settlements: data.settlements,
          chats: data.chats,
          rules: props.rules,
          books: booksText(
            dayBooks(props.today, data, config, props.lagos.day),
          ),
          trends: trendsText(recent, bankName),
          now: props.now(),
        }
      : null
  const facts =
    data && recent
      ? businessText({
          books: booksText(
            dayBooks(props.today, data, config, props.lagos.day),
          ),
          trends: trendsText(recent, bankName),
          orders: data.orders,
          credits: data.credits,
          products: data.products,
          drops: data.drops,
          settlements: data.settlements,
          chats: data.chats,
          rules: props.rules,
          now: props.now(),
        })
      : ''

  // Whether the records themselves changed, rather than the text: the demo's
  // sample clock drifts, which can move an order across an hour without any
  // record changing.
  const records = data
    ? [
        data.orders.length,
        Math.max(0, ...data.orders.map((o) => o.updatedAt)),
        data.credits.length,
        data.settlements.length,
        Math.max(0, ...data.products.map((p) => p.updatedAt)),
      ].join(':')
    : ''

  const chat = useRef<ChatSession | null>(null)
  // The records as the owner approved them with the first cloud question;
  // the chat's lookups answer from these and nothing newer.
  const approvedDesk = useRef<DeskData | null>(null)
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const [sent, setSent] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  // The chat keeps a fixed height and scrolls, so the newest answer is
  // brought into view whenever a turn is added or answered.
  const chatList = useRef<HTMLOListElement | null>(null)
  useEffect(() => {
    const list = chatList.current
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  }, [turns])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)

  const startOver = () => {
    chat.current = null
    approvedDesk.current = null
    setSent(null)
    setTurns([])
  }

  const userPrefs = useSyncExternalStore(prefsStore.subscribe, prefsStore.get)
  // The language answers come in, from Settings.
  const lang = answerLanguage(market(), userPrefs.answerLanguage)
  // On the device when the model is ready and can write that language; the
  // cloud otherwise.
  const onDevice = props.deviceReady && lang.onDevice

  async function send(asked: string, viaCloud = false) {
    const typed = asked.trim()
    if (!typed || !facts || busy) return
    if (onDevice && !viaCloud && desk) {
      const history = turns.flatMap((t) =>
        t.answer?.source === 'On device'
          ? [{ question: t.question, answer: t.answer.text }]
          : [],
      )
      const prompt = deviceAskPrompt(
        deskInstructions(lang.prompt),
        chartMenu(),
        facts,
        history,
        typed,
      )
      setQuestion('')
      setBusy(true)
      const at = turns.length
      setTurns((t) => [...t, { question: typed }])
      try {
        const read = await props.jobs(
          onDeviceJob(() =>
            askOnDeviceWithTools(
              typed,
              history,
              desk,
              () =>
                prompt
                  ? askOnDevice(prompt)
                  : Promise.reject(
                      new NeedsCloud(
                        'That needs more of your records than the model on this computer can hold. Ask the cloud instead.',
                      ),
                    ),
              lang.prompt,
            ),
          ),
        )
        // Order numbers are checked against the shop's real orders.
        const answer = {
          ...read,
          text: repairOrderNumbers(
            read.text,
            desk.orders.map((o) => o.code),
          ),
        }
        setTurns((t) => t.map((x, i) => (i === at ? { ...x, answer } : x)))
      } catch (e) {
        const error = e instanceof NeedsCloud ? e.message : cloudErrorText(e)
        setTurns((t) => t.map((x, i) => (i === at ? { ...x, error } : x)))
      } finally {
        setBusy(false)
      }
      return
    }
    const first = !chat.current
    const { asked: text, plan } = planCloudAsk({
      typed,
      names: (data?.customers ?? []).map((c) => c.name),
      preview: first ? (desk ? lookupPreview(desk) : '') : null,
      language: lang.prompt,
      session: () => (chat.current ??= toolChat()),
      data: () => approvedDesk.current!,
    })
    // The question joins the chat only once it is approved.
    let at = -1
    try {
      const answer = await props.jobs(
        whenApproved(plan, () => {
          if (first) {
            approvedDesk.current = desk
            setSent(records)
          }
          setQuestion('')
          setBusy(true)
          at = turns.length
          setTurns((t) => [...t, { question: text }])
        }),
      )
      if (answer) {
        setTurns((t) => t.map((x, i) => (i === at ? { ...x, answer } : x)))
      }
    } catch (e) {
      const error = cloudErrorText(e)
      setTurns((t) =>
        at < 0
          ? [...t, { question: typed, error }]
          : t.map((x, i) => (i === at ? { ...x, error } : x)),
      )
    } finally {
      setBusy(false)
    }
  }

  // Product names and order numbers, so speech recognition hears them right.
  const vocabulary = useMemo(
    () => [
      ...(data?.products ?? []).map((p) => p.name.trim()).filter(Boolean),
      ...(data?.orders ?? []).map((o) => `order ${o.code}`),
    ],
    [data],
  )
  // The latest send, for answers to voice questions that finish later.
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  })
  // Whether the last question was spoken, so its answer is read aloud.
  const voiceAsked = useRef(false)
  const voice = useVoiceAsk({
    vocabulary,
    onQuestion: useCallback((q: string) => {
      voiceAsked.current = true
      void sendRef.current(q)
    }, []),
    jobs: props.jobs,
    online: props.online,
  })
  // While the owner speaks, their words fill a bubble at the end of the
  // chat, so it follows them as it grows.
  const listening = voice.state.status === 'listening' ? voice.state : null
  const heardSoFar = listening?.heard
  useEffect(() => {
    const list = chatList.current
    if (list && listening) list.scrollTo({ top: list.scrollHeight })
  }, [listening, heardSoFar])
  const speech = useSpeech()
  // Talk mode: listen, answer, say the answer, listen again, until stopped.
  const [talking, setTalking] = useState(false)
  // The first turn of the current talk, so an older failure does not end it.
  const [talkFrom, setTalkFrom] = useState(0)
  const [noVoice, setNoVoice] = useState(false)
  // A failed question or a microphone problem ends the talk.
  if (
    talking &&
    (voice.state.status === 'error' ||
      (turns.length > talkFrom && turns[turns.length - 1]?.error))
  ) {
    setTalking(false)
  }
  const say = (text: string) =>
    speech.speak(speakable(text, market()), lang.voiceLang, {
      voiceName: userPrefs.voiceName,
      rate: userPrefs.speechRate,
    })
  // Each finished answer, once: read aloud if it was asked aloud or the
  // owner is talking, then listen for the next question.
  const handledTurn = useRef(-1)
  const onTurnDone = useEffectEvent(async (i: number) => {
    const t = turns[i]
    if (!t || (!t.answer && !t.error) || handledTurn.current === i) return
    handledTurn.current = i
    const aloud = (talking || voiceAsked.current) && userPrefs.speakAnswers
    voiceAsked.current = false
    if (aloud && t.answer) {
      const r = await say(t.answer.text)
      setNoVoice(r === 'no-voice')
    }
    if (talking && t.answer) voice.start()
  })
  useEffect(() => {
    void onTurnDone(turns.length - 1)
  }, [turns])

  function startTalking() {
    setTalking(true)
    setTalkFrom(turns.length)
    setNoVoice(false)
    voice.start()
  }
  function stopTalking() {
    setTalking(false)
    voice.stop()
    speech.stop()
  }

  function act(p: Proposal) {
    if (p.kind === 'delivery') void props.ledger.setDelivery(p.orderId, p.to)
    else if (p.kind === 'open-chat') props.openChat?.(p.customerKey)
    else if (p.kind === 'sheet') props.sendSheet()
    else props.addRun(p.area, p.orderIds)
    setDone((d) => new Set(d).add(proposalKey(p)))
  }

  return (
    <section className="card ask-desk" data-tone="ask" aria-labelledby="ask-h">
      <h3 id="ask-h">
        <Icon name="spark" />
        Ask Foil
      </h3>
      {turns.length === 0 && (
        <p className="hint">
          {onDevice
            ? 'Ask anything about your orders, stock, money or week. Answers come from the model on this computer, so nothing is sent. For a harder question, you can ask the cloud instead.'
            : "Ask anything about your orders, stock, money or week. Answers come from Google's Gemini service, and your first question shows you exactly what it will be sent: your shop's facts, never customers' names, phones or addresses."}
        </p>
      )}
      {(turns.length > 0 || listening) && (
        <ol
          ref={chatList}
          className="books-chat ask-chat"
          aria-live="polite"
          tabIndex={0}
          aria-label="Your chat with Foil"
        >
          {turns.map((t, i) => (
            <li key={i}>
              <div className="bubble me">
                <span className="who">You</span>
                <p>{t.question}</p>
              </div>
              <div className="bubble desk">
                <header className="who">
                  <span>Foil</span>
                  {t.answer &&
                    props.badge({
                      fields: null,
                      source: t.answer.source,
                      ms: t.answer.ms,
                    })}
                </header>
                {t.answer ? (
                  <>
                    {t.answer.steps.length > 0 && (
                      <ol className="ask-steps" aria-label="What Foil did">
                        {t.answer.steps.map((st, n) => (
                          <li key={n} data-source={st.source}>
                            <Icon
                              name={
                                st.source === 'On device' ? 'device' : 'cloud'
                              }
                              size={13}
                            />
                            {st.label}
                          </li>
                        ))}
                      </ol>
                    )}
                    <p className="said">{t.answer.text}</p>
                    {t.answer.chart && recent && (
                      <Chart
                        spec={chartSpec(recent, t.answer.chart, bankName)}
                      />
                    )}
                    {t.answer.proposals.length > 0 && (
                      <div className="actions ask-actions">
                        {t.answer.proposals
                          .filter(
                            (p) => p.kind !== 'open-chat' || props.openChat,
                          )
                          .map((p) => (
                            <button
                              key={proposalKey(p)}
                              type="button"
                              className="quiet"
                              disabled={done.has(proposalKey(p))}
                              onClick={() => act(p)}
                            >
                              {done.has(proposalKey(p))
                                ? `Done: ${proposalLabel(p)}`
                                : proposalLabel(p)}
                            </button>
                          ))}
                      </div>
                    )}
                    <footer>
                      {i === turns.length - 1 && speech.speaking ? (
                        <button
                          type="button"
                          className="link read-aloud"
                          onClick={speech.stop}
                        >
                          <Icon name="stop" size={14} />
                          Stop reading
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="link read-aloud"
                          onClick={() => {
                            if (t.answer)
                              void say(t.answer.text).then((r) =>
                                setNoVoice(r === 'no-voice'),
                              )
                          }}
                        >
                          <Icon name="speaker" size={14} />
                          Read aloud
                        </button>
                      )}
                      {t.answer.source === 'On device' && !busy && (
                        <button
                          type="button"
                          className="link"
                          onClick={() => void send(t.question, true)}
                        >
                          Ask the cloud instead
                        </button>
                      )}
                    </footer>
                  </>
                ) : t.error ? (
                  <p className="error" role="alert">
                    {t.error}
                  </p>
                ) : (
                  <p className="hint said">Thinking…</p>
                )}
              </div>
            </li>
          ))}
          {listening && (
            <li>
              <div className="bubble me live">
                <span className="who">
                  <Icon name="mic" size={14} />
                  {listening.mode === 'device' ? 'Listening' : 'Recording'}
                </span>
                {listening.mode === 'device' && listening.heard ? (
                  <p>{listening.heard}</p>
                ) : (
                  <p className="hint">
                    {listening.mode === 'device'
                      ? 'Speak; take your time.'
                      : 'Speak; you will see the recording before anything is sent.'}
                  </p>
                )}
                <span className="meta">Sends after a short pause</span>
              </div>
            </li>
          )}
        </ol>
      )}
      {sent !== null && sent !== records && (
        <p className="hint">
          Your records have changed since your first question, and this chat
          still uses what you sent then.{' '}
          <button type="button" className="link" onClick={startOver}>
            Start over with the latest
          </button>
        </p>
      )}
      {turns.length === 0 && (
        <div className="suggestions" role="group" aria-label="Try asking">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="quiet"
              disabled={busy || !facts}
              onClick={() => void send(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send(question)
        }}
      >
        <label htmlFor="ask-q" className="visually-hidden">
          Your question
        </label>
        <input
          id="ask-q"
          value={question}
          placeholder="Ask about your orders, stock or money"
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!facts}
        />
        <div className="actions">
          <button type="submit" disabled={busy || !question.trim()}>
            {busy ? 'Asking…' : 'Ask'}
          </button>
          {(voice.mode === 'device' || voice.mode === 'cloud') && (
            <button
              type="button"
              className="quiet mic"
              aria-pressed={voice.state.status === 'listening'}
              disabled={busy || !desk || voice.state.status === 'writing'}
              onClick={
                voice.state.status === 'listening' ? voice.stop : voice.start
              }
            >
              <Icon
                name={voice.state.status === 'listening' ? 'stop' : 'mic'}
              />
              {voice.state.status === 'listening' ? 'Stop' : 'Speak'}
            </button>
          )}
          {(voice.mode === 'device' || voice.mode === 'cloud') && (
            <button
              type="button"
              className="quiet talk"
              aria-pressed={talking}
              disabled={!desk}
              onClick={talking ? stopTalking : startTalking}
            >
              <Icon name={talking ? 'stop' : 'speaker'} />
              {talking ? 'End the talk' : 'Talk'}
            </button>
          )}
          {voice.mode === 'device-download' && (
            <button
              type="button"
              className="link"
              disabled={voice.state.status === 'writing'}
              onClick={() => void voice.download()}
            >
              Set up voice on this computer
            </button>
          )}
          {turns.length > 0 && !busy && (
            <button type="button" className="quiet" onClick={startOver}>
              Clear the chat
            </button>
          )}
        </div>
      </form>
      {talking && (
        <p className="hint talk-live" aria-live="polite">
          Talking with Foil in {lang.label}. Ask, wait for the answer, then ask
          the next thing. Press End the talk when you are done.
        </p>
      )}
      {noVoice && (
        <p className="hint" role="status">
          No voice on this computer reads {lang.label}, so answers stay on
          screen. Chrome adds voices from your computer&apos;s language
          settings.
        </p>
      )}
      {voice.state.status === 'writing' && (
        <p className="hint" aria-live="polite">
          {voice.state.note}
        </p>
      )}
      {voice.state.status === 'error' && (
        <div className="error" role="alert">
          <p>{voice.state.message}</p>
          {voice.state.mic && (
            <button type="button" className="quiet" onClick={allowMic}>
              <Icon name="mic" />
              Allow the microphone
            </button>
          )}
        </div>
      )}
    </section>
  )
}
