# RippleGuard

A real-time supply-chain security monitor for npm dependencies. RippleGuard watches a project's `package.json` / `package-lock.json`, and whenever dependencies change, it analyzes the new or updated packages against live vulnerability intelligence and produces an **explainable** risk score — not just a number, but the reasons behind it.

## Why

Most dependency-scanning tools return an opaque "risk score" with no breakdown. If a build gets blocked and a developer can't see *why*, they bypass the tool. RippleGuard's risk engine exposes every contributing factor — vulnerability exposure, compromise likelihood, blast radius, and evidence confidence — plus a human-readable "Why this score?" explanation for every finding.

## How it works

1. **Watch** — a debounced file watcher detects changes to `package.json` / `package-lock.json`.
2. **Parse** — the lockfile is parsed into a dependency graph (direct + transitive packages, with reverse "dependents" edges).
3. **Check** — changed/new packages are queried against the live [OSV.dev](https://osv.dev) vulnerability database, with CVSS v3.1 base scores computed from vector strings and exploit-probability data pulled from the [FIRST.org EPSS API](https://www.first.org/epss/).
4. **Score** — an explainable multi-factor risk engine combines:
   - **Vulnerability exposure** — CVSS severity × EPSS exploit probability × reachability
   - **Compromise signal** — package trust weakness + temporal drift, amplified by version mutability (floating/unpinned ranges)
   - **Blast radius** — how many packages/projects downstream would be affected, weighted by topological centrality
   - **Evidence confidence** — an uncertainty penalty applied when input data is incomplete
5. **Explain** — every score ships with a bullet-point breakdown of exactly what drove it.
6. **Simulate** — a ripple simulation models how a compromise of a package would spread up the reverse dependency graph, step by step, to the root application, and can test how much a mitigation (quarantining a package) reduces the blast radius.

## Project layout

```
src/
  watcher.js          file watcher for package.json / package-lock.json
  parseLockfile.js    builds the dependency graph from package-lock.json
  osvCheck.js         OSV.dev + FIRST EPSS queries, CVSS v3.1 vector parsing, fix versions
  deriveMetrics.js    translates graph/lockfile data into risk-engine inputs
  riskEngine.js       explainable multi-factor risk scoring engine
  rippleSimulation.js time-step compromise propagation + mitigation simulation
  index.js            CLI entrypoint (watch, one-shot scan, and simulation modes)
  services/
    scanService.js       the full scan pipeline, shared by the CLI and the API
    simulationService.js simulation requests, node inspection, mitigation comparison
    projectService.js    projects, watchers, queued scans, scan diffs, events
    eventService.js      activity log + live event bus
    store.js             JSON persistence under data/
  api/
    server.js            Express app (REST + Server-Sent Events)
    routes/, controllers/
fixtures/demo-project/  sample project used for local testing
test/                   risk engine, ripple simulation and API tests
```

The CLI, the API and the watcher all call the same `scanProject()` — there is no separate scanning or scoring logic for the API.

## Usage

Install dependencies:

```bash
npm install
```

Run a one-time scan against a project (e.g. the bundled fixture):

```bash
npm run scan
# equivalent to:
node src/index.js ./fixtures/demo-project --once
```

Run in continuous watch mode against any project with a `package-lock.json`:

```bash
node src/index.js /path/to/your/project
```

Leave it running; it re-scans automatically whenever dependencies change (e.g. after `npm install some-package`) and prints an alert for any newly introduced risk.

Simulate a compromise of a package and test a mitigation:

```bash
node src/index.js ./fixtures/demo-project --once --simulate qs --mitigate express
```

```
[Baseline Propagation Timeline]
  t=0: qs (Impact: 0.225, Prob: 90.0%) [INITIATING COMPROMISE]
    t=1: express (Impact: 0.1549, Prob: 60.8%)
    t=1: body-parser (Impact: 0.0911, Prob: 60.8%)
      t=2: demo-project (Impact: 0.4556, Prob: 45.6%) [PRODUCTION APPLICATION REACHED]

Baseline Blast Radius: 0.6041
Critical Path: qs ➔ express ➔ demo-project

🛡️  Simulating Mitigation: Quarantining / Blocking 'express'

[Mitigated Propagation Timeline]
  t=0: qs (Impact: 0.225, Prob: 90.0%) [INITIATING COMPROMISE]
    t=1: body-parser (Impact: 0.0911, Prob: 60.8%)

Mitigated Blast Radius: 0.271
Risk Reduction: 55.1% blast radius reduction achieved.
```

Pick the mitigation target along the critical path: blocking a package that isn't on every route to the app (e.g. `body-parser` here, since `express` also depends on `qs` directly) only gives a small reduction.

Run the test suite:

```bash
npm test
```

## API server

Start the backend for the dashboard (watches the demo project by default):

```bash
npm run server
# or any projects:
node src/api/server.js /path/to/project-a /path/to/project-b
```

It listens on `http://localhost:4000/api` (override with `PORT` / `HOST`; pass `--no-watch` to disable file watching). Scan history, simulations and the activity log are stored as JSON in `data/` (override with `RIPPLEGUARD_DATA_DIR`). The server binds to `127.0.0.1` and only accepts browser requests from `localhost` origins, because it reads local project folders; add other origins with `RIPPLEGUARD_CORS_ORIGINS`.

### Endpoints

All project routes are under `/api/projects/:projectId`. The project id is the folder name (e.g. `demo-project`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects` | Registered projects with watcher and scan status |
| POST | `/api/projects` | Watch a local folder: `{ "path": "/abs/path" }` |
| POST | `/api/projects/upload` | Scan an uploaded lockfile once (no watching): `{ "name", "packageLock", "packageJson" }` as JSON strings or objects |
| DELETE | `/api/projects/:projectId` | Stop watching and remove a project |
| GET | `…/overview` | Dashboard summary: risk score, dependency and vulnerability counts, risk distribution, agent status |
| GET | `…/scans` | Scan history (for risk trends) |
| POST | `…/scans` | Run a scan now |
| GET | `…/dependencies` | All packages with risk score, direct/transitive, dependents/dependencies counts |
| GET | `…/dependencies/graph` | `nodes` + `edges` (`source` depends on `target`) for React Flow / Cytoscape / D3 |
| GET | `…/dependencies/:packageName` | Package detail: risk components, signals (CVSS, EPSS, trust, mutability, centrality), reasons, path to the application |
| GET | `…/vulnerabilities` | Every finding with CVSS, EPSS, severity, fix versions, package risk and reasons |
| POST | `…/simulations` | Run a ripple simulation: `{ "initialPackage": "qs", "initialProbability": 0.9, "maxSteps": 5 }` |
| GET | `…/simulations` | Past simulations |
| GET | `…/simulations/:simulationId` | Full simulation: nodes, events, critical path, mitigations |
| GET | `…/simulations/:simulationId/nodes/:nodeId` | Inspect a node: probability, impact, criticality, centrality, propagation path |
| POST | `…/simulations/:simulationId/mitigate` | Block packages: `{ "blockedPackage": "express" }` → before/after blast radius and reduction |
| GET | `…/events` | Recent activity log |
| GET | `…/events/stream` | Live Server-Sent Events |

Errors return `{ "error": "message" }` with a 400, 404 or 409 status.

### Live events

`GET …/events/stream` is a Server-Sent Events stream. Each message is JSON with `id`, `projectId`, `type`, `timestamp` and `data`:

| Type | When |
|---|---|
| `file-changed` | `package.json` / `package-lock.json` changed on disk |
| `scan-started`, `scan-completed`, `scan-failed` | Scan lifecycle; `scan-completed` carries the new summary and change counts |
| `dependencies-changed` | Packages added, updated or removed since the last scan |
| `vulnerabilities-detected`, `vulnerabilities-resolved` | Findings that appeared or disappeared |
| `simulation-completed`, `mitigation-completed` | Simulation results |

```js
const source = new EventSource("http://localhost:4000/api/projects/demo-project/events/stream");
source.onmessage = (message) => {
  const event = JSON.parse(message.data);
  if (event.type === "scan-completed") refreshDashboard();
};
```

Browsers reconnect automatically and send `Last-Event-ID`; the server replays any events missed in between.

## Demo script

Uses the bundled fixture (`express@4.17.1`, no `lodash`). The numbers below are what the tool actually produces for this project.

1. `npm run server`, then open the dashboard: **49 dependencies**, **14 known vulnerabilities** across **7 packages**, overall risk **76 (high)** led by `qs`.
2. Open the dependency graph and select `qs`. Its path to the application is `qs → express → demo-project`.
3. Open `qs` details: CVSS, EPSS, trust and mutability signals, centrality, downstream reach, and the "why this score" reasons.
4. Run a ripple simulation from `qs`: qs 90% → express and body-parser 60.8% → **demo-project 45.6%**, blast radius **60.4%**.
5. Mitigate by blocking `express`: blast radius **60.4% → 27.1%**, a **55.1% reduction**, and the application is no longer reached.
6. In a terminal, run `npm install lodash@4.17.15` inside `fixtures/demo-project`. The watcher rescans and the stream sends `dependencies-changed`, `vulnerabilities-detected` (6 lodash advisories) and `scan-completed`.

Reset afterwards with `npm uninstall lodash` in the fixture.

## Example output

```
🔴 Package: lodash@4.17.15
  Vulnerabilities: GHSA-29mw-wpgm-hmr9 (CVE-2020-28500), GHSA-35jh-r3h4-6jhm (CVE-2021-23337), +4 more
  Vulnerability exposure: 0.4406
  Compromise signal: 2.2408
  Blast radius: 0.1264
  Evidence confidence: 0.95
  Final contextual risk: 0.8766
  Risk level: Critical

  Why this score?
  - Known vulnerability exposure is moderate
  - Dependency is unpinned/floating, so updates land without explicit review
  - Package has 1 direct downstream dependent
  - Dependency is a direct top-level requirement
  - It reaches a production application
  - Evidence confidence is high
```

## Status

Working end-to-end against real npm projects with live OSV.dev / FIRST EPSS data: CLI, REST API, live event stream, ripple simulation and mitigation. Not yet built: the dashboard frontend and desktop notifications.
