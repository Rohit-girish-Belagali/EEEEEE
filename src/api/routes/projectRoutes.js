import { Router } from "express";
import { asyncHandler as h } from "./asyncHandler.js";

export function projectRoutes(controller) {
  const router = Router();
  router.get("/", h(controller.list));
  router.post("/", h(controller.create));
  router.delete("/:projectId", h(controller.remove));
  router.get("/:projectId/overview", h(controller.overview));
  router.get("/:projectId/scans", h(controller.scans));
  router.post("/:projectId/scans", h(controller.triggerScan));
  router.get("/:projectId/events", h(controller.eventHistory));
  router.get("/:projectId/events/stream", h(controller.eventStream));
  return router;
}
