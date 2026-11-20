import { Schema } from 'firebase/ai'
import { RAW_HISTORY_FIELDS, type RawHistoryRow } from '../verify/history'
import { privateModels, TEXT_AND_IMAGE } from './device'
import { RECEIPT_IMAGE_TYPES, type ReceiptImage } from './receipt'
import { generateJson, pickStrings, type Reading } from './run'

// Every value is a string for the same reason as receipts: the model copies
// "-₦5,000.00" faithfully but mangles it when forced into a number.
const rowProperties = Object.fromEntries(
  RAW_HISTORY_FIELDS.map((k) => [k, { type: 'string' }]),
)

const onDeviceSchema = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: rowProperties,
        required: [...RAW_HISTORY_FIELDS],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
}

const cloudSchema = Schema.object({
  properties: {
    rows: Schema.array({
      items: Schema.object({
        properties: Object.fromEntries(
          RAW_HISTORY_FIELDS.map((k) => [k, Schema.string()]),
        ),
      }),
    }),
  },
})

const PROMPT = `This is a screenshot of a Nigerian bank app's transaction history. Copy every transaction row, top to bottom, exactly as printed, or an empty string if absent:
amountText: the amount with its sign, symbol and commas
direction: any word or marker showing money in or out, such as Credit, Debit, In or Out
description: the row's description or narration, including any long number, exactly as shown
dateTime: the row's date and time as printed; if the row shows only a time, copy the date heading above it as well`

// The vendor's own account history: on the device, unless they consented.
const model = privateModels({
  createOptions: TEXT_AND_IMAGE,
  onDeviceSchema,
  cloudConfig: {
    responseMimeType: 'application/json',
    responseSchema: cloudSchema,
  },
})

export async function readHistoryImage(
  image: ReceiptImage,
  cloudConsent: boolean,
): Promise<Reading<RawHistoryRow[]>> {
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
  const rows =
    json &&
    typeof json === 'object' &&
    'rows' in json &&
    Array.isArray(json.rows)
      ? (json.rows as unknown[])
      : []
  return {
    fields: rows.map((r) => pickStrings(r, RAW_HISTORY_FIELDS)),
    source,
    ms,
  }
}
