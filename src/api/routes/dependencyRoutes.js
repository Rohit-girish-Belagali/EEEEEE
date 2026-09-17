import { Router } from "express";
import { asyncHandler as h } from "./asyncHandler.js";

export function dependencyRoutes(controller) {
  const router = Router({ mergeParams: true });
  router.get("/", h(controller.list));
  router.get("/graph", h(controller.graph));
  // (*) keeps scoped names like @babel/core in one param.
  router.get("/:packageName(*)", h(controller.detail));
  return router;
}
