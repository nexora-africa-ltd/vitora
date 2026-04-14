/**
 * Chunk Load Error Handler
 *
 * Handles the common issue where after a new deployment, browsers try to
 * load old JavaScript chunks that no longer exist (ChunkLoadError).
 *
 * Strategy:
 * 1. Detect ChunkLoadError in global error handler
 * 2. Show user a brief toast notification
 * 3. Force a full page reload (limited retries to prevent loops)
 */

import { clearAllCaches } from './version-check';

const RELOAD_KEY = 'vitora_chunk_error_reload';
const RELOAD_COUNT_KEY = 'vitora_chunk_reload_count';
const RELOAD_COOLDOWN_MS = 30_000; // 30 seconds cooldown to prevent loops
const MAX_RELOAD_ATTEMPTS = 2; // Maximum reload attempts before giving up

/**
 * Get the current reload attempt count
 */
function getReloadCount(): number {
  if (typeof window === 'undefined') return 0;
  const count = sessionStorage.getItem(RELOAD_COUNT_KEY);
  return count ? parseInt(count, 10) : 0;
}

/**
 * Check if we should skip reload (either recently reloaded or max attempts reached)
 */
function shouldSkipReload(): { skip: boolean; reason: string } {
  if (typeof window === 'undefined') return { skip: true, reason: 'SSR' };

  const reloadCount = getReloadCount();

  // Check max attempts first
  if (reloadCount >= MAX_RELOAD_ATTEMPTS) {
    return { skip: true, reason: `Max reload attempts (${MAX_RELOAD_ATTEMPTS}) reached` };
  }

  // Check cooldown
  const lastReload = sessionStorage.getItem(RELOAD_KEY);
  if (lastReload) {
    const lastReloadTime = parseInt(lastReload, 10);
    const now = Date.now();
    if (now - lastReloadTime < RELOAD_COOLDOWN_MS) {
      return { skip: true, reason: 'Recently reloaded' };
    }
  }

  return { skip: false, reason: '' };
}

/**
 * Mark that we're about to reload due to a chunk error
 * Increments the reload counter and sets the timestamp
 */
function markReload(): void {
  if (typeof window === 'undefined') return;
  const currentCount = getReloadCount();
  sessionStorage.setItem(RELOAD_COUNT_KEY, (currentCount + 1).toString());
  sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
}

/**
 * Clear the reload markers (call after successful app load)
 * Resets both the timestamp and the attempt counter
 */
export function clearChunkReloadMarker(): void {
  if (typeof window === 'undefined') return;
  // Clear after a delay to ensure app is stable
  setTimeout(() => {
    sessionStorage.removeItem(RELOAD_KEY);
    sessionStorage.removeItem(RELOAD_COUNT_KEY);
  }, 5000);
}

/**
 * Check if an error is a chunk loading error
 */
export function isChunkLoadError(error: Error | unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message?.toLowerCase() || '';
  const name = error.name?.toLowerCase() || '';

  // Common chunk load error patterns
  return (
    name === 'chunkloaderror' ||
    message.includes('loading chunk') ||
    message.includes('loading css chunk') ||
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('dynamically imported module') ||
    message.includes('unexpected token') // Can happen with HTML 404 response for missing chunk
  );
}

/**
 * Handle chunk load errors by reloading the page (with retry limits)
 */
export function handleChunkLoadError(error: Error): boolean {
  if (!isChunkLoadError(error)) return false;

  // Check if we should skip reload
  const { skip, reason } = shouldSkipReload();
  if (skip) {
    console.warn(`[ChunkError] Skipping reload - ${reason}. Please hard refresh (Ctrl+Shift+R or Cmd+Shift+R).`);
    // Show user-friendly message for max attempts
    if (reason.includes('Max reload')) {
      showReloadFailedMessage();
    }
    return true; // Error was recognized but we're not reloading
  }

  const attemptNumber = getReloadCount() + 1;
  console.info(`[ChunkError] Detected stale chunk, clearing cache and reloading page (attempt ${attemptNumber}/${MAX_RELOAD_ATTEMPTS})...`);
  markReload();

  // Clear caches and reload
  clearAllCaches().then(() => {
    // Small delay to let cache clearing complete
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }).catch(() => {
    // If cache clearing fails, still try to reload
    window.location.reload();
  });

  return true;
}

/**
 * Show a user-friendly message when reload attempts are exhausted
 */
function showReloadFailedMessage(): void {
  // Use a simple DOM-based alert since React might not be working
  if (typeof document === 'undefined') return;

  // Check if we already showed the message
  if (document.getElementById('chunk-error-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'chunk-error-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #dc2626;
    color: white;
    padding: 12px 20px;
    text-align: center;
    z-index: 99999;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
  `;
  banner.innerHTML = `
    <strong>Update Required:</strong> A new version is available.
    <button onclick="location.reload(true)" style="margin-left: 10px; padding: 4px 12px; background: white; color: #dc2626; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
      Hard Refresh
    </button>
    <span style="margin-left: 10px; opacity: 0.8;">(or press Ctrl+Shift+R / Cmd+Shift+R)</span>
  `;
  document.body.prepend(banner);
}

/**
 * Initialize global chunk error handling
 * Call this once in your app entry point
 */
export function initChunkErrorHandler(): void {
  if (typeof window === 'undefined') return;

  // Handle unhandled rejections (e.g., from dynamic imports)
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && handleChunkLoadError(event.reason)) {
      event.preventDefault(); // Suppress the error from console
    }
  });

  // Handle regular errors
  window.addEventListener('error', (event) => {
    if (event.error && handleChunkLoadError(event.error)) {
      event.preventDefault();
    }
  });

  // Clear the reload marker after successful load
  clearChunkReloadMarker();
}
