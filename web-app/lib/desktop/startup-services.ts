type StartupStage = 'idle' | 'starting' | 'ready' | 'failed';

export interface DesktopStartupStatus {
  stage: StartupStage;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  services: {
    localDb: StartupStage;
    backups: StartupStage;
    sync: StartupStage;
  };
  error: string | null;
  trigger: string | null;
}

const status: DesktopStartupStatus = {
  stage: 'idle',
  startedAt: null,
  completedAt: null,
  durationMs: null,
  services: {
    localDb: 'idle',
    backups: 'idle',
    sync: 'idle',
  },
  error: null,
  trigger: null,
};

let startPromise: Promise<DesktopStartupStatus> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function durationSince(startedAt: string | null) {
  return startedAt ? Date.now() - new Date(startedAt).getTime() : null;
}

function cloneStatus(): DesktopStartupStatus {
  return {
    ...status,
    services: { ...status.services },
    durationMs: status.completedAt ? status.durationMs : durationSince(status.startedAt),
  };
}

export function getDesktopStartupStatus(): DesktopStartupStatus {
  return cloneStatus();
}

export function startDesktopServices(trigger = 'manual'): Promise<DesktopStartupStatus> {
  if (process.env.VITORA_DESKTOP !== '1') {
    status.stage = 'failed';
    status.error = 'Desktop services are only available in desktop mode.';
    return Promise.resolve(cloneStatus());
  }

  if (startPromise) return startPromise;

  status.stage = 'starting';
  status.startedAt = nowIso();
  status.completedAt = null;
  status.durationMs = null;
  status.error = null;
  status.trigger = trigger;

  startPromise = (async () => {
    const startMs = Date.now();
    try {
      console.log(`[DesktopStartup] Starting desktop services (${trigger})`);

      status.services.localDb = 'starting';
      const localDbStart = Date.now();
      const { initLocalDatabase } = await import('./local-db');
      initLocalDatabase();
      status.services.localDb = 'ready';
      console.log(`[DesktopStartup] Local DB ready in ${Date.now() - localDbStart}ms`);

      status.services.backups = 'starting';
      const backupStart = Date.now();
      const { startAutoBackups } = await import('./backup-service');
      setTimeout(() => {
        try {
          startAutoBackups();
          status.services.backups = 'ready';
          console.log(`[DesktopStartup] Backup service ready in ${Date.now() - backupStart}ms`);
        } catch (error) {
          status.services.backups = 'failed';
          console.warn('[DesktopStartup] Backup service failed:', error);
        }
      }, 10_000);

      status.services.sync = 'starting';
      const syncStart = Date.now();
      const { startAutoSync } = await import('./sync-engine');
      setTimeout(() => {
        try {
          startAutoSync();
          status.services.sync = 'ready';
          console.log(`[DesktopStartup] Sync service ready in ${Date.now() - syncStart}ms`);
        } catch (error) {
          status.services.sync = 'failed';
          console.warn('[DesktopStartup] Sync service failed:', error);
        }
      }, 15_000);

      status.stage = 'ready';
      status.completedAt = nowIso();
      status.durationMs = Date.now() - startMs;
      console.log(`[DesktopStartup] Core services ready in ${status.durationMs}ms`);
    } catch (error) {
      status.stage = 'failed';
      status.completedAt = nowIso();
      status.durationMs = Date.now() - startMs;
      status.error = error instanceof Error ? error.message : String(error);
      console.warn('[DesktopStartup] Failed to initialize desktop services:', error);
    }

    return cloneStatus();
  })();

  return startPromise;
}

export function scheduleDesktopServices(trigger = 'scheduled'): void {
  if (process.env.VITORA_DESKTOP !== '1') return;
  setTimeout(() => {
    startDesktopServices(trigger).catch((error) => {
      status.stage = 'failed';
      status.error = error instanceof Error ? error.message : String(error);
      console.warn('[DesktopStartup] Scheduled startup failed:', error);
    });
  }, 0);
}
