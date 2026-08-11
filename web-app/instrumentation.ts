type ModuleMap = Record<string, unknown>;

function runtimeImport(modulePath: string): Promise<ModuleMap> {
  const importer = Function('path', 'return import(path)') as (path: string) => Promise<ModuleMap>;
  return importer(modulePath);
}

export async function register() {
  // Desktop app: initialize local SQLite database and sync services
  // Guard with NEXT_RUNTIME to prevent Edge bundler from tracing Node.js-only imports
  if (process.env.VITORA_DESKTOP === "1" && process.env.NEXT_RUNTIME === "nodejs") {
    // Safety net: keep the sidecar alive even if a background task throws.
    // Node 15+ defaults to terminating on unhandled rejections, which would kill
    // the Next.js server *after* the HTTP port is bound, leaving the WebView blank.
    process.on("unhandledRejection", (reason) => {
      console.error("[Desktop] Unhandled rejection (kept alive):", reason);
    });
    process.on("uncaughtException", (err) => {
      console.error("[Desktop] Uncaught exception (kept alive):", err);
    });

    try {
      const localDbModule = await runtimeImport('./lib/desktop/local-db');
      const syncEngineModule = await runtimeImport('./lib/desktop/sync-engine');
      const backupServiceModule = await runtimeImport('./lib/desktop/backup-service');

      const initLocalDatabase = localDbModule.initLocalDatabase as () => void;
      const startAutoSync = syncEngineModule.startAutoSync as () => void;
      const startAutoBackups = backupServiceModule.startAutoBackups as () => void;

      initLocalDatabase();
      startAutoBackups();
      startAutoSync();

      console.log("[Desktop] Local DB, sync, and backup services initialized");
    } catch (e) {
      console.warn("[Desktop] Failed to initialize offline services:", e);
    }
    return;
  }

  try {
    if (process.env.NEXT_RUNTIME === "nodejs") {
      await runtimeImport('./sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === "edge") {
      await runtimeImport('./sentry.edge.config');
    }
  } catch (e) {
    // Silently fail in development (Turbopack compatibility)
    if (process.env.NODE_ENV !== 'development') {
      console.error('Failed to load Sentry config:', e);
    }
  }
}

export async function onRequestError(...args: unknown[]) {
  try {
    const sentry = await runtimeImport('@sentry/nextjs');
    return (sentry.captureRequestError as (...innerArgs: unknown[]) => unknown)(...args);
  } catch (e) {
    if (process.env.NODE_ENV !== "development") {
      console.error("Failed to capture request error:", e);
    }
  }
  return undefined;
}
