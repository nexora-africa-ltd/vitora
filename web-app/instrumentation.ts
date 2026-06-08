import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Skip instrumentation in desktop app (standalone build lacks native modules)
  if (process.env.VITORA_DESKTOP === "1") {
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
