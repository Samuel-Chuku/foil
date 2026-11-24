// The desk's icon set: one 24px grid, a 1.75 stroke, round ends, drawn in
// currentColor so an icon takes the colour of the text or chip it sits in.
// Icons label; they never replace the words beside them.

const PATHS = {
  // Where a result came from.
  // A laptop: worked out on this computer.
  device: (
    <>
      <rect x="4.5" y="5" width="15" height="10.5" rx="1.75" />
      <path d="M2.5 18.5h19" />
    </>
  ),
  cloud: (
    <path d="M7.5 18.5h9.25a4.25 4.25 0 0 0 .4-8.48A5.75 5.75 0 0 0 6.1 11.3 3.6 3.6 0 0 0 7.5 18.5Z" />
  ),
  rules: (
    <>
      <path d="M9 7h11M9 12h11M9 17h11" />
      <path d="m3.5 7 1.25 1.25L7 6M3.5 12l1.25 1.25L7 11M3.5 17l1.25 1.25L7 16" />
    </>
  ),
  // Tabs.
  chat: (
    <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z" />
  ),
  today: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      <circle cx="12" cy="15" r="1.75" />
    </>
  ),
  money: (
    <>
      <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
      <path d="M16 12.5h1.5M3.5 10h17" />
    </>
  ),
  shop: (
    <>
      <path d="M4.5 10v9.5h15V10" />
      <path d="M3.5 6 5 3.5h14L20.5 6v1.5a2.75 2.75 0 0 1-5.5 0 2.75 2.75 0 0 1-5.5 0 2.75 2.75 0 0 1-5.5 0Z" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  // Cards.
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12.5H6Z" />
      <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </>
  ),
  reply: (
    <>
      <path d="M9.5 6 4 11l5.5 5" />
      <path d="M4 11h9.5a6.5 6.5 0 0 1 6.5 6.5V19" />
    </>
  ),
  spark: (
    <path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5ZM18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z" />
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6.5h11v10H3ZM14 10h4l3 3.5v3h-7" />
      <circle cx="7" cy="18" r="1.75" />
      <circle cx="17.5" cy="18" r="1.75" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z" />
      <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2Z" />
      <path d="M5 18a2 2 0 0 1 2-2h11.5M9 8.5h6" />
    </>
  ),
  chart: <path d="M4 4v16h16M8 16v-4M12 16V8M16 16v-6" />,
  pulse: <path d="M3 12.5h4l2.5-6 4 11 2.5-5h5" />,
  table: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M12 13v4M10 15h4" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" />
    </>
  ),
  // Actions.
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" />
      <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  back: <path d="M14.5 6 8.5 12l6 6" />,
  pin: <path d="M9 4h6l-1 6 3.5 3.5h-11L10 10 9 4ZM12 13.5V20" />,
} as const

export type IconName = keyof typeof PATHS

export function Icon(props: { name: IconName; size?: number }) {
  const size = props.size ?? 16
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[props.name]}
    </svg>
  )
}
