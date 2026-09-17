export function LoadingState({ label }) {
  return (
    <section className="px-8 py-16">
      <p className="eyebrow">Loading</p>
      <h1 className="mt-4 font-display text-6xl font-extrabold uppercase leading-none text-muted">{label}</h1>
    </section>
  )
}

export function ErrorState({ message }) {
  return (
    <section className="px-8 py-16">
      <p className="eyebrow">Backend</p>
      <h1 className="mt-4 font-display text-6xl font-extrabold uppercase leading-none text-red">Not reachable.</h1>
      <p className="mt-4 max-w-xl text-muted">
        The dashboard could not load data from the RippleGuard API ({message}). Start RippleGuard from the repository
        root, then open the address it prints.
      </p>
      <pre className="mt-6 inline-block border border-line bg-panel px-5 py-3 font-mono text-sm">npm run demo</pre>
    </section>
  )
}

export const LEVEL_CLASS = {
  critical: 'text-red',
  high: 'text-amber',
  medium: 'text-ink/70',
  low: 'text-green',
}
