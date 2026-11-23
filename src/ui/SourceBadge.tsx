import type { Reading } from '../ai/run'
import { Icon, type IconName } from './icons'

const ICON: Record<Reading<unknown>['source'], IconName> = {
  'On device': 'device',
  Cloud: 'cloud',
  Rules: 'rules',
}

// Where a result came from, always from the SDK's own source field (or
// "Rules" for work done without a model): a chip icon for this computer, a
// cloud for Google's service, a checklist for plain rules.
export function SourceBadge(props: { source: Reading<unknown>['source'] }) {
  return (
    <span className="badge" data-source={props.source}>
      <Icon name={ICON[props.source]} size={14} />
      {props.source}
    </span>
  )
}
