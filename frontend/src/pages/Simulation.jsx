import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { createSimulation, getDependencies, getOverview, mitigateSimulation } from '../lib/api.js'
import { useLive } from '../lib/live.jsx'

const INITIAL_PROBABILITY = 0.9
const pct = (x) => `${(x * 100).toFixed(1)}%`

function Metric({ label, value, tone = 'text-ink' }) {
  return (
    <div className="border-t border-line py-3">
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 font-mono text-lg tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

/** One stage of the spread: every node first reached at this time step. */
function Stage({ step, nodes, criticalPath, selected, onSelect, isLast, delay }) {
  return (
    <li className="rise relative min-w-[210px] flex-1" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          {step === 0 ? 't=0 · compromised' : `t=${step} · step ${step}`}
        </span>
        {!isLast && <span aria-hidden="true" className="ml-3 h-px flex-1 bg-red/60" />}
      </div>
      <ul className="mt-3 space-y-2 pr-4">
        {nodes.map((node) => {
          const onPath = criticalPath.includes(node.id)
          const isSelected = selected === node.id
          const border = isSelected ? 'border-ink' : onPath ? 'border-red' : 'border-line'
          return (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                aria-pressed={isSelected}
                className={`w-full border ${border} bg-panel/70 px-3 py-2.5 text-left transition-colors hover:border-ink`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`truncate font-mono text-sm ${node.isApplication ? 'text-red' : 'text-ink'}`}>
                    {node.id}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-ink">{pct(node.probability)}</span>
                </span>
                <span className="mt-2 block h-1 w-full bg-line">
                  <span
                    className={`block h-full ${onPath ? 'bg-red' : 'bg-amber'}`}
                    style={{ width: `${Math.max(2, node.probability * 100)}%` }}
                  />
                </span>
                <span className="mt-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  {node.isApplication ? 'Your application' : node.isInitial ? 'Starting point' : `impact ${node.impact}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </li>
  )
}

function Timeline({ result, selected, onSelect }) {
  const stages = useMemo(() => {
    const byStep = new Map()
    for (const node of result.nodes.filter((n) => n.status !== 'blocked')) {
      if (!byStep.has(node.timeStep)) byStep.set(node.timeStep, [])
      byStep.get(node.timeStep).push(node)
    }
    return [...byStep.entries()].sort(([a], [b]) => a - b)
  }, [result])

  return (
    <ol className="flex gap-2 overflow-x-auto pb-2" aria-label="Propagation timeline">
      {stages.map(([step, nodes], i) => (
        <Stage
          key={step}
          step={step}
          nodes={nodes}
          criticalPath={result.criticalPath}
          selected={selected}
          onSelect={onSelect}
          isLast={i === stages.length - 1}
          delay={i * 160}
        />
      ))}
    </ol>
  )
}

function Inspector({ node, risk }) {
  if (!node) {
    return (
      <p className="border border-line px-5 py-6 text-sm text-muted">
        Select a package in the timeline to see how the compromise reached it.
      </p>
    )
  }
  return (
    <div className="border border-line bg-panel/40 px-5 py-4">
      <p className="eyebrow">Inspecting</p>
      <p className="mt-1 break-all font-mono text-xl">
        {node.id}
        {node.version && !node.isApplication && <span className="text-muted">@{node.version}</span>}
      </p>
      <p className="mt-3 font-mono text-xs leading-relaxed text-muted">
        {node.propagationPath.map((id, i) => (
          <span key={id}>
            {i > 0 && <span className="text-red"> → </span>}
            <span className={id === node.id ? 'text-ink' : ''}>{id}</span>
          </span>
        ))}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-6">
        <Metric label="Chance it's compromised" value={pct(node.probability)} tone="text-red" />
        <Metric label="Impact" value={node.impact} />
        <Metric label="Business criticality" value={node.businessCriticality ?? '—'} />
        <Metric label="Graph centrality" value={node.systemicCentrality ?? '—'} />
        <Metric label="Exposure" value={node.exposureFactor ?? '—'} />
        <Metric label="Reached at" value={`step ${node.timeStep}`} />
      </div>
      {risk && (
        <p className="mt-3 border-t border-line pt-3 font-mono text-xs text-muted">
          Package risk score {risk.riskScore} ({risk.riskLevel})
          {risk.vulnerabilityCount > 0 && ` · ${risk.vulnerabilityCount} known vulnerabilities`}
        </p>
      )}
    </div>
  )
}

export default function Simulation() {
  const { projectId } = useParams()
  const [params, setParams] = useSearchParams()
  const { latest } = useLive()

  const [packages, setPackages] = useState([])
  const [target, setTarget] = useState(params.get('package') ?? '')
  const [baseline, setBaseline] = useState(null)
  const [mitigation, setMitigation] = useState(null)
  const [view, setView] = useState('before')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const loadPackages = useCallback(async () => {
    const [deps, overview] = await Promise.all([getDependencies(projectId), getOverview(projectId)])
    const sorted = [...deps.dependencies].sort(
      (a, b) => b.vulnerabilityCount - a.vulnerabilityCount || b.riskScore - a.riskScore || a.name.localeCompare(b.name),
    )
    setPackages(sorted)
    setTarget((current) => current || overview.highestRiskPackage || sorted[0]?.name || '')
  }, [projectId])

  useEffect(() => {
    loadPackages().catch((e) => setError(e.message))
  }, [loadPackages])

  useEffect(() => {
    if (latest?.type === 'scan-completed') loadPackages().catch(() => {})
  }, [latest, loadPackages])

  const riskByName = useMemo(() => new Map(packages.map((p) => [p.name, p])), [packages])

  const simulate = async (e) => {
    e?.preventDefault()
    if (!target) return
    setBusy('simulate')
    setError(null)
    setMitigation(null)
    setView('before')
    try {
      const result = await createSimulation(projectId, {
        initialPackage: target,
        initialProbability: INITIAL_PROBABILITY,
        maxSteps: 10,
      })
      setBaseline(result)
      setSelected(result.criticalPath.at(-1) ?? target)
      setParams({ package: target }, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const block = async (name) => {
    setBusy(name)
    setError(null)
    try {
      const result = await mitigateSimulation(projectId, baseline.simulationId, { blockedPackage: name })
      setMitigation(result)
      setView('after')
      setSelected(result.mitigated.nodes.find((n) => n.isApplication)?.id ?? baseline.initialPackage)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const shown = view === 'after' && mitigation ? mitigation.mitigated : baseline
  const selectedNode = shown?.nodes.find((n) => n.id === selected && n.status !== 'blocked') ?? null
  const blockable = baseline
    ? baseline.nodes
        .filter((n) => !n.isApplication && !n.isInitial && n.status !== 'blocked')
        .sort((a, b) => Number(baseline.criticalPath.includes(b.id)) - Number(baseline.criticalPath.includes(a.id)) || b.probability - a.probability)
    : []

  const reached = shown?.reachesApplication
  const verdictWord = !shown ? null : reached ? 'REACHES YOUR APP.' : 'CONTAINED.'
  const vulnerable = packages.filter((p) => p.vulnerabilityCount > 0)
  const clean = packages.filter((p) => p.vulnerabilityCount === 0)

  return (
    <>
      <section className="border-b border-line px-8 py-12">
        <p className="eyebrow">Ripple simulation</p>
        <h1 className="mt-3 max-w-5xl font-display text-[clamp(44px,7vw,96px)] font-extrabold uppercase leading-[0.9]">
          What if <span className="text-red">{target || 'a package'}</span> is compromised?
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          RippleGuard starts from one compromised package and follows every package that depends on it, step by step,
          until it reaches your application — then tests which fix stops it.
        </p>

        <form onSubmit={simulate} className="mt-8 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="eyebrow">Compromised package</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-2 block h-12 min-w-[280px] border border-line bg-panel px-3 font-mono text-sm text-ink focus:border-ink"
            >
              {vulnerable.length > 0 && (
                <optgroup label="With known vulnerabilities">
                  {vulnerable.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}@{p.version} · {p.vulnerabilityCount} vulns
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Other packages">
                {clean.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}@{p.version}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button
            type="submit"
            disabled={!target || busy !== null}
            className="inline-flex h-12 items-center bg-green px-6 font-display text-sm font-bold uppercase tracking-[0.14em] text-bg hover:brightness-110 disabled:cursor-wait disabled:opacity-50"
          >
            {busy === 'simulate' ? 'Simulating…' : 'Simulate compromise'}
          </button>
          <p className="h-12 content-center font-mono text-[11px] text-muted">
            Starting chance of compromise: {pct(INITIAL_PROBABILITY)}
          </p>
        </form>

        {error && (
          <p role="alert" className="mt-4 inline-block border border-red/40 px-3 py-2 font-mono text-xs text-red">
            {error}
          </p>
        )}
      </section>

      {!baseline ? (
        <section className="px-8 py-12">
          <p className="max-w-xl border border-line px-5 py-6 text-muted">
            Choose a package and run the simulation. Packages with known vulnerabilities are listed first.
          </p>
        </section>
      ) : (
        <>
          <section className="border-b border-line px-8 py-10">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="eyebrow">
                  {view === 'after' && mitigation
                    ? `After blocking ${mitigation.blockedPackages.join(', ')}`
                    : `Compromise of ${baseline.initialPackage}`}
                </p>
                <p
                  className={`mt-2 font-display text-5xl font-extrabold leading-none md:text-7xl ${
                    reached ? 'text-red' : 'text-green'
                  }`}
                >
                  {verdictWord}
                </p>
              </div>
              <div className="flex gap-10">
                <div>
                  <p className="eyebrow">Blast radius</p>
                  <p className="mt-1 font-display text-5xl font-extrabold tabular-nums md:text-6xl">
                    {pct(shown.blastRadius)}
                  </p>
                </div>
                <div>
                  <p className="eyebrow">Packages reached</p>
                  <p className="mt-1 font-display text-5xl font-extrabold tabular-nums md:text-6xl">
                    {shown.affectedNodes}
                  </p>
                </div>
              </div>
            </div>

            {mitigation && (
              <div className="mt-6 inline-flex border border-line" role="tablist" aria-label="Compare">
                {[
                  ['before', 'Before fix'],
                  ['after', 'After fix'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={view === key}
                    onClick={() => setView(key)}
                    className={`px-5 py-2 font-mono text-[11px] uppercase tracking-[0.16em] ${
                      view === key ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <p className="mt-6 font-mono text-xs text-muted">
              Most likely path:{' '}
              {shown.criticalPath.map((id, i) => (
                <span key={id}>
                  {i > 0 && <span className="text-red"> → </span>}
                  <span className="text-ink">{id}</span>
                </span>
              ))}
            </p>

            <div className="mt-6" key={`${view}-${baseline.simulationId}`}>
              <Timeline result={shown} selected={selected} onSelect={setSelected} />
            </div>
          </section>

          <section className="grid gap-10 px-8 py-10 lg:grid-cols-[1fr_1fr]">
            <div>
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Test a fix</h2>
              <p className="mt-2 max-w-xl text-muted">
                Block a package — remove, replace or quarantine it — and see how much of the spread it stops. Packages on
                the most likely path usually stop the most.
              </p>

              {blockable.length === 0 ? (
                <p className="mt-5 border border-line px-5 py-4 text-sm text-muted">
                  Nothing depends on {baseline.initialPackage} except your application directly, so there is no package in
                  between to block. Remove or upgrade {baseline.initialPackage} itself.
                </p>
              ) : (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {blockable.map((n) => {
                    const onPath = baseline.criticalPath.includes(n.id)
                    const active = mitigation?.blockedPackages.includes(n.id)
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => block(n.id)}
                          disabled={busy !== null}
                          className={`inline-flex h-10 items-center gap-2 border px-4 font-mono text-xs disabled:cursor-wait ${
                            active ? 'border-green bg-green/10 text-green' : onPath ? 'border-red text-ink hover:bg-red/10' : 'border-line text-ink hover:border-ink'
                          }`}
                        >
                          {busy === n.id ? 'Blocking…' : `Block ${n.id}`}
                          {onPath && !active && <span className="text-[10px] uppercase tracking-[0.14em] text-red">on path</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {mitigation && (
                <div className="rise mt-6 border border-line bg-panel/40 px-5 py-5">
                  <p className="eyebrow">Result of blocking {mitigation.blockedPackages.join(', ')}</p>
                  <p className="mt-3 font-display text-4xl font-extrabold tabular-nums">
                    {pct(mitigation.originalBlastRadius)} <span className="text-muted">→</span>{' '}
                    <span className="text-green">{pct(mitigation.mitigatedBlastRadius)}</span>
                  </p>
                  <p className="mt-2 font-mono text-sm text-green">{mitigation.reductionPercentage}% smaller blast radius</p>
                  <p className="mt-3 text-sm text-ink/90">
                    {mitigation.applicationReachedBefore && !mitigation.applicationReachedAfter
                      ? 'Your application is no longer reached.'
                      : mitigation.applicationReachedAfter
                        ? 'Your application is still reached through another path — try a package closer to it.'
                        : 'Your application was not reached before either.'}
                    {mitigation.protectedNodes.length > 0 && (
                      <span className="text-muted"> Protected: {mitigation.protectedNodes.join(', ')}.</span>
                    )}
                  </p>
                </div>
              )}
            </div>

            <div>
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Inspect</h2>
              <div className="mt-5">
                <Inspector node={selectedNode} risk={selectedNode ? riskByName.get(selectedNode.id) : null} />
              </div>
            </div>
          </section>
        </>
      )}
    </>
  )
}
