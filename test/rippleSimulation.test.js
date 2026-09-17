import test from "node:test";
import assert from "node:assert/strict";
import {
  RippleSimulator,
  calculateEdgeProbability,
  buildDependencyNodesFromGraph,
  buildPropagationEdgesFromGraph,
} from "../src/rippleSimulation.js";

test("RippleSimulator matches canonical specification walkthrough (qs -> body-parser -> express -> application)", () => {
  const nodes = {
    qs: {
      nodeId: "qs",
      version: "6.11.0",
      systemicCentrality: 0.4,
      businessCriticality: 0.5,
      exposureFactor: 0.8,
    },
    "body-parser": {
      nodeId: "body-parser",
      version: "1.20.2",
      systemicCentrality: 0.7,
      businessCriticality: 0.7,
      exposureFactor: 0.9,
    },
    express: {
      nodeId: "express",
      version: "4.18.2",
      systemicCentrality: 0.9,
      businessCriticality: 0.9,
      exposureFactor: 0.9,
    },
    application: {
      nodeId: "application",
      systemicCentrality: 1.0,
      businessCriticality: 1.0,
      exposureFactor: 1.0,
      isRootApplication: true,
    },
  };

  const edges = [
    {
      source: "qs",
      target: "body-parser",
      propagationProbability: 0.75,
      exposureFactor: 0.9,
    },
    {
      source: "body-parser",
      target: "express",
      propagationProbability: 0.8,
      exposureFactor: 0.9,
    },
    {
      source: "express",
      target: "application",
      propagationProbability: 0.95,
      exposureFactor: 1.0,
    },
  ];

  const sim = new RippleSimulator(nodes, edges);
  const result = sim.simulate({
    initialNode: "qs",
    initialProbability: 0.9,
  });

  // Verify node states
  const byId = Object.fromEntries(result.affectedNodes.map((n) => [n.nodeId, n]));

  // Step 0: qs
  assert.equal(byId["qs"].timeStep, 0);
  assert.equal(byId["qs"].infectionProbability, 0.9);
  assert.equal(byId["qs"].impactScore, 0.18); // 0.90 * 0.50 * 0.40

  // Step 1: body-parser
  assert.equal(byId["body-parser"].timeStep, 1);
  assert.equal(byId["body-parser"].infectionProbability, 0.6075); // 0.90 * 0.75 * 0.90
  assert.equal(byId["body-parser"].impactScore, 0.2977); // 0.6075 * 0.70 * 0.70 = 0.297675 -> 0.2977

  // Step 2: express
  assert.equal(byId["express"].timeStep, 2);
  assert.equal(byId["express"].infectionProbability, 0.4374); // 0.6075 * 0.80 * 0.90
  assert.equal(byId["express"].impactScore, 0.3543); // 0.4374 * 0.90 * 0.90 = 0.354294 -> 0.3543

  // Step 3: application
  assert.equal(byId["application"].timeStep, 3);
  assert.equal(byId["application"].infectionProbability, 0.4155); // 0.4374 * 0.95 * 1.0 = 0.41553 -> 0.4155
  assert.equal(byId["application"].impactScore, 0.4155);

  // Total saturating blast radius: 1 - exp(-1.2475) ≈ 0.7128
  assert.equal(result.totalBlastRadius, 0.7128);
  assert.equal(result.maximumDepth, 3);
  assert.equal(result.simulationSteps, 4);

  // Critical path verification
  assert.deepEqual(result.criticalPath, ["qs", "body-parser", "express", "application"]);
});

test("RippleSimulator handles mitigation and blocked nodes", () => {
  const nodes = {
    qs: { nodeId: "qs", systemicCentrality: 0.5, businessCriticality: 0.5, exposureFactor: 1.0 },
    "body-parser": { nodeId: "body-parser", systemicCentrality: 0.7, businessCriticality: 0.7, exposureFactor: 1.0 },
    express: { nodeId: "express", systemicCentrality: 0.9, businessCriticality: 0.9, exposureFactor: 1.0 },
    application: { nodeId: "application", systemicCentrality: 1.0, businessCriticality: 1.0, exposureFactor: 1.0, isRootApplication: true },
  };

  const edges = [
    { source: "qs", target: "body-parser", propagationProbability: 0.8 },
    { source: "body-parser", target: "express", propagationProbability: 0.8 },
    { source: "express", target: "application", propagationProbability: 0.8 },
  ];

  const sim = new RippleSimulator(nodes, edges);

  // Scenario 1: Quarantining body-parser completely cuts off express & application
  const resultBlocked = sim.simulate({
    initialNode: "qs",
    initialProbability: 1.0,
    mitigation: {
      blockedNodes: ["body-parser"],
    },
  });

  const affectedIds = resultBlocked.affectedNodes.map((n) => n.nodeId);
  assert.ok(affectedIds.includes("qs"));
  assert.ok(!affectedIds.includes("express"), "express should NOT be affected when body-parser is blocked");
  assert.ok(!affectedIds.includes("application"), "application should NOT be affected when body-parser is blocked");

  // Scenario 2: Active containment dampens resulting probabilities
  const resultNormal = sim.simulate({ initialNode: "qs", initialProbability: 1.0 });
  const resultContained = sim.simulate({
    initialNode: "qs",
    initialProbability: 1.0,
    mitigation: {
      containmentEffectiveness: 0.5,
      detectionDelaySteps: 1,
    },
  });

  assert.ok(resultContained.totalBlastRadius < resultNormal.totalBlastRadius);
});

test("calculateEdgeProbability computes bounded context-aware probability", () => {
  const prob = calculateEdgeProbability({
    baseProbability: 0.8,
    executionReachability: 0.9,
    exposureFactor: 0.9,
    privilegeFactor: 0.8,
    dataflowFactor: 0.9,
  });
  // 0.8 * 0.9 * 0.9 * 0.8 * 0.9 = 0.46656
  assert.ok(Math.abs(prob - 0.46656) < 0.0001);
});
