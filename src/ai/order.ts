import { Schema } from 'firebase/ai'
import { pickOrder, type RawOrder } from '../capture/orderFields'
import { privateModels, TEXT_ONLY } from './device'
import { generateJson, type Reading } from './run'

const FIELDS = ['total', 'customerName', 'address', 'landmark', 'area'] as const

// Prices and quantities are strings for the same reason as on receipts: the
// model copies "₦15,000" faithfully but mangles it when forced into a number.
const onDeviceSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'string' },
          price: { type: 'string' },
        },
        required: ['name', 'quantity', 'price'],
        additionalProperties: false,
      },
    },
    ...Object.fromEntries(FIELDS.map((k) => [k, { type: 'string' }])),
  },
  required: ['items', ...FIELDS],
  additionalProperties: false,
}

const cloudSchema = Schema.object({
  properties: {
    items: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string(),
          quantity: Schema.string(),
          price: Schema.string(),
        },
      }),
    }),
    ...Object.fromEntries(FIELDS.map((k) => [k, Schema.string()])),
  },
})

// The chat holds the customer's address and name, so it stays on the device
// unless the vendor has consented to the cloud.
const model = privateModels({
  createOptions: TEXT_ONLY,
  onDeviceSchema,
  cloudConfig: {
    responseMimeType: 'application/json',
    responseSchema: cloudSchema,
  },
})

const PROMPT = `Below is a WhatsApp chat between a Lagos shop ("You") and a customer. Copy the order the customer agreed to, exactly as written in the chat, or an empty string if absent. Never calculate or invent anything.
items: each item ordered, with its quantity and its unit price as stated in the chat
total: the total amount stated in the chat
customerName: the customer's name, if they gave it
address: the delivery address; empty if they will pick up
landmark: a landmark near the address
area: the Lagos area or neighbourhood, such as Yaba or Ikeja

Chat:
`

export async function readOrder(
  chat: string,
  cloudConsent: boolean,
): Promise<Reading<RawOrder>> {
  const { json, source, ms } = await generateJson(model(cloudConsent), [
    PROMPT + chat,
  ])
  return { fields: pickOrder(json), source, ms }
}
