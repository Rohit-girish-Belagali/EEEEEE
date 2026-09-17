export const SLIDES = [
  { title: 'RippleGuard · Team Spectra', points: ['Manipal Hackathon 2026, Cybersecurity track, problem statement P04: Open Source Supply Chains, The Ripple Effect.', 'RippleGuard maps a dependency ecosystem, scores every package with reasons, and simulates how a compromise spreads to production.'] },
  { title: 'The problem', points: ['454,600 new malicious open-source packages in 2025, up 75% year on year, and 99% of them on npm (Sonatype 2026).', 'A supply-chain compromise costs $4.91M on average and takes 267 days to contain (IBM 2025).', 'Scanners score packages one at a time, never show the propagation path, and hide their reasoning.'] },
  { title: 'Our solution', points: ['Map: package-lock.json becomes a full graph with reverse dependents edges.', 'Score: four explainable factors fed by live OSV.dev, EPSS and CVSS 3.1 data.', 'Simulate: time-step ripple from any package to the production root, with what-if quarantine.', 'Explain: every score ships with plain-English reasons.'] },
  { title: 'Risk engine', points: ['Risk combines vulnerability exposure, compromise signal, blast radius, and evidence confidence.', 'On the demo project, qs@6.7.0 scores highest at 0.76 because it is a central junction that reaches the app.', 'The "Why this score?" list is verbatim engine output.'] },
  { title: 'Ripple simulation', points: ['A compromise of qs at 90% reaches express and body-parser at 60.8%, then the app at 45.6%.', 'Baseline blast radius is 60.4%. Blocking express cuts it to 27.1%, a 55.1% reduction.', 'Blocking body-parser only removes 6.3%, because qs still reaches the app through express.'] },
  { title: 'Technical implementation', points: ['Watcher, graph parser, intelligence lookup, risk engine, ripple simulation, REST + SSE API, React dashboard.', '13 of 13 tests pass across engine, simulation and API.', 'No API keys or paid feeds. OSV.dev and FIRST EPSS are free.'] },
  { title: 'Business strategy', points: ['Free CLI drives adoption. Team tier adds history, alerts and a GitHub Action CI gate. Enterprise adds SBOM import, SSO and on-prem.', 'Roadmap: PyPI and Maven in 3 months, CycloneDX SBOM in 6, policy engine in 12.', 'Scan the QR codes for the repo, live dashboard and demo video.'] },
]

// Crop boxes are fractions of the 16:9 slide image: [x, y, width, height].
const P = '/p/demo-project'

export const TEAM = [
  {
    slug: 'tejasvi', name: 'Tejasvi M H', part: 'The hook', time: '0:00–0:24',
    shots: [
      { kind: 'slide', n: 2, label: 'Slide 2 · The problem', note: 'Land the 454,600 stat and the Shai-Hulud worm.' },
      { kind: 'site', to: `${P}/vulnerabilities`, label: 'Website · Vulnerabilities', note: 'Scroll slowly so the long list of findings shows.' },
      { kind: 'slide', n: 1, label: 'Slide 1 · RippleGuard title', note: 'Name the product and the team.' },
      { kind: 'site', to: P, label: 'Website · Overview', note: 'Hold on the big red "EXPOSED." verdict.' },
    ],
  },
  {
    slug: 'shashank', name: 'Thambichetty Shashank', part: 'Target audience', time: '0:24–0:48',
    shots: [
      { kind: 'slide', n: 7, crop: [0.03, 0.645, 0.52, 0.125], label: 'Slide 7 · Who pays', note: 'JS/TS engineering teams, DevSecOps and AppSec, OSS maintainers.' },
      { kind: 'terminal', label: 'Terminal · npm run demo', note: 'Run it, then open the dashboard link it prints.' },
      { kind: 'site', to: '/add', label: 'Website · Add project', note: 'Show both ways in: Watch a folder and Check a lockfile.' },
      { kind: 'slide', n: 7, crop: [0.03, 0.765, 0.52, 0.18], label: 'Slide 7 · Roadmap', note: 'npm now, PyPI and Maven next, SBOM and policy engine after.' },
    ],
  },
  {
    slug: 'harsha', name: 'M Harshavardan', part: 'Developer pain points', time: '0:48–1:12',
    shots: [
      { kind: 'site', to: `${P}/vulnerabilities`, label: 'Website · Vulnerabilities', note: 'Click "Why" on a qs row to open its reasons.' },
      { kind: 'site', to: `${P}/simulation?package=qs`, label: 'Website · Simulation', note: 'Run qs. Wait for the red "REACHES YOUR APP."' },
      { kind: 'slide', n: 5, crop: [0.595, 0.21, 0.375, 0.7], label: 'Slide 5 · −6.3% vs −55.1%', note: 'Blocking the wrong package barely helps. Blocking express cuts the blast radius by more than half.' },
      { kind: 'site', to: `${P}/simulation?package=qs`, label: 'Website · Simulation', note: 'Run qs, then click Block express. Wait for the green "CONTAINED."' },
    ],
  },
  {
    slug: 'rohit', name: 'Rohit Girish Belagali', part: 'Technical advantage', time: '1:12–1:36',
    shots: [
      { kind: 'slide', n: 4, crop: [0.03, 0.2, 0.94, 0.17], label: 'Slide 4 · Risk engine formula', note: 'Exposure × compromise × blast radius, adjusted for confidence.' },
      { kind: 'curve', label: 'Saturation curve · 1 − e⁻ˣ', note: 'The engine squashes raw risk with 1 − e⁻ˣ, so scores stay in 0–1 and never hit a hard clamp.' },
      { kind: 'site', to: `${P}/dependencies?package=qs`, label: 'Website · Dependency graph', note: 'qs is selected, so its red path and detail panel show.' },
    ],
  },
  {
    slug: 'varsha', name: 'Varsha K', part: 'Business and roadmap', time: '1:36–2:00',
    shots: [
      { kind: 'slide', n: 7, crop: [0.03, 0.2, 0.52, 0.45], label: 'Slide 7 · Free / Team / Enterprise', note: 'Free drives adoption, Team is the CI wedge, Enterprise is the revenue.' },
      { kind: 'slide', n: 7, crop: [0.03, 0.765, 0.52, 0.18], label: 'Slide 7 · Roadmap', note: 'Walk the four milestones left to right.' },
      { kind: 'site', to: P, label: 'Website · Overview', note: 'Scroll to the live activity feed.' },
      { kind: 'endcard', label: 'End card · GitHub', note: 'Close on the repo link.' },
    ],
  },
]

export const GITHUB_URL = 'https://github.com/Rohit-girish-Belagali/Spectra'
