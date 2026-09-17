/**
 * rippleSimulation.js — Models propagation of dependency compromises
 * through reverse dependency graphs, computing step-by-step impact,
 * propagation probabilities, blast radius, and mitigation effectiveness.
 */

const clamp01 = (x) => Math.min(1.0, Math.max(0.0, x));
const round4 = (x) => Math.round(x * 10000) / 10000;

/**
 * Calculates contextual edge transmission probability from environmental factors.
 */
export function calculateEdgeProbability({
  baseProbability = 0.8,
  executionReachability = 0.9,
  exposureFactor = 0.9,
  privilegeFactor = 0.8,
  dataflowFactor = 0.9,
} = {}) {
  const probability =
    baseProbability *
    executionReachability *
    exposureFactor *
    privilegeFactor *
    dataflowFactor;
  return clamp01(probability);
}

/**
 * Automatically builds propagation edges from the forward dependency graph.
 * If package A depends on B (A -> B), the reverse compromise propagation is B -> A.
 */
export function buildPropagationEdgesFromGraph(graph, defaultProbability = 0.75) {
  const edges = [];
  const rootName = graph.name ?? "(root)";

  for (const [pkgName, pkgInfo] of graph.packages) {
    for (const dependent of pkgInfo.dependents) {
      const isTargetRoot = dependent === rootName || dependent === "(root)";
      edges.push({
        source: pkgName,
        target: dependent,
        propagationProbability: defaultProbability,
        exposureFactor: isTargetRoot ? 1.0 : 0.9,
      });
    }
  }

  return edges;
}

/**
 * Automatically derives metadata for all DependencyNodes from the lockfile graph.
 */
export function buildDependencyNodesFromGraph(graph, manifestDeps = {}) {
  const nodes = {};
  const rootName = graph.name ?? "(root)";

  // 1. Root application node
  nodes[rootName] = {
    nodeId: rootName,
    version: "1.0.0",
    systemicCentrality: 1.0,
    businessCriticality: 1.0,
    exposureFactor: 1.0,
    isRootApplication: true,
  };

  // 2. Package nodes
  for (const [name, info] of graph.packages) {
    const isDirect = Object.prototype.hasOwnProperty.call(manifestDeps, name);
    const dependentCount = info.dependents.size;

    // Direct dependencies have higher business criticality and exposure
    const businessCriticality = isDirect ? 0.85 : 0.5;
    const systemicCentrality = Math.min(1.0, Math.max(0.3, dependentCount / 4.0));
    const exposureFactor = isDirect ? 0.95 : 0.8;

    nodes[name] = {
      nodeId: name,
      version: info.version,
      systemicCentrality,
      businessCriticality,
      exposureFactor,
      isRootApplication: false,
      isDirect,
    };
  }

  return nodes;
}

export class RippleSimulator {
  /**
   * @param {Object.<string, {nodeId: string, systemicCentrality: number, businessCriticality: number, exposureFactor: number, isRootApplication?: boolean}>} nodes
   * @param {Array.<{source: string, target: string, propagationProbability: number, exposureFactor?: number}>} edges
   */
  constructor(nodes = {}, edges = []) {
    this.nodes = { ...nodes };
    this.reverseGraph = new Map(); // source -> Array<edge>

    for (const edge of edges) {
      if (!this.reverseGraph.has(edge.source)) {
        this.reverseGraph.set(edge.source, []);
      }
      this.reverseGraph.get(edge.source).push({
        source: edge.source,
        target: edge.target,
        propagationProbability: clamp01(edge.propagationProbability ?? 0.75),
        exposureFactor: clamp01(edge.exposureFactor ?? 1.0),
      });
    }
  }

  /**
   * Simulates propagation of compromise starting at `initialNode`.
   *
   * @param {Object} options
   * @param {string} options.initialNode Package where compromise begins
   * @param {number} [options.initialProbability=1.0] Starting probability of initial compromise [0-1]
   * @param {number} [options.maxSteps=10] Maximum simulation time steps (propagation depth)
   * @param {number} [options.probabilityThreshold=0.01] Cutoff under which propagation ceases
   * @param {Object} [options.mitigation] Optional containment & mitigation parameters
   * @param {number} [options.mitigation.containmentEffectiveness=0.0] Mitigation damping [0-1]
   * @param {number} [options.mitigation.detectionDelaySteps=0] Steps before containment takes effect
   * @param {Array.<string>} [options.mitigation.blockedNodes=[]] Severed / quarantined packages
   */
  simulate({
    initialNode,
    initialProbability = 1.0,
    maxSteps = 10,
    probabilityThreshold = 0.01,
    mitigation = {},
  } = {}) {
    const {
      containmentEffectiveness = 0.0,
      detectionDelaySteps = 0,
      blockedNodes = [],
    } = mitigation;

    const blockedSet = new Set(blockedNodes);

    const queue = [];
    const visitedProbability = new Map();
    const states = new Map();
    const events = [];
    let maximumDepth = 0;

    // Check if initial node itself is blocked
    if (blockedSet.has(initialNode)) {
      return {
        initialNode,
        totalNodes: Object.keys(this.nodes).length,
        affectedNodes: [
          {
            nodeId: initialNode,
            infectionProbability: 0.0,
            impactScore: 0.0,
            timeStep: 0,
            parentNode: null,
            status: "blocked",
          },
        ],
        events: [],
        totalBlastRadius: 0.0,
        maximumDepth: 0,
        simulationSteps: 1,
        mitigationApplied: true,
      };
    }

    const initProb = clamp01(initialProbability);
    visitedProbability.set(initialNode, initProb);
    queue.push({
      currentNode: initialNode,
      currentProbability: initProb,
      step: 0,
      parent: null,
    });

    while (queue.length > 0) {
      const { currentNode, currentProbability, step, parent } = queue.shift();
      maximumDepth = Math.max(maximumDepth, step);

      const nodeMeta = this.nodes[currentNode] ?? {
        nodeId: currentNode,
        systemicCentrality: 0.5,
        businessCriticality: 0.5,
        exposureFactor: 0.8,
      };

      const rawImpact =
        currentProbability *
        nodeMeta.businessCriticality *
        nodeMeta.systemicCentrality;
      const impactScore = round4(Math.min(1.0, rawImpact));

      states.set(currentNode, {
        nodeId: currentNode,
        infectionProbability: round4(currentProbability),
        impactScore,
        timeStep: step,
        parentNode: parent,
        status: currentProbability >= probabilityThreshold ? "affected" : "exposed",
      });

      if (step >= maxSteps) continue;

      const outgoingEdges = this.reverseGraph.get(currentNode) ?? [];

      for (const edge of outgoingEdges) {
        const target = edge.target;

        // Quarantined / blocked target package stops propagation completely
        if (blockedSet.has(target)) {
          events.push({
            timeStep: step + 1,
            sourceNode: currentNode,
            targetNode: target,
            transmissionProbability: 0.0,
            resultingProbability: 0.0,
            impactScore: 0.0,
            status: "blocked",
          });
          continue;
        }

        const targetMeta = this.nodes[target] ?? {
          nodeId: target,
          systemicCentrality: 0.5,
          businessCriticality: 0.5,
          exposureFactor: 1.0,
        };

        // Exposure of the target: edge-specific exposure or target node exposure
        const targetExposure =
          edge.exposureFactor !== undefined && edge.exposureFactor !== 1.0
            ? edge.exposureFactor
            : (targetMeta.exposureFactor ?? 1.0);

        const transmissionProbability =
          edge.propagationProbability * targetExposure;

        let resultingProbability = currentProbability * transmissionProbability;

        // Apply active containment mitigation after detection delay
        if (step + 1 >= detectionDelaySteps && containmentEffectiveness > 0) {
          resultingProbability *= 1.0 - clamp01(containmentEffectiveness);
        }

        if (resultingProbability < probabilityThreshold) continue;

        const previousProbability = visitedProbability.get(target) ?? 0.0;

        // Maintain the strongest discovered propagation path
        if (resultingProbability <= previousProbability) continue;

        visitedProbability.set(target, resultingProbability);

        const targetImpact = round4(
          Math.min(
            1.0,
            resultingProbability *
              targetMeta.businessCriticality *
              targetMeta.systemicCentrality
          )
        );

        events.push({
          timeStep: step + 1,
          sourceNode: currentNode,
          targetNode: target,
          transmissionProbability: round4(transmissionProbability),
          resultingProbability: round4(resultingProbability),
          impactScore: targetImpact,
          status: "propagated",
        });

        queue.push({
          currentNode: target,
          currentProbability: resultingProbability,
          step: step + 1,
          parent: currentNode,
        });
      }
    }

    const affectedNodes = Array.from(states.values()).sort(
      (a, b) => a.timeStep - b.timeStep || b.impactScore - a.impactScore
    );

    const totalBlastRadius = this.calculateTotalBlastRadius(affectedNodes);

    // Identify critical propagation path to root application if reached
    const criticalPath = this.traceCriticalPath(states, initialNode);

    return {
      initialNode,
      totalNodes: Object.keys(this.nodes).length,
      affectedNodes,
      events,
      totalBlastRadius,
      maximumDepth,
      simulationSteps: maximumDepth + 1,
      criticalPath,
      mitigationApplied: containmentEffectiveness > 0 || blockedNodes.length > 0,
    };
  }

  /**
   * Saturating blast radius aggregation: 1 - exp(- sum(node.impactScore))
   */
  calculateTotalBlastRadius(states) {
    const impactSum = states.reduce((sum, s) => sum + s.impactScore, 0);
    const normalizedImpact = 1.0 - Math.exp(-impactSum);
    return round4(clamp01(normalizedImpact));
  }

  /**
   * Traces back the highest-impact propagation path from the root application to the initial node.
   */
  traceCriticalPath(statesMap, initialNode) {
    // Find the highest-severity affected node that is a root application or max depth
    let destination = null;
    for (const state of statesMap.values()) {
      const isRoot = this.nodes[state.nodeId]?.isRootApplication;
      if (isRoot) {
        destination = state.nodeId;
        break;
      }
    }

    if (!destination) {
      let maxImpact = -1;
      for (const state of statesMap.values()) {
        if (state.impactScore > maxImpact) {
          maxImpact = state.impactScore;
          destination = state.nodeId;
        }
      }
    }

    if (!destination) return [initialNode];

    const path = [];
    let curr = destination;
    const visited = new Set();

    while (curr && !visited.has(curr)) {
      path.unshift(curr);
      visited.add(curr);
      const state = statesMap.get(curr);
      if (!state || !state.parentNode) break;
      curr = state.parentNode;
    }

    return path;
  }
}
