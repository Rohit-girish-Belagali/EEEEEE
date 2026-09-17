#!/usr/bin/env node
import express from "express";
import { fileURLToPath } from "node:url";
import { JsonStore } from "../services/store.js";
import { EventService } from "../services/eventService.js";
import { ProjectService } from "../services/projectService.js";
import { projectController } from "./controllers/projectController.js";
import { dependencyController } from "./controllers/dependencyController.js";
import { vulnerabilityController } from "./controllers/vulnerabilityController.js";
import { simulationController } from "./controllers/simulationController.js";
import { projectRoutes } from "./routes/projectRoutes.js";
import { dependencyRoutes } from "./routes/dependencyRoutes.js";
import { vulnerabilityRoutes } from "./routes/vulnerabilityRoutes.js";
import { simulationRoutes } from "./routes/simulationRoutes.js";

// The API reads local project paths, so only local frontends may call it from a browser.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function cors(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.get("Origin");
    if (origin && (LOCAL_ORIGIN.test(origin) || allowedOrigins.includes(origin))) {
      res.set({
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Last-Event-ID",
        Vary: "Origin",
      });
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  };
}

export function createApp({ projects, events, allowedOrigins = [] }) {
  const app = express();
  app.use(cors(allowedOrigins));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  const base = "/api/projects/:projectId";
  app.use("/api/projects", projectRoutes(projectController(projects, events)));
  app.use(`${base}/dependencies`, dependencyRoutes(dependencyController(projects)));
  app.use(`${base}/vulnerabilities`, vulnerabilityRoutes(vulnerabilityController(projects)));
  app.use(`${base}/simulations`, simulationRoutes(simulationController(projects)));

  app.use("/api", (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? `Internal error: ${err.message}` : err.message });
  });

  return app;
}

export async function startServer({
  projectPaths = [],
  port = 4000,
  host = "127.0.0.1",
  watch = true,
  dataDir,
} = {}) {
  const store = new JsonStore(dataDir);
  await store.init();
  const events = new EventService(store);
  await events.init();
  const projects = new ProjectService({ store, events, watch });
  await projects.init();

  for (const projectPath of projectPaths) await projects.addProject(projectPath);
  for (const project of projects.listProjects()) projects.activate(project.id);

  const allowedOrigins = (process.env.RIPPLEGUARD_CORS_ORIGINS ?? "").split(",").filter(Boolean);
  const app = createApp({ projects, events, allowedOrigins });

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s)).on("error", reject);
  });

  const close = async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await projects.shutdown();
  };

  return { server, app, projects, events, close, port: server.address().port };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const { port, projects, close } = await startServer({
    projectPaths: args.filter((a) => !a.startsWith("--")),
    port: Number(process.env.PORT ?? 4000),
    host: process.env.HOST ?? "127.0.0.1",
    watch: !args.includes("--no-watch"),
  });

  console.log(`RippleGuard API listening on http://localhost:${port}/api`);
  for (const p of projects.listProjects()) console.log(`  project '${p.id}' -> ${p.path} (${p.status})`);

  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      if (closing) return;
      closing = true;
      await close();
      process.exit(0);
    });
  }
}
