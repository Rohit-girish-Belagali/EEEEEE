import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import guide from '../../../docs/TERMINAL-GUIDE.md?raw'
import { RippleMark } from '../components/Shell.jsx'

const REPO = 'https://github.com/Rohit-girish-Belagali/Spectra'

// The markdown's own H1 is replaced by the page hero below.
const body = guide.replace(/^# .*\n/, '')

// "3. Run a scan" -> "run-a-scan", so in-page links to sections work.
const slug = (children) =>
  String(Array.isArray(children) ? children.join('') : children)
    .toLowerCase()
    .replace(/^\d+\.\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const components = {
  h2: ({ children }) => (
    <h2
      id={slug(children)}
      className="mt-14 scroll-mt-20 border-t border-line pt-8 font-display text-3xl font-bold uppercase tracking-wide"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => <h3 className="mt-8 font-display text-xl font-bold uppercase tracking-wide">{children}</h3>,
  p: ({ children }) => <p className="mt-4 max-w-3xl leading-relaxed text-ink/90">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} className="text-green underline decoration-green/40 underline-offset-4 hover:decoration-green">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  code: ({ className, children }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="bg-panel px-1.5 py-0.5 font-mono text-[0.9em] text-ink">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="mt-4 max-w-3xl overflow-x-auto border border-line bg-panel px-5 py-4 font-mono text-sm leading-relaxed">
      {children}
    </pre>
  ),
  ul: ({ children }) => <ul className="mt-4 max-w-3xl list-disc space-y-1 pl-6 text-ink/90">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 max-w-3xl list-decimal space-y-1 pl-6 text-ink/90">{children}</ol>,
  table: ({ children }) => (
    <div className="mt-4 max-w-4xl overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line py-2 pr-6 text-left align-top font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-line py-2.5 pr-6 align-top text-ink/90">{children}</td>,
}

export default function Guide() {
  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center border-b border-line px-6">
        <Link to="/" className="flex items-center gap-3 text-ink">
          <RippleMark />
          <span className="font-display text-sm font-bold tracking-[0.22em]">RIPPLEGUARD</span>
        </Link>
        <nav className="ml-auto flex gap-6 font-mono text-[11px] uppercase tracking-[0.16em]">
          <Link to="/" className="text-muted hover:text-ink">
            Dashboard
          </Link>
          <Link to="/add" className="text-muted hover:text-ink">
            + Add project
          </Link>
          <a href={REPO} className="text-muted hover:text-ink" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </nav>
      </header>

      <article className="px-8 py-14">
        <p className="eyebrow">Guide</p>
        <h1 className="mt-3 font-display text-[clamp(48px,7vw,96px)] font-extrabold uppercase leading-[0.9]">
          How to use RippleGuard
        </h1>
        <p className="mt-6 max-w-3xl text-lg text-muted">
          RippleGuard watches an npm project's dependencies, checks every package against live vulnerability data,
          scores the risk with the reasons spelled out, and simulates how a compromised package would ripple through to
          your application. Use the dashboard, or drive it entirely from the terminal as described below.
        </p>

        <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          {[
            ['Dashboard', 'Add a project or drop a lockfile, get scores, run simulations.', '/add'],
            ['Terminal', 'The same engine as a command-line tool. Everything below.', '#run-a-scan'],
            ['Source', 'MIT-licensed, on GitHub.', REPO],
          ].map(([title, text, href]) => {
            const cls = 'border border-line bg-panel/40 p-4 hover:border-ink'
            const inner = (
              <>
                <p className="font-display text-lg font-bold uppercase tracking-wide">{title}</p>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </>
            )
            return href.startsWith('http') ? (
              <a key={title} href={href} className={cls} target="_blank" rel="noreferrer">
                {inner}
              </a>
            ) : href.startsWith('#') ? (
              <a key={title} href={href} className={cls}>
                {inner}
              </a>
            ) : (
              <Link key={title} to={href} className={cls}>
                {inner}
              </Link>
            )
          })}
        </div>

        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {body}
        </ReactMarkdown>
      </article>
    </div>
  )
}
