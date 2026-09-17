import { Link, Navigate, useParams } from 'react-router-dom'
import { PitchHeader } from './Pitch.jsx'
import { SLIDES, TEAM } from '../lib/pitch.js'

export function TeamList() {
  return (
    <>
      <PitchHeader />
      <section className="mx-auto max-w-6xl px-6 py-10">
        <p className="eyebrow">Team Spectra · Manipal Hackathon 2026 · Cybersecurity · P04</p>
        <h1 className="mt-2 font-display text-6xl font-extrabold uppercase leading-none">The team</h1>
        <div className="mt-8 grid gap-px border border-line bg-line md:grid-cols-5">
          {TEAM.map((m, k) => (
            <Link key={m.slug} to={`/team/${m.slug}`} className="bg-bg p-5 hover:bg-panel">
              <p className="font-mono text-xs text-muted">0{k + 1}</p>
              <p className="mt-6 font-display text-2xl font-bold uppercase leading-tight">{m.name}</p>
              <p className="mt-2 text-sm text-muted">{m.role}</p>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-green">Slides {m.slides.join(', ')} →</p>
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
  const next = TEAM[(idx + 1) % TEAM.length]
  return (
    <>
      <PitchHeader />
      <section className="mx-auto max-w-6xl px-6 py-10">
        <Link to="/team" className="font-mono text-xs uppercase tracking-[0.16em] text-muted hover:text-ink">← Team</Link>
        <p className="eyebrow mt-6">Person {idx + 1} of {TEAM.length}</p>
        <h1 className="mt-2 font-display text-6xl font-extrabold uppercase leading-none">{m.name}</h1>
        <p className="mt-3 text-lg text-muted">{m.role}</p>
        <p className="mt-6 max-w-3xl text-ink">{m.focus}</p>
        {m.demo && (
          <Link to={m.demo.to} className="mt-6 inline-block border border-green px-5 py-3 font-mono text-xs uppercase tracking-[0.16em] text-green hover:bg-green hover:text-bg">
            Open live demo: {m.demo.label} →
          </Link>
        )}
        {m.slides.map((n) => (
          <div key={n} className="mt-10">
            <p className="eyebrow">Slide {n} · {SLIDES[n - 1].title}</p>
            <Link to={`/pitch/${n}`}><img src={`/pitch/slide-${n}.jpg`} alt={SLIDES[n - 1].title} className="mt-3 w-full border border-line hover:border-muted" /></Link>
            <ul className="mt-4 space-y-2 text-muted">
              {SLIDES[n - 1].points.map((p) => <li key={p} className="border-l border-line pl-4">{p}</li>)}
            </ul>
          </div>
        ))}
        <Link to={`/team/${next.slug}`} className="mt-12 block border-t border-line pt-6 text-right font-mono text-xs uppercase tracking-[0.16em] text-ink hover:text-green">
          Next: {next.name} →
        </Link>
      </section>
    </>
  )
}
