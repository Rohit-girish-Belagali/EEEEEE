import { clock, describeEvent } from '../lib/format.js'

const TONE = {
  red: 'text-red',
  green: 'text-green',
  amber: 'text-amber',
  muted: 'text-muted',
}

export default function ActivityFeed({ events, limit = 40 }) {
  if (events.length === 0) {
    return (
      <p className="border border-line px-5 py-6 font-mono text-xs text-muted">
        No activity yet. Change a dependency in the watched project — install, update or remove a
        package — and it shows up here as it happens.
      </p>
    )
  }

  return (
    <ol className="border-t border-line font-mono text-xs" aria-live="polite">
      {events.slice(0, limit).map((event) => {
        const { tag, tone, text } = describeEvent(event)
        return (
          <li
            key={event.id}
            className="rise grid grid-cols-[72px_64px_1fr] gap-4 border-b border-line py-2.5 md:grid-cols-[88px_80px_1fr]"
          >
            <span className="tabular-nums text-muted">{clock(new Date(event.timestamp))}</span>
            <span className={`uppercase tracking-[0.14em] ${TONE[tone]}`}>{tag}</span>
            <span className="min-w-0 break-words text-ink/90">{text}</span>
          </li>
        )
      })}
    </ol>
  )
}
