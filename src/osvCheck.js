const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_VULN_URL = "https://api.osv.dev/v1/vulns";
const FIRST_EPSS_URL = "https://api.first.org/data/v1/epss";

// In-memory cache for vuln details and EPSS scores
const vulnCache = new Map();
const epssCache = new Map();

/**
 * Calculates CVSS v3.1 Base Score from a vector string.
 * Follows FIRST CVSS v3.1 specification.
 */
export function parseCvssV3Vector(vectorStr) {
  if (!vectorStr || typeof vectorStr !== "string") return null;
  const parts = vectorStr.split("/");
  const metrics = {};
  for (const p of parts) {
    const [k, v] = p.split(":");
    if (k && v) metrics[k] = v;
  }
  const AV_MAP = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
  const AC_MAP = { L: 0.77, H: 0.44 };
  const UI_MAP = { N: 0.85, R: 0.62 };
  const C_MAP = { N: 0, L: 0.22, H: 0.56 };
  const I_MAP = { N: 0, L: 0.22, H: 0.56 };
  const A_MAP = { N: 0, L: 0.22, H: 0.56 };

  const scopeChanged = metrics.S === "C";
  const PR_MAP = scopeChanged
    ? { N: 0.85, L: 0.68, H: 0.50 }
    : { N: 0.85, L: 0.62, H: 0.27 };

  const av = AV_MAP[metrics.AV];
  const ac = AC_MAP[metrics.AC];
  const pr = PR_MAP[metrics.PR];
  const ui = UI_MAP[metrics.UI];
  const c = C_MAP[metrics.C];
  const i = I_MAP[metrics.I];
  const a = A_MAP[metrics.A];

  if ([av, ac, pr, ui, c, i, a].some((x) => x === undefined)) return null;

  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  let impact = 0;
  if (scopeChanged) {
    impact = 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  } else {
    impact = 6.42 * iss;
  }

  const exploitability = 8.22 * av * ac * pr * ui;
  if (impact <= 0) return 0.0;
  const rawScore = scopeChanged
    ? Math.min(1.08 * (impact + exploitability), 10.0)
    : Math.min(impact + exploitability, 10.0);

  return Math.ceil(rawScore * 10) / 10;
}

/**
 * Extracts a numeric 0-10 CVSS base score from an OSV vuln record.
 */
function extractCvssScore(vulnRecord) {
  // 1. Check severity entries for numeric score or CVSS vector
  const severities = vulnRecord.severity ?? [];
  for (const sev of severities) {
    if (typeof sev.score === "number") return sev.score;
    if (typeof sev.score === "string") {
      const parsedNum = parseFloat(sev.score);
      if (!Number.isNaN(parsedNum) && parsedNum >= 0 && parsedNum <= 10 && !sev.score.includes("/")) {
        return parsedNum;
      }
      if (sev.score.includes("CVSS:3")) {
        const computed = parseCvssV3Vector(sev.score);
        if (computed !== null) return computed;
      }
    }
  }

  // 2. Fallback to GitHub / ecosystem database_specific qualitative severity
  const qualitative = vulnRecord.database_specific?.severity?.toUpperCase?.();
  if (qualitative) {
    if (qualitative === "CRITICAL") return 9.5;
    if (qualitative === "HIGH") return 7.8;
    if (qualitative === "MODERATE" || qualitative === "MEDIUM") return 5.5;
    if (qualitative === "LOW") return 2.5;
  }

  return null;
}

/**
 * Fetches EPSS score from the FIRST.org API for a given CVE ID.
 */
async function fetchEpssScore(cveId) {
  if (!cveId || !cveId.startsWith("CVE-")) return null;
  if (epssCache.has(cveId)) return epssCache.get(cveId);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${FIRST_EPSS_URL}?cve=${cveId}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    const epssVal = data?.data?.[0]?.epss ? parseFloat(data.data[0].epss) : null;
    if (epssVal !== null && !Number.isNaN(epssVal)) {
      epssCache.set(cveId, epssVal);
      return epssVal;
    }
  } catch {
    // Gracefully handle timeouts or network errors
  }
  return null;
}

/**
 * Fetches full details for a vulnerability from OSV.dev and FIRST EPSS.
 */
async function fetchVulnSummary(id) {
  if (vulnCache.has(id)) return vulnCache.get(id);

  try {
    const res = await fetch(`${OSV_VULN_URL}/${id}`);
    if (!res.ok) {
      return { id, summary: "(details unavailable)", cvssScore: null, epssScore: null, aliases: [] };
    }
    const data = await res.json();
    const aliases = data.aliases ?? [];
    const cvssScore = extractCvssScore(data);

    // Look for a CVE alias to query EPSS
    const cveAlias = aliases.find((a) => a.startsWith("CVE-"));
    const epssScore = cveAlias ? await fetchEpssScore(cveAlias) : null;

    const result = {
      id,
      summary: data.summary ?? "(no summary provided)",
      cvssScore,
      epssScore,
      aliases,
      severity: data.database_specific?.severity?.toLowerCase?.() ?? null,
      fixedVersionsByPackage: extractFixedVersions(data),
    };
    vulnCache.set(id, result);
    return result;
  } catch {
    return { id, summary: "(details unavailable)", cvssScore: null, epssScore: null, aliases: [] };
  }
}

function extractFixedVersions(vulnRecord) {
  const fixed = {};
  for (const affected of vulnRecord.affected ?? []) {
    if (affected.package?.ecosystem !== "npm") continue;
    const name = affected.package.name;
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) (fixed[name] ??= []).push(event.fixed);
      }
    }
  }
  return fixed;
}

// OSV caps querybatch at 1000 queries per request.
const OSV_BATCH_SIZE = 500;

/**
 * Queries the OSV.dev API for known vulnerabilities affecting the given
 * { name, version } npm packages. Returns Map<name, vuln[]>.
 */
export async function checkVulnerabilities(pkgs) {
  // A query without a version matches every advisory ever published for the package.
  const versioned = pkgs.filter((p) => p.version);
  const findings = new Map();

  for (let start = 0; start < versioned.length; start += OSV_BATCH_SIZE) {
    const batch = versioned.slice(start, start + OSV_BATCH_SIZE);
    const queries = batch.map(({ name, version }) => ({
      package: { name, ecosystem: "npm" },
      version,
    }));

    const res = await fetch(OSV_BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries }),
    });

    if (!res.ok) {
      throw new Error(`OSV query failed: ${res.status} ${res.statusText}`);
    }

    const { results } = await res.json();

    for (let i = 0; i < batch.length; i++) {
      const ids = (results[i]?.vulns ?? []).map((v) => v.id);
      if (ids.length === 0) continue;

      const details = await Promise.all(ids.map((id) => fetchVulnSummary(id)));
      findings.set(batch[i].name, details);
    }
  }

  return findings;
}
