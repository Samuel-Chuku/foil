import { useId, useState, useSyncExternalStore, type ReactNode } from 'react'
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
  type Prefs,
} from './prefs'

const ACCENT_NAME: Record<Prefs['accent'], string> = {
  ember: 'Ember',
  butter: 'Butter',
  iris: 'Iris',
  sea: 'Sea glass',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// A row of choices drawn as one segmented control, built on radio inputs so
// arrow keys and screen readers treat it as one choice.
function Segmented<T extends string>(props: {
  legend: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label?: (v: T) => ReactNode
}) {
  const name = useId()
  return (
    <fieldset className="setting">
      <legend>{props.legend}</legend>
      <div className="segmented">
        {props.options.map((o) => (
          <label key={o}>
            <input
              type="radio"
              name={name}
              value={o}
              checked={props.value === o}
              onChange={() => props.onChange(o)}
            />
            <span>{props.label ? props.label(o) : cap(o)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Slider(props: {
  label: string
  value: number
  range: { min: number; max: number; step: number }
  unit: string
  onChange: (v: number) => void
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="setting">
      <div className="setting-head">
        <label htmlFor={id}>{props.label}</label>
        <output htmlFor={id} className="num">
          {props.value}
          {props.unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={props.range.min}
        max={props.range.max}
        step={props.range.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  )
}

function Switch(props: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: ReactNode
}) {
  return (
    <div className="setting">
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span>{props.label}</span>
      </label>
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  )
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

export function SettingsView(props: { device: DeviceApi }) {
  const p = useSyncExternalStore(prefsStore.subscribe, prefsStore.get)
  const set = prefsStore.set
  const recommended = verifyFor(appConfig().verify)
  const lagos = market().id === 'ng'
  const [saving, setSaving] = useState<'idle' | 'saving' | 'error'>('idle')
  const { device } = props

  return (
    <div className="settings" aria-labelledby="settings-h">
      <h3 id="settings-h" className="settings-title">
        Settings
      </h3>
      <p className="hint">
        Changes apply straight away and are kept in this browser.
      </p>

      <section className="card" data-tone="ask" aria-labelledby="look-h">
        <h3 id="look-h">Appearance</h3>
        <Segmented
          legend="Theme"
          options={THEMES}
          value={p.theme}
          onChange={(theme) => set({ theme })}
          label={(t) => (t === 'system' ? 'Match browser' : cap(t))}
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

      <section className="card" data-tone="reply" aria-labelledby="replies-h">
        <h3 id="replies-h">Replies</h3>
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
        <h3 id="match-h">Matching payments</h3>
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

      <section className="card" aria-labelledby="ai-h">
        <h3 id="ai-h">AI on this computer</h3>
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
        <h3 id="data-h">Your records</h3>
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
