import { useState } from 'react'
import {
  prepareDevice,
  probeCloud,
  probeOnDevice,
  probeOnDeviceRegex,
  REGEX_CONSTRAINT,
  type ProbeResult,
} from './ai/smokeTest'

type ProbeState =
  | { status: 'idle' }
  | { status: 'running'; note?: string }
  | { status: 'done'; result: ProbeResult }
  | { status: 'error'; message: string }

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function useProbe(probe: () => Promise<ProbeResult>, needsDevice: boolean) {
  const [state, setState] = useState<ProbeState>({ status: 'idle' })
  const start = async () => {
    setState({ status: 'running' })
    try {
      if (needsDevice) {
        await prepareDevice((fraction) =>
          setState({
            status: 'running',
            note: `Downloading model: ${Math.round(fraction * 100)}%`,
          }),
        )
      }
      setState({ status: 'done', result: await probe() })
    } catch (error) {
      setState({ status: 'error', message: describeError(error) })
    }
  }
  return [state, start] as const
}

function ProbeCard(props: {
  title: string
  detail: string
  state: ProbeState
  onRun: () => void
  check?: (text: string) => string
}) {
  const { state } = props
  return (
    <section className="probe">
      <h2>{props.title}</h2>
      <p>{props.detail}</p>
      <button
        type="button"
        onClick={props.onRun}
        disabled={state.status === 'running'}
      >
        Run
      </button>
      <div aria-live="polite">
        {state.status === 'running' && <p>{state.note ?? 'Running…'}</p>}
        {state.status === 'error' && (
          <p className="error">Error: {state.message}</p>
        )}
        {state.status === 'done' && (
          <>
            <p>
              <span className="badge">{state.result.source}</span>{' '}
              {state.result.ms} ms
            </p>
            <pre>{state.result.text}</pre>
            {props.check && <p>{props.check(state.result.text)}</p>}
          </>
        )}
      </div>
    </section>
  )
}

export default function App() {
  const [device, runDevice] = useProbe(probeOnDevice, true)
  const [regex, runRegex] = useProbe(probeOnDeviceRegex, true)
  const [cloud, runCloud] = useProbe(probeCloud, false)

  return (
    <main>
      <h1>Hybrid inference check</h1>
      <p>
        Each request goes through Firebase AI Logic. The badge comes from the
        response&apos;s inference source.
      </p>
      <ProbeCard
        title="On device only"
        detail="Free text from the on-device model."
        state={device}
        onRun={runDevice}
      />
      <ProbeCard
        title="On device with a regex constraint"
        detail={`Three sample messages, output constrained to ${REGEX_CONSTRAINT.source}. Expected: 1:Q,2:S,3:N`}
        state={regex}
        onRun={runRegex}
        check={(text) =>
          REGEX_CONSTRAINT.test(text.trim())
            ? 'Output matches the constraint.'
            : 'Output does NOT match the constraint.'
        }
      />
      <ProbeCard
        title="Cloud only"
        detail="Free text from the cloud model."
        state={cloud}
        onRun={runCloud}
      />
    </main>
  )
}
