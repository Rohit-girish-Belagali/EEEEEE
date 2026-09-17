import chokidar from "chokidar";
import path from "node:path";

/**
 * Watches package.json / package-lock.json in `projectDir` and invokes
 * `onChange(filePath)` (debounced) whenever either file is written.
 * Returns the chokidar watcher so the caller can close it.
 */
export function watchProject(projectDir, onChange, { debounceMs = 500 } = {}) {
  const targets = [
    path.join(projectDir, "package.json"),
    path.join(projectDir, "package-lock.json"),
  ];

  let timer = null;
  const watcher = chokidar.watch(targets, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  watcher.on("all", (event, filePath) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onChange(filePath, event), debounceMs);
  });

  return watcher;
}
