import type { Reading } from '../ai/run'
import { SourceBadge } from './SourceBadge'

// Where a result came from and how long it took.
export function Badge(props: {
  source: Reading<unknown>['source']
  ms: number
}) {
  return (
    <p className="meta">
      <SourceBadge source={props.source} /> {(props.ms / 1000).toFixed(1)} s
    </p>
  )
}
