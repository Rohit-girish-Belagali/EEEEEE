#!/usr/bin/env node
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseLockfile, affectedBy } from "./parseLockfile.js";
import { checkVulnerabilities } from "./osvCheck.js";
import { watchProject } from "./watcher.js";
import { deriveRiskInputs } from "./deriveMetrics.js";
import { AdvancedRiskEngine } from "./riskEngine.js";
import {
  RippleSimulator,
  buildDependencyNodesFromGraph,
  buildPropagationEdgesFromGraph,
} from "./rippleSimulation.js";

const args = process.argv.slice(2);
const onceFlag = args.includes("--once");
const targetArg = args.find((arg) => !arg.startsWith("--"));

// Optional simulation flags: --simulate <pkg> --mitigate <pkg>
const simIndex = args.indexOf("--simulate");
const targetSimulatePkg = simIndex !== -1 && args[simIndex + 1] ? args[simIndex + 1] : null;
const mitIndex = args.indexOf("--mitigate");
const targetMitigatePkg = mitIndex !== -1 && args[mitIndex + 1] ? args[mitIndex + 1] : null;

const projectDir = path.resolve(targetArg ?? ".");
const lockfilePath = path.join(projectDir, "package-lock.json");
const manifestPath = path.join(projectDir, "package.json");
const riskEngine = new AdvancedRiskEngine();

const RISK_ICON = {
  Critical: "🔴",
  High: "🟠",
  Medium: "🟡",
  Low: "🟢",
};

function isFloatingRange(range) {
  if (!range) return false;
  return /^[\^~*]|latest|>=?/.test(range.trim());
}

if (!existsSync(lockfilePath)) {
  console.error(`No package-lock.json found in ${projectDir}`);
  process.exit(1);
}

console.log(`RippleGuard: Contextual Supply Chain Risk & Ripple Simulator`);
console.log(`Target: ${projectDir}`);

let knownVersions = new Map(); // name -> version, from the last scan

async function scan(label = "Initial scan") {
  const graph = await parseLockfile(lockfilePath);

  let manifestDeps = {};
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
    manifestDeps = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  } catch {
    // no package.json / unreadable
  }

  // Build simulator components from graph
  const simNodes = buildDependencyNodesFromGraph(graph, manifestDeps);
  const simEdges = buildPropagationEdgesFromGraph(graph);
  const simulator = new RippleSimulator(simNodes, simEdges);

  // If manual simulation requested via CLI
  if (targetSimulatePkg) {
    runManualSimulation(simulator, graph, targetSimulatePkg, targetMitigatePkg);
    return;
  }

  const newVersions = new Map();
  for (const [name, info] of graph.packages) newVersions.set(name, info.version);

  const changed = [];
  for (const [name, version] of newVersions) {
    if (!knownVersions.has(name)) {
      changed.push({ name, version, kind: "added" });
    } else if (knownVersions.get(name) !== version) {
      changed.push({ name, version, kind: "updated", from: knownVersions.get(name) });
    }
  }

  console.log(`\n[${label}] ${graph.packages.size} packages analyzed in dependency graph`);

  if (changed.length > 0) {
    if (label !== "Initial scan") {
      console.log(`Changed packages (${changed.length}):`);
      for (const c of changed) {
        const detail = c.kind === "updated" ? `${c.from} -> ${c.version}` : c.version;
        console.log(`  ${c.kind === "added" ? "+" : "~"} ${c.name}@${detail}`);
      }
    }

    try {
      const vulns = await checkVulnerabilities(
        changed.map((c) => ({ name: c.name, version: c.version }))
      );

      let anyVulnFound = false;
      const sortedChanged = [...changed].sort((a, b) => a.name.localeCompare(b.name));

      for (const { name, version } of sortedChanged) {
        const findings = vulns.get(name);
        if (!findings || findings.length === 0) continue;
        anyVulnFound = true;

        const isDirect = Object.prototype.hasOwnProperty.call(manifestDeps, name);
        const floating = isFloatingRange(manifestDeps[name]);

        const inputs = deriveRiskInputs({
          packageName: name,
          version,
          findings,
          graph,
          isFloatingRange: floating,
          isDirect,
        });

        const assessment = riskEngine.assessPackage({
          packageName: name,
          version,
          ...inputs,
        });

        // Run ripple simulation for this package
        const simResult = simulator.simulate({
          initialNode: name,
          initialProbability: assessment.compromiseLikelihood > 0 ? assessment.compromiseLikelihood : 0.85,
        });

        printRiskAssessment(assessment, findings, simResult, graph);
      }

      if (!anyVulnFound) {
        console.log("No known vulnerabilities found for scanned packages.");
      }
    } catch (err) {
      console.error(`OSV / Risk Engine check failed: ${err.message}`);
    }
  } else if (label !== "Initial scan") {
    console.log("No dependency changes detected.");
  }

  knownVersions = newVersions;
}

function printRiskAssessment(a, findings, simResult, graph) {
  const icon = RISK_ICON[a.riskLevel] ?? "⚠️";
  console.log(`\n--------------------------------------------------`);
  console.log(`${icon} Package: ${a.packageName}@${a.version}`);

  const cveLabels = (findings ?? [])
    .map((f) => {
      const cve = f.aliases?.find((al) => al.startsWith("CVE-"));
      return cve ? `${f.id} (${cve})` : f.id;
    })
    .slice(0, 3);
  if (findings.length > 3) cveLabels.push(`+${findings.length - 3} more`);

  console.log(`  Vulnerabilities: ${cveLabels.join(", ")}`);
  console.log(`  Vulnerability exposure: ${a.vulnerabilityExposure}`);
  console.log(`  Compromise signal: ${a.compromiseSignal}`);
  console.log(`  Blast radius: ${a.blastRadius}`);
  console.log(`  Evidence confidence: ${a.confidenceScore}`);
  console.log(`  Final contextual risk: ${a.finalRiskScore}`);
  console.log(`  Risk level: ${a.riskLevel}`);

  console.log(`\n  Why this score?`);
  for (const reason of a.explanation) {
    console.log(`  - ${reason}`);
  }

  // Ripple Simulation Report
  if (simResult && simResult.affectedNodes.length > 1) {
    const rootName = graph.name ?? "(root)";
    console.log(`\n  🌊 Propagation Ripple Timeline:`);
    for (const node of simResult.affectedNodes) {
      const isInit = node.timeStep === 0;
      const isRoot = node.nodeId === rootName || node.nodeId === "(root)";
      const tag = isInit
        ? " [INITIATING COMPROMISE]"
        : isRoot
        ? " [PRODUCTION APPLICATION REACHED]"
        : "";
      const indent = "    " + "  ".repeat(node.timeStep);
      console.log(
        `${indent}t=${node.timeStep}: ${node.nodeId} (Impact: ${node.impactScore}, Prob: ${(
          node.infectionProbability * 100
        ).toFixed(1)}%)${tag}`
      );
    }
    if (simResult.criticalPath && simResult.criticalPath.length > 1) {
      console.log(`  Critical Impact Path: ${simResult.criticalPath.join(" ➔ ")}`);
    }
    console.log(
      `  Simulated Blast Radius: ${simResult.totalBlastRadius} (spreads across ${simResult.affectedNodes.length} nodes, depth ${simResult.maximumDepth})`
    );
  }
}

function runManualSimulation(simulator, graph, pkgName, mitigatePkg) {
  console.log(`\n==================================================`);
  console.log(`🌊 Standalone Ripple Simulation: ${pkgName}`);
  console.log(`==================================================`);

  const baseline = simulator.simulate({
    initialNode: pkgName,
    initialProbability: 0.9,
  });

  const rootName = graph.name ?? "(root)";
  console.log(`\n[Baseline Propagation Timeline]`);
  for (const node of baseline.affectedNodes) {
    const isInit = node.timeStep === 0;
    const isRoot = node.nodeId === rootName || node.nodeId === "(root)";
    const tag = isInit
      ? " [INITIATING COMPROMISE]"
      : isRoot
      ? " [PRODUCTION APPLICATION REACHED]"
      : "";
    const indent = "  " + "  ".repeat(node.timeStep);
    console.log(
      `${indent}t=${node.timeStep}: ${node.nodeId} (Impact: ${node.impactScore}, Prob: ${(
        node.infectionProbability * 100
      ).toFixed(1)}%)${tag}`
    );
  }
  console.log(`\nBaseline Blast Radius: ${baseline.totalBlastRadius}`);
  console.log(`Critical Path: ${baseline.criticalPath.join(" ➔ ")}`);

  if (mitigatePkg) {
    console.log(`\n🛡️  Simulating Mitigation: Quarantining / Blocking '${mitigatePkg}'`);
    const mitigated = simulator.simulate({
      initialNode: pkgName,
      initialProbability: 0.9,
      mitigation: {
        blockedNodes: [mitigatePkg],
      },
    });

    console.log(`\n[Mitigated Propagation Timeline]`);
    for (const node of mitigated.affectedNodes) {
      const indent = "  " + "  ".repeat(node.timeStep);
      console.log(
        `${indent}t=${node.timeStep}: ${node.nodeId} (Impact: ${node.impactScore}, Prob: ${(
          node.infectionProbability * 100
        ).toFixed(1)}%)`
      );
    }
    console.log(`\nMitigated Blast Radius: ${mitigated.totalBlastRadius}`);
    const reduction =
      baseline.totalBlastRadius > 0
        ? (
            ((baseline.totalBlastRadius - mitigated.totalBlastRadius) /
              baseline.totalBlastRadius) *
            100
          ).toFixed(1)
        : 0;
    console.log(`Risk Reduction: ${reduction}% blast radius reduction achieved.`);
  }
}

await scan();

if (!onceFlag && !targetSimulatePkg) {
  watchProject(projectDir, async () => {
    await scan("Change detected");
  });
  console.log("\nRippleGuard is watching for dependency modifications. Press Ctrl+C to stop.");
}
