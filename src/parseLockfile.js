import { readFile } from "node:fs/promises";

/**
 * Parses an npm package-lock.json (lockfileVersion 2 or 3, which use the
 * flat "packages" map) into a simple dependency graph.
 *
 * Returns:
 *   {
 *     name: string,
 *     packages: Map<name, { version, dependents: Set<name> }>
 *   }
 */
export async function parseLockfile(lockfilePath) {
  const raw = await readFile(lockfilePath, "utf-8");
  const lock = JSON.parse(raw);

  const packages = new Map();

  if (!lock.packages) {
    throw new Error(
      "Unsupported lockfile format: expected lockfileVersion 2 or 3 (a 'packages' map)"
    );
  }

  // lock.packages keys look like "" (root), "node_modules/foo",
  // "node_modules/foo/node_modules/bar" (nested/transitive).
  for (const [pkgPath, info] of Object.entries(lock.packages)) {
    if (pkgPath === "") continue; // root project itself
    const name = pkgPath.split("node_modules/").pop();
    if (!packages.has(name)) {
      packages.set(name, { version: info.version ?? null, dependents: new Set() });
    }
  }

  // Build dependent edges: for each package, its declared "dependencies"
  // point to packages it requires -> those packages are dependents-of-this.
  for (const [pkgPath, info] of Object.entries(lock.packages)) {
    const fromName = pkgPath === "" ? lock.name ?? "(root)" : pkgPath.split("node_modules/").pop();
    const deps = { ...(info.dependencies ?? {}), ...(info.optionalDependencies ?? {}) };
    for (const depName of Object.keys(deps)) {
      const dep = packages.get(depName);
      if (dep) dep.dependents.add(fromName);
    }
  }

  return { name: lock.name ?? "(root)", packages };
}

/** Returns every package name reachable as a (transitive) dependent of `pkgName`. */
export function affectedBy(graph, pkgName, seen = new Set()) {
  const node = graph.packages.get(pkgName);
  if (!node) return seen;
  for (const dependent of node.dependents) {
    if (!seen.has(dependent)) {
      seen.add(dependent);
      affectedBy(graph, dependent, seen);
    }
  }
  return seen;
}
