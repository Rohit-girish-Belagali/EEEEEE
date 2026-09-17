import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { LiveProvider, useLive } from '../lib/live.jsx'
import { clock } from '../lib/format.js'

const NAV = [
  { to: '', label: 'Overview', end: true },
  { to: 'dependencies', label: 'Dependencies' },
  { to: 'vulnerabilities', label: 'Vulnerabilities' },
  { to: 'simulation', label: 'Simulation' },
]

export function RippleMark({ className = '' }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" className={className}>
      <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <circle cx="10" cy="10" r="2" fill="var(--color-red)" />
    </svg>
  )
}

function Header({ projectId }) {
  const { connected } = useLive()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="flex h-14 items-stretch border-b border-line">
      <Link to={`/p/${projectId}`} className="flex items-center gap-3 border-r border-line px-6 text-ink">
        <RippleMark />
        <span className="font-display text-sm font-bold tracking-[0.22em]">RIPPLEGUARD</span>
      </Link>

      <nav className="hidden md:flex" aria-label="Sections">
        {NAV.map(({ to, label, end }) => (
          <NavLink
            key={label}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center border-r border-line px-5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors ${
                isActive ? 'bg-panel text-ink' : 'text-muted hover:text-ink'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-6 px-6 font-mono text-[11px] uppercase tracking-[0.16em]">
        <Link to="/add" className="text-ink hover:text-green">
          + Add project
        </Link>
        <span className={connected ? 'text-green' : 'text-red'} role="status">
          <span aria-hidden="true">■ </span>
          {connected ? 'Live stream' : 'Stream offline'}
        </span>
        <span className="tabular-nums text-muted">{clock(now)}</span>
      </div>
    </header>
  )
}

export default function Shell() {
  const { projectId } = useParams()
  return (
    <LiveProvider projectId={projectId}>
      <div className="flex min-h-screen flex-col">
        <Header projectId={projectId} />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </LiveProvider>
  )
}
