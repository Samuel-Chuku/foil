import { useCallback, useEffect, useRef, useState } from 'react'
import type { Approved, CloudRequest } from '../cloud/approval'
import { cloudModel, sendApproved } from '../cloud/send'
import { market } from '../config/market'
import { speechLangs } from '../config/speech'

// Asking the desk by voice. On this computer, Chrome's speech recognition
// runs with processLocally set, so neither the audio nor the words leave the
// machine; the words then go through Ask the desk like typed ones. Where
// Chrome cannot recognise speech locally, the question is recorded and,
// after the owner approves the recording, written down by the cloud model
// through Firebase AI Logic.

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

type SpeechOptions = { langs: string[]; processLocally: boolean }

// The parts of the Web Speech API this uses, including the on-device
// additions (Chrome 139), which TypeScript's DOM types do not have yet.
type Recognition = EventTarget & {
  lang: string
  interimResults: boolean
  continuous: boolean
  processLocally: boolean
  phrases?: unknown[]
  start(): void
  stop(): void
  abort(): void
  onresult:
    | ((e: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >
      }) => void)
    | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionClass = {
  new (): Recognition
  available?(o: SpeechOptions): Promise<Availability>
  install?(o: SpeechOptions): Promise<boolean>
}
type PhraseClass = new (phrase: string, boost?: number) => unknown

const speech = (): RecognitionClass | undefined =>
  (globalThis as { SpeechRecognition?: RecognitionClass }).SpeechRecognition

const phraseClass = (): PhraseClass | undefined =>
  (globalThis as { SpeechRecognitionPhrase?: PhraseClass })
    .SpeechRecognitionPhrase

export type VoiceMode = 'device' | 'device-download' | 'cloud' | 'none'

export type VoiceState =
  | { status: 'idle' }
  | { status: 'listening'; heard: string; mode: 'device' | 'cloud' }
  | { status: 'writing'; note: string }
  | { status: 'error'; message: string }

const MAX_RECORD_MS = 30_000

const transcriber = cloudModel()

export function voiceQuestionRequest(audio: {
  mimeType: string
  base64: string
  seconds: number
}): CloudRequest {
  return {
    feature: 'Ask the desk by voice',
    reason:
      'This computer cannot recognise speech on its own, so your spoken question is written down by the cloud model. Only the recording goes; the written question then waits in the box for you.',
    texts: [
      "Write down the shop owner's spoken question exactly, in the language they spoke, as one plain line. Output only the question.",
    ],
    attachment: {
      kind: 'audio',
      mimeType: audio.mimeType,
      base64: audio.base64,
      label: `Your question, ${Math.round(audio.seconds)} s`,
    },
    replaced: [],
  }
}

// What this browser offers for voice: speech recognised on the device (or
// ready to download), a recording for the cloud, or nothing.
async function probe(): Promise<{ mode: VoiceMode; lang: string }> {
  const locale = market().currency.locale
  const SR = speech()
  if (SR?.available) {
    for (const lang of speechLangs(locale)) {
      try {
        const a = await SR.available({ langs: [lang], processLocally: true })
        if (a === 'available') return { mode: 'device', lang }
        if (a !== 'unavailable') return { mode: 'device-download', lang }
      } catch {
        // Treated as unavailable; the next language is tried.
      }
    }
  }
  const canRecord =
    typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices
  return { mode: canRecord ? 'cloud' : 'none', lang: locale }
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error ?? new Error('Could not read the audio.'))
    r.readAsDataURL(blob)
  })

export function useVoiceAsk(props: {
  // Product names and order numbers, so they are heard right.
  vocabulary: string[]
  onQuestion: (text: string) => void
  ask: (request: CloudRequest) => Promise<Approved | null>
  online: boolean
}) {
  const [mode, setMode] = useState<VoiceMode>('none')
  const [state, setState] = useState<VoiceState>({ status: 'idle' })
  const rec = useRef<Recognition | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const { onQuestion, ask } = props

  const [lang, setLang] = useState(() => market().currency.locale)

  useEffect(() => {
    let live = true
    void probe().then((p) => {
      if (!live) return
      setMode(p.mode)
      setLang(p.lang)
    })
    return () => {
      live = false
    }
  }, [])

  // Chrome downloads the speech pack only from a click.
  const download = useCallback(async () => {
    const SR = speech()
    if (!SR?.install) return
    setState({
      status: 'writing',
      note: 'Downloading speech for this computer…',
    })
    try {
      const ok = await SR.install({ langs: [lang], processLocally: true })
      setState(
        ok
          ? { status: 'idle' }
          : {
              status: 'error',
              message: 'Chrome could not add speech for this language.',
            },
      )
    } catch {
      setState({
        status: 'error',
        message: 'Chrome could not download speech recognition. Try again.',
      })
    }
    const p = await probe()
    setMode(p.mode)
    setLang(p.lang)
  }, [lang])

  const listenOnDevice = useCallback(
    (withPhrases: boolean) => {
      const listen = (withPhrases: boolean): void => {
        const SR = speech()
        if (!SR) return
        const r = new SR()
        r.lang = lang
        r.processLocally = true
        r.interimResults = true
        r.continuous = false
        const Phrase = phraseClass()
        if (withPhrases && Phrase && r.phrases) {
          for (const p of props.vocabulary.slice(0, 50)) {
            r.phrases.push(new Phrase(p, 3))
          }
        }
        let heard = ''
        // Some builds take no vocabulary; the question is then heard again
        // without it.
        let retry = false
        r.onresult = (e) => {
          heard = Array.from(e.results)
            .map((x) => x[0]?.transcript ?? '')
            .join(' ')
            .trim()
          setState({ status: 'listening', heard, mode: 'device' })
        }
        r.onerror = (e) => {
          if (e.error === 'phrases-not-supported' && withPhrases) {
            retry = true
            return
          }
          if (e.error === 'no-speech' || e.error === 'aborted') return
          heard = ''
          setState({
            status: 'error',
            message:
              e.error === 'not-allowed'
                ? 'The microphone is blocked. Allow it for this page and try again.'
                : 'Speech recognition stopped. Try again, or type the question.',
          })
        }
        r.onend = () => {
          rec.current = null
          if (retry) return listen(false)
          setState((s) => (s.status === 'error' ? s : { status: 'idle' }))
          if (heard) onQuestion(heard)
        }
        rec.current = r
        setState({ status: 'listening', heard: '', mode: 'device' })
        r.start()
      }
      listen(withPhrases)
    },
    [lang, onQuestion, props.vocabulary],
  )

  const recordForCloud = useCallback(async () => {
    if (!props.online) {
      setState({
        status: 'error',
        message:
          'You are offline, and this computer cannot hear you without the internet. Type the question instead.',
      })
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setState({
        status: 'error',
        message:
          'The microphone is blocked. Allow it for this page and try again.',
      })
      return
    }
    const chunks: Blob[] = []
    const r = new MediaRecorder(stream)
    const started = performance.now()
    const timer = setTimeout(
      () => r.state === 'recording' && r.stop(),
      MAX_RECORD_MS,
    )
    r.ondataavailable = (e) => chunks.push(e.data)
    r.onstop = async () => {
      clearTimeout(timer)
      stream.getTracks().forEach((t) => t.stop())
      recorder.current = null
      const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' })
      const seconds = (performance.now() - started) / 1000
      try {
        const approved = await ask(
          voiceQuestionRequest({
            mimeType: blob.type.split(';')[0] || 'audio/webm',
            base64: await toBase64(blob),
            seconds,
          }),
        )
        if (!approved) {
          setState({ status: 'idle' })
          return
        }
        setState({ status: 'writing', note: 'Writing down your question…' })
        const { text } = await sendApproved(transcriber(), approved)
        setState({ status: 'idle' })
        const q = text.trim()
        if (q) onQuestion(q)
      } catch {
        setState({
          status: 'error',
          message:
            'The question could not be written down. Try again, or type it.',
        })
      }
    }
    recorder.current = r
    setState({ status: 'listening', heard: '', mode: 'cloud' })
    r.start()
  }, [ask, onQuestion, props.online])

  const start = useCallback(() => {
    if (mode === 'device') listenOnDevice(true)
    else if (mode === 'cloud') void recordForCloud()
  }, [mode, listenOnDevice, recordForCloud])

  const stop = useCallback(() => {
    rec.current?.stop()
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }, [])

  return { mode, state, start, stop, download }
}
