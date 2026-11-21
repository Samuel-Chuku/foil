import { Schema } from 'firebase/ai'
import type { Approved, CloudRequest } from '../cloud/approval'
import { cloudModel, sendApproved } from '../cloud/send'
import {
  pickVoice,
  VOICE_FIELDS,
  voicePrompt,
  type VoiceNote,
} from '../capture/voice'
import type { Reading } from './run'

const model = cloudModel({
  responseMimeType: 'application/json',
  responseSchema: Schema.object({
    properties: {
      items: Schema.array({
        items: Schema.object({
          properties: {
            name: Schema.string(),
            quantity: Schema.string(),
            unsure: Schema.string(),
          },
        }),
      }),
      ...Object.fromEntries(VOICE_FIELDS.map((k) => [k, Schema.string()])),
      unsure: Schema.array({ items: Schema.string() }),
    },
  }),
})

// The request the vendor is shown: the instructions, which hold only the
// shop's own vocabulary, and the voice note itself.
export function voiceRequest(
  audio: { mimeType: string; base64: string; seconds?: number },
  vocabulary: Parameters<typeof voicePrompt>[0],
): CloudRequest {
  return {
    feature: 'Read a voice note',
    reason:
      'The model on this computer cannot listen to audio, so the voice note is heard in the cloud.',
    texts: [voicePrompt(vocabulary)],
    attachment: {
      kind: 'audio',
      mimeType: audio.mimeType,
      base64: audio.base64,
      label:
        audio.seconds !== undefined
          ? `Voice note, ${Math.round(audio.seconds)} s`
          : 'Voice note',
    },
    replaced: [],
  }
}

export async function readVoiceNote(
  request: Approved,
): Promise<Reading<VoiceNote>> {
  const { text, source, ms } = await sendApproved(model(), request)
  return { fields: pickVoice(JSON.parse(text) as unknown), source, ms }
}
