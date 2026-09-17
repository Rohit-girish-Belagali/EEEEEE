/**
 * AdvancedRiskEngine — computes an explainable supply-chain risk score for
 * a package, broken into its core components (vulnerability exposure, compromise
 * signal/likelihood, blast radius, uncertainty) rather than a single opaque number.
 */

export class AdvancedRiskEngine {
  constructor({
    alpha = 1.0,      // weight: vulnerability exposure
    beta = 1.5,       // weight: compromise likelihood
    gamma = 1.2,      // weight: blast radius
    lambdaDrift = 2.0,// weight: temporal drift signal
    eta = 1.5,        // amplifier: version mutability
    kappa = 0.5,      // uncertainty penalty coefficient
  } = {}) {
    this.alpha = alpha;
    this.beta = beta;
    this.gamma = gamma;
    this.lambdaDrift = lambdaDrift;
    this.eta = eta;
    this.kappa = kappa;
  }

  /**
   * vuln: { cvssScore [0-10], epssScore [0-1], executionReachability [0-1] }
   */
  calculateVulnerabilityExposure(vuln) {
    const normalizedCvss = Math.min(10, Math.max(0, vuln.cvssScore)) / 10.0;
    // EPSS score or scaled exploit likelihood
    const epss = Math.min(1, Math.max(0, vuln.epssScore ?? 0.3));
    const reachability = Math.min(1, Math.max(0, vuln.executionReachability ?? 0.7));
    return normalizedCvss * epss * reachability;
  }

  /**
   * trust: { baseTrust [0-1], temporalDrift [0-1], versionMutability [0-1] }
   */
  calculateCompromiseSignal(trust) {
    const trustWeakness = 1.0 - Math.min(1, Math.max(0, trust.baseTrust ?? 0.5));
    const driftSignal = this.lambdaDrift * Math.min(1, Math.max(0, trust.temporalDrift ?? 0.0));
    const mutabilityAmplifier = Math.exp(this.eta * Math.min(1, Math.max(0, trust.versionMutability ?? 0.0)));
    return (trustWeakness + driftSignal) * mutabilityAmplifier;
  }

  normalizeCompromiseSignal(rawSignal) {
    return 1.0 - Math.exp(-rawSignal);
  }

  /**
   * struct: { systemicCentrality [0-1], downstreamImpacts: [{ nodeId, probabilityOfPropagation, businessCriticality }] }
   */
  calculateBlastRadius(struct) {
    const impacts = struct.downstreamImpacts ?? [];
    const impactSum = impacts.reduce(
      (sum, node) => sum + (node.probabilityOfPropagation ?? 1.0) * (node.businessCriticality ?? 0.5),
      0
    );
    const normalizedImpact = 1.0 - Math.exp(-impactSum);
    const centrality = Math.min(1, Math.max(0, struct.systemicCentrality ?? 0.5));
    return centrality * normalizedImpact;
  }

  /**
   * confidence: { confidenceScore [0-1] }
   */
  calculateUncertaintyPenalty(confidence) {
    const conf = Math.min(1, Math.max(0, confidence.confidenceScore ?? 0.8));
    return 1.0 + this.kappa * (1.0 - conf);
  }

  classifyRisk(score) {
    if (score >= 0.8) return "Critical";
    if (score >= 0.6) return "High";
    if (score >= 0.3) return "Medium";
    return "Low";
  }

  assessPackage({ packageName, version, vuln, trust, struct, confidence }) {
    const vulnerabilityExposure = this.calculateVulnerabilityExposure(vuln);
    const compromiseSignal = this.calculateCompromiseSignal(trust);
    const compromiseLikelihood = this.normalizeCompromiseSignal(compromiseSignal);
    const blastRadius = this.calculateBlastRadius(struct);
    const uncertaintyPenalty = this.calculateUncertaintyPenalty(confidence);

    const baseRisk =
      this.alpha * vulnerabilityExposure +
      this.beta * compromiseLikelihood +
      this.gamma * blastRadius;

    // Scale base risk by the uncertainty penalty BEFORE exponential saturation.
    // This avoids a hard clamp cliff at 1.0 and preserves relative ranking
    // between high-risk packages instead of flattening them to the same score.
    const effectiveRisk = baseRisk * uncertaintyPenalty;
    const finalScore = 1.0 - Math.exp(-effectiveRisk);

    const round4 = (x) => Math.round(x * 10000) / 10000;

    const assessment = {
      packageName,
      version,
      vulnerabilityExposure: round4(vulnerabilityExposure),
      compromiseSignal: round4(compromiseSignal),
      compromiseLikelihood: round4(compromiseLikelihood),
      blastRadius: round4(blastRadius),
      confidenceScore: round4(confidence.confidenceScore),
      uncertaintyPenalty: round4(uncertaintyPenalty),
      finalRiskScore: round4(finalScore),
      riskLevel: this.classifyRisk(finalScore),
    };

    assessment.explanation = explainAssessment(assessment, { vuln, trust, struct, confidence });
    return assessment;
  }
}

/**
 * Generates transparent, human-readable explanations answering "Why this score?"
 * highlighting the active contributing factors and risk posture.
 */
export function explainAssessment(a, { vuln, trust, struct, confidence }) {
  const reasons = [];

  // 1. Vulnerability Exposure
  if (a.vulnerabilityExposure >= 0.5) {
    reasons.push("Known vulnerability exposure is high");
  } else if (a.vulnerabilityExposure >= 0.2) {
    reasons.push("Known vulnerability exposure is moderate");
  } else if (vuln.cvssScore > 0) {
    reasons.push("Known vulnerability exposure is low (low severity or lower reachability)");
  }

  // 2. Trust & Mutability
  if (trust.versionMutability >= 0.7) {
    reasons.push("Dependency is unpinned/floating, so updates land without explicit review");
  }
  if (trust.temporalDrift >= 0.5) {
    reasons.push("Recent package changes exhibit temporal drift compared to historical baseline");
  }
  if (trust.baseTrust <= 0.4) {
    reasons.push("Package has weak provenance or unverified maintainer identity signals");
  }

  // 3. Structural & Graph Reach
  const dependentCount = struct.downstreamImpacts?.length ?? 0;
  if (dependentCount > 1) {
    reasons.push(`Package has ${dependentCount} downstream dependents in this project`);
  } else if (dependentCount === 1) {
    reasons.push("Package has 1 direct downstream dependent");
  }

  const isTransitive = struct.isTransitive ?? (dependentCount > 0 && !struct.isDirect);
  if (isTransitive) {
    reasons.push("Dependency is transitive");
  } else {
    reasons.push("Dependency is a direct top-level requirement");
  }

  const reachesProd = (struct.downstreamImpacts ?? []).some((n) => (n.businessCriticality ?? 0) >= 0.7);
  if (reachesProd) {
    reasons.push("It reaches a production application");
  }

  if (struct.systemicCentrality >= 0.6) {
    reasons.push("Package sits at a central topological junction in the dependency graph");
  }

  // 4. Evidence Confidence
  if (confidence.confidenceScore >= 0.8) {
    reasons.push("Evidence confidence is high");
  } else if (confidence.confidenceScore < 0.5) {
    reasons.push("Evidence confidence is low — provisional defaults applied");
  }

  if (reasons.length === 0) {
    reasons.push("Risk is distributed evenly across baseline supply chain factors");
  }

  return reasons;
}
