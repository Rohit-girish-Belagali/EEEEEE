// Frontend-only demo build: every call is served from a snapshot captured
// from the real RippleGuard backend scanning fixtures/demo-project.
import data from './mockData.json'

const delay = (value, ms = 180) =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))
const fail = (message) => Promise.reject(new Error(message))

const simsById = {}
for (const sim of Object.values(data.simulations)) simsById[sim.simulationId] = sim

export const DEMO_MODE = true

export const getProjects = () => delay(data.projects)
export const addProject = () => fail('This is the hosted demo. Run RippleGuard locally to watch your own folder.')
export const uploadProject = () => fail('This is the hosted demo. Run RippleGuard locally to scan your own lockfile.')
export const getOverview = () => delay(data.overview)
export const getEvents = () => delay(data.events)
export const getDependencies = () => delay(data.dependencies)
export const getDependencyGraph = () => delay(data.graph)
export const getDependency = (_id, name) =>
  data.dependency[name] ? delay(data.dependency[name]) : fail(`Package "${name}" not found`)
export const getVulnerabilities = () => delay(data.vulnerabilities)
export const getScans = () => delay(data.scans)
export const triggerScan = () => delay(data.overview, 900)
export const createSimulation = (_id, body) => {
  const sim = data.simulations[body?.initialPackage]
  return sim ? delay(sim, 400) : fail(`Package "${body?.initialPackage}" is not in the dependency graph`)
}
export const getSimulation = (_id, simId) => (simsById[simId] ? delay(simsById[simId]) : fail('Simulation not found'))
export const inspectNode = (_id, simId, node) => {
  const n = simsById[simId]?.nodes?.find((x) => x.id === node)
  return n ? delay(n) : fail('Node not found')
}
export const mitigateSimulation = (_id, simId, body) => {
  const m = simsById[simId]?.mitigations?.[body?.blockedPackage]
  return m
    ? delay(m, 400)
    : fail(`Blocking "${body?.blockedPackage}" does not change this ripple. Pick a package on the propagation path.`)
}

export const streamUrl = () => null
