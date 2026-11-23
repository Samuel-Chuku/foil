import { Icon } from './icons'

const SAID = {
  device: 'on this computer',
  cloud: "in Google's cloud, after you approve",
} as const

// Where an action runs, as icons: a laptop for this computer, a cloud for
// Google's service, both when it can run either way.
export function Where(props: { where: ('device' | 'cloud')[] }) {
  const said = `Runs ${props.where.map((w) => SAID[w]).join(' or ')}`
  return (
    <span className="where" role="img" aria-label={said} title={said}>
      {props.where.map((w) => (
        <Icon key={w} name={w} size={15} />
      ))}
    </span>
  )
}
