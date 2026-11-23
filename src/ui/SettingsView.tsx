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
  a.download = `desk-records-${new Date().toISOString().slice(0, 10)}.json`
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
                  Payment desk: orders
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
          <button type="button" onClick={() => void google.connect()}>
            <Icon name="link" />
            Connect Google Sheets and Calendar
          </button>
        )}
        <GoogleResult status={google.status.connect} />
      </section>

      <section className="card" aria-labelledby="ai-h">
        <h3 id="ai-h">
          <Icon name="device" />
          AI on this computer
        </h3>
        <p className="hint">
          {device.state === 'available'
            ? 'The model on this computer is ready, so receipts, orders and replies are read here.'
            : device.state === 'checking'
              ? 'Checking for the model on this computer…'
              : 'This computer has no model ready, so those steps need the cloud or wait for the download.'}
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
