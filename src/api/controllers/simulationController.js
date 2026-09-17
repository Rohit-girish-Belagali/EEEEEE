export function simulationController(projects) {
  return {
    async create(req, res) {
      const record = await projects.createSimulation(req.params.projectId, req.body ?? {});
      res.status(201).json(record);
    },

    async list(req, res) {
      const sims = await projects.listSimulations(req.params.projectId);
      res.json({
        simulations: sims.map((s) => ({
          simulationId: s.simulationId,
          scanId: s.scanId,
          createdAt: s.createdAt,
          initialPackage: s.initialPackage,
          blastRadius: s.blastRadius,
          affectedNodes: s.affectedNodes,
          reachesApplication: s.reachesApplication,
          mitigationCount: s.mitigations.length,
        })),
      });
    },

    async get(req, res) {
      res.json(await projects.getSimulation(req.params.projectId, req.params.simulationId));
    },

    async inspectNode(req, res) {
      const { projectId, simulationId, nodeId } = req.params;
      res.json(await projects.inspectSimulationNode(projectId, simulationId, nodeId));
    },

    async mitigate(req, res) {
      const { projectId, simulationId } = req.params;
      res.json(await projects.mitigateSimulation(projectId, simulationId, req.body ?? {}));
    },
  };
}
