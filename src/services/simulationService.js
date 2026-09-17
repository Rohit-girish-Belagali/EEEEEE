import { randomUUID } from "node:crypto";

const round4 = (x) => Math.round(x * 10000) / 10000;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

export function validateSimulationRequest(scan, body = {}) {
  const { initialPackage, initialProbability = 0.9, maxSteps = 10, model = "probabilistic" } = body;

  if (typeof initialPackage !== "string" || !initialPackage) {
    throw new ValidationError("initialPackage is required");
  }
  if (!scan.graph.packages.has(initialPackage)) {
    throw new ValidationError(`Package '${initialPackage}' is not in this project's dependency graph`);
  }
  if (typeof initialProbability !== "number" || initialProbability <= 0 || initialProbability > 1) {
    throw new ValidationError("initialProbability must be a number in (0, 1]");
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 50) {
    throw new ValidationError("maxSteps must be an integer between 1 and 50");
  }
  if (model !== "probabilistic") {
    throw new ValidationError("Only the 'probabilistic' model is supported");
  }
  return { initialPackage, initialProbability, maxSteps, model };
}

export function validateBlockedPackages(scan, body = {}) {
  const list = body.blockedPackages ?? (body.blockedPackage ? [body.blockedPackage] : []);
  if (!Array.isArray(list) || list.length === 0 || list.some((p) => typeof p !== "string" || !p)) {
    throw new ValidationError("Provide blockedPackage (string) or blockedPackages (non-empty string array)");
  }
  for (const name of list) {
    if (name === scan.rootName) throw new ValidationError("The application itself cannot be blocked");
    if (!scan.graph.packages.has(name)) {
      throw new ValidationError(`Package '${name}' is not in this project's dependency graph`);
    }
  }
  return [...new Set(list)];
}

/** Runs the ripple model and shapes the result for API consumers. */
export function runSimulation(scan, params, blockedPackages = []) {
  const raw = scan.simulator.simulate({
    initialNode: params.initialPackage,
    initialProbability: params.initialProbability,
    maxSteps: params.maxSteps,
    mitigation: blockedPackages.length ? { blockedNodes: blockedPackages } : {},
  });
  return shapeResult(scan, raw);
}

function shapeResult(scan, raw) {
  const stateById = new Map(raw.affectedNodes.map((n) => [n.nodeId, n]));

  const pathTo = (nodeId) => {
    const path = [];
    const seen = new Set();
    let current = nodeId;
    while (current && !seen.has(current)) {
      path.unshift(current);
      seen.add(current);
      current = stateById.get(current)?.parentNode;
    }
    return path;
  };

  const nodes = raw.affectedNodes.map((state) => {
    const meta = scan.simulator.nodes[state.nodeId] ?? {};
    return {
      id: state.nodeId,
      version: meta.version ?? null,
      timeStep: state.timeStep,
      probability: state.infectionProbability,
      impact: state.impactScore,
      status: state.status,
      parent: state.parentNode,
      businessCriticality: meta.businessCriticality ?? null,
      systemicCentrality: meta.systemicCentrality ?? null,
      exposureFactor: meta.exposureFactor ?? null,
      isApplication: Boolean(meta.isRootApplication),
      isInitial: state.timeStep === 0,
      propagationPath: pathTo(state.nodeId),
    };
  });

  const initial = raw.affectedNodes.find((n) => n.timeStep === 0);
  const events = [
    ...(initial
      ? [{
          timeStep: 0,
          source: initial.nodeId,
          target: initial.nodeId,
          probability: initial.infectionProbability,
          transmissionProbability: null,
          impact: initial.impactScore,
          status: initial.status === "blocked" ? "blocked" : "initial",
        }]
      : []),
    ...raw.events.map((e) => ({
      timeStep: e.timeStep,
      source: e.sourceNode,
      target: e.targetNode,
      probability: e.resultingProbability,
      transmissionProbability: e.transmissionProbability,
      impact: e.impactScore,
      status: e.status,
    })),
  ];

  const reachesApplication = nodes.some((n) => n.isApplication && n.status !== "blocked");

  return {
    blastRadius: raw.totalBlastRadius,
    blastRadiusPercentage: round4(raw.totalBlastRadius * 100),
    affectedNodes: nodes.filter((n) => n.status !== "blocked").length,
    maximumDepth: raw.maximumDepth,
    criticalPath: raw.criticalPath ?? [],
    reachesApplication,
    nodes,
    events,
  };
}

export function compareMitigation(baseline, mitigated, blockedPackages) {
  const reduction = round4(baseline.blastRadius - mitigated.blastRadius);
  const blocked = new Set(blockedPackages);
  const afterIds = new Set(mitigated.nodes.filter((n) => n.status !== "blocked").map((n) => n.id));
  return {
    blockedPackages,
    originalBlastRadius: baseline.blastRadius,
    mitigatedBlastRadius: mitigated.blastRadius,
    reduction,
    reductionPercentage:
      baseline.blastRadius > 0 ? Math.round((reduction / baseline.blastRadius) * 1000) / 10 : 0,
    applicationReachedBefore: baseline.reachesApplication,
    applicationReachedAfter: mitigated.reachesApplication,
    protectedNodes: baseline.nodes.map((n) => n.id).filter((id) => !afterIds.has(id) && !blocked.has(id)),
    mitigated,
  };
}

export function newSimulationId() {
  return `sim_${randomUUID().slice(0, 8)}`;
}
