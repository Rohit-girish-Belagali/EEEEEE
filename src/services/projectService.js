import path from "node:path";
import { randomUUID } from "node:crypto";
import { watchProject } from "../watcher.js";
import { scanProject, assertScannableProject, diffScans } from "./scanService.js";
import {
  ValidationError,
  validateSimulationRequest,
  validateBlockedPackages,
  runSimulation,
  compareMitigation,
  newSimulationId,
} from "./simulationService.js";

const SCANS_TO_KEEP = 50;
const HIGH_RISK_LEVELS = new Set(["High", "Critical"]);

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.status = 404;
  }
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

export function summarizeSnapshot(snapshot) {
  const packages = snapshot.packages;
  // Packages without advisories still score from graph position alone, so the headline
  // score comes from vulnerable packages; otherwise a clean hub like `statuses` would lead.
  const vulnerable = packages.filter((p) => p.vulnerabilityIds.length > 0);
  const top = vulnerable.reduce(
    (best, p) => (!best || p.assessment.finalRiskScore > best.assessment.finalRiskScore ? p : best),
    null
  );
  const distribution = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const p of packages) distribution[p.assessment.riskLevel.toLowerCase()]++;

  return {
    riskScore: top ? Math.round(top.assessment.finalRiskScore * 100) : 0,
    riskLevel: top ? top.assessment.riskLevel.toLowerCase() : "low",
    highestRiskPackage: top?.name ?? null,
    totalDependencies: packages.length,
    directDependencies: packages.filter((p) => p.direct).length,
    knownVulnerabilities: snapshot.findings.length,
    vulnerablePackages: vulnerable.length,
    highRiskPackages: vulnerable.filter((p) => HIGH_RISK_LEVELS.has(p.assessment.riskLevel)).length,
    riskDistribution: distribution,
  };
}

export class ProjectService {
  constructor({ store, events, watch = true }) {
    this.store = store;
    this.events = events;
    this.watch = watch;
    this.projects = new Map();
    this.state = new Map(); // projectId -> { watcher, watcherStatus, inFlight, rerun, latest, live, lastError }
  }

  async init() {
    for (const project of await this.store.loadProjects()) {
      this.projects.set(project.id, project);
      const scans = await this.store.listScans(project.id);
      this.stateFor(project.id).latest = scans.at(-1) ?? null;
    }
  }

  stateFor(projectId) {
    if (!this.state.has(projectId)) {
      this.state.set(projectId, {
        watcher: null,
        watcherStatus: "stopped",
        inFlight: null,
        rerun: null,
        latest: null,
        live: null,
        lastError: null,
      });
    }
    return this.state.get(projectId);
  }

  getProject(projectId) {
    const project = this.projects.get(projectId);
    if (!project) throw new NotFoundError(`Project '${projectId}' not found`);
    return project;
  }

  describeProject(project) {
    const st = this.stateFor(project.id);
    return {
      id: project.id,
      name: st.latest?.projectName ?? project.name,
      path: project.path,
      status: st.watcherStatus,
      scanStatus: st.inFlight ? "scanning" : st.lastError ? "failed" : st.latest ? "idle" : "pending",
      lastScan: st.latest?.completedAt ?? null,
      lastError: st.lastError,
      createdAt: project.createdAt,
    };
  }

  listProjects() {
    return [...this.projects.values()].map((p) => this.describeProject(p));
  }

  async addProject(projectPath) {
    if (typeof projectPath !== "string" || !projectPath.trim()) {
      throw new ValidationError("path is required");
    }
    const absolute = path.resolve(projectPath);
    assertScannableProject(absolute);

    const existing = [...this.projects.values()].find((p) => p.path === absolute);
    if (existing) return { project: existing, created: false };

    const base = slugify(path.basename(absolute));
    let id = base;
    for (let n = 2; this.projects.has(id); n++) id = `${base}-${n}`;

    const project = { id, name: path.basename(absolute), path: absolute, createdAt: new Date().toISOString() };
    this.projects.set(id, project);
    await this.store.saveProjects([...this.projects.values()]);
    this.events.publish(id, "project-added", { path: absolute });
    return { project, created: true };
  }

  async removeProject(projectId) {
    this.getProject(projectId);
    await this.stopWatching(projectId);
    this.projects.delete(projectId);
    this.state.delete(projectId);
    await this.store.saveProjects([...this.projects.values()]);
  }

  /** Starts watching and kicks off a background scan. */
  activate(projectId) {
    if (this.watch) this.startWatching(projectId);
    this.requestScan(projectId, "startup").catch(() => {});
  }

  startWatching(projectId) {
    const project = this.getProject(projectId);
    const st = this.stateFor(projectId);
    if (st.watcher) return;

    st.watcher = watchProject(project.path, (filePath) => {
      this.events.publish(projectId, "file-changed", { file: path.basename(filePath) });
      this.requestScan(projectId, "file-change").catch(() => {});
    });
    st.watcher.on("error", (err) => {
      st.watcherStatus = "error";
      this.events.publish(projectId, "watcher-error", { message: err.message });
    });
    st.watcherStatus = "watching";
  }

  async stopWatching(projectId) {
    const st = this.stateFor(projectId);
    if (st.watcher) await st.watcher.close();
    st.watcher = null;
    st.watcherStatus = "stopped";
  }

  async shutdown() {
    await Promise.all([...this.state.keys()].map((id) => this.stopWatching(id)));
    await this.events.flush();
  }

  /**
   * Serializes scans per project. A change that lands while a scan is running
   * queues exactly one follow-up scan, so the final state always reflects disk.
   */
  requestScan(projectId, trigger) {
    this.getProject(projectId);
    const st = this.stateFor(projectId);
    if (st.inFlight) {
      st.rerun = trigger;
      return st.inFlight;
    }

    st.inFlight = (async () => {
      let next = trigger;
      let result;
      while (next) {
        st.rerun = null;
        try {
          result = await this.performScan(projectId, next);
        } catch (err) {
          if (!st.rerun) throw err;
        }
        next = st.rerun;
      }
      return result;
    })().finally(() => {
      st.inFlight = null;
    });
    return st.inFlight;
  }

  async performScan(projectId, trigger) {
    const project = this.getProject(projectId);
    const st = this.stateFor(projectId);
    const scanId = `scan_${Date.now()}_${randomUUID().slice(0, 6)}`;

    this.events.publish(projectId, "scan-started", { scanId, trigger });

    let scan;
    try {
      scan = await scanProject(project.path);
    } catch (err) {
      st.lastError = err.message;
      this.events.publish(projectId, "scan-failed", { scanId, trigger, message: err.message });
      throw err;
    }

    const { graph, simulator, ...data } = scan;
    const snapshot = { id: scanId, projectId, trigger, ...data };
    snapshot.summary = summarizeSnapshot(snapshot);

    const previous = st.latest;
    const diff = diffScans(previous, snapshot);

    await this.store.saveScan(snapshot);
    await this.store.pruneScans(projectId, SCANS_TO_KEEP);

    st.latest = snapshot;
    st.live = { ...scan, scanId };
    st.lastError = null;

    if (previous) {
      if (diff.hasDependencyChanges) {
        this.events.publish(projectId, "dependencies-changed", {
          scanId,
          added: diff.added,
          updated: diff.updated,
          removed: diff.removed,
        });
      }
      if (diff.newFindings.length) {
        this.events.publish(projectId, "vulnerabilities-detected", {
          scanId,
          count: diff.newFindings.length,
          findings: diff.newFindings.map(({ package: pkg, version, osvId, severity, summary }) => ({
            package: pkg,
            version,
            osvId,
            severity,
            summary,
          })),
        });
      }
      if (diff.resolvedFindings.length) {
        this.events.publish(projectId, "vulnerabilities-resolved", {
          scanId,
          count: diff.resolvedFindings.length,
          findings: diff.resolvedFindings.map(({ package: pkg, version, osvId }) => ({ package: pkg, version, osvId })),
        });
      }
    }

    this.events.publish(projectId, "scan-completed", {
      scanId,
      trigger,
      durationMs: snapshot.durationMs,
      summary: snapshot.summary,
      previousRiskScore: previous?.summary?.riskScore ?? null,
      changes: {
        added: diff.added.length,
        updated: diff.updated.length,
        removed: diff.removed.length,
        newVulnerabilities: previous ? diff.newFindings.length : 0,
        resolvedVulnerabilities: previous ? diff.resolvedFindings.length : 0,
      },
    });

    return snapshot;
  }

  /** Latest scan data; serves the last persisted snapshot if a fresh scan fails. */
  async getSnapshot(projectId) {
    this.getProject(projectId);
    const st = this.stateFor(projectId);
    if (st.latest) return st.latest;
    return st.inFlight ?? this.requestScan(projectId, "on-demand");
  }

  /** Scan with a live dependency graph + simulator, required for simulations. */
  async getLiveScan(projectId) {
    this.getProject(projectId);
    const st = this.stateFor(projectId);
    if (st.inFlight) await st.inFlight.catch(() => {});
    if (!st.live) await this.requestScan(projectId, "on-demand");
    return st.live;
  }

  getScanHistory(projectId) {
    this.getProject(projectId);
    return this.store.listScans(projectId);
  }

  async createSimulation(projectId, body) {
    const live = await this.getLiveScan(projectId);
    const params = validateSimulationRequest(live, body);
    const result = runSimulation(live, params);

    const record = {
      simulationId: newSimulationId(),
      projectId,
      scanId: live.scanId,
      createdAt: new Date().toISOString(),
      ...params,
      ...result,
      mitigations: [],
    };
    await this.store.saveSimulation(record);
    this.events.publish(projectId, "simulation-completed", {
      simulationId: record.simulationId,
      initialPackage: params.initialPackage,
      blastRadius: record.blastRadius,
      affectedNodes: record.affectedNodes,
      reachesApplication: record.reachesApplication,
    });
    return record;
  }

  async getSimulation(projectId, simulationId) {
    this.getProject(projectId);
    const record = await this.store.loadSimulation(simulationId);
    if (!record || record.projectId !== projectId) {
      throw new NotFoundError(`Simulation '${simulationId}' not found`);
    }
    return record;
  }

  listSimulations(projectId) {
    this.getProject(projectId);
    return this.store.listSimulations(projectId);
  }

  async inspectSimulationNode(projectId, simulationId, nodeId) {
    const record = await this.getSimulation(projectId, simulationId);
    const node = record.nodes.find((n) => n.id === nodeId);
    if (!node) throw new NotFoundError(`Node '${nodeId}' was not reached in simulation '${simulationId}'`);

    const snapshot = this.stateFor(projectId).latest;
    const pkg = snapshot?.packages.find((p) => p.name === nodeId);
    return {
      simulationId,
      ...node,
      incomingEvents: record.events.filter((e) => e.target === nodeId && e.timeStep > 0),
      outgoingEvents: record.events.filter((e) => e.source === nodeId && e.timeStep > 0),
      packageRisk: pkg
        ? {
            riskScore: Math.round(pkg.assessment.finalRiskScore * 100),
            riskLevel: pkg.assessment.riskLevel.toLowerCase(),
            vulnerabilityIds: pkg.vulnerabilityIds,
            direct: pkg.direct,
          }
        : null,
    };
  }

  /**
   * Re-runs the stored simulation on the current dependency graph with and
   * without the blocked packages, so both numbers come from the same graph.
   */
  async mitigateSimulation(projectId, simulationId, body) {
    const record = await this.getSimulation(projectId, simulationId);
    const live = await this.getLiveScan(projectId);
    if (!live.graph.packages.has(record.initialPackage)) {
      throw new ConflictError(
        `'${record.initialPackage}' is no longer in the dependency graph; run a new simulation`
      );
    }

    const blocked = validateBlockedPackages(live, body);
    const params = {
      initialPackage: record.initialPackage,
      initialProbability: record.initialProbability,
      maxSteps: record.maxSteps,
    };
    const baseline = runSimulation(live, params);
    const mitigated = runSimulation(live, params, blocked);
    const comparison = compareMitigation(baseline, mitigated, blocked);

    const mitigation = {
      simulationId,
      scanId: live.scanId,
      baselineRecomputed: live.scanId !== record.scanId,
      createdAt: new Date().toISOString(),
      ...comparison,
    };
    record.mitigations.push(mitigation);
    await this.store.saveSimulation(record);

    this.events.publish(projectId, "mitigation-completed", {
      simulationId,
      blockedPackages: blocked,
      originalBlastRadius: comparison.originalBlastRadius,
      mitigatedBlastRadius: comparison.mitigatedBlastRadius,
      reductionPercentage: comparison.reductionPercentage,
    });
    return mitigation;
  }
}
