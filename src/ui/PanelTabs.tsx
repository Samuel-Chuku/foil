import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'

export type TabId = 'chat' | 'today' | 'money' | 'shop'

// Each tab wears the colour of the section it opens.
const TABS: { id: TabId; label: string; tone: string; icon: IconName }[] = [
  { id: 'chat', label: 'This chat', tone: 'pay', icon: 'chat' },
  { id: 'today', label: 'Today', tone: 'order', icon: 'today' },
  { id: 'money', label: 'Money', tone: 'money', icon: 'money' },
  { id: 'shop', label: 'Shop', tone: 'shop', icon: 'shop' },
]

// The panel's sections as tabs, following the ARIA tabs pattern: arrow keys
// move between tabs, and only the chosen tab is in the Tab order.
export function PanelTabs(props: {
  current: TabId
  onChange: (id: TabId) => void
  // A small count beside a tab, such as money waiting for a decision.
  counts?: Partial<Record<TabId, number>>
}) {
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({})
  const move = (e: KeyboardEvent, i: number) => {
    const to =
      e.key === 'ArrowRight'
        ? (i + 1) % TABS.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + TABS.length) % TABS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? TABS.length - 1
              : null
    if (to === null) return
    e.preventDefault()
    const id = TABS[to]!.id
    props.onChange(id)
    refs.current[id]?.focus()
  }
  return (
    <div className="panel-tabs" role="tablist" aria-label="Foil sections">
      {TABS.map((t, i) => {
        const count = props.counts?.[t.id] ?? 0
        const selected = props.current === t.id
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el
            }}
            type="button"
            role="tab"
            data-tone={t.tone}
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => props.onChange(t.id)}
            onKeyDown={(e) => move(e, i)}
          >
            <Icon name={t.icon} />
            {t.label}
            {count > 0 && (
              <span className="tab-count" aria-label={`, ${count} waiting`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel(props: {
  id: TabId
  current: TabId
  children: ReactNode
}) {
  // Hidden rather than unmounted, so a half-typed question or an unsaved
  // change survives a switch.
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${props.id}`}
      aria-labelledby={`tab-${props.id}`}
      hidden={props.current !== props.id}
      className="tab-panel"
    >
      {props.children}
    </div>
  )
}
