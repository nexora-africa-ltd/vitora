import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Desktop app: initialize local SQLite database and sync services
  if (process.env.VITORA_DESKTOP === "1") {
    try {
      const { initLocalDatabase } = await import("./lib/desktop/local-db");
      const { startAutoSync } = await import("./lib/desktop/sync-engine");
      const { startAutoBackups } = await import("./lib/desktop/backup-service");

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
      await import("./sentry.server.config");
    }

    if (process.env.NEXT_RUNTIME === "edge") {
      await import("./sentry.edge.config");
    }
  } catch (e) {
    // Silently fail in development (Turbopack compatibility)
    if (process.env.NODE_ENV !== 'development') {
      console.error('Failed to load Sentry config:', e);
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
