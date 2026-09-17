import { affectedBy } from "./parseLockfile.js";

/**
 * Turns real signals (OSV findings, FIRST EPSS, dependency graph position,
 * manifest version constraints) into structured inputs for AdvancedRiskEngine.
 */
export function deriveRiskInputs({ packageName, version, findings, graph, isFloatingRange, isDirect }) {
  // --- 1. Vulnerability Metrics ---
  const validScores = (findings ?? []).map((f) => f.cvssScore).filter((s) => typeof s === "number");
  const highestCvss = validScores.length ? Math.max(...validScores) : (findings?.length ? 6.0 : 0.0);
  const hasKnownCvss = validScores.length > 0;

  const validEpss = (findings ?? []).map((f) => f.epssScore).filter((s) => typeof s === "number");
  const maxEpss = validEpss.length ? Math.max(...validEpss) : null;

  // If EPSS is known from FIRST, scale realistically; otherwise default to 0.3 for existing CVE
  let epssScore = 0.0;
  if (findings?.length) {
    if (maxEpss !== null) {
      // EPSS > 0.1 is in the top 5% of actively exploited CVEs globally
      epssScore = Math.min(1.0, Math.max(0.1, maxEpss * 3.0));
    } else {
      epssScore = 0.3;
    }
  }

  // Reachability: direct dependencies have higher direct invocation probability
  const executionReachability = isDirect ? 0.85 : 0.65;

  const vuln = {
    cvssScore: highestCvss,
    epssScore,
    executionReachability,
  };

  // --- 2. Trust Metrics ---
  const trust = {
    // Default neutral trust in absence of cryptographic provenance / sigstore attestations
    baseTrust: 0.5,
    // Temporal drift: 0.0 baseline unless anomalous release velocity or sudden author switch
    temporalDrift: 0.0,
    versionMutability: isFloatingRange ? 1.0 : 0.0,
  };

  // --- 3. Structural Graph Metrics ---
  const dependents = graph ? [...affectedBy(graph, packageName)] : [];
  const rootName = graph?.name ?? "(root)";
  
  // Downstream impact nodes
  const downstreamImpacts = dependents.map((nodeId) => ({
    nodeId,
    probabilityOfPropagation: 1.0,
    // The top-level project is the production consumer
    businessCriticality: (nodeId === rootName || nodeId === "(root)") ? 1.0 : 0.4,
  }));

  const struct = {
    systemicCentrality: Math.min(1.0, Math.max(0.1, dependents.length / 5.0)),
    downstreamImpacts,
    isDirect: Boolean(isDirect),
    isTransitive: !isDirect,
  };

  // --- 4. Evidence Confidence ---
  let confidenceScore = 0.95;
  if (!hasKnownCvss && findings?.length) confidenceScore -= 0.2;
  if (maxEpss === null && findings?.length) confidenceScore -= 0.1;
  if (!graph) confidenceScore -= 0.3;

  const confidence = {
    confidenceScore: Math.round(Math.max(0.2, Math.min(1.0, confidenceScore)) * 100) / 100,
  };

  return { vuln, trust, struct, confidence };
}
