import { Schema } from 'firebase/ai'
import type { RawRules } from '../capture/shopRules'
import { privateModels, TEXT_AND_IMAGE } from './device'
import { RECEIPT_IMAGE_TYPES, type ReceiptImage } from './receipt'
import { generateJson, type Reading } from './run'

const TEXT_FIELDS = [
  'methods',
  'otherAreasFee',
  'pickupAddress',
  'pickupHours',
  'paymentWait',
  'refundTerms',
  'otherRules',
] as const

const str = { type: 'string' }
const onDeviceSchema = {
  type: 'object',
  properties: {
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, str])),
    areaFees: {
      type: 'array',
      items: {
        type: 'object',
        properties: { area: str, fee: str },
        required: ['area', 'fee'],
        additionalProperties: false,
      },
    },
    parks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { state: str, park: str, fee: str },
        required: ['state', 'park', 'fee'],
        additionalProperties: false,
      },
    },
  },
  required: [...TEXT_FIELDS, 'areaFees', 'parks'],
  additionalProperties: false,
}

const cloudSchema = Schema.object({
  properties: {
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, Schema.string()])),
    areaFees: Schema.array({
      items: Schema.object({
        properties: { area: Schema.string(), fee: Schema.string() },
      }),
    }),
    parks: Schema.array({
      items: Schema.object({
        properties: {
          state: Schema.string(),
          park: Schema.string(),
          fee: Schema.string(),
        },
      }),
    }),
  },
})

const PROMPT = `This is part of a Nigerian small shop's own rules for customers. Copy what it says, exactly as written, or an empty string or empty list if it does not say:
methods: how the shop delivers, in its own words (own rider, courier, customer's rider, pickup, nationwide or park delivery)
areaFees: each delivery area within the city and its fee
otherAreasFee: the fee for areas not listed
parks: each other state the shop sends to, the park there, and the fee
pickupAddress: where customers pick up from
pickupHours: when customers can pick up
paymentWait: how long the shop waits for a transfer to arrive
refundTerms: the refund and exchange terms
otherRules: every other rule, copied as written`

// The shop's own documents: read on the device, unless the vendor consented.
const model = privateModels({
  createOptions: TEXT_AND_IMAGE,
  onDeviceSchema,
  cloudConfig: {
    responseMimeType: 'application/json',
    responseSchema: cloudSchema,
  },
})

function pick(json: unknown): RawRules {
  const o = (json && typeof json === 'object' ? json : {}) as Record<
    string,
    unknown
  >
  const s = (v: unknown) =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : ''
  const rows = (v: unknown) =>
    (Array.isArray(v) ? v : []).map(
      (r) => (r && typeof r === 'object' ? r : {}) as Record<string, unknown>,
    )
  return {
    methods: s(o.methods),
    areaFees: rows(o.areaFees).map((r) => ({ area: s(r.area), fee: s(r.fee) })),
    otherAreasFee: s(o.otherAreasFee),
    parks: rows(o.parks).map((r) => ({
      state: s(r.state),
      park: s(r.park),
      fee: s(r.fee),
    })),
    pickupAddress: s(o.pickupAddress),
    pickupHours: s(o.pickupHours),
    paymentWait: s(o.paymentWait),
    refundTerms: s(o.refundTerms),
    otherRules: s(o.otherRules),
  }
}

export async function readRulesText(
  text: string,
  cloudConsent: boolean,
): Promise<Reading<RawRules>> {
  const { json, source, ms } = await generateJson(model(cloudConsent), [
    `${PROMPT}\n\nRules:\n${text}`,
  ])
  return { fields: pick(json), source, ms }
}

export async function readRulesImage(
  image: ReceiptImage,
  cloudConsent: boolean,
): Promise<Reading<RawRules>> {
  if (!RECEIPT_IMAGE_TYPES.includes(image.mimeType)) {
    throw new Error(`Screenshots must be PNG or JPEG, not ${image.mimeType}.`)
  }
  const { json, source, ms } = await generateJson(model(cloudConsent), [
    PROMPT,
    {
      type: 'inlineData',
      inlineData: { mimeType: image.mimeType, data: image.base64 },
    },
  ])
  return { fields: pick(json), source, ms }
}
