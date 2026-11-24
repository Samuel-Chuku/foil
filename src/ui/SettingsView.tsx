import { useState, useSyncExternalStore } from 'react'
import { Segmented, Slider, Switch } from './controls'
import { appConfig } from '../config/active'
import { verifyFor } from '../config/marketBanks'
import { market } from '../config/market'
import { getAll, type StoreName } from '../ledger/db'
import type { DeviceApi } from './useDevice'
import {
  ACCENTS,
  DENSITIES,
  LENGTHS,
  RANGES,
  THEMES,
  TONES,
  prefsStore,
  usesDrops,
  type Prefs,
} from './prefs'
import { Icon } from './icons'
import { GoogleResult } from './GoogleResult'
import type { GoogleApi } from './useGoogle'
import {
  answerLanguage,
  answerLanguages,
  soundsBasic,
  voicesFor,
} from '../config/speech'
import { useSpeech, type SpeakResult } from './useSpeech'
import { useOnline } from './useOnline'

// A line to try each voice with, in its own language.
const VOICE_SAMPLE: Record<string, string> = {
  english: 'Order 77 is paid. Three orders are waiting to go out.',
  pidgin: 'Order 77 don pay. Three orders dey wait to go out.',
  yoruba: 'Wọ́n ti san owó fún order 77.',
  igbo: 'Akwụọla ụgwọ order 77.',
  hausa: 'An biya order 77.',
  hindi: 'ऑर्डर 77 का भुगतान हो गया है।',
  portuguese: 'O pedido 77 está pago. Três pedidos esperam envio.',
}

const ACCENT_NAME: Record<Prefs['accent'], string> = {
  ember: 'Ember',
  butter: 'Butter',
  iris: 'Iris',
  sea: 'Sea glass',
}

const RECORDS: StoreName[] = [
  'orders',
  'customers',
  'credits',
  'settlements',
  'products',
  'drops',
  'chats',
]

// The vendor's own records, as one file they keep. Nothing leaves the
// computer: the file is made here and saved by the browser.
async function downloadRecords() {
  const rows = await Promise.all(RECORDS.map((s) => getAll(s)))
  const file = Object.fromEntries(RECORDS.map((s, i) => [s, rows[i]]))
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `foil-records-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function SettingsView(props: {
  device: DeviceApi
  google: GoogleApi
  // Drops the shop has run, so the drops switch shows what is in force.
  dropsRun: number
}) {
  const p = useSyncExternalStore(prefsStore.subscribe, prefsStore.get)
  const set = prefsStore.set
  const recommended = verifyFor(appConfig().verify)
  const lagos = market().id === 'ng'
  const [saving, setSaving] = useState<'idle' | 'saving' | 'error'>('idle')
  const { device, google } = props
  const speech = useSpeech()
  const lang = answerLanguage(market(), p.answerLanguage)
  const voices = voicesFor(speech.voices, lang.voiceLang)
  const onlineVoice = voices.online.some((v) => v.name === p.voiceName)
  const onlyBasic = voices.online.length > 0 && voices.local.every(soundsBasic)
  const [tried, setTried] = useState<SpeakResult | null>(null)
  const online = useOnline()

  return (
    <div className="settings" aria-labelledby="settings-h">
      <h3 id="settings-h" className="settings-title">
        Settings
      </h3>
      <p className="hint">
        Changes apply straight away and are kept in this browser.
      </p>

      <section className="card" data-tone="ask" aria-labelledby="look-h">
        <h3 id="look-h">
          <Icon name="settings" />
          Appearance
        </h3>
        <Segmented
          legend="Theme"
          options={THEMES}
          value={p.theme}
          onChange={(theme) => set({ theme })}
          label={(t) =>
            ({ system: 'Match browser', light: 'Light', dark: 'Dark' })[t]
          }
        />
        <fieldset className="setting">
          <legend>Accent</legend>
          <div className="swatches">
            {ACCENTS.map((a) => (
              <label key={a} data-accent-swatch={a}>
                <input
                  type="radio"
                  name="accent"
                  value={a}
                  checked={p.accent === a}
                  onChange={() => set({ accent: a })}
                />
                <span>{ACCENT_NAME[a]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Slider
          label="Text size"
          value={p.textScale}
          range={RANGES.textScale}
          unit="%"
          onChange={(textScale) => set({ textScale })}
        />
        <Segmented
          legend="Spacing"
          options={DENSITIES}
          value={p.density}
          onChange={(density) => set({ density })}
        />
        <Switch
          label="Colour each section"
          checked={p.sectionColours}
          onChange={(sectionColours) => set({ sectionColours })}
          hint="Payment, orders, replies, money and shop each keep their own shade. Lime always means money your bank confirmed."
        />
      </section>

      <section className="card" data-tone="shop" aria-labelledby="shop-h">
        <h3 id="shop-h">
          <Icon name="shop" />
          Your shop
        </h3>
        <Switch
          label="I sell in drops"
          checked={usesDrops(p, props.dropsRun)}
          onChange={(drops) => set({ drops })}
          hint="Timed status sales of one-of-a-kind pieces. On, you set a drop up on the Shop tab and watch it live on Today. Off, drop tools stay out of the way."
        />
        <p className="hint">
          Deliveries show on Today only when your Shop rules say you deliver and
          a paid order is waiting to go out.
        </p>
      </section>

      <section className="card" data-tone="reply" aria-labelledby="replies-h">
        <h3 id="replies-h">
          <Icon name="reply" />
          Replies
        </h3>
        <Segmented
          legend="Tone"
          options={TONES}
          value={p.replyTone}
          onChange={(replyTone) => set({ replyTone })}
        />
        <Segmented
          legend="Length"
          options={LENGTHS}
          value={p.replyLength}
          onChange={(replyLength) => set({ replyLength })}
          label={(l) => (l === 'short' ? 'Short' : 'Fuller')}
        />
        {lagos && (
          <Switch
            label="Answer Pidgin with Pidgin"
            checked={p.pidgin}
            onChange={(pidgin) => set({ pidgin })}
            hint="When a customer writes in Pidgin, the draft answers the same way. Off, drafts stay in English."
          />
        )}
      </section>

      <section className="card" data-tone="ask" aria-labelledby="voice-h">
        <h3 id="voice-h">
          <Icon name="speaker" />
          Voice and language
        </h3>
        <label className="setting">
          <span className="setting-label">Ask Foil answers in</span>
          <select
            value={lang.id}
            onChange={(e) => set({ answerLanguage: e.target.value })}
          >
            {answerLanguages(market()).map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
                {l.onDevice ? '' : ' (in the cloud, after you approve)'}
              </option>
            ))}
          </select>
        </label>
        <Switch
          label="Read answers aloud"
          checked={p.speakAnswers}
          onChange={(speakAnswers) => set({ speakAnswers })}
          hint="After a spoken question, and all through a talk. A voice on this computer is chosen first."
        />
        <label className="setting">
          <span className="setting-label">Voice</span>
          <select
            value={p.voiceName}
            onChange={(e) => set({ voiceName: e.target.value })}
          >
            <option value="">Choose one for {lang.label}</option>
            {voices.local.length > 0 && (
              <optgroup label="On this computer">
                {voices.local.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            )}
            {voices.online.length > 0 && (
              <optgroup label="Google online voices (the words go to Google)">
                {voices.online.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {speech.voices.length === 0 ? (
          <p className="hint" role="status">
            Chrome is still listing the voices on this computer. If none appear,
            answers stay on screen only.
          </p>
        ) : onlineVoice ? (
          <p className="hint">
            <Icon name="cloud" size={14} /> With an online voice, the words of
            each answer read aloud go to Google to be spoken. Choose a voice on
            this computer to keep them here.
          </p>
        ) : (
          onlyBasic && (
            <p className="hint">
              The voices on this computer are basic, robotic ones. For a natural
              voice, choose one of Google&apos;s online voices; the words of
              each answer then go to Google to be spoken.
            </p>
          )
        )}
        <Slider
          label="Speed"
          value={p.speechRate}
          range={RANGES.speechRate}
          unit="%"
          onChange={(speechRate) => set({ speechRate })}
        />
        <button
          type="button"
          className="quiet"
          onClick={() =>
            void speech
              .speak(
                VOICE_SAMPLE[lang.id] ?? VOICE_SAMPLE.english!,
                lang.voiceLang,
                {
                  voiceName: p.voiceName,
                  rate: p.speechRate,
                },
              )
              .then((r) => setTried(r))
          }
        >
          <Icon name="speaker" />
          Try the voice
        </button>
        {tried === 'no-voice' && (
          <p className="hint" role="status">
            No voice on this computer reads {lang.label}. Answers stay on
            screen; Chrome adds voices from your computer&apos;s language
            settings.
          </p>
        )}
      </section>

      <section className="card" data-tone="pay" aria-labelledby="match-h">
        <h3 id="match-h">
          <Icon name="receipt" />
          Matching payments
        </h3>
        <Slider
          label="Same-bank transfers land within"
          value={p.sameBankWindowMin ?? recommended.sameBankWindowMin}
          range={RANGES.sameBankWindowMin}
          unit=" min"
          onChange={(sameBankWindowMin) => set({ sameBankWindowMin })}
          hint={`These carry no session ID, so the time is what ties a receipt to your alert. Recommended: ${recommended.sameBankWindowMin} minutes.`}
        />
        <Slider
          label="Other-bank transfers land within"
          value={p.interbankWindowMin ?? recommended.interbankWindowMin}
          range={RANGES.interbankWindowMin}
          unit=" min"
          onChange={(interbankWindowMin) => set({ interbankWindowMin })}
          hint={`A wider window finds slow transfers but asks you to choose more often. Recommended: ${recommended.interbankWindowMin} minutes.`}
        />
        {(p.sameBankWindowMin !== null || p.interbankWindowMin !== null) && (
          <button
            type="button"
            className="quiet"
            onClick={() =>
              set({ sameBankWindowMin: null, interbankWindowMin: null })
            }
          >
            Use the recommended windows
          </button>
        )}
      </section>

      <section className="card" data-tone="money" aria-labelledby="links-h">
        <h3 id="links-h">
          <Icon name="link" />
          Connections
        </h3>
        <p className="hint">
          Send your orders to a Google Sheet, and add delivery runs to Google
          Calendar, in your own Google account. Each send shows you exactly what
          goes first. Phone numbers and addresses never go; customer names only
          if you tick for them.
        </p>
        {!google.canSign ? (
          <p className="hint">
            In the demo, Sheets and Calendar show what would be sent and send
            nothing. Connect them in the extension.
          </p>
        ) : google.connected ? (
          <>
            <p>
              <Icon name="check" /> Google Sheets and Calendar are connected.
            </p>
            {google.sheet && (
              <p className="hint">
                Your sheet:{' '}
                <a
                  href={google.sheet.sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open your orders sheet
                </a>
                {google.sheet.sentAt &&
                  `, last sent ${new Date(google.sheet.sentAt).toISOString().slice(0, 16).replace('T', ' ')}`}
              </p>
            )}
            <button
              type="button"
              className="quiet"
              onClick={() => void google.disconnect()}
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={!online || google.status.connect?.kind === 'busy'}
              onClick={() => void google.connect()}
            >
              <Icon name="link" />
              Connect Google Sheets and Calendar
            </button>
            {!online && (
              <p className="hint">
                You are offline. Connect once you are back online.
              </p>
            )}
          </>
        )}
        <GoogleResult status={google.status.connect} />
      </section>

      <section className="card" aria-labelledby="ai-h">
        <h3 id="ai-h">
          <Icon name="device" />
          AI on this computer
        </h3>
        <p className="hint">
          {
            {
              available:
                'The model on this computer is ready, so receipts, orders and replies are read here.',
              checking: 'Checking for the model on this computer…',
              downloading: `Chrome is downloading the model${device.progress === null ? '' : ` (${Math.round(device.progress * 100)}%)`}. Until it finishes, those steps need the cloud or wait.`,
              downloadable:
                'Chrome can download a model for this computer from the status line at the top of the panel. Until then, those steps need the cloud or wait.',
              unavailable:
                'This computer cannot run Chrome’s built-in model, so receipts, orders and replies need the cloud, after you agree below.',
            }[device.state]
          }
        </p>
        <Switch
          label="Use Google's Gemini service when this computer has no model"
          checked={device.consent}
          onChange={device.setConsent}
          hint="Off, nothing private goes to the cloud without the model. Voice notes, the books chat and replies in other languages always ask before sending."
        />
      </section>

      <section className="card" aria-labelledby="data-h">
        <h3 id="data-h">
          <Icon name="book" />
          Your records
        </h3>
        <p className="hint">
          Orders, customers and alerts live in this browser. Keep a copy as a
          file; it never leaves this computer.
        </p>
        <button
          type="button"
          disabled={saving === 'saving'}
          onClick={() => {
            setSaving('saving')
            downloadRecords().then(
              () => setSaving('idle'),
              () => setSaving('error'),
            )
          }}
        >
          {saving === 'saving' ? 'Preparing the file…' : 'Download my records'}
        </button>
        <button type="button" className="quiet" onClick={prefsStore.reset}>
          Reset settings
        </button>
        {saving === 'error' && (
          <p className="error" role="alert">
            Couldn&apos;t read the records on this computer. Try again.
          </p>
        )}
      </section>
    </div>
  )
}
