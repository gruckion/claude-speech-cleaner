// Evaluated inside Claude's main process through its supported Developer menu.
export async function installDesktop(rendererSource) {
  const require = process
    .getBuiltinModule("module")
    .createRequire(process.execPath);
  const { app, webContents } = require("electron");
  if (
    app.getName() !== "Claude" ||
    !process.execPath.endsWith("/Claude.app/Contents/MacOS/Claude")
  ) {
    throw new Error("This installer only supports Claude Desktop on macOS.");
  }
  const key = Symbol.for("claude-speech-cleaner-desktop");
  await globalThis[key]?.remove();
  const readStatus = `(() => {
    const c = globalThis[Symbol.for('claude-speech-cleaner')];
    return c ? { active: c.active, version: c.version, ...c.stats } : null;
  })()`;
  const source = `(() => {
    if (location.origin !== 'https://claude.ai') return null;
    ${rendererSource}
    return ${readStatus};
  })()`;
  let active = true;
  let failures = 0;
  let injections = 0;
  const views = new Map();
  const pending = new Set();
  function allowed(view) {
    if (view.isDestroyed()) return false;
    try {
      return new URL(view.getURL()).origin === "https://claude.ai";
    } catch {
      return false;
    }
  }
  function inject(view) {
    if (!active || !allowed(view)) return Promise.resolve(null);
    const job = view
      .executeJavaScript(source)
      .then((result) => {
        if (result?.active) injections++;
        return result;
      })
      .catch(() => {
        if (active && allowed(view)) failures++;
        return null;
      })
      .finally(() => pending.delete(job));
    pending.add(job);
    return job;
  }
  function watch(view) {
    if (views.has(view) || view.isDestroyed()) return;
    const onReady = () => {
      void inject(view);
    };
    const onDestroyed = () => views.delete(view);
    views.set(view, { onReady, onDestroyed });
    view.on("dom-ready", onReady);
    view.once("destroyed", onDestroyed);
    void inject(view);
  }
  const onCreated = (_event, view) => watch(view);
  app.on("web-contents-created", onCreated);
  for (const view of webContents.getAllWebContents()) watch(view);
  const control = {
    async status() {
      const pages = [];
      for (const view of views.keys()) {
        if (!allowed(view)) continue;
        try {
          pages.push({
            id: view.id,
            ...(await view.executeJavaScript(readStatus)),
          });
        } catch {
          pages.push({ id: view.id, active: false });
        }
      }
      return {
        installed: active,
        appVersion: app.getVersion(),
        failures,
        injections,
        pages,
      };
    },
    async remove() {
      active = false;
      app.off("web-contents-created", onCreated);
      for (const [view, handlers] of views) {
        if (view.isDestroyed()) continue;
        view.off("dom-ready", handlers.onReady);
        view.off("destroyed", handlers.onDestroyed);
      }
      await Promise.allSettled([...pending]);
      const results = [];
      for (const view of views.keys()) {
        if (!allowed(view)) continue;
        try {
          results.push(
            await view.executeJavaScript(
              `globalThis[Symbol.for('claude-speech-cleaner')]?.undo() ?? true`,
            ),
          );
        } catch {
          results.push(false);
        }
      }
      views.clear();
      if (globalThis[key] === control) delete globalThis[key];
      return { removed: results.every(Boolean) };
    },
  };
  globalThis[key] = control;
  await Promise.allSettled([...pending]);
  return control.status();
}
