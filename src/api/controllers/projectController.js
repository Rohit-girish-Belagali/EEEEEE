export function projectController(projects, events) {
  return {
    async list(req, res) {
      res.json(projects.listProjects());
    },

    async create(req, res) {
      const { project, created } = await projects.addProject(req.body?.path);
      if (created) projects.activate(project.id);
      res.status(created ? 201 : 200).json(projects.describeProject(project));
    },

    async remove(req, res) {
      await projects.removeProject(req.params.projectId);
      res.status(204).end();
    },

    async overview(req, res) {
      const project = projects.getProject(req.params.projectId);
      const description = projects.describeProject(project);
      const snapshot = await projects.getSnapshot(project.id);
      res.json({
        projectId: project.id,
        project: snapshot.projectName,
        path: project.path,
        ...snapshot.summary,
        scanId: snapshot.id,
        lastScan: snapshot.completedAt,
        scanDurationMs: snapshot.durationMs,
        agentStatus: description.status === "watching" ? "active" : "inactive",
        watcherStatus: description.status,
        scanStatus: description.scanStatus,
        lastError: description.lastError,
      });
    },

    async scans(req, res) {
      const history = await projects.getScanHistory(req.params.projectId);
      res.json({
        scans: history.map((s) => ({
          scanId: s.id,
          trigger: s.trigger,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          durationMs: s.durationMs,
          ...s.summary,
        })),
      });
    },

    async triggerScan(req, res) {
      const snapshot = await projects.requestScan(req.params.projectId, "manual");
      res.json({ scanId: snapshot.id, completedAt: snapshot.completedAt, ...snapshot.summary });
    },

    async eventHistory(req, res) {
      projects.getProject(req.params.projectId);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
      res.json({ events: events.list(req.params.projectId, { limit }) });
    },

    eventStream(req, res) {
      const { projectId } = req.params;
      projects.getProject(projectId);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const send = (event) => res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);

      // Replay anything missed since the client's last event (EventSource reconnects send this header).
      const lastEventId = parseInt(req.get("Last-Event-ID"), 10);
      if (Number.isInteger(lastEventId)) {
        for (const event of events.list(projectId, { limit: 500, afterId: lastEventId })) send(event);
      }

      res.write(`data: ${JSON.stringify({ type: "connected", projectId, timestamp: new Date().toISOString() })}\n\n`);

      const unsubscribe = events.subscribe(projectId, send);
      // Comment lines keep proxies and idle connections from timing out.
      const heartbeat = setInterval(() => res.write(": ping\n\n"), 20000);

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  };
}
