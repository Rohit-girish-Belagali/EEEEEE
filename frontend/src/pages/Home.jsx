import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProjects } from '../lib/api.js'
import { RippleMark } from '../components/Shell.jsx'

export default function Home() {
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    getProjects()
      .then((projects) => {
        if (projects.length) navigate(`/p/${projects[0].id}`, { replace: true })
        else setState({ status: 'empty' })
      })
      .catch((e) => setState({ status: 'error', message: e.message }))
  }, [navigate])

  return (
    <section className="px-8 py-16">
      <p className="flex items-center gap-3 text-ink">
        <RippleMark />
        <span className="font-display text-sm font-bold tracking-[0.22em]">RIPPLEGUARD</span>
      </p>
      {state.status === 'loading' && (
        <h1 className="mt-8 font-display text-6xl font-extrabold uppercase leading-none text-muted">Connecting…</h1>
      )}
      {state.status === 'empty' && (
        <>
          <h1 className="mt-8 font-display text-6xl font-extrabold uppercase leading-none">Nothing watched yet.</h1>
          <p className="mt-4 max-w-xl text-muted">Start the server with the project folders you want to protect.</p>
          <pre className="mt-6 inline-block border border-line bg-panel px-5 py-3 font-mono text-sm">
            node src/api/server.js /path/to/your/project
          </pre>
        </>
      )}
      {state.status === 'error' && (
        <>
          <h1 className="mt-8 font-display text-6xl font-extrabold uppercase leading-none text-red">Not reachable.</h1>
          <p className="mt-4 max-w-xl text-muted">
            The dashboard could not reach the RippleGuard API ({state.message}). Start it from the repository root,
            then reload.
          </p>
          <pre className="mt-6 inline-block border border-line bg-panel px-5 py-3 font-mono text-sm">npm run server</pre>
        </>
      )}
    </section>
  )
}
