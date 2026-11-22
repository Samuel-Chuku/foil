import {
  DEFAULT_PHOTO_THRESHOLDS,
  type PhotoThresholds,
} from '../capture/imageMatch'
import type { BankInfo, VerifyConfig } from '../verify/types'
import {
  DEFAULT_CLOUD_MODEL,
  DEFAULT_PIDGIN_GLOSSARY,
  DEFAULT_VERIFY,
} from './defaults'

export type AppConfig = {
  cloudModel: string
  verify: VerifyConfig
  pidginGlossary: Record<string, string>
  photoMatch: PhotoThresholds
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  cloudModel: DEFAULT_CLOUD_MODEL,
  verify: DEFAULT_VERIFY,
  pidginGlossary: DEFAULT_PIDGIN_GLOSSARY,
  photoMatch: DEFAULT_PHOTO_THRESHOLDS,
}

// Remote Config parameter names, as they appear in the Firebase console.
export const KEYS = {
  cloudModel: 'cloud_model',
  banks: 'banks',
  nameThreshold: 'name_threshold',
  interbankWindowMin: 'interbank_window_min',
  sameBankWindowMin: 'same_bank_window_min',
  clockToleranceMin: 'clock_tolerance_min',
  sessionOffsetsMin: 'session_offsets_min',
  pidginGlossary: 'pidgin_glossary',
  photoSure: 'photo_match_sure',
  photoGap: 'photo_match_gap',
  photoLikely: 'photo_match_likely',
} as const

// Remote Config holds every value as text. These defaults are what the
// console template should hold too.
export function remoteDefaults(): Record<string, string> {
  const v = DEFAULT_VERIFY
  return {
    [KEYS.cloudModel]: DEFAULT_CLOUD_MODEL,
    [KEYS.banks]: JSON.stringify(v.banks),
    [KEYS.nameThreshold]: String(v.nameThreshold),
    [KEYS.interbankWindowMin]: String(v.interbankWindowMin),
    [KEYS.sameBankWindowMin]: String(v.sameBankWindowMin),
    [KEYS.clockToleranceMin]: String(v.clockToleranceMin),
    [KEYS.sessionOffsetsMin]: JSON.stringify(v.sessionOffsetsMin),
    [KEYS.pidginGlossary]: JSON.stringify(DEFAULT_PIDGIN_GLOSSARY),
    [KEYS.photoSure]: String(DEFAULT_PHOTO_THRESHOLDS.sure),
    [KEYS.photoGap]: String(DEFAULT_PHOTO_THRESHOLDS.gap),
    [KEYS.photoLikely]: String(DEFAULT_PHOTO_THRESHOLDS.likely),
  }
}

function json(text: string | undefined): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

const isStrings = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((s) => typeof s === 'string')

function isBank(x: unknown): x is BankInfo {
  if (!x || typeof x !== 'object') return false
  const b = x as Record<string, unknown>
  return (
    typeof b.id === 'string' &&
    b.id !== '' &&
    typeof b.name === 'string' &&
    typeof b.nipCode === 'string' &&
    /^\d{6}$/.test(b.nipCode) &&
    isStrings(b.aliases) &&
    isStrings(b.alertSenders) &&
    typeof b.receiptShowsSessionId === 'boolean' &&
    (b.sessionOffsetMin === null ||
      (typeof b.sessionOffsetMin === 'number' &&
        Number.isFinite(b.sessionOffsetMin)))
  )
}

function number(
  text: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (text === undefined || text.trim() === '') return fallback
  const n = Number(text)
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

// Each value is checked on its own: one bad parameter falls back to its
// default without discarding the rest. Matching rules never run on a value
// that failed its check.
export function parseAppConfig(values: Record<string, string>): AppConfig {
  const d = DEFAULT_APP_CONFIG
  const banks = json(values[KEYS.banks])
  const offsets = json(values[KEYS.sessionOffsetsMin])
  const glossary = json(values[KEYS.pidginGlossary])
  const model = values[KEYS.cloudModel]?.trim()
  return {
    cloudModel: model && /^[\w.-]+$/.test(model) ? model : d.cloudModel,
    verify: {
      rail: d.verify.rail,
      banks:
        Array.isArray(banks) && banks.length > 0 && banks.every(isBank)
          ? banks
          : d.verify.banks,
      nameThreshold: number(
        values[KEYS.nameThreshold],
        d.verify.nameThreshold,
        0.1,
        1,
      ),
      interbankWindowMin: number(
        values[KEYS.interbankWindowMin],
        d.verify.interbankWindowMin,
        1,
        24 * 60,
      ),
      sameBankWindowMin: number(
        values[KEYS.sameBankWindowMin],
        d.verify.sameBankWindowMin,
        1,
        24 * 60,
      ),
      clockToleranceMin: number(
        values[KEYS.clockToleranceMin],
        d.verify.clockToleranceMin,
        0,
        60,
      ),
      sessionOffsetsMin:
        Array.isArray(offsets) &&
        offsets.length > 0 &&
        offsets.every((n) => typeof n === 'number' && Number.isFinite(n))
          ? (offsets as number[])
          : d.verify.sessionOffsetsMin,
    },
    pidginGlossary:
      glossary &&
      typeof glossary === 'object' &&
      !Array.isArray(glossary) &&
      Object.values(glossary).every((v) => typeof v === 'string')
        ? (glossary as Record<string, string>)
        : d.pidginGlossary,
    photoMatch: {
      sure: number(values[KEYS.photoSure], d.photoMatch.sure, 0.01, 0.5),
      gap: number(values[KEYS.photoGap], d.photoMatch.gap, 0, 0.5),
      likely: number(values[KEYS.photoLikely], d.photoMatch.likely, 0.05, 1),
    },
  }
}
