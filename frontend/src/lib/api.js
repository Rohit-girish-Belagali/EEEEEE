const BASE = '/api'

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, options)
  } catch {
    throw new Error('Backend not reachable')
  }
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`)
  return body
}

const post = (path, body) =>
  request(path, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })

export const getProjects = () => request('/projects')
export const getOverview = (id) => request(`/projects/${id}/overview`)
export const getEvents = (id, limit = 80) => request(`/projects/${id}/events?limit=${limit}`)
export const getDependencies = (id) => request(`/projects/${id}/dependencies`)
export const getDependencyGraph = (id) => request(`/projects/${id}/dependencies/graph`)
export const getDependency = (id, name) => request(`/projects/${id}/dependencies/${name}`)
export const getVulnerabilities = (id) => request(`/projects/${id}/vulnerabilities`)
export const getScans = (id) => request(`/projects/${id}/scans`)
export const triggerScan = (id) => post(`/projects/${id}/scans`)
export const createSimulation = (id, body) => post(`/projects/${id}/simulations`, body)
export const getSimulation = (id, simId) => request(`/projects/${id}/simulations/${simId}`)
export const inspectNode = (id, simId, node) => request(`/projects/${id}/simulations/${simId}/nodes/${node}`)
export const mitigateSimulation = (id, simId, body) => post(`/projects/${id}/simulations/${simId}/mitigate`, body)

export const streamUrl = (id) => `${BASE}/projects/${id}/events/stream`
