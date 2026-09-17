import { createContext, useContext, useEffect, useState } from 'react'
import { getEvents, streamUrl } from './api.js'

const LiveContext = createContext({ events: [], connected: false, pulse: 0, latest: null })

export const useLive = () => useContext(LiveContext)

/** Backfills recent history, then keeps a Server-Sent Events stream open. */
export function LiveProvider({ projectId, children }) {
  const [events, setEvents] = useState([])
  const [connected, setConnected] = useState(false)
  const [pulse, setPulse] = useState(0)

  useEffect(() => {
    if (!projectId) return undefined
    let cancelled = false
    setEvents([])

    getEvents(projectId)
      .then((r) => {
        if (!cancelled) setEvents([...r.events].reverse())
      })
      .catch(() => {})

    const source = new EventSource(streamUrl(projectId))
    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    source.onmessage = (message) => {
      const event = JSON.parse(message.data)
      if (event.type === 'connected') {
        setConnected(true)
        return
      }
      // Reconnects replay missed events; drop any we already have.
      setEvents((prev) => [event, ...prev.filter((e) => e.id !== event.id)].slice(0, 200))
      setPulse((n) => n + 1)
    }

    return () => {
      cancelled = true
      source.close()
    }
  }, [projectId])

  return (
    <LiveContext.Provider value={{ events, connected, pulse, latest: events[0] ?? null }}>
      {children}
    </LiveContext.Provider>
  )
}
