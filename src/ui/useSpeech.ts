import { useCallback, useEffect, useState } from 'react'
import { pickVoice, type VoiceInfo } from '../config/speech'

// Reading answers aloud with Chrome's own voices, preferring ones that run
// on this computer. Nothing here is a model call: it is the browser's
// speech synthesis, given the answer the desk already shows.

const synth = (): SpeechSynthesis | null =>
  typeof speechSynthesis === 'undefined' ? null : speechSynthesis

export type SpeakResult = 'spoken' | 'no-voice' | 'stopped'

export function useSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    const s = synth()
    if (!s) return
    // Chrome lists its voices a moment after the page loads.
    const load = () => setVoices(s.getVoices())
    load()
    s.addEventListener('voiceschanged', load)
    return () => {
      s.removeEventListener('voiceschanged', load)
      s.cancel()
    }
  }, [])

  const info: VoiceInfo[] = voices.map((v) => ({
    name: v.name,
    lang: v.lang,
    localService: v.localService,
  }))

  const speak = useCallback(
    (
      text: string,
      lang: string,
      opts: { voiceName: string; rate: number },
    ): Promise<SpeakResult> => {
      const s = synth()
      const choice = pickVoice(
        voices.map((v) => ({
          name: v.name,
          lang: v.lang,
          localService: v.localService,
        })),
        lang,
        opts.voiceName,
      )
      const voice = voices.find((v) => v.name === choice?.name)
      if (!s || !voice) return Promise.resolve('no-voice')
      s.cancel()
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text)
        u.voice = voice
        u.lang = voice.lang
        u.rate = opts.rate / 100
        u.onend = () => {
          setSpeaking(false)
          resolve('spoken')
        }
        u.onerror = () => {
          setSpeaking(false)
          resolve('stopped')
        }
        setSpeaking(true)
        s.speak(u)
      })
    },
    [voices],
  )

  const stop = useCallback(() => {
    synth()?.cancel()
    setSpeaking(false)
  }, [])

  return { voices: info, speak, stop, speaking }
}

export type SpeechApi = ReturnType<typeof useSpeech>
