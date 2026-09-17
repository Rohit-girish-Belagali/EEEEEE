import { Router } from "express";
import { asyncHandler as h } from "./asyncHandler.js";

export function simulationRoutes(controller) {
  const router = Router({ mergeParams: true });
  router.get("/", h(controller.list));
  router.post("/", h(controller.create));
  router.get("/:simulationId", h(controller.get));
  router.post("/:simulationId/mitigate", h(controller.mitigate));
  router.get("/:simulationId/nodes/:nodeId(*)", h(controller.inspectNode));
  return router;
}
