// The vendor's own settings for how the desk looks and behaves, kept in this
// browser. Pure parsing and defaults live here; the store below only reads,
// writes and notifies.

export const THEMES = ['system', 'light', 'dark'] as const
export const ACCENTS = ['ember', 'butter', 'iris', 'sea'] as const
export const DENSITIES = ['comfortable', 'compact'] as const
export const TONES = ['formal', 'friendly', 'casual'] as const
export const LENGTHS = ['short', 'fuller'] as const

export type Theme = (typeof THEMES)[number]
export type Accent = (typeof ACCENTS)[number]
export type Density = (typeof DENSITIES)[number]
export type ReplyTone = (typeof TONES)[number]
export type ReplyLength = (typeof LENGTHS)[number]

export type Prefs = {
  theme: Theme
  accent: Accent
  // Percent; the panel is drawn at this size.
  textScale: number
  density: Density
  // Each section of the panel carries its own colour.
  sectionColours: boolean
  replyTone: ReplyTone
  replyLength: ReplyLength
  // Answer Pidgin with Pidgin (Lagos only).
  pidgin: boolean
  // Minutes either side of a same-bank receipt within which a credit fits,
  // and after an interbank one within which it may land. Null follows the
  // recommended values from Remote Config.
  sameBankWindowMin: number | null
  interbankWindowMin: number | null
  // Whether the shop sells in drops. Null decides from the records: on once
  // the shop has run a drop, so other shops never see drop tools.
  drops: boolean | null
  // The language Ask Foil answers in; empty is the market's own.
  answerLanguage: string
  // Read answers aloud after a spoken question, and in talk mode.
  speakAnswers: boolean
  // The voice that reads them; empty picks one for the language.
  voiceName: string
  // Percent of normal speed.
  speechRate: number
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  accent: 'ember',
  textScale: 100,
  density: 'comfortable',
  sectionColours: true,
  replyTone: 'friendly',
  replyLength: 'short',
  pidgin: true,
  sameBankWindowMin: null,
  interbankWindowMin: null,
  drops: null,
  answerLanguage: '',
  speakAnswers: true,
  voiceName: '',
  speechRate: 100,
}

// The ranges the sliders offer; stored values outside them are pulled in.
export const RANGES = {
  textScale: { min: 90, max: 125, step: 5 },
  sameBankWindowMin: { min: 2, max: 30, step: 1 },
  interbankWindowMin: { min: 15, max: 180, step: 5 },
  speechRate: { min: 70, max: 140, step: 5 },
} as const

const oneOf = <T extends string>(list: readonly T[], v: unknown, d: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v)
    ? (v as T)
    : d

function within(key: keyof typeof RANGES, v: unknown, d: number): number
function within(
  key: keyof typeof RANGES,
  v: unknown,
  d: number | null,
): number | null
function within(key: keyof typeof RANGES, v: unknown, d: number | null) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return d
  const { min, max, step } = RANGES[key]
  return Math.min(max, Math.max(min, Math.round(v / step) * step))
}

// The matching windows with the vendor's choices laid over the recommended
// ones.
export function withWindows<
  T extends { sameBankWindowMin: number; interbankWindowMin: number },
>(base: T, p: Pick<Prefs, 'sameBankWindowMin' | 'interbankWindowMin'>): T {
  return {
    ...base,
    sameBankWindowMin: p.sameBankWindowMin ?? base.sameBankWindowMin,
    interbankWindowMin: p.interbankWindowMin ?? base.interbankWindowMin,
  }
}

// Anything stored by an older version, or edited by hand, falls back to the
// default field by field rather than losing every setting.
export function parsePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >
  const d = DEFAULT_PREFS
  return {
    theme: oneOf(THEMES, r.theme, d.theme),
    accent: oneOf(ACCENTS, r.accent, d.accent),
    textScale: within('textScale', r.textScale, d.textScale),
    density: oneOf(DENSITIES, r.density, d.density),
    sectionColours:
      typeof r.sectionColours === 'boolean'
        ? r.sectionColours
        : d.sectionColours,
    replyTone: oneOf(TONES, r.replyTone, d.replyTone),
    replyLength: oneOf(LENGTHS, r.replyLength, d.replyLength),
    pidgin: typeof r.pidgin === 'boolean' ? r.pidgin : d.pidgin,
    sameBankWindowMin: within(
      'sameBankWindowMin',
      r.sameBankWindowMin,
      d.sameBankWindowMin,
    ),
    interbankWindowMin: within(
      'interbankWindowMin',
      r.interbankWindowMin,
      d.interbankWindowMin,
    ),
    drops: typeof r.drops === 'boolean' ? r.drops : d.drops,
    answerLanguage:
      typeof r.answerLanguage === 'string'
        ? r.answerLanguage
        : d.answerLanguage,
    speakAnswers:
      typeof r.speakAnswers === 'boolean' ? r.speakAnswers : d.speakAnswers,
    voiceName: typeof r.voiceName === 'string' ? r.voiceName : d.voiceName,
    speechRate: within('speechRate', r.speechRate, d.speechRate),
  }
}

// Whether drop tools show: the vendor's choice, or else whether the shop has
// ever run a drop.
export function usesDrops(p: Pick<Prefs, 'drops'>, dropsRun: number) {
  return p.drops ?? dropsRun > 0
}

// What the reply settings ask of the model, as one sentence for the prompt.
export function replyManner(p: Pick<Prefs, 'replyTone' | 'replyLength'>) {
  const tone = {
    formal: 'Write politely and a little formally, with no slang.',
    friendly: 'Be warm and plain.',
    casual: 'Be relaxed and chatty, the way a friend who runs the shop texts.',
  }[p.replyTone]
  const length =
    p.replyLength === 'short'
      ? 'one short WhatsApp reply of one to three sentences'
      : 'one WhatsApp reply of up to five sentences that covers every point fully'
  return { tone, length }
}

// The theme actually drawn, once "system" is resolved.
export function resolvedTheme(theme: Theme, systemDark: boolean) {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}

const KEY = 'desk-prefs'

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    return parsePrefs(raw ? JSON.parse(raw) : {})
  } catch {
    return DEFAULT_PREFS
  }
}

let current: Prefs = read()
const listeners = new Set<() => void>()

export const prefsStore = {
  get: (): Prefs => current,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  set(patch: Partial<Prefs>) {
    current = parsePrefs({ ...current, ...patch })
    try {
      localStorage.setItem(KEY, JSON.stringify(current))
    } catch {
      // Without storage the change lasts until the panel closes.
    }
    listeners.forEach((fn) => fn())
  },
  reset() {
    prefsStore.set(DEFAULT_PREFS)
  },
}

export function prefs(): Prefs {
  return current
}
