import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, rename, writeFile, unlink } from "node:fs/promises";

const DEFAULT_DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");

/** Small JSON-file store: data/projects.json, data/events.json, data/scans/*, data/simulations/*. */
export class JsonStore {
  constructor(dataDir = process.env.RIPPLEGUARD_DATA_DIR ?? DEFAULT_DATA_DIR) {
    this.dataDir = dataDir;
  }

  async init() {
    await mkdir(path.join(this.dataDir, "scans"), { recursive: true });
    await mkdir(path.join(this.dataDir, "simulations"), { recursive: true });
  }

  async readJson(relPath, fallback) {
    try {
      return JSON.parse(await readFile(path.join(this.dataDir, relPath), "utf-8"));
    } catch (err) {
      if (err.code === "ENOENT") return fallback;
      throw err;
    }
  }

  // Write to a temp file then rename, so a crash never leaves half-written JSON.
  async writeJson(relPath, value) {
    const target = path.join(this.dataDir, relPath);
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2));
    await rename(tmp, target);
  }

  loadProjects() {
    return this.readJson("projects.json", []);
  }

  saveProjects(projects) {
    return this.writeJson("projects.json", projects);
  }

  loadEvents() {
    return this.readJson("events.json", []);
  }

  saveEvents(events) {
    return this.writeJson("events.json", events);
  }

  saveScan(scan) {
    return this.writeJson(path.join("scans", `${scan.id}.json`), scan);
  }

  loadScan(scanId) {
    return this.readJson(path.join("scans", `${scanId}.json`), null);
  }

  /** Scan snapshots for a project, oldest first. */
  async listScans(projectId) {
    const files = (await readdir(path.join(this.dataDir, "scans"))).filter((f) => f.endsWith(".json"));
    const scans = await Promise.all(files.map((f) => this.readJson(path.join("scans", f), null)));
    return scans
      .filter((s) => s && s.projectId === projectId)
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  }

  async pruneScans(projectId, keep) {
    const scans = await this.listScans(projectId);
    const excess = scans.slice(0, Math.max(0, scans.length - keep));
    await Promise.all(excess.map((s) => unlink(path.join(this.dataDir, "scans", `${s.id}.json`))));
  }

  saveSimulation(sim) {
    return this.writeJson(path.join("simulations", `${sim.simulationId}.json`), sim);
  }

  loadSimulation(simulationId) {
    if (!/^sim_[a-f0-9]+$/.test(simulationId)) return Promise.resolve(null);
    return this.readJson(path.join("simulations", `${simulationId}.json`), null);
  }

  async listSimulations(projectId) {
    const files = (await readdir(path.join(this.dataDir, "simulations"))).filter((f) => f.endsWith(".json"));
    const sims = await Promise.all(files.map((f) => this.readJson(path.join("simulations", f), null)));
    return sims
      .filter((s) => s && s.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
