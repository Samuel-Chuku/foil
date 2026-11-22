import { market } from '../config/market'
import { Schema } from 'firebase/ai'
import { RAW_REFUND_FIELDS, type RawRefundTo } from '../capture/refundDetails'
import { privateModels, TEXT_ONLY } from './device'
import { generateJson, pickStrings, type Reading } from './run'

const onDeviceSchema = {
  type: 'object',
  properties: Object.fromEntries(
    RAW_REFUND_FIELDS.map((k) => [k, { type: 'string' }]),
  ),
  required: [...RAW_REFUND_FIELDS],
  additionalProperties: false,
}

const cloudSchema = Schema.object({
  properties: Object.fromEntries(
    RAW_REFUND_FIELDS.map((k) => [k, Schema.string()]),
  ),
})

const prompt =
  () => `Below is a WhatsApp chat between a ${market().city} shop ("You") and a customer who is owed a refund. Copy the account the customer asked for the refund to be sent to, exactly as written, or an empty string if they have not given one:
accountNumber: the account number, digits only
bank: the bank or app name
accountName: the name on the account

Chat:
`

// An account number is the customer's own data: read on the device unless the
// vendor has consented to the cloud.
const model = privateModels({
  createOptions: TEXT_ONLY,
  onDeviceSchema,
  cloudConfig: {
    responseMimeType: 'application/json',
    responseSchema: cloudSchema,
  },
})

export async function readRefundTo(
  chat: string,
  cloudConsent: boolean,
): Promise<Reading<RawRefundTo>> {
  const { json, source, ms } = await generateJson(model(cloudConsent), [
    prompt() + chat,
  ])
  return { fields: pickStrings(json, RAW_REFUND_FIELDS), source, ms }
}
