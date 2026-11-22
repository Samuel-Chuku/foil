import { market, type MarketId } from '../config/market'
import { Schema } from 'firebase/ai'
import { parsePdfReceiptText } from '../verify/pdfReceipt'
import { RAW_RECEIPT_FIELDS, type RawReceipt } from '../verify/receiptFields'
import { privateModels, TEXT_AND_IMAGE } from './device'
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

// What each market's receipts call their parts. The model copies text; code
// decides what it means.
const RECEIPT_WORDS: Record<MarketId, { kind: string; ref: string }> = {
  ng: {
    kind: 'a Nigerian bank transfer receipt',
    ref: 'the value labelled Session ID',
  },
  in: {
    kind: 'an Indian UPI payment receipt from an app such as Google Pay, PhonePe or Paytm, or a bank app',
    ref: 'the 12-digit UPI transaction ID, UPI Ref No or UTR',
  },
  br: {
    kind: 'a Brazilian Pix receipt ("comprovante"), which may be in Portuguese',
    ref: 'the Pix transaction ID ("ID da transação" or "ID E2E"), which starts with E',
  },
}

export function receiptPrompt(id: MarketId = market().id): string {
  const w = RECEIPT_WORDS[id]
  return `This is ${w.kind}. Copy these fields exactly as printed, or an empty string if absent:
issuer: the bank or app named in the receipt's logo or header
amountText: the amount transferred, with its symbol and separators
statusText: the status words, such as Successful, Pending or Failed, in the receipt's own language
sender: the payer's name (may be labelled Sender, From, Debit Account, Account Name, Paid by or Pagador)
recipient: the beneficiary's name
sessionId: ${w.ref}, digits and letters only
reference: any other transaction reference or number, digits and letters only
dateTime: the transaction date and time as printed`
}

// Receipts hold customer and bank details, so the default path never leaves
// the device. The cloud path exists only for a vendor who has consented.
const model = privateModels({
  createOptions: TEXT_AND_IMAGE,
  onDeviceSchema,
  cloudConfig: {
    responseMimeType: 'application/json',
    responseSchema: cloudSchema,
  },
})

export type ReceiptImage = { mimeType: string; base64: string }

// The on-device model accepts only these image types.
export const RECEIPT_IMAGE_TYPES = ['image/png', 'image/jpeg']

export function prepareReceiptModel(
  onProgress: (fraction: number) => void,
): Promise<void> {
  return model(false).initializeDeviceModel(onProgress)
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
  const { json, source, ms } = await generateJson(model(cloudConsent), [
    receiptPrompt(),
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
  const { json, source, ms } = await generateJson(model(cloudConsent), [
    `${receiptPrompt()}\n\nReceipt text:\n${text.slice(0, 6000)}`,
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
