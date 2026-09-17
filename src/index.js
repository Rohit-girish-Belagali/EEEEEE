#!/usr/bin/env node
import path from "node:path";
import { watchProject } from "./watcher.js";
import {
  scanProject,
  assertScannableProject,
  diffScans,
  defaultInitialProbability,
} from "./services/scanService.js";

const args = process.argv.slice(2);
const onceFlag = args.includes("--once");
const targetArg = args.find((arg) => !arg.startsWith("--"));

// Optional simulation flags: --simulate <pkg> --mitigate <pkg>
const simIndex = args.indexOf("--simulate");
const targetSimulatePkg = simIndex !== -1 && args[simIndex + 1] ? args[simIndex + 1] : null;
const mitIndex = args.indexOf("--mitigate");
const targetMitigatePkg = mitIndex !== -1 && args[mitIndex + 1] ? args[mitIndex + 1] : null;

const projectDir = path.resolve(targetArg ?? ".");

const RISK_ICON = {
  Critical: "🔴",
  High: "🟠",
  Medium: "🟡",
  Low: "🟢",
};

try {
  assertScannableProject(projectDir);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

console.log(`RippleGuard: Contextual Supply Chain Risk & Ripple Simulator`);
console.log(`Target: ${projectDir}`);

let previousScan = null;

async function scan(label = "Initial scan") {
  let result;
  try {
    result = await scanProject(projectDir);
  } catch (err) {
    console.error(`OSV / Risk Engine check failed: ${err.message}`);
    return;
  }

  if (targetSimulatePkg) {
    runManualSimulation(result.simulator, result.graph, targetSimulatePkg, targetMitigatePkg);
    return;
  }

  const diff = diffScans(previousScan, result);
  previousScan = result;

  console.log(`\n[${label}] ${result.packages.length} packages analyzed in dependency graph`);

  if (!diff.hasDependencyChanges) {
    if (label !== "Initial scan") console.log("No dependency changes detected.");
    return;
  }

  if (label !== "Initial scan") {
    const count = diff.added.length + diff.updated.length + diff.removed.length;
    console.log(`Changed packages (${count}):`);
    for (const p of diff.added) console.log(`  + ${p.name}@${p.version}`);
    for (const p of diff.updated) console.log(`  ~ ${p.name}@${p.from} -> ${p.to}`);
    for (const p of diff.removed) console.log(`  - ${p.name}@${p.version}`);
  }

  const changedNames = new Set([...diff.added, ...diff.updated].map((p) => p.name));
  const vulnerable = result.packages.filter((p) => changedNames.has(p.name) && p.vulnerabilityIds.length);

  for (const pkg of vulnerable) {
    const findings = result.findings
      .filter((f) => f.package === pkg.name)
      .map((f) => ({ id: f.osvId, aliases: f.aliases }));
    const simResult = result.simulator.simulate({
      initialNode: pkg.name,
      initialProbability: defaultInitialProbability(pkg),
    });
    printRiskAssessment(pkg.assessment, findings, simResult, result.graph);
  }

  if (vulnerable.length === 0) {
    console.log("No known vulnerabilities found for scanned packages.");
  }
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
    console.log(`\n  🌊 Propagation Ripple Timeline:`);
    printTimeline(simResult.affectedNodes, graph, "    ");
    if (simResult.criticalPath && simResult.criticalPath.length > 1) {
      console.log(`  Critical Impact Path: ${simResult.criticalPath.join(" ➔ ")}`);
    }
    console.log(
      `  Simulated Blast Radius: ${simResult.totalBlastRadius} (spreads across ${simResult.affectedNodes.length} nodes, depth ${simResult.maximumDepth})`
    );
  }
}

function printTimeline(affectedNodes, graph, baseIndent) {
  const rootName = graph.name ?? "(root)";
  for (const node of affectedNodes) {
    const isRoot = node.nodeId === rootName || node.nodeId === "(root)";
    const tag =
      node.timeStep === 0
        ? " [INITIATING COMPROMISE]"
        : isRoot
        ? " [PRODUCTION APPLICATION REACHED]"
        : "";
    const indent = baseIndent + "  ".repeat(node.timeStep);
    console.log(
      `${indent}t=${node.timeStep}: ${node.nodeId} (Impact: ${node.impactScore}, Prob: ${(
        node.infectionProbability * 100
      ).toFixed(1)}%)${tag}`
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

  console.log(`\n[Baseline Propagation Timeline]`);
  printTimeline(baseline.affectedNodes, graph, "  ");
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
    printTimeline(mitigated.affectedNodes, graph, "  ");
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
