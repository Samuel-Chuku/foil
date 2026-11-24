// A contact's initial on a solid disc, its colour fixed by the name so it
// stays the same between visits and between the chat and the desk.
const AVATAR_TONES = ['pay', 'order', 'reply', 'ask', 'money', 'shop']

export function Avatar(props: { name: string }) {
  const tone =
    AVATAR_TONES[
      [...props.name].reduce((n, ch) => n + ch.charCodeAt(0), 0) %
        AVATAR_TONES.length
    ]
  return (
    <span className="avatar" data-avatar={tone} aria-hidden="true">
      {props.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
