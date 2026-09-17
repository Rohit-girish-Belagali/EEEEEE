import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { RippleMark } from '../components/Shell.jsx'
import { SLIDES, TEAM } from '../lib/pitch.js'

export function PitchHeader() {
  return (
    <header className="flex h-14 items-stretch border-b border-line">
      <Link to="/p/demo-project" className="flex items-center gap-3 border-r border-line px-6 text-ink">
        <RippleMark />
        <span className="font-display text-sm font-bold tracking-[0.22em]">RIPPLEGUARD</span>
      </Link>
      <nav className="flex font-mono text-[11px] uppercase tracking-[0.16em]">
        <Link to="/p/demo-project" className="flex items-center border-r border-line px-5 text-muted hover:text-ink">Live demo</Link>
        <Link to="/pitch/1" className="flex items-center border-r border-line px-5 text-muted hover:text-ink">Pitch</Link>
        <Link to="/team" className="flex items-center border-r border-line px-5 text-muted hover:text-ink">Team</Link>
      </nav>
      <a href="/pitch/Spectra_RippleGuard.pptx" download className="ml-auto flex items-center px-6 font-mono text-[11px] uppercase tracking-[0.16em] text-ink hover:text-green">
        ↓ Download PPT
      </a>
    </header>
  )
}

export default function Pitch() {
  const { n } = useParams()
  const navigate = useNavigate()
  const i = Math.min(Math.max(Number(n) || 1, 1), SLIDES.length)
  const slide = SLIDES[i - 1]
  const presenter = TEAM.find((m) => m.slides.includes(i))

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' && i < SLIDES.length) navigate(`/pitch/${i + 1}`)
      if (e.key === 'ArrowLeft' && i > 1) navigate(`/pitch/${i - 1}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, navigate])

  return (
    <>
      <PitchHeader />
      <section className="mx-auto max-w-6xl px-6 py-8">
        <p className="eyebrow">Slide {i} / {SLIDES.length}</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold uppercase leading-none md:text-5xl">{slide.title}</h1>
        <img src={`/pitch/slide-${i}.jpg`} alt={`Slide ${i}: ${slide.title}`} className="mt-6 w-full border border-line" />
        <div className="mt-4 flex items-center justify-between font-mono text-xs uppercase tracking-[0.16em]">
          {i > 1 ? <Link to={`/pitch/${i - 1}`} className="text-ink hover:text-green">← Prev</Link> : <span />}
          <div className="flex gap-2">
            {SLIDES.map((_, k) => (
              <Link key={k} to={`/pitch/${k + 1}`} aria-label={`Slide ${k + 1}`} className={`h-2 w-6 ${k + 1 === i ? 'bg-green' : 'bg-line hover:bg-muted'}`} />
            ))}
          </div>
          {i < SLIDES.length ? <Link to={`/pitch/${i + 1}`} className="text-ink hover:text-green">Next →</Link> : <span />}
        </div>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2">
            <p className="eyebrow">Talking points</p>
            <ul className="mt-3 space-y-2 text-muted">
              {slide.points.map((p) => <li key={p} className="border-l border-line pl-4">{p}</li>)}
            </ul>
          </div>
          {presenter && (
            <Link to={`/team/${presenter.slug}`} className="block border border-line bg-panel p-5 hover:border-muted">
              <p className="eyebrow">Presented by</p>
              <p className="mt-2 font-display text-2xl font-bold uppercase">{presenter.name}</p>
              <p className="mt-1 text-sm text-muted">{presenter.role}</p>
            </Link>
          )}
        </div>
      </section>
    </>
  )
}
