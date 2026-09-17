import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { startServer } from "../src/api/server.js";

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/demo-project");

// Deterministic stand-ins for OSV.dev and FIRST EPSS: only qs@6.7.0 is vulnerable.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const href = String(url);
  const json = (body) => new Response(JSON.stringify(body), { status: 200 });
  if (href === "https://api.osv.dev/v1/querybatch") {
    const { queries } = JSON.parse(options.body);
    return json({
      results: queries.map((q) =>
        q.package.name === "qs" && q.version === "6.7.0" ? { vulns: [{ id: "GHSA-test-qs" }] } : {}
      ),
    });
  }
  if (href === "https://api.osv.dev/v1/vulns/GHSA-test-qs") {
    return json({
      id: "GHSA-test-qs",
      summary: "qs prototype pollution",
      aliases: ["CVE-2022-24999"],
      severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H" }],
      database_specific: { severity: "HIGH" },
      affected: [{ package: { ecosystem: "npm", name: "qs" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "6.7.3" }] }] }],
    });
  }
  if (href.startsWith("https://api.first.org/data/v1/epss")) {
    return json({ data: [{ epss: "0.01" }] });
  }
  return realFetch(url, options);
};

let ctx;
let dataDir;
let base;

const api = async (method, route, body) => {
  const res = await realFetch(`${base}${route}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "rippleguard-test-"));
  ctx = await startServer({ projectPaths: [FIXTURE], port: 0, watch: false, dataDir });
  base = `http://127.0.0.1:${ctx.port}/api`;
  await ctx.projects.getSnapshot("demo-project");
});

after(async () => {
  await ctx.close();
  await rm(dataDir, { recursive: true, force: true });
});

test("projects and overview expose scan summary", async () => {
  const projects = await api("GET", "/projects");
  assert.equal(projects.status, 200);
  assert.equal(projects.body[0].id, "demo-project");

  const overview = await api("GET", "/projects/demo-project/overview");
  assert.equal(overview.status, 200);
  assert.equal(overview.body.knownVulnerabilities, 1);
  assert.equal(overview.body.vulnerablePackages, 1);
  assert.ok(overview.body.totalDependencies > 40);
  assert.ok(overview.body.highRiskPackages <= overview.body.vulnerablePackages);
  assert.equal(overview.body.highestRiskPackage, "qs");
  assert.ok(Number.isInteger(overview.body.riskScore));
});

test("dependency list, detail and graph", async () => {
  const list = await api("GET", "/projects/demo-project/dependencies");
  const qs = list.body.dependencies.find((d) => d.name === "qs");
  assert.equal(qs.vulnerabilityCount, 1);
  assert.equal(qs.direct, false);

  const detail = await api("GET", "/projects/demo-project/dependencies/qs");
  assert.equal(detail.status, 200);
  assert.equal(detail.body.signals.cvss, 7.5);
  assert.deepEqual(detail.body.pathToApplication, ["qs", "express", "demo-project"]);
  assert.ok(detail.body.reasons.length > 0);

  const graph = await api("GET", "/projects/demo-project/dependencies/graph");
  const ids = new Set(graph.body.nodes.map((n) => n.id));
  assert.ok(ids.has("demo-project"));
  for (const edge of graph.body.edges) {
    assert.ok(ids.has(edge.source) && ids.has(edge.target), `dangling edge ${edge.id}`);
  }
  assert.ok(graph.body.edges.some((e) => e.source === "express" && e.target === "qs"));

  assert.equal((await api("GET", "/projects/demo-project/dependencies/nope")).status, 404);
});

test("vulnerabilities include CVSS, EPSS, fix version and reasons", async () => {
  const { body } = await api("GET", "/projects/demo-project/vulnerabilities");
  assert.equal(body.total, 1);
  const [finding] = body.findings;
  assert.equal(finding.osvId, "GHSA-test-qs");
  assert.equal(finding.severity, "high");
  assert.equal(finding.epss, 0.01);
  assert.deepEqual(finding.fixedVersions, ["6.7.3"]);
  assert.ok(finding.reasons.length > 0);
});

test("simulate, inspect and mitigate", async () => {
  const sim = await api("POST", "/projects/demo-project/simulations", {
    initialPackage: "qs",
    initialProbability: 0.9,
    maxSteps: 5,
  });
  assert.equal(sim.status, 201);
  assert.equal(sim.body.blastRadius, 0.6041);
  assert.equal(sim.body.reachesApplication, true);
  assert.deepEqual(sim.body.criticalPath, ["qs", "express", "demo-project"]);
  assert.equal(sim.body.events[0].status, "initial");

  const { simulationId } = sim.body;
  const node = await api("GET", `/projects/demo-project/simulations/${simulationId}/nodes/demo-project`);
  assert.equal(node.status, 200);
  assert.equal(node.body.isApplication, true);
  assert.deepEqual(node.body.propagationPath, ["qs", "express", "demo-project"]);

  const mitigation = await api("POST", `/projects/demo-project/simulations/${simulationId}/mitigate`, {
    blockedPackage: "express",
  });
  assert.equal(mitigation.status, 200);
  assert.equal(mitigation.body.originalBlastRadius, 0.6041);
  assert.equal(mitigation.body.mitigatedBlastRadius, 0.271);
  assert.equal(mitigation.body.reductionPercentage, 55.1);
  assert.equal(mitigation.body.applicationReachedAfter, false);
  assert.deepEqual(mitigation.body.protectedNodes, ["demo-project"]);

  const stored = await api("GET", `/projects/demo-project/simulations/${simulationId}`);
  assert.equal(stored.body.mitigations.length, 1);
});

test("uploaded lockfile is scanned but not watched, and cleaned up on delete", async () => {
  const packageLock = await readFile(path.join(FIXTURE, "package-lock.json"), "utf-8");
  const packageJson = await readFile(path.join(FIXTURE, "package.json"), "utf-8");

  const created = await api("POST", "/projects/upload", { name: "Uploaded Demo", packageLock, packageJson });
  assert.equal(created.status, 201);
  assert.equal(created.body.id, "uploaded-demo");
  assert.equal(created.body.source, "upload");
  assert.equal(created.body.status, "uploaded");
  assert.equal(created.body.path, null);

  await ctx.projects.getSnapshot("uploaded-demo");
  const overview = await api("GET", "/projects/uploaded-demo/overview");
  assert.equal(overview.body.agentStatus, "inactive");
  assert.equal(overview.body.knownVulnerabilities, 1);

  const workspace = path.join(dataDir, "uploads", "uploaded-demo");
  assert.equal(existsSync(path.join(workspace, "package-lock.json")), true);
  assert.equal((await api("DELETE", "/projects/uploaded-demo")).status, 204);
  assert.equal(existsSync(workspace), false);

  const lockOnly = await api("POST", "/projects/upload", { packageLock });
  assert.equal(lockOnly.status, 201);
  assert.equal(lockOnly.body.id, "demo-project-2");

  assert.equal((await api("POST", "/projects/upload", { packageLock: "{nope" })).status, 400);
  assert.equal((await api("POST", "/projects/upload", { packageLock: { lockfileVersion: 1 } })).status, 400);
});

test("validation errors return 4xx with a message", async () => {
  const cases = [
    ["POST", "/projects/demo-project/simulations", { initialPackage: "does-not-exist" }, 400],
    ["POST", "/projects/demo-project/simulations", { initialPackage: "qs", initialProbability: 2 }, 400],
    ["POST", "/projects/demo-project/simulations", { initialPackage: "qs", model: "sir" }, 400],
    ["GET", "/projects/demo-project/simulations/sim_00000000", undefined, 404],
    ["GET", "/projects/unknown/overview", undefined, 404],
    ["POST", "/projects", { path: os.tmpdir() }, 400],
  ];
  for (const [method, route, body, status] of cases) {
    const res = await api(method, route, body);
    assert.equal(res.status, status, `${method} ${route}`);
    assert.ok(res.body.error);
  }

  const sim = await api("POST", "/projects/demo-project/simulations", { initialPackage: "qs" });
  const blockRoot = await api("POST", `/projects/demo-project/simulations/${sim.body.simulationId}/mitigate`, {
    blockedPackage: "demo-project",
  });
  assert.equal(blockRoot.status, 400);
});

test("event stream delivers scan events", async () => {
  const controller = new AbortController();
  const res = await realFetch(`${base}/projects/demo-project/events/stream`, { signal: controller.signal });
  assert.equal(res.headers.get("content-type"), "text/event-stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const received = [];
  const readUntilCompleted = (async () => {
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      for (const line of buffer.split("\n")) {
        if (line.startsWith("data: ")) received.push(JSON.parse(line.slice(6)).type);
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
      if (received.includes("scan-completed")) return;
    }
  })();

  const scan = await api("POST", "/projects/demo-project/scans");
  assert.equal(scan.status, 200);
  await readUntilCompleted;
  controller.abort();

  assert.deepEqual(received, ["connected", "scan-started", "scan-completed"]);
});
