import * as Sentry from "@sentry/nextjs";

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

    console.log("[Desktop] Sidecar instrumentation registered; offline services start after health check");
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
