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
  watcher.js        file watcher for package.json / package-lock.json
  parseLockfile.js  builds the dependency graph from package-lock.json
  osvCheck.js        OSV.dev + FIRST EPSS queries, CVSS v3.1 vector parsing
  deriveMetrics.js  translates graph/lockfile data into risk-engine inputs
  riskEngine.js      explainable multi-factor risk scoring engine
  rippleSimulation.js time-step compromise propagation + mitigation simulation
  index.js           CLI entrypoint (watch, one-shot scan, and simulation modes)
fixtures/demo-project/  sample project used for local testing
test/                   automated tests for the risk engine and ripple simulation
```

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

Working end-to-end against real npm projects with live OSV.dev / FIRST EPSS data, including ripple simulation and mitigation testing. Not yet built: a dashboard UI and desktop notifications.
