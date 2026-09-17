import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getOverview, triggerScan } from '../lib/api.js'
import { useLive } from '../lib/live.jsx'
import { duration, timeAgo } from '../lib/format.js'
import Ripple from '../components/Ripple.jsx'
import ActivityFeed from '../components/ActivityFeed.jsx'

const TONE = {
  red: { text: 'text-red', bg: 'bg-red' },
  green: { text: 'text-green', bg: 'bg-green' },
  amber: { text: 'text-amber', bg: 'bg-amber' },
}

const LEVEL_TONE = { critical: 'red', high: 'amber', medium: 'muted', low: 'green' }

function verdictFor(overview, scanning) {
  if (scanning) {
    return {
      word: 'SCANNING.',
      tone: 'amber',
      title: 'Checking every package again.',
      line: 'Re-reading the lockfile and querying OSV and EPSS for each dependency.',
    }
  }
  if (overview.knownVulnerabilities > 0) {
    return {
      word: 'EXPOSED.',
      tone: 'red',
      title: 'Known vulnerabilities reach this application.',
      line: `${overview.knownVulnerabilities} known vulnerabilities in ${overview.vulnerablePackages} packages sit in the dependency tree of ${overview.project}. Highest contextual risk: ${overview.highestRiskPackage}.`,
    }
  }
  return {
    word: 'CLEAR.',
    tone: 'green',
    title: 'Nothing known reaches this application.',
    line: `No known vulnerabilities across ${overview.totalDependencies} packages. RippleGuard keeps watching for changes.`,
  }
}

function Row({ marker, label, children }) {
  return (
    <div className="grid grid-cols-[16px_120px_1fr] items-baseline gap-4 border-t border-line py-3.5">
      <span aria-hidden="true" className={`mt-1 block h-2.5 w-2.5 ${marker}`} />
      <span className="eyebrow">{label}</span>
      <span className="min-w-0 text-sm text-ink/90">{children}</span>
    </div>
  )
}

function Stat({ label, value, note }) {
  return (
    <div className="border border-line bg-panel/60 px-5 py-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-6xl font-extrabold leading-none tabular-nums">{value}</p>
      {note && <p className="mt-2 font-mono text-[11px] text-muted">{note}</p>}
    </div>
  )
}

function Distribution({ dist, total }) {
  const segments = [
    ['critical', 'bg-red'],
    ['high', 'bg-amber'],
    ['medium', 'bg-ink/50'],
    ['low', 'bg-green'],
  ]
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden border border-line">
        {segments.map(([key, cls]) =>
          dist[key] ? <span key={key} className={cls} style={{ width: `${(dist[key] / total) * 100}%` }} /> : null,
        )}
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em]">
        {segments.map(([key, cls]) => (
          <div key={key} className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-2 w-2 ${cls}`} />
            <dt className="text-muted">{key}</dt>
            <dd className="tabular-nums text-ink">{dist[key]}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function Overview() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { events, latest, pulse } = useLive()
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)

  const load = useCallback(() => {
    return getOverview(projectId)
      .then((o) => {
        setOverview(o)
        setScanning(o.scanStatus === 'scanning')
        setError(null)
      })
      .catch((e) => setError(e.message))
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!latest) return
    if (latest.type === 'scan-started') setScanning(true)
    if (latest.type === 'scan-completed' || latest.type === 'scan-failed') load()
  }, [latest, load])

  const rescan = useCallback(() => {
    if (scanning) return
    setScanning(true)
    triggerScan(projectId).catch((e) => setError(e.message)).finally(load)
  }, [projectId, scanning, load])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 's' || e.key === 'S') navigate('simulation')
      if (e.key === 'r' || e.key === 'R') rescan()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, rescan])

  if (error && !overview) {
    return (
      <section className="px-8 py-16">
        <p className="eyebrow">Backend</p>
        <h1 className="mt-4 font-display text-6xl font-extrabold uppercase leading-none text-red">Not reachable.</h1>
        <p className="mt-4 max-w-xl text-muted">
          The dashboard could not reach the RippleGuard API ({error}). Start it from the repository root, then reload.
        </p>
        <pre className="mt-6 inline-block border border-line bg-panel px-5 py-3 font-mono text-sm">npm run server</pre>
      </section>
    )
  }

  if (!overview) {
    return (
      <section className="px-8 py-16">
        <p className="eyebrow">Loading</p>
        <h1 className="mt-4 font-display text-6xl font-extrabold uppercase leading-none text-muted">Reading scan…</h1>
      </section>
    )
  }

  const verdict = verdictFor(overview, scanning)
  const tone = TONE[verdict.tone]
  const pathParts = overview.path.split('/')
  const folder = pathParts.pop()
  const parent = pathParts.join('/') + '/'
  const riskTone = LEVEL_TONE[overview.riskLevel] ?? 'muted'
  const watching = overview.agentStatus === 'active'
  const dist = overview.riskDistribution

  return (
    <>
      <section className="relative border-b border-line px-8 py-14 lg:py-20">
        <Ripple pulse={pulse} tone={verdict.tone} />

        <div className="relative grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <p className="eyebrow">
              Verdict · scan {overview.scanId?.split('_')[1]?.slice(-6) ?? '—'} · {timeAgo(overview.lastScan)}
            </p>
            <h1
              className={`mt-3 font-display text-[clamp(72px,13vw,168px)] font-extrabold leading-[0.85] tracking-tight ${tone.text}`}
            >
              {verdict.word}
            </h1>
            <p className="mt-6 max-w-xl font-display text-3xl font-bold uppercase leading-tight tracking-wide">
              {verdict.title}
            </p>
            <p className="mt-4 max-w-xl text-lg text-muted">{verdict.line}</p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="simulation"
                className="inline-flex h-12 items-center gap-3 bg-green px-6 font-display text-sm font-bold uppercase tracking-[0.14em] text-bg hover:brightness-110"
              >
                Simulate a compromise
                <kbd className="border border-bg/40 px-1.5 py-0.5 font-mono text-[10px] font-normal">S</kbd>
              </Link>
              <button
                type="button"
                onClick={rescan}
                disabled={scanning}
                className="inline-flex h-12 items-center gap-3 border border-amber px-6 font-display text-sm font-bold uppercase tracking-[0.14em] text-amber hover:bg-amber/10 disabled:cursor-wait disabled:opacity-50"
              >
                {scanning ? 'Scanning…' : 'Rescan now'}
                <kbd className="border border-amber/40 px-1.5 py-0.5 font-mono text-[10px] font-normal">R</kbd>
              </button>
              <Link
                to="vulnerabilities"
                className="inline-flex h-12 items-center border border-line px-6 font-display text-sm font-bold uppercase tracking-[0.14em] text-ink hover:border-ink"
              >
                View vulnerabilities
              </Link>
            </div>
          </div>

          <div className="lg:pt-2">
            <p className="eyebrow flex items-center gap-4">
              Project under watch
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
            </p>
            <p className="mt-5 break-all font-mono text-xl leading-snug md:text-2xl">
              <span className="text-muted">{parent}</span>
              <span className={`px-1.5 text-bg ${tone.bg}`}>{folder}</span>
            </p>

            <div className="mt-6">
              <Row marker={watching ? 'bg-green' : 'bg-red'} label="Watcher">
                {watching
                  ? 'Active — rescans when package.json or package-lock.json change'
                  : 'Stopped — changes on disk are not being picked up'}
              </Row>
              <Row marker="border border-muted" label="Last scan">
                {timeAgo(overview.lastScan)} · took {duration(overview.scanDurationMs)}
              </Row>
              <Row marker={TONE[riskTone]?.bg ?? 'border border-muted'} label="Highest risk">
                <span className="font-mono">{overview.highestRiskPackage ?? '—'}</span>
                {overview.highestRiskPackage && (
                  <span className="text-muted">
                    {' '}
                    · {overview.riskScore} / 100 · {overview.riskLevel}
                  </span>
                )}
              </Row>
              <Row marker={overview.knownVulnerabilities ? 'bg-red' : 'bg-green'} label="Findings">
                {overview.knownVulnerabilities} across {overview.vulnerablePackages} packages
              </Row>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-line px-8 py-12">
        <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">What the last scan found</h2>
          <p className="max-w-2xl text-muted">
            Every package in the lockfile is scored, not only the ones with advisories — a clean package at a busy
            junction of the graph still carries structural risk.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Dependencies" value={overview.totalDependencies} note={`${overview.directDependencies} direct`} />
          <Stat label="Vulnerable packages" value={overview.vulnerablePackages} />
          <Stat label="Known vulnerabilities" value={overview.knownVulnerabilities} note="OSV.dev advisories" />
          <Stat label="High-risk packages" value={overview.highRiskPackages} note="vulnerable, scored high or critical" />
        </div>
        <div className="mt-8">
          <p className="eyebrow mb-3">Risk distribution · all {overview.totalDependencies} packages</p>
          <Distribution dist={dist} total={overview.totalDependencies || 1} />
        </div>
      </section>

      <section className="px-8 py-12">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Live activity</h2>
          <p className="max-w-2xl text-muted">Streamed from the watcher as it happens. Newest first.</p>
        </div>
        <ActivityFeed events={events} />
      </section>
    </>
  )
}
