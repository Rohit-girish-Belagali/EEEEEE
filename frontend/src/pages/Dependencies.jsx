import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getDependency, getDependencyGraph } from '../lib/api.js'
import { useLive } from '../lib/live.jsx'
import { ErrorState, LEVEL_CLASS, LoadingState } from '../components/PageStates.jsx'

const COL_W = 230
const ROW_H = 30
const PAD_X = 16
const PAD_Y = 40

/** Columns by shortest distance from the application; rows sorted by risk. */
function layout(graph) {
  const root = graph.nodes.find((n) => n.type === 'application')
  const children = new Map()
  for (const e of graph.edges) {
    if (!children.has(e.source)) children.set(e.source, [])
    children.get(e.source).push(e.target)
  }

  const depth = new Map([[root.id, 0]])
  const queue = [root.id]
  while (queue.length) {
    const id = queue.shift()
    for (const child of children.get(id) ?? []) {
      if (!depth.has(child)) {
        depth.set(child, depth.get(id) + 1)
        queue.push(child)
      }
    }
  }

  const columns = []
  for (const node of graph.nodes) {
    const d = depth.get(node.id) ?? 1
    ;(columns[d] ??= []).push(node)
  }
  const positions = new Map()
  columns.forEach((col = [], d) => {
    col.sort((a, b) => (b.vulnerabilityCount > 0) - (a.vulnerabilityCount > 0) || (b.riskScore ?? 0) - (a.riskScore ?? 0) || a.id.localeCompare(b.id))
    col.forEach((node, i) => positions.set(node.id, { x: PAD_X + d * COL_W, y: PAD_Y + i * ROW_H, depth: d }))
  })
  const tallest = Math.max(...columns.map((c) => c?.length ?? 0))
  return { positions, width: PAD_X * 2 + columns.length * COL_W, height: PAD_Y + tallest * ROW_H + 10, columns: columns.length }
}

function GraphView({ graph, selected, highlight, onSelect }) {
  const { positions, width, height, columns } = useMemo(() => layout(graph), [graph])
  const onPath = new Set(highlight)
  const pathEdges = new Set()
  for (let i = 0; i < highlight.length - 1; i++) pathEdges.add(`${highlight[i + 1]}->${highlight[i]}`)

  return (
    <div className="overflow-auto border border-line bg-panel/30" style={{ maxHeight: 620 }}>
      <svg width={width} height={height} role="img" aria-label="Dependency graph">
        {Array.from({ length: columns }, (_, d) => (
          <text key={d} x={PAD_X + d * COL_W} y={20} className="fill-muted font-mono" fontSize="10" letterSpacing="1.5">
            {d === 0 ? 'APPLICATION' : d === 1 ? 'DIRECT' : `DEPTH ${d}`}
          </text>
        ))}
        {graph.edges.map((e) => {
          const a = positions.get(e.source)
          const b = positions.get(e.target)
          if (!a || !b) return null
          const hot = pathEdges.has(e.id)
          const x1 = a.x + 190
          const y1 = a.y
          const x2 = b.x - 6
          const y2 = b.y
          const mid = (x1 + x2) / 2
          return (
            <path
              key={e.id}
              d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
              fill="none"
              stroke={hot ? 'var(--color-red)' : 'rgba(255,255,255,0.08)'}
              strokeWidth={hot ? 2 : 1}
            />
          )
        })}
        {graph.nodes.map((n) => {
          const p = positions.get(n.id)
          if (!p) return null
          const vulnerable = n.vulnerabilityCount > 0
          const isSelected = selected === n.id
          const fill = n.type === 'application' ? 'var(--color-ink)' : vulnerable ? 'var(--color-red)' : 'var(--color-muted)'
          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              onClick={() => onSelect(n.id)}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onSelect(n.id)}
              tabIndex={0}
              role="button"
              aria-label={`${n.id}${vulnerable ? `, ${n.vulnerabilityCount} vulnerabilities` : ''}`}
              className="cursor-pointer outline-none"
            >
              <rect x={-6} y={-11} width={200} height={22} fill={isSelected ? 'rgba(255,255,255,0.08)' : 'transparent'} stroke={isSelected ? 'var(--color-ink)' : onPath.has(n.id) ? 'var(--color-red)' : 'none'} />
              <rect x={0} y={-3} width={6} height={6} fill={fill} />
              <text x={14} y={4} fontSize="12" className={`font-mono ${vulnerable || n.type === 'application' ? 'fill-ink' : 'fill-muted'}`}>
                {n.id.length > 22 ? `${n.id.slice(0, 21)}…` : n.id}
              </text>
              {vulnerable && (
                <text x={188} y={4} fontSize="10" textAnchor="end" className="fill-red font-mono">
                  {n.vulnerabilityCount}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Detail({ projectId, name }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getDependency(projectId, name)
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((e) => !cancelled && setState({ status: 'error', message: e.message }))
    return () => {
      cancelled = true
    }
  }, [projectId, name])

  if (state.status === 'loading') return <p className="border border-line px-5 py-6 font-mono text-xs text-muted">Loading {name}…</p>
  if (state.status === 'error') return <p className="border border-red/40 px-5 py-6 font-mono text-xs text-red">{state.message}</p>

  const d = state.data
  const s = d.signals
  const rows = [
    ['CVSS (worst)', s.cvss ? s.cvss.toFixed(1) : '—'],
    ['EPSS (scaled)', s.epss ? s.epss.toFixed(2) : '—'],
    ['Reachability', s.executionReachability],
    ['Version pinned', s.versionMutability ? 'No — floating range' : 'Yes'],
    ['Graph centrality', s.systemicCentrality],
    ['Downstream reach', `${s.downstreamReach} packages`],
  ]

  return (
    <div className="border border-line bg-panel/40 px-5 py-5">
      <p className="eyebrow">{d.direct ? 'Direct dependency' : 'Transitive dependency'}</p>
      <p className="mt-1 break-all font-mono text-xl">
        {d.name}
        <span className="text-muted">@{d.version}</span>
      </p>
      <p className={`mt-2 font-display text-4xl font-extrabold ${LEVEL_CLASS[d.riskLevel]}`}>
        {d.riskScore} <span className="text-lg uppercase tracking-wide">{d.riskLevel}</span>
      </p>

      {d.pathToApplication && (
        <>
          <p className="eyebrow mt-5">How it reaches your app</p>
          <p className="mt-2 font-mono text-sm">
            {d.pathToApplication.map((id, i) => (
              <span key={id}>
                {i > 0 && <span className="text-red"> → </span>}
                {id}
              </span>
            ))}
          </p>
        </>
      )}

      <p className="eyebrow mt-5">Why this score</p>
      <ul className="mt-2 space-y-1 text-sm text-ink/90">
        {d.reasons.map((r) => (
          <li key={r} className="flex gap-2">
            <span aria-hidden="true" className="text-muted">–</span>
            {r}
          </li>
        ))}
      </ul>

      <dl className="mt-5 grid grid-cols-2 gap-x-6">
        {rows.map(([k, v]) => (
          <div key={k} className="border-t border-line py-2">
            <dt className="eyebrow">{k}</dt>
            <dd className="mt-0.5 font-mono text-sm tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {d.vulnerabilities.length > 0 && (
        <>
          <p className="eyebrow mt-5">Known vulnerabilities ({d.vulnerabilities.length})</p>
          <ul className="mt-2 space-y-2">
            {d.vulnerabilities.map((v) => (
              <li key={v.osvId} className="border-t border-line pt-2 text-sm">
                <a href={`https://osv.dev/vulnerability/${v.osvId}`} target="_blank" rel="noreferrer" className="font-mono text-green hover:underline">
                  {v.osvId}
                </a>
                <span className="text-muted"> · {v.severity ?? 'unrated'}</span>
                <p className="text-ink/90">{v.summary}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <Link
        to={`../simulation?package=${encodeURIComponent(d.name)}`}
        relative="path"
        className="mt-6 inline-flex h-11 items-center bg-green px-5 font-display text-sm font-bold uppercase tracking-[0.14em] text-bg hover:brightness-110"
      >
        Simulate compromise of {d.name}
      </Link>
    </div>
  )
}

export default function Dependencies() {
  const { projectId } = useParams()
  const [params, setParams] = useSearchParams()
  const { latest } = useLive()
  const [graph, setGraph] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [onlyVulnerable, setOnlyVulnerable] = useState(false)
  const [path, setPath] = useState([])
  const selected = params.get('package')

  const load = useCallback(() => getDependencyGraph(projectId).then(setGraph).catch((e) => setError(e.message)), [projectId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (latest?.type === 'scan-completed') load()
  }, [latest, load])

  useEffect(() => {
    if (!selected) return setPath([])
    let cancelled = false
    getDependency(projectId, selected)
      .then((d) => !cancelled && setPath(d.pathToApplication ?? []))
      .catch(() => !cancelled && setPath([]))
    return () => {
      cancelled = true
    }
  }, [projectId, selected, graph])

  const select = (id) => {
    const node = graph.nodes.find((n) => n.id === id)
    if (node?.type === 'application') return
    setParams(id ? { package: id } : {}, { replace: true })
  }

  const rows = useMemo(() => {
    if (!graph) return []
    const q = query.trim().toLowerCase()
    return graph.nodes
      .filter((n) => n.type === 'package')
      .filter((n) => (!onlyVulnerable || n.vulnerabilityCount > 0) && (!q || n.id.toLowerCase().includes(q)))
      .sort((a, b) => b.vulnerabilityCount - a.vulnerabilityCount || b.riskScore - a.riskScore || a.id.localeCompare(b.id))
  }, [graph, query, onlyVulnerable])

  if (error && !graph) return <ErrorState message={error} />
  if (!graph) return <LoadingState label="Reading graph…" />

  const packages = graph.nodes.filter((n) => n.type === 'package')
  const vulnerableCount = packages.filter((n) => n.vulnerabilityCount > 0).length

  return (
    <>
      <section className="border-b border-line px-8 py-12">
        <p className="eyebrow">Dependency graph</p>
        <h1 className="mt-3 font-display text-[clamp(44px,7vw,96px)] font-extrabold uppercase leading-[0.9]">
          {packages.length} packages. <span className="text-red">{vulnerableCount} vulnerable.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Your application on the left, then its direct dependencies, then everything they pull in. Red squares have known
          vulnerabilities. Select a package to trace how it reaches your app.
        </p>
      </section>

      <section className="grid gap-8 px-8 py-10 xl:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-8">
          <GraphView graph={graph} selected={selected} highlight={path} onSelect={select} />

          <div>
            <div className="flex flex-wrap items-center gap-4">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter packages"
                aria-label="Filter packages"
                className="h-10 w-64 border border-line bg-panel px-3 font-mono text-sm focus:border-ink"
              />
              <label className="flex items-center gap-2 font-mono text-xs text-muted">
                <input type="checkbox" checked={onlyVulnerable} onChange={(e) => setOnlyVulnerable(e.target.checked)} className="accent-[var(--color-red)]" />
                Only vulnerable
              </label>
              <span className="font-mono text-xs text-muted">{rows.length} shown</span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="text-left">
                    {['Package', 'Version', 'Risk', 'Type', 'Used by', 'Vulns'].map((h) => (
                      <th key={h} className="border-b border-line py-2 pr-4 font-mono text-[11px] font-normal uppercase tracking-[0.16em] text-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((n) => (
                    <tr
                      key={n.id}
                      onClick={() => select(n.id)}
                      className={`cursor-pointer border-b border-line hover:bg-panel ${selected === n.id ? 'bg-panel' : ''}`}
                    >
                      <td className="py-2 pr-4 font-mono">
                        <button type="button" className="text-left hover:underline" onClick={() => select(n.id)}>
                          {n.id}
                        </button>
                      </td>
                      <td className="py-2 pr-4 font-mono text-muted">{n.version}</td>
                      <td className={`py-2 pr-4 font-mono tabular-nums ${LEVEL_CLASS[n.riskLevel]}`}>
                        {n.riskScore} {n.riskLevel}
                      </td>
                      <td className="py-2 pr-4 text-muted">{n.direct ? 'direct' : 'transitive'}</td>
                      <td className="py-2 pr-4 font-mono tabular-nums text-muted">
                        {graph.edges.filter((e) => e.target === n.id).length}
                      </td>
                      <td className={`py-2 pr-4 font-mono tabular-nums ${n.vulnerabilityCount ? 'text-red' : 'text-muted'}`}>
                        {n.vulnerabilityCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          {selected ? (
            <Detail projectId={projectId} name={selected} />
          ) : (
            <p className="border border-line px-5 py-6 text-muted">
              Select a package in the graph or the table to see its risk score, the reasons behind it, and how it reaches
              your application.
            </p>
          )}
        </aside>
      </section>
    </>
  )
}
