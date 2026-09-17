import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addProject, uploadProject } from '../lib/api.js'
import { RippleMark } from '../components/Shell.jsx'

const LOCK = 'package-lock.json'
const MANIFEST = 'package.json'

/** Picks the top-most package-lock.json / package.json out of a folder's file list. */
function pickFromFiles(files) {
  const picked = {}
  for (const file of files) {
    const rel = file.webkitRelativePath || file.name
    if (rel.includes('node_modules/')) continue
    const depth = rel.split('/').length
    for (const wanted of [LOCK, MANIFEST]) {
      if (file.name === wanted && (!picked[wanted] || depth < picked[wanted].depth)) {
        picked[wanted] = { file, depth }
      }
    }
  }
  return { lock: picked[LOCK]?.file ?? null, manifest: picked[MANIFEST]?.file ?? null }
}

async function readFolderHandle(handle) {
  const get = async (name) => {
    try {
      return await (await handle.getFileHandle(name)).getFile()
    } catch {
      return null
    }
  }
  return { lock: await get(LOCK), manifest: await get(MANIFEST), folderName: handle.name }
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  )
}

const inputClass =
  'w-full border border-line bg-panel px-4 py-3 font-mono text-sm text-ink placeholder:text-muted/60 focus:border-ink'
const primaryClass =
  'inline-flex h-12 items-center gap-3 bg-green px-6 font-display text-sm font-bold uppercase tracking-[0.14em] text-bg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40'
const outlineClass =
  'inline-flex h-10 items-center border border-line px-4 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink hover:border-ink'

function WatchFolder({ navigate }) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const project = await addProject(path.trim())
      navigate(`/p/${project.id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col border border-line bg-panel/40 p-6">
      <p className="eyebrow">On this machine</p>
      <h2 className="mt-2 font-display text-3xl font-bold uppercase tracking-wide">Watch a folder</h2>
      <p className="mt-3 text-muted">
        For a project on the computer running RippleGuard. It watches <code className="font-mono">package.json</code>{' '}
        and <code className="font-mono">package-lock.json</code> and rescans every time they change.
      </p>
      <div className="mt-6 flex-1">
        <Field label="Project folder path">
          <input
            className={inputClass}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/Users/you/projects/my-app"
            spellCheck={false}
            autoComplete="off"
            required
          />
        </Field>
        <p className="mt-2 font-mono text-[11px] text-muted">
          The folder needs a package-lock.json (run npm install there first).
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-4 border border-red/40 px-3 py-2 font-mono text-xs text-red">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !path.trim()} className={`${primaryClass} mt-6 self-start`}>
        {busy ? 'Starting…' : 'Start watching'}
      </button>
    </form>
  )
}

function CheckLockfile({ navigate }) {
  const [lock, setLock] = useState(null)
  const [manifest, setManifest] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const folderInput = useRef(null)
  const fileInput = useRef(null)

  const take = ({ lock: l, manifest: m, folderName }) => {
    setError(null)
    if (!l) {
      setError(`No ${LOCK} found there. Run npm install in the project, or pick the file directly.`)
      return
    }
    setLock(l)
    setManifest(m)
    if (!name && folderName) setName(folderName)
  }

  const chooseFolder = async () => {
    if (window.showDirectoryPicker) {
      try {
        take(await readFolderHandle(await window.showDirectoryPicker()))
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message)
      }
    } else {
      folderInput.current?.click()
    }
  }

  const onFolderInput = (e) => {
    const files = [...e.target.files]
    const folderName = files[0]?.webkitRelativePath?.split('/')[0]
    take({ ...pickFromFiles(files), folderName })
    e.target.value = ''
  }

  const onFileInput = (e) => {
    take(pickFromFiles([...e.target.files]))
    e.target.value = ''
  }

  const onDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    const entry = e.dataTransfer.items?.[0]?.getAsFileSystemHandle?.()
    const handle = entry ? await entry : null
    if (handle?.kind === 'directory') {
      take(await readFolderHandle(handle))
    } else {
      take(pickFromFiles([...e.dataTransfer.files]))
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const project = await uploadProject({
        name: name.trim() || undefined,
        packageLock: await lock.text(),
        packageJson: manifest ? await manifest.text() : undefined,
      })
      navigate(`/p/${project.id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col border border-line bg-panel/40 p-6">
      <p className="eyebrow">From anywhere</p>
      <h2 className="mt-2 font-display text-3xl font-bold uppercase tracking-wide">Check a lockfile</h2>
      <p className="mt-3 text-muted">
        Pick the project folder or drop its <code className="font-mono">package-lock.json</code>. Your browser reads
        the two files and sends only those; the project is scanned once, not watched.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-6 flex flex-1 flex-col items-center justify-center gap-4 border border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? 'border-green bg-green/5' : 'border-line'
        }`}
      >
        {lock ? (
          <div className="font-mono text-sm">
            <p className="text-green">■ {LOCK}</p>
            <p className={manifest ? 'text-green' : 'text-muted'}>
              {manifest ? '■' : '□'} {MANIFEST}
              {!manifest && <span className="text-muted"> (optional, not found)</span>}
            </p>
          </div>
        ) : (
          <p className="text-muted">Drop a folder or {LOCK} here</p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={chooseFolder} className={outlineClass}>
            Choose folder
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} className={outlineClass}>
            Choose file
          </button>
        </div>
        <input ref={folderInput} type="file" webkitdirectory="" multiple hidden onChange={onFolderInput} />
        <input ref={fileInput} type="file" accept=".json" multiple hidden onChange={onFileInput} />
      </div>

      <div className="mt-6">
        <Field label="Project name (optional)">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Taken from package.json if left empty"
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-4 border border-red/40 px-3 py-2 font-mono text-xs text-red">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !lock} className={`${primaryClass} mt-6 self-start`}>
        {busy ? 'Scanning…' : 'Scan lockfile'}
      </button>
    </form>
  )
}

export default function AddProject() {
  const navigate = useNavigate()
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
          <Link to="/guide" className="text-muted hover:text-ink">
            Guide
          </Link>
        </nav>
      </header>
      <section className="px-8 py-14">
        <p className="eyebrow">Add a project</p>
        <h1 className="mt-3 font-display text-[clamp(48px,7vw,96px)] font-extrabold uppercase leading-[0.9]">
          What should RippleGuard check?
        </h1>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <WatchFolder navigate={navigate} />
          <CheckLockfile navigate={navigate} />
        </div>
      </section>
    </div>
  )
}
