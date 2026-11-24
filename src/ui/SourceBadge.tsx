import type { Reading } from '../ai/run'
import { Icon, type IconName } from './icons'

const ICON: Record<Reading<unknown>['source'], IconName> = {
  'On device': 'device',
  Cloud: 'cloud',
  Rules: 'rules',
}

const SAID: Record<Reading<unknown>['source'], string> = {
  'On device': 'Worked out on this computer',
  Cloud: "Worked out in Google's cloud",
  Rules: 'Worked out by Foil’s rules, without a model',
}

// Where a result came from, always from the SDK's own source field (or
// "Rules" for work done without a model), as an icon: a laptop for this
// computer, a cloud for Google's service, a checklist for plain rules. The
// words are its accessible name and its tooltip.
export function SourceBadge(props: { source: Reading<unknown>['source'] }) {
  return (
    <span
      className="badge"
      data-source={props.source}
      role="img"
      aria-label={SAID[props.source]}
      title={SAID[props.source]}
    >
      <Icon name={ICON[props.source]} size={16} />
    </span>
  )
}
