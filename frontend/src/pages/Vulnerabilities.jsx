import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getVulnerabilities } from '../lib/api.js'
import { useLive } from '../lib/live.jsx'
import { ErrorState, LEVEL_CLASS, LoadingState } from '../components/PageStates.jsx'

const SEVERITIES = ['all', 'critical', 'high', 'moderate', 'low']
const SEVERITY_CLASS = { critical: 'text-red', high: 'text-amber', moderate: 'text-ink/80', medium: 'text-ink/80', low: 'text-green' }

export default function Vulnerabilities() {
  const { projectId } = useParams()
  const { latest } = useLive()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [severity, setSeverity] = useState('all')
  const [open, setOpen] = useState(null)

  const load = useCallback(() => getVulnerabilities(projectId).then(setData).catch((e) => setError(e.message)), [projectId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (latest?.type === 'scan-completed') load()
  }, [latest, load])

  const findings = useMemo(() => {
    if (!data) return []
    return severity === 'all'
      ? data.findings
      : data.findings.filter((f) => (f.severity === 'medium' ? 'moderate' : f.severity) === severity)
  }, [data, severity])

  if (error && !data) return <ErrorState message={error} />
  if (!data) return <LoadingState label="Reading findings…" />

  const packages = new Set(data.findings.map((f) => f.package)).size
  const fixable = data.findings.filter((f) => f.fixedVersions.length > 0).length

  return (
    <>
      <section className="border-b border-line px-8 py-12">
        <p className="eyebrow">Vulnerabilities</p>
        {data.total === 0 ? (
          <h1 className="mt-3 font-display text-[clamp(44px,7vw,96px)] font-extrabold uppercase leading-[0.9] text-green">
            No known vulnerabilities.
          </h1>
        ) : (
          <h1 className="mt-3 font-display text-[clamp(44px,7vw,96px)] font-extrabold uppercase leading-[0.9]">
            <span className="text-red">{data.total} known</span> in {packages} packages.
          </h1>
        )}
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Every advisory from OSV.dev affecting an installed version, ordered by how risky the package is in{' '}
          <em>this</em> project — not just by CVSS. {fixable} of {data.total} have a fixed version available.
        </p>

        <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Filter by severity">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={severity === s}
              onClick={() => setSeverity(s)}
              className={`h-9 border px-4 font-mono text-[11px] uppercase tracking-[0.16em] ${
                severity === s ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="px-8 py-10">
        {findings.length === 0 ? (
          <p className="border border-line px-5 py-6 text-muted">No findings with this severity.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="text-left">
                  {['Package', 'Advisory', 'Severity', 'CVSS', 'EPSS', 'Fixed in', 'Project risk', ''].map((h) => (
                    <th key={h} className="border-b border-line py-2 pr-4 font-mono text-[11px] font-normal uppercase tracking-[0.16em] text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => {
                  const key = `${f.package}#${f.osvId}`
                  const expanded = open === key
                  const cve = f.aliases.find((a) => a.startsWith('CVE-'))
                  return (
                    <Fragment key={key}>
                      <tr className={`border-b border-line align-top ${expanded ? 'bg-panel' : ''}`}>
                        <td className="py-3 pr-4 font-mono">
                          {f.package}
                          <span className="text-muted">@{f.version}</span>
                          {f.direct && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">direct</span>}
                        </td>
                        <td className="py-3 pr-4">
                          <a href={`https://osv.dev/vulnerability/${f.osvId}`} target="_blank" rel="noreferrer" className="font-mono text-green hover:underline">
                            {f.osvId}
                          </a>
                          {cve && <p className="font-mono text-[11px] text-muted">{cve}</p>}
                          <p className="mt-1 max-w-sm text-ink/90">{f.summary}</p>
                        </td>
                        <td className={`py-3 pr-4 font-mono uppercase ${SEVERITY_CLASS[f.severity] ?? 'text-muted'}`}>{f.severity ?? '—'}</td>
                        <td className="py-3 pr-4 font-mono tabular-nums">{f.cvss != null ? f.cvss.toFixed(1) : '—'}</td>
                        <td className="py-3 pr-4 font-mono tabular-nums">{f.epss != null ? `${(f.epss * 100).toFixed(1)}%` : '—'}</td>
                        <td className="py-3 pr-4 font-mono">{f.fixedVersions.length ? f.fixedVersions.join(', ') : <span className="text-muted">no fix</span>}</td>
                        <td className={`py-3 pr-4 font-mono tabular-nums ${LEVEL_CLASS[f.riskLevel]}`}>
                          {f.riskScore} {f.riskLevel}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setOpen(expanded ? null : key)}
                            className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted hover:text-ink"
                          >
                            {expanded ? 'Hide' : 'Why'}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-line bg-panel">
                          <td colSpan={8} className="px-4 pb-5 pt-1">
                            <p className="eyebrow">Why {f.package} scores {f.riskScore} in this project</p>
                            <ul className="mt-2 space-y-1 text-ink/90">
                              {f.reasons.map((r) => (
                                <li key={r}>– {r}</li>
                              ))}
                            </ul>
                            <div className="mt-4 flex flex-wrap gap-3">
                              <Link
                                to={`../simulation?package=${encodeURIComponent(f.package)}`}
                                relative="path"
                                className="inline-flex h-10 items-center bg-green px-4 font-display text-xs font-bold uppercase tracking-[0.14em] text-bg hover:brightness-110"
                              >
                                Simulate compromise
                              </Link>
                              <Link
                                to={`../dependencies?package=${encodeURIComponent(f.package)}`}
                                relative="path"
                                className="inline-flex h-10 items-center border border-line px-4 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink hover:border-ink"
                              >
                                Show in graph
                              </Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
