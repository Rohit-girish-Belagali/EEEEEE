import { NotFoundError } from "../../services/projectService.js";

const pct = (x) => Math.round(x * 100);

function riskSummary(pkg) {
  return {
    riskScore: pct(pkg.assessment.finalRiskScore),
    riskLevel: pkg.assessment.riskLevel.toLowerCase(),
  };
}

export function dependencyController(projects) {
  return {
    async list(req, res) {
      const snapshot = await projects.getSnapshot(req.params.projectId);
      res.json({
        scanId: snapshot.id,
        dependencies: snapshot.packages.map((p) => ({
          name: p.name,
          version: p.version,
          ...riskSummary(p),
          direct: p.direct,
          dependents: p.dependents.length,
          dependencies: p.dependencies.length,
          transitiveDependents: p.transitiveDependents.length,
          vulnerabilityCount: p.vulnerabilityIds.length,
          reachesApplication: p.reachesApplication,
        })),
      });
    },

    async detail(req, res) {
      const snapshot = await projects.getSnapshot(req.params.projectId);
      const pkg = snapshot.packages.find((p) => p.name === req.params.packageName);
      if (!pkg) throw new NotFoundError(`Package '${req.params.packageName}' not found`);

      const { assessment: a, signals: s } = pkg;
      res.json({
        scanId: snapshot.id,
        name: pkg.name,
        version: pkg.version,
        ...riskSummary(pkg),
        direct: pkg.direct,
        declaredRange: pkg.declaredRange,
        floatingRange: pkg.floatingRange,
        reachesApplication: pkg.reachesApplication,
        dependents: pkg.dependents,
        dependencies: pkg.dependencies,
        transitiveDependents: pkg.transitiveDependents,
        pathToApplication: shortestPathToRoot(snapshot, pkg.name),
        components: {
          vulnerabilityExposure: a.vulnerabilityExposure,
          compromiseSignal: a.compromiseSignal,
          compromiseLikelihood: a.compromiseLikelihood,
          blastRadius: a.blastRadius,
          confidenceScore: a.confidenceScore,
          uncertaintyPenalty: a.uncertaintyPenalty,
          finalRiskScore: a.finalRiskScore,
        },
        signals: {
          cvss: s.vuln.cvssScore,
          epss: s.vuln.epssScore,
          executionReachability: s.vuln.executionReachability,
          baseTrust: s.trust.baseTrust,
          temporalDrift: s.trust.temporalDrift,
          versionMutability: s.trust.versionMutability,
          systemicCentrality: s.struct.systemicCentrality,
          downstreamReach: s.struct.downstreamImpacts.length,
        },
        reasons: a.explanation,
        vulnerabilities: snapshot.findings.filter((f) => f.package === pkg.name),
      });
    },

    async graph(req, res) {
      const snapshot = await projects.getSnapshot(req.params.projectId);
      const nodes = [
        {
          id: snapshot.rootName,
          label: snapshot.rootName,
          version: null,
          type: "application",
          riskScore: null,
          riskLevel: null,
          centrality: 1,
          direct: false,
          vulnerabilityCount: 0,
        },
        ...snapshot.packages.map((p) => ({
          id: p.name,
          label: p.name,
          version: p.version,
          type: "package",
          ...riskSummary(p),
          centrality: p.signals.struct.systemicCentrality,
          direct: p.direct,
          vulnerabilityCount: p.vulnerabilityIds.length,
        })),
      ];

      const edges = [];
      for (const target of snapshot.rootDependencies) {
        edges.push({ id: `${snapshot.rootName}->${target}`, source: snapshot.rootName, target, relationship: "depends_on" });
      }
      for (const p of snapshot.packages) {
        for (const target of p.dependencies) {
          edges.push({ id: `${p.name}->${target}`, source: p.name, target, relationship: "depends_on" });
        }
      }

      res.json({ scanId: snapshot.id, nodes, edges });
    },
  };
}

/** Breadth-first walk up the dependents edges until the application is reached. */
function shortestPathToRoot(snapshot, packageName) {
  const byName = new Map(snapshot.packages.map((p) => [p.name, p]));
  const queue = [[packageName]];
  const seen = new Set([packageName]);
  while (queue.length) {
    const path = queue.shift();
    const current = path.at(-1);
    if (current === snapshot.rootName) return path;
    for (const dependent of byName.get(current)?.dependents ?? []) {
      if (!seen.has(dependent)) {
        seen.add(dependent);
        queue.push([...path, dependent]);
      }
    }
  }
  return null;
}
