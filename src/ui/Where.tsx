import { whereSaid, type Where as Place } from './deskActions'
import { Icon } from './icons'

// Where an action runs, as icons: a laptop for this computer, a cloud for
// Google's service, both when it can run either way.
export function Where(props: { where: Place[] }) {
  const said = whereSaid(props.where)
  return (
    <span className="where" role="img" aria-label={said} title={said}>
      {props.where.map((w) => (
        <Icon key={w} name={w} size={15} />
      ))}
    </span>
  )
}
