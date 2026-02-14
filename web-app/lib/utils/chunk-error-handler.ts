/**
 * Chunk Load Error Handler
 *
 * Handles the common issue where after a new deployment, browsers try to
 * load old JavaScript chunks that no longer exist (ChunkLoadError).
 *
 * Strategy:
 * 1. Detect ChunkLoadError in global error handler
 * 2. Show user a brief toast notification
 * 3. Force a full page reload (one-time, not a loop)
 */

import { clearAllCaches } from './version-check';

const RELOAD_KEY = 'vitora_chunk_error_reload';
const RELOAD_COOLDOWN_MS = 10_000; // 10 seconds cooldown to prevent loops

/**
 * Check if a reload for chunk errors has happened recently
 */
function hasRecentlyReloaded(): boolean {
  if (typeof window === 'undefined') return false;

  const lastReload = sessionStorage.getItem(RELOAD_KEY);
  if (!lastReload) return false;

  const lastReloadTime = parseInt(lastReload, 10);
  const now = Date.now();

  // If reloaded within cooldown period, we're in a potential loop
  return now - lastReloadTime < RELOAD_COOLDOWN_MS;
}

/**
 * Mark that we're about to reload due to a chunk error
 */
function markReload(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
}

/**
 * Clear the reload marker (call after successful app load)
 */
export function clearChunkReloadMarker(): void {
  if (typeof window === 'undefined') return;
  // Clear after a delay to ensure app is stable
  setTimeout(() => {
    sessionStorage.removeItem(RELOAD_KEY);
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
 * Handle chunk load errors by reloading the page once
 */
export function handleChunkLoadError(error: Error): boolean {
  if (!isChunkLoadError(error)) return false;

  // Prevent reload loops
  if (hasRecentlyReloaded()) {
    console.warn('[ChunkError] Skipping reload - already reloaded recently. Please hard refresh (Ctrl+Shift+R).');
    return true; // Error was recognized but we're not reloading
  }

  console.info('[ChunkError] Detected stale chunk, clearing cache and reloading page...');
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
