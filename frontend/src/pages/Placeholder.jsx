import { Link } from 'react-router-dom'

export default function Placeholder({ title }) {
  return (
    <section className="px-8 py-16">
      <p className="eyebrow">Next screen</p>
      <h1 className="mt-4 font-display text-6xl font-extrabold uppercase leading-none text-muted">{title}</h1>
      <p className="mt-4 max-w-xl text-muted">
        The backend for this screen is ready; the view is being built next.
      </p>
      <Link to=".." relative="path" className="mt-8 inline-block font-mono text-xs uppercase tracking-[0.16em] text-green">
        ← Back to overview
      </Link>
    </section>
  )
}
