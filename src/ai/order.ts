import { market } from '../config/market'
import { Schema } from 'firebase/ai'
import { pickOrder, type RawOrder } from '../capture/orderFields'
import { privateModels, TEXT_ONLY } from './device'
import { onDevice, type DevicePlan } from './job'
import { generateJson, type Reading } from './run'

const FIELDS = [
  'total',
  'customerName',
  'address',
  'landmark',
  'area',
  'deliveryChoice',
  'state',
  'park',
  'payOnDelivery',
] as const

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

const prompt =
  () => `Below is a WhatsApp chat between a ${market().city} shop ("You") and a customer. Copy the order the customer agreed to, exactly as written in the chat, or an empty string if absent. Never calculate or invent anything.
items: each item ordered, with its quantity and its unit price as stated in the chat
total: the total amount stated in the chat
customerName: the customer's name, if they gave it
address: the delivery address; empty if they will pick up
landmark: a landmark near the address
area: the area or neighbourhood of ${market().city}
deliveryChoice: how the customer wants to receive it, in their words, such as pickup, sending their own rider, or a park
${market().id === 'ng' ? 'state: the Nigerian state or city for delivery, as written, including short forms such as PH or Abj\npark: the motor park they chose in that state\n' : 'state: another city or state for delivery, if outside ' + market().city + '\npark: empty\n'}payOnDelivery: yes if they will pay the delivery fee to the rider on delivery, otherwise empty

Chat:
`

export const planOrder = (chat: string): DevicePlan<Reading<RawOrder>> =>
  onDevice(async (cloudConsent) => {
    const { json, source, ms } = await generateJson(model(cloudConsent), [
      prompt() + chat,
    ])
    return { fields: pickOrder(json), source, ms }
  })
