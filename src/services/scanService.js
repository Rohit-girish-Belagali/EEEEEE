import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseLockfile } from "../parseLockfile.js";
import { checkVulnerabilities } from "../osvCheck.js";
import { deriveRiskInputs } from "../deriveMetrics.js";
import { AdvancedRiskEngine } from "../riskEngine.js";
import {
  RippleSimulator,
  buildDependencyNodesFromGraph,
  buildPropagationEdgesFromGraph,
} from "../rippleSimulation.js";

const riskEngine = new AdvancedRiskEngine();

export function isFloatingRange(range) {
  if (!range) return false;
  return /^[\^~*]|latest|>=?/.test(range.trim());
}

export function lockfilePathFor(projectPath) {
  return path.join(projectPath, "package-lock.json");
}

export function assertScannableProject(projectPath) {
  if (!existsSync(lockfilePathFor(projectPath))) {
    const err = new Error(`No package-lock.json found in ${projectPath}`);
    err.status = 400;
    throw err;
  }
}

async function readManifestDeps(projectPath) {
  try {
    const manifest = JSON.parse(await readFile(path.join(projectPath, "package.json"), "utf-8"));
    return { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  } catch {
    return {};
  }
}

/**
 * Full analysis pipeline shared by the CLI, the API and the watcher:
 * lockfile graph -> OSV/EPSS intelligence -> risk engine -> ripple simulator.
 *
 * `packages` and `findings` are plain data; `graph` and `simulator` are live
 * objects kept for follow-up simulations and are not serialized.
 */
export async function scanProject(projectPath) {
  const startedAt = new Date();
  assertScannableProject(projectPath);

  const graph = await parseLockfile(lockfilePathFor(projectPath));
  const manifestDeps = await readManifestDeps(projectPath);
  const rootName = graph.name ?? "(root)";

  const vulnsByPackage = await checkVulnerabilities(
    [...graph.packages].map(([name, info]) => ({ name, version: info.version }))
  );

  const dependenciesOf = new Map([[rootName, []]]);
  for (const name of graph.packages.keys()) dependenciesOf.set(name, []);
  for (const [name, info] of graph.packages) {
    for (const dependent of info.dependents) {
      if (!dependenciesOf.has(dependent)) dependenciesOf.set(dependent, []);
      dependenciesOf.get(dependent).push(name);
    }
  }

  const simulator = new RippleSimulator(
    buildDependencyNodesFromGraph(graph, manifestDeps),
    buildPropagationEdgesFromGraph(graph)
  );

  const packages = [];
  const findings = [];

  for (const [name, info] of [...graph.packages].sort(([a], [b]) => a.localeCompare(b))) {
    const pkgFindings = vulnsByPackage.get(name) ?? [];
    const direct = Object.prototype.hasOwnProperty.call(manifestDeps, name);
    const floating = isFloatingRange(manifestDeps[name]);

    const inputs = deriveRiskInputs({
      packageName: name,
      version: info.version,
      findings: pkgFindings,
      graph,
      isFloatingRange: floating,
      isDirect: direct,
    });
    const assessment = riskEngine.assessPackage({ packageName: name, version: info.version, ...inputs });

    packages.push({
      name,
      version: info.version,
      direct,
      declaredRange: manifestDeps[name] ?? null,
      floatingRange: floating,
      dependents: [...info.dependents].sort(),
      dependencies: [...(dependenciesOf.get(name) ?? [])].sort(),
      transitiveDependents: inputs.struct.downstreamImpacts.map((d) => d.nodeId).sort(),
      reachesApplication: inputs.struct.downstreamImpacts.some((d) => d.nodeId === rootName),
      vulnerabilityIds: pkgFindings.map((f) => f.id),
      signals: inputs,
      assessment,
    });

    for (const f of pkgFindings) {
      findings.push({
        package: name,
        version: info.version,
        osvId: f.id,
        aliases: f.aliases ?? [],
        summary: f.summary,
        severity: f.severity ?? severityFromCvss(f.cvssScore),
        cvss: f.cvssScore ?? null,
        epss: f.epssScore ?? null,
        fixedVersions: f.fixedVersionsByPackage?.[name] ?? [],
      });
    }
  }

  const completedAt = new Date();
  return {
    projectPath,
    projectName: rootName,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt - startedAt,
    rootName,
    rootDependencies: [...(dependenciesOf.get(rootName) ?? [])].sort(),
    packages,
    findings,
    graph,
    simulator,
  };
}

export function severityFromCvss(cvss) {
  if (typeof cvss !== "number") return null;
  if (cvss >= 9) return "critical";
  if (cvss >= 7) return "high";
  if (cvss >= 4) return "moderate";
  if (cvss > 0) return "low";
  return null;
}

/** Initial compromise probability used for automatic per-package simulations. */
export function defaultInitialProbability(pkg) {
  const likelihood = pkg.assessment.compromiseLikelihood;
  return likelihood > 0 ? likelihood : 0.85;
}

export function diffScans(previous, next) {
  const before = new Map((previous?.packages ?? []).map((p) => [p.name, p.version]));
  const after = new Map(next.packages.map((p) => [p.name, p.version]));

  const added = [];
  const updated = [];
  const removed = [];
  for (const [name, version] of after) {
    if (!before.has(name)) added.push({ name, version });
    else if (before.get(name) !== version) updated.push({ name, from: before.get(name), to: version });
  }
  for (const [name, version] of before) {
    if (!after.has(name)) removed.push({ name, version });
  }

  const key = (f) => `${f.package}@${f.version}#${f.osvId}`;
  const beforeFindings = new Set((previous?.findings ?? []).map(key));
  const afterFindings = new Set(next.findings.map(key));

  return {
    added,
    updated,
    removed,
    newFindings: next.findings.filter((f) => !beforeFindings.has(key(f))),
    resolvedFindings: (previous?.findings ?? []).filter((f) => !afterFindings.has(key(f))),
    hasDependencyChanges: added.length + updated.length + removed.length > 0,
  };
}
