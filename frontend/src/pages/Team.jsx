import { Link, Navigate, useParams } from 'react-router-dom'
import { PitchHeader } from './Pitch.jsx'
import { GITHUB_URL, TEAM } from '../lib/pitch.js'

function SlideCrop({ n, crop }) {
  if (!crop) return <img src={`/pitch/slide-${n}.jpg`} alt={`Slide ${n}`} className="block w-full" />
  const [x, y, w, h] = crop
  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: `${(w * 16) / (h * 9)}` }}>
      <img
        src={`/pitch/slide-${n}.jpg`}
        alt={`Slide ${n}`}
        className="absolute max-w-none"
        style={{ width: `${100 / w}%`, height: `${100 / h}%`, left: `${(-x / w) * 100}%`, top: `${(-y / h) * 100}%` }}
      />
    </div>
  )
}

function Terminal() {
  return (
    <pre className="overflow-x-auto bg-[#07070a] p-5 font-mono text-[13px] leading-relaxed text-muted">
      <span className="text-green">$</span> <span className="text-ink">npm run demo</span>{'\n'}
      RippleGuard: Contextual Supply Chain Risk &amp; Ripple Simulator{'\n'}
      [Initial scan] 49 packages analyzed in dependency graph{'\n\n'}
      <span className="text-amber">🟠 Package: qs@6.7.0</span>{'\n'}
      {'  '}Final contextual risk: 0.7647{'\n'}
      {'  '}Risk level: <span className="text-red">High</span>{'\n'}
      {'  '}Critical Impact Path: qs ➔ express ➔ demo-project{'\n\n'}
      <span className="text-ink">Dashboard: </span><Link to="/p/demo-project" className="text-green underline">http://localhost:4000/p/demo-project</Link>{'\n'}
      RippleGuard is watching for dependency modifications.
    </pre>
  )
}

function Curve() {
  const pts = Array.from({ length: 101 }, (_, i) => {
    const x = (i / 100) * 5
    return `${40 + x * 100},${240 - (1 - Math.exp(-x)) * 200}`
  }).join(' ')
  return (
    <svg viewBox="0 0 580 280" className="w-full bg-[#07070a]" role="img" aria-label="Curve of 1 minus e to the minus x">
      <style>{`.draw{stroke-dasharray:900;stroke-dashoffset:900;animation:draw 2.4s ease-out forwards infinite alternate}
        @keyframes draw{to{stroke-dashoffset:0}}`}</style>
      <line x1="40" y1="40" x2="540" y2="40" stroke="#26262a" strokeDasharray="6 6" />
      <line x1="40" y1="240" x2="545" y2="240" stroke="#8b8b86" />
      <line x1="40" y1="245" x2="40" y2="30" stroke="#8b8b86" />
      <text x="548" y="44" fill="#8b8b86" fontSize="13" fontFamily="monospace">1.0</text>
      <text x="455" y="265" fill="#8b8b86" fontSize="13" fontFamily="monospace">raw risk x</text>
      <text x="48" y="26" fill="#8b8b86" fontSize="13" fontFamily="monospace">score</text>
      <polyline points={pts} fill="none" stroke="#2ee06a" strokeWidth="4" className="draw" />
      <text x="250" y="150" fill="#f2f0ea" fontSize="28" fontFamily="monospace">score = 1 − e⁻ˣ</text>
    </svg>
  )
}

function EndCard() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 bg-[#07070a] px-6 py-16 text-center">
      <p className="eyebrow">Team Spectra · Manipal Hackathon 2026</p>
      <p className="font-display text-6xl font-extrabold uppercase leading-none">RippleGuard</p>
      <p className="text-muted">See the ripple before it hits production.</p>
      <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="border border-green px-6 py-3 font-mono text-sm text-green hover:bg-green hover:text-bg">
        github.com/Rohit-girish-Belagali/Spectra
      </a>
    </div>
  )
}

function Shot({ shot }) {
  switch (shot.kind) {
    case 'slide':
      return <SlideCrop n={shot.n} crop={shot.crop} />
    case 'site':
      return <iframe title={shot.label} src={shot.to} className="block h-[560px] w-full bg-bg" />
    case 'terminal':
      return <Terminal />
    case 'curve':
      return <Curve />
    default:
      return <EndCard />
  }
}

export function TeamList() {
  return (
    <>
      <PitchHeader />
      <section className="mx-auto max-w-6xl px-6 py-10">
        <p className="eyebrow">Team Spectra · 2-minute demo video</p>
        <h1 className="mt-2 font-display text-6xl font-extrabold uppercase leading-none">Who explains what</h1>
        <div className="mt-8 grid gap-px border border-line bg-line md:grid-cols-5">
          {TEAM.map((m, k) => (
            <Link key={m.slug} to={`/team/${m.slug}`} className="bg-bg p-5 hover:bg-panel">
              <p className="font-mono text-xs text-muted">Teammate {k + 1} · {m.time}</p>
              <p className="mt-6 font-display text-2xl font-bold uppercase leading-tight">{m.name}</p>
              <p className="mt-2 text-sm text-ink">{m.part}</p>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-green">{m.shots.length} shots →</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}

export function TeamMember() {
  const { slug } = useParams()
  const idx = TEAM.findIndex((m) => m.slug === slug)
  if (idx < 0) return <Navigate to="/team" replace />
  const m = TEAM[idx]
  const prev = TEAM[idx - 1]
  const next = TEAM[idx + 1]
  return (
    <>
      <PitchHeader />
      <section className="mx-auto max-w-5xl px-6 py-10">
        <Link to="/team" className="font-mono text-xs uppercase tracking-[0.16em] text-muted hover:text-ink">← All teammates</Link>
        <p className="eyebrow mt-6">Teammate {idx + 1} · {m.time}</p>
        <h1 className="mt-2 font-display text-6xl font-extrabold uppercase leading-none">{m.name}</h1>
        <p className="mt-3 font-display text-3xl font-bold uppercase text-green">{m.part}</p>

        <ol className="mt-10 space-y-12">
          {m.shots.map((shot, k) => (
            <li key={k}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-2xl font-bold uppercase">
                  <span className="mr-3 font-mono text-sm text-muted">0{k + 1}</span>
                  {shot.label}
                </p>
                {shot.kind === 'site' && (
                  <Link to={shot.to} className="font-mono text-[11px] uppercase tracking-[0.16em] text-green hover:underline">
                    Open full page →
                  </Link>
                )}
              </div>
              <p className="mt-1 text-muted">{shot.note}</p>
              <div className="mt-4 border border-line">
                <Shot shot={shot} />
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-14 flex justify-between border-t border-line pt-6 font-mono text-xs uppercase tracking-[0.16em]">
          {prev ? <Link to={`/team/${prev.slug}`} className="text-ink hover:text-green">← {prev.name}</Link> : <span />}
          {next ? <Link to={`/team/${next.slug}`} className="text-ink hover:text-green">{next.name} →</Link> : <span />}
        </div>
      </section>
    </>
  )
}
