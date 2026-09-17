# Using RippleGuard from the terminal

RippleGuard checks the packages an npm project depends on, tells you which ones have known security problems, explains how risky each one is, and shows how a compromised package could spread through your project. This guide covers the terminal only — no dashboard needed.

## 1. Set it up (once)

You need Node.js 18 or newer. Check with `node -v`.

```bash
git clone https://github.com/Rohit-girish-Belagali/Spectra.git
cd Spectra
npm install
npm run build
```

The last line builds the dashboard so the terminal can open it for you. It only needs to run once.

## 2. Pick a project to check

RippleGuard works on a **folder** that contains a `package-lock.json` file. Every npm project gets that file after you run `npm install` in it.

Don't have one yet? Generate just the lockfile without installing anything:

```bash
cd /path/to/your/project
npm install --package-lock-only
```

Want to try it without your own project? The repository ships a small demo project at `fixtures/demo-project` that uses an old, vulnerable version of Express.

## 3. Run a scan

From the Spectra folder:

```bash
node src/index.js /path/to/your/project --once
```

Or, for the demo project:

```bash
npm run scan
```

`--once` means: scan, print the results, exit. Scanning takes a few seconds because it asks two public databases (OSV.dev and FIRST EPSS) about every package.

### Reading the results

For each package with a known vulnerability you get a block like this:

```
🟠 Package: qs@6.7.0
  Vulnerabilities: GHSA-4mjr-xmp4-gh2g (CVE-2026-82417), +3 more
  Vulnerability exposure: 0.2203
  Compromise signal: 0.5
  Blast radius: 0.5008
  Evidence confidence: 0.95
  Final contextual risk: 0.7647
  Risk level: High

  Why this score?
  - Known vulnerability exposure is moderate
  - Package has 3 downstream dependents in this project
  - Dependency is transitive
  - It reaches a production application

  🌊 Propagation Ripple Timeline:
    t=0: qs (Impact: 0.0984, Prob: 39.4%) [INITIATING COMPROMISE]
      t=1: express (Impact: 0.0677, Prob: 26.6%)
        t=2: demo-project (Impact: 0.1992, Prob: 19.9%) [PRODUCTION APPLICATION REACHED]
  Critical Impact Path: qs ➔ express ➔ demo-project
  Simulated Blast Radius: 0.3331
```

| Line | What it means |
|---|---|
| 🔴 🟠 🟡 🟢 | Critical / High / Medium / Low risk |
| **Vulnerabilities** | The advisory IDs. Search any of them on osv.dev for details and the fixed version |
| **Vulnerability exposure** | How bad the known problems are, taking severity and real-world exploitation into account |
| **Compromise signal** | How likely the package is to be tampered with (unpinned `^` / `~` versions score higher) |
| **Blast radius** | How much of your project sits downstream of this package |
| **Final contextual risk** | All of the above combined, 0 to 1 |
| **Why this score?** | The reasons behind the number, in plain words |
| **Ripple Timeline** | If this package were compromised, what it would reach, step by step, and with what probability |
| **Critical Impact Path** | The most likely route from the package to your application |

Packages with no known vulnerabilities are not printed.

## 4. Keep watching a project (and open the dashboard)

Run it without `--once` and RippleGuard becomes an agent: it scans, prints the report, keeps watching, and opens the dashboard in your browser at `http://localhost:4000`:

```bash
node src/index.js /path/to/your/project
```

The dashboard shows the same results with the dependency graph, the live activity feed, and the ripple simulation. Add `--no-open` if you don't want the browser to launch.

Leave that terminal open. In a second terminal, change something in the project — for example:

```bash
cd /path/to/your/project
npm install lodash@4.17.15
```

Within a few seconds the first terminal prints `[Change detected]`, the packages that changed, and the risk report for any new problems — and the dashboard updates at the same moment. Press `Ctrl+C` to stop watching.

## 5. Ask "what if this package were compromised?"

```bash
node src/index.js /path/to/your/project --once --simulate qs
```

Replace `qs` with any package name from the project. You get the full propagation timeline and the blast radius.

To test a fix — for example, what happens if you remove or replace `express` — add `--mitigate`:

```bash
node src/index.js /path/to/your/project --once --simulate qs --mitigate express
```

The output shows the blast radius before and after, and the percentage reduction:

```
Baseline Blast Radius: 0.6041
Mitigated Blast Radius: 0.271
Risk Reduction: 55.1% blast radius reduction achieved.
```

Tip: block a package on the **Critical Impact Path** for the biggest reduction. Blocking something off that path changes little.

## 6. Run the tests

```bash
npm test
```

## Quick reference

| I want to… | Command |
|---|---|
| Scan a project once | `node src/index.js <folder> --once` |
| Scan the demo project | `npm run scan` |
| Watch a project + open the dashboard | `node src/index.js <folder>` |
| Same, without launching the browser | `node src/index.js <folder> --no-open` |
| Watch the demo project | `npm run demo` |
| Simulate a compromise | `node src/index.js <folder> --once --simulate <package>` |
| Test a mitigation | `… --simulate <package> --mitigate <package>` |
| Build the dashboard (once) | `npm run build` |
| Run the tests | `npm test` |

## If something goes wrong

| Message | Fix |
|---|---|
| `No package-lock.json found in …` | Run `npm install` (or `npm install --package-lock-only`) inside that folder first |
| `Unsupported lockfile format` | The lockfile is from npm 6 or older. Run `npm install` with npm 7+ to upgrade it |
| `OSV / Risk Engine check failed` | No internet connection, or the vulnerability database is temporarily unreachable. Try again |
| Nothing prints after a change | Only `package.json` and `package-lock.json` are watched. Edits elsewhere do not trigger a scan |
| `dashboard not built yet` | Run `npm run build` once in the Spectra folder, then start again |
| `Port 4000 is in use, picking a free one` | Something else uses port 4000; the terminal prints the address that was used instead |
