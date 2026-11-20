import {
  getGenerativeModel,
  InferenceMode,
  Schema,
  type GenerativeModel,
} from 'firebase/ai'
import { DEFAULTS } from '../config/defaults'
import { ai } from '../firebase'
import { parsePdfReceiptText } from '../verify/pdfReceipt'
import { RAW_RECEIPT_FIELDS, type RawReceipt } from '../verify/receiptFields'
import { pdfText } from './pdfText'
import { generateJson, pickStrings, type Reading } from './run'

// Amounts and IDs are requested as strings: a numeric constraint makes the
// on-device model drop commas and run digits together.
const onDeviceSchema = {
  type: 'object',
  properties: Object.fromEntries(
    RAW_RECEIPT_FIELDS.map((k) => [k, { type: 'string' }]),
  ),
  required: [...RAW_RECEIPT_FIELDS],
  additionalProperties: false,
}

const cloudSchema = Schema.object({
  properties: Object.fromEntries(
    RAW_RECEIPT_FIELDS.map((k) => [k, Schema.string()]),
  ),
})

const PROMPT = `This is a Nigerian bank transfer receipt. Copy these fields exactly as printed, or an empty string if absent:
issuer: the bank or app named in the receipt's logo or header
amountText: the amount transferred, with its symbol and commas
statusText: the status words, such as Successful, Pending or Failed
sender: the payer's name (may be labelled Sender, From, Debit Account or Account Name)
recipient: the beneficiary's name
sessionId: the value labelled Session ID, digits and letters only
reference: any other transaction reference or number, digits and letters only
dateTime: the transaction date and time as printed`

const createOptions = {
  expectedInputs: [
    { type: 'text' as const, languages: ['en'] },
    { type: 'image' as const },
  ],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
}

// Receipts hold customer and bank details, so the default path never leaves
// the device. The cloud path exists only for a vendor who has consented.
const onDevice = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions,
    promptOptions: { responseConstraint: onDeviceSchema },
  },
})

const consented = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: {
    createOptions,
    promptOptions: { responseConstraint: onDeviceSchema },
  },
  inCloudParams: {
    model: DEFAULTS.cloudModel,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: cloudSchema,
    },
  },
})

export type ReceiptImage = { mimeType: string; base64: string }

// The on-device model accepts only these image types.
export const RECEIPT_IMAGE_TYPES = ['image/png', 'image/jpeg']

function pick(cloudConsent: boolean): GenerativeModel {
  return cloudConsent ? consented : onDevice
}

export function prepareReceiptModel(
  onProgress: (fraction: number) => void,
): Promise<void> {
  return onDevice.initializeDeviceModel(onProgress)
}

export async function readReceiptImage(
  image: ReceiptImage,
  cloudConsent: boolean,
): Promise<Reading<RawReceipt>> {
  if (!RECEIPT_IMAGE_TYPES.includes(image.mimeType)) {
    throw new Error(
      `Receipt images must be PNG or JPEG, not ${image.mimeType}.`,
    )
  }
  const { json, source, ms } = await generateJson(pick(cloudConsent), [
    PROMPT,
    {
      type: 'inlineData',
      inlineData: { mimeType: image.mimeType, data: image.base64 },
    },
  ])
  return { fields: pickStrings(json, RAW_RECEIPT_FIELDS), source, ms }
}

// PDF receipts carry a text layer, so their text is read instead of an image.
export async function readReceiptText(
  text: string,
  cloudConsent: boolean,
): Promise<Reading<RawReceipt>> {
  const { json, source, ms } = await generateJson(pick(cloudConsent), [
    `${PROMPT}\n\nReceipt text:\n${text.slice(0, 6000)}`,
  ])
  return { fields: pickStrings(json, RAW_RECEIPT_FIELDS), source, ms }
}

// A PDF receipt is read by rules from its text layer; only a layout the rules
// do not know goes to the model.
export async function readReceiptPdf(
  data: ArrayBuffer,
  cloudConsent: boolean,
): Promise<Reading<RawReceipt>> {
  const started = performance.now()
  const text = await pdfText(data)
  const fields = parsePdfReceiptText(text)
  if (fields) {
    return {
      fields,
      source: 'Rules',
      ms: Math.round(performance.now() - started),
    }
  }
  return readReceiptText(text, cloudConsent)
}
