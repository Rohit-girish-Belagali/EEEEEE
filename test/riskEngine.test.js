import test from "node:test";
import assert from "node:assert/strict";
import { AdvancedRiskEngine } from "../src/riskEngine.js";
import { parseCvssV3Vector } from "../src/osvCheck.js";

test("AdvancedRiskEngine calculates and explains component scores", () => {
  const engine = new AdvancedRiskEngine();

  const assessment = engine.assessPackage({
    packageName: "qs",
    version: "6.7.0",
    vuln: {
      cvssScore: 7.5,
      epssScore: 0.6,
      executionReachability: 0.8,
    },
    trust: {
      baseTrust: 0.4,
      temporalDrift: 0.2,
      versionMutability: 0.8,
    },
    struct: {
      systemicCentrality: 0.7,
      downstreamImpacts: [
        { nodeId: "demo-project", probabilityOfPropagation: 1.0, businessCriticality: 1.0 },
        { nodeId: "body-parser", probabilityOfPropagation: 1.0, businessCriticality: 0.4 },
      ],
      isTransitive: true,
      isDirect: false,
    },
    confidence: {
      confidenceScore: 0.92,
    },
  });

  assert.equal(assessment.packageName, "qs");
  assert.equal(assessment.version, "6.7.0");
  assert.ok(assessment.vulnerabilityExposure > 0);
  assert.ok(assessment.compromiseSignal > 0);
  assert.ok(assessment.blastRadius > 0);
  assert.ok(assessment.finalRiskScore > 0);
  assert.ok(["Critical", "High", "Medium", "Low"].includes(assessment.riskLevel));

  // Explanations present
  assert.ok(assessment.explanation.length >= 3);
  assert.ok(assessment.explanation.some((e) => e.includes("Known vulnerability exposure")));
  assert.ok(assessment.explanation.some((e) => e.includes("reaches a production application")));
  assert.ok(assessment.explanation.some((e) => e.includes("transitive")));
});

test("uncertainty penalty scales smoothly without abrupt clipping cliff at 1.0", () => {
  const engine = new AdvancedRiskEngine();

  // High base risk package with high uncertainty (low confidence)
  const a1 = engine.assessPackage({
    packageName: "critical-a",
    version: "1.0.0",
    vuln: { cvssScore: 9.8, epssScore: 0.9, executionReachability: 1.0 },
    trust: { baseTrust: 0.1, temporalDrift: 0.8, versionMutability: 1.0 },
    struct: { systemicCentrality: 0.9, downstreamImpacts: [{ nodeId: "root", probabilityOfPropagation: 1.0, businessCriticality: 1.0 }] },
    confidence: { confidenceScore: 0.2 }, // low confidence = high uncertainty penalty
  });

  // Even higher base risk package with same low confidence
  const a2 = engine.assessPackage({
    packageName: "critical-b",
    version: "2.0.0",
    vuln: { cvssScore: 10.0, epssScore: 1.0, executionReachability: 1.0 },
    trust: { baseTrust: 0.0, temporalDrift: 1.0, versionMutability: 1.0 },
    struct: {
      systemicCentrality: 1.0,
      downstreamImpacts: [
        { nodeId: "root", probabilityOfPropagation: 1.0, businessCriticality: 1.0 },
        { nodeId: "sub-1", probabilityOfPropagation: 1.0, businessCriticality: 0.8 },
      ],
    },
    confidence: { confidenceScore: 0.2 },
  });

  // Both should be strictly <= 1.0, but should retain relative rank differentiation without both flat-lining at 1.0000
  assert.ok(a1.finalRiskScore <= 1.0);
  assert.ok(a2.finalRiskScore <= 1.0);
  assert.ok(a2.finalRiskScore > a1.finalRiskScore, `Expected ${a2.finalRiskScore} > ${a1.finalRiskScore}`);
});

test("parseCvssV3Vector correctly calculates official CVSS 3.1 base score", () => {
  // Test case 1: Moderate
  const score1 = parseCvssV3Vector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L");
  assert.equal(score1, 5.3);

  // Test case 2: Critical Log4Shell vector
  const score2 = parseCvssV3Vector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H");
  assert.equal(score2, 10.0);
});

