/**
 * Version Check Utility
 *
 * Detects when a new version of the app is deployed and prompts users to refresh.
 * Works both locally (dev) and in production by comparing build IDs.
 *
 * Strategy:
 * 1. On app load, fetch the current build ID from the server
 * 2. Store it in sessionStorage as the "known" version
 * 3. Periodically check if the server version has changed
 * 4. If changed, show a toast prompting the user to refresh
 * 5. On refresh, clear caches to ensure fresh content
 */

const VERSION_KEY = 'vitora_app_version';
const VERSION_CHECK_INTERVAL = 60_000; // Check every 60 seconds
const VERSION_LAST_CHECK_KEY = 'vitora_version_last_check';

// In development, use a longer interval to avoid false positives during HMR
const isDevelopment = process.env.NODE_ENV === 'development';
const EFFECTIVE_CHECK_INTERVAL = isDevelopment ? 300_000 : VERSION_CHECK_INTERVAL; // 5 min in dev

// Prefixes for user data that must be preserved
const PRESERVED_PREFIXES = [
  'vitora_draft_',        // Draft form data
  'vitora_autosave_queue_', // Offline queue
  'vitora_access_token',  // Auth
  'vitora_refresh_token', // Auth  
  'vitora_user',          // User profile
  'vitora_events_',       // Event logs
];

export interface VersionState {
  currentVersion: string | null;
  newVersionAvailable: boolean;
  newVersion: string | null;
  isChecking: boolean;
}

/**
 * Fetch the current build ID from Next.js
 * Next.js exposes the build ID at /_next/static/{buildId}/_buildManifest.js
 * We can also check the __NEXT_DATA__ script tag
 */
async function fetchServerVersion(): Promise<string | null> {
  try {
    // Method 1: Check __NEXT_DATA__ on the page (most reliable for client-side)
    if (typeof document !== 'undefined') {
      const nextDataScript = document.getElementById('__NEXT_DATA__');
      if (nextDataScript) {
        const data = JSON.parse(nextDataScript.textContent || '{}');
        if (data.buildId) {
          return data.buildId;
        }
      }
    }

    // Method 2: Fetch a lightweight endpoint that returns version info
    // We'll create this endpoint
    const response = await fetch('/api/version', {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.version || data.buildId || null;
    }

    return null;
  } catch (error) {
    console.warn('[VersionCheck] Failed to fetch server version:', error);
    return null;
  }
}

/**
 * Get the stored version from sessionStorage
 */
function getStoredVersion(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(VERSION_KEY);
}

/**
 * Store the current version in sessionStorage
 */
function storeVersion(version: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(VERSION_KEY, version);
}

/**
 * Get the last check timestamp
 */
function getLastCheckTime(): number {
  if (typeof window === 'undefined') return 0;
  const value = sessionStorage.getItem(VERSION_LAST_CHECK_KEY);
  return value ? parseInt(value, 10) : 0;
}

/**
 * Store the last check timestamp
 */
function setLastCheckTime(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(VERSION_LAST_CHECK_KEY, Date.now().toString());
}

/**
 * Check if enough time has passed since last check
 */
function shouldCheck(): boolean {
  const lastCheck = getLastCheckTime();
  return Date.now() - lastCheck > EFFECTIVE_CHECK_INTERVAL;
}

export interface PendingUserData {
  /** Total count of pending items */
  count: number;
  /** Whether there are draft forms */
  hasDrafts: boolean;
  /** Whether there are offline queue items */
  hasOfflineQueue: boolean;
  /** List of draft keys found */
  draftKeys: string[];
}

/**
 * Check for pending unsaved user data in localStorage
 * Useful for warning users before refresh/logout
 */
export function getPendingUserData(): PendingUserData {
  const result: PendingUserData = {
    count: 0,
    hasDrafts: false,
    hasOfflineQueue: false,
    draftKeys: [],
  };

  if (typeof window === 'undefined') return result;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (key.startsWith('vitora_draft_')) {
      result.hasDrafts = true;
      result.count++;
      // Extract the draft key name (e.g., 'new-encounter' from 'vitora_draft_new-encounter')
      result.draftKeys.push(key.replace('vitora_draft_', ''));
    } else if (key.startsWith('vitora_autosave_queue_')) {
      // Check if queue has items
      try {
        const queueData = localStorage.getItem(key);
        if (queueData) {
          const queue = JSON.parse(queueData);
          if (Array.isArray(queue) && queue.length > 0) {
            result.hasOfflineQueue = true;
            result.count += queue.length;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return result;
}

/**
 * Check if there's any pending user data that would be at risk
 */
export function hasPendingUserData(): boolean {
  const data = getPendingUserData();
  return data.count > 0;
}

/**
 * Clear all application caches
 * This includes:
 * - Service Worker caches
 * - Browser caches via Cache API
 * - React Query cache (handled separately)
 * 
 * IMPORTANT: This preserves user data in localStorage:
 * - Auth tokens (vitora_access_token, vitora_refresh_token, vitora_user)
 * - Draft forms (vitora_draft_*)
 * - Offline queue (vitora_autosave_queue_*)
 * - Event logs (vitora_events_*)
 */
export async function clearAllCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // 1. Clear Service Worker caches (these are separate from localStorage)
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
      console.info('[VersionCheck] Cleared', cacheNames.length, 'cache(s)');
    }

    // 2. Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister())
      );
      console.info('[VersionCheck] Unregistered', registrations.length, 'service worker(s)');
    }

    // 3. Clear ONLY version/cache tracking keys from sessionStorage
    // We explicitly DO NOT clear localStorage - it contains user data:
    // - Auth tokens (vitora_access_token, vitora_refresh_token, vitora_user)
    // - Draft forms (vitora_draft_*)
    // - Offline queue (vitora_autosave_queue_*)
    // NOTE: We intentionally DO NOT clear 'vitora_chunk_error_reload' here!
    // That marker is managed by chunk-error-handler to prevent infinite reload loops.
    const sessionKeysToRemove = [
      VERSION_KEY,
      VERSION_LAST_CHECK_KEY,
    ];
    sessionKeysToRemove.forEach((key) => {
      sessionStorage.removeItem(key);
    });

    console.info('[VersionCheck] Cache clearing complete (user data preserved)');
  } catch (error) {
    console.error('[VersionCheck] Failed to clear caches:', error);
  }
}

/**
 * Clear caches and perform a hard reload
 */
export async function clearCacheAndReload(): Promise<void> {
  await clearAllCaches();

  // Force a hard reload bypassing all caches
  if (typeof window !== 'undefined') {
    // Use location.reload(true) is deprecated, so we use a cache-busting approach
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString());
    window.location.href = url.toString();
  }
}

/**
 * Check for a new version and return the state
 */
export async function checkForNewVersion(): Promise<VersionState> {
  const state: VersionState = {
    currentVersion: getStoredVersion(),
    newVersionAvailable: false,
    newVersion: null,
    isChecking: true,
  };

  try {
    const serverVersion = await fetchServerVersion();

    if (!serverVersion) {
      return { ...state, isChecking: false };
    }

    const storedVersion = getStoredVersion();

    // First time - just store the version
    if (!storedVersion) {
      storeVersion(serverVersion);
      setLastCheckTime();
      return {
        currentVersion: serverVersion,
        newVersionAvailable: false,
        newVersion: null,
        isChecking: false,
      };
    }

    // Compare versions
    if (serverVersion !== storedVersion) {
      return {
        currentVersion: storedVersion,
        newVersionAvailable: true,
        newVersion: serverVersion,
        isChecking: false,
      };
    }

    setLastCheckTime();
    return {
      currentVersion: storedVersion,
      newVersionAvailable: false,
      newVersion: null,
      isChecking: false,
    };
  } catch (error) {
    console.warn('[VersionCheck] Error checking version:', error);
    return { ...state, isChecking: false };
  }
}

/**
 * Start periodic version checking
 * Returns a cleanup function to stop checking
 */
export function startVersionChecking(
  onNewVersion: (newVersion: string) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  let intervalId: NodeJS.Timeout | null = null;
  let isActive = true;

  const check = async () => {
    if (!isActive) return;
    if (!shouldCheck()) return;

    const state = await checkForNewVersion();
    if (state.newVersionAvailable && state.newVersion) {
      onNewVersion(state.newVersion);
      // Stop checking once we've detected a new version
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  };

  // Initial check after a short delay (let app stabilize)
  setTimeout(check, 5000);

  // Start periodic checking
  intervalId = setInterval(check, EFFECTIVE_CHECK_INTERVAL);

  // Handle visibility change - check when tab becomes visible
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      check();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Handle online event - check when coming back online
  const handleOnline = () => {
    check();
  };
  window.addEventListener('online', handleOnline);

  // Return cleanup function
  return () => {
    isActive = false;
    if (intervalId) {
      clearInterval(intervalId);
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
  };
}
