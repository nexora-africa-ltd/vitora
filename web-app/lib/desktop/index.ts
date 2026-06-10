/**
 * Desktop bridge — feature-detects Tauri APIs and exposes typed wrappers.
 * Falls back gracefully in browser mode (all functions return false/undefined).
 */

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

/** Returns true if running inside a Tauri desktop shell. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
}

/** Get the Tauri invoke function, or null if not in Tauri. */
function getInvoke() {
  if (!isDesktop()) return null;
  return window.__TAURI__!.core.invoke;
}

// ---------------------------------------------------------------------------
// Printer
// ---------------------------------------------------------------------------

interface PrintResult {
  success: boolean;
  message: string;
}

interface PrinterInfo {
  name: string;
  is_default: boolean;
}

/**
 * Print a receipt via native ESC/POS printer.
 * Falls back to window.print() in browser mode.
 */
export async function printReceipt(
  content: string,
  printerName?: string
): Promise<PrintResult> {
  const invoke = getInvoke();
  if (!invoke) {
    window.print();
    return { success: true, message: 'Printed via browser' };
  }

  return invoke<PrintResult>('print_receipt', {
    payload: { content, printer_name: printerName },
  });
}

/**
 * List available printers on the system.
 * Returns empty array in browser mode.
 */
export async function listPrinters(): Promise<PrinterInfo[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<PrinterInfo[]>('list_printers');
}

// ---------------------------------------------------------------------------
// Filesystem (save dialog)
// ---------------------------------------------------------------------------

/**
 * Save content to a file using native save dialog.
 * Returns the path the file was saved to, or null if cancelled/unavailable.
 */
export async function saveFile(
  content: string,
  defaultName: string,
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<string | null> {
  if (!isDesktop()) {
    // Browser fallback: download via blob
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    return defaultName;
  }

  // Use Tauri dialog + fs plugins
  const invoke = getInvoke()!;
  const path = await invoke<string | null>('plugin:dialog|save', {
    defaultPath: defaultName,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  });

  if (!path) return null;

  await invoke('plugin:fs|write_text_file', { path, contents: content });
  return path;
}

// ---------------------------------------------------------------------------
// App info
// ---------------------------------------------------------------------------

/**
 * Get the sidecar port (only relevant in production desktop mode).
 */
export async function getSidecarPort(): Promise<number | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<number>('get_sidecar_port');
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Check if this is the first run of the desktop app (no config saved yet).
 * Always returns false in browser mode.
 */
export async function isFirstRun(): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) return false;
  return invoke<boolean>('is_first_run');
}

/**
 * Get the configured API base URL.
 * Returns default (https://api.vitora.digital) if not configured or not in desktop mode.
 */
export async function getApiUrl(): Promise<string> {
  const invoke = getInvoke();
  if (!invoke) return process.env.NEXT_PUBLIC_API_URL || '';
  return invoke<string>('get_api_url');
}

/**
 * Set and persist the API base URL.
 * Only works in desktop mode.
 */
export async function setApiUrl(url: string): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string>('set_api_url', { url });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Show a native desktop notification.
 * Falls back to Web Notifications API in browser mode.
 */
export async function showNotification(
  title: string,
  body?: string
): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) {
    // Browser fallback
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
    return;
  }
  await invoke('plugin:notification|notify', { title, body });
}

/**
 * Request notification permission (desktop + browser).
 * Returns true if granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) {
    if (!('Notification' in window)) return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
  const granted = await invoke<string>('plugin:notification|request_permission');
  return granted === 'granted';
}

// ---------------------------------------------------------------------------
// Deep Link
// ---------------------------------------------------------------------------

/**
 * Listen for deep link events (vitora:// URLs).
 * Only works in desktop mode. Returns an unlisten function.
 */
export function onDeepLink(
  callback: (urls: string[]) => void
): (() => void) | null {
  if (typeof window === 'undefined' || !window.__TAURI__) return null;

  // Listen for the 'deep-link' event emitted by the Rust side
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (Array.isArray(detail)) {
      callback(detail);
    }
  };

  window.addEventListener('deep-link', handler);
  return () => window.removeEventListener('deep-link', handler);
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

export interface UpdateInfo {
  available: boolean;
  version?: string;
  body?: string;
}

/**
 * Check for app updates. Returns info about the available update, if any.
 * Only works in desktop mode.
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  const invoke = getInvoke();
  if (!invoke) return { available: false };

  try {
    const result = await invoke<{ available: boolean; version?: string; body?: string }>(
      'plugin:updater|check'
    );
    return result;
  } catch {
    return { available: false };
  }
}

/**
 * Download and install an available update. The app will restart.
 * Only works in desktop mode.
 */
export async function installUpdate(): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('plugin:updater|download_and_install');
}

// ---------------------------------------------------------------------------
// Deployment Mode & Sync Config
// ---------------------------------------------------------------------------

export type DeploymentMode = 'standalone' | 'lan_client' | 'lan_hub' | 'web_only';

export interface AppConfig {
  api_url: string;
  deployment_mode: DeploymentMode;
  client_id: string;
  sync_interval_secs: number;
  backup_interval_mins: number;
  hub_url: string;
  facility_id: string;
  organization_id: string;
  setup_completed: boolean;
}

/**
 * Get the full app configuration.
 * Returns null in browser mode.
 */
export async function getAppConfig(): Promise<AppConfig | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<AppConfig>('get_app_config');
}

/**
 * Set the deployment mode.
 */
export async function setDeploymentMode(mode: DeploymentMode): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('set_deployment_mode', { mode });
}

/**
 * Set the auto-sync interval (in seconds). 0 to disable.
 */
export async function setSyncInterval(seconds: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('set_sync_interval', { seconds });
}

/**
 * Set the auto-backup interval (in minutes). 0 to disable.
 */
export async function setBackupInterval(minutes: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('set_backup_interval', { minutes });
}

// ---------------------------------------------------------------------------
// Hub Connection & Discovery
// ---------------------------------------------------------------------------

/**
 * Set the facility hub URL (for LAN client mode).
 * Example: "http://192.168.1.100:9088"
 */
export async function setHubUrl(url: string): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string>('set_hub_url', { url });
}

/**
 * Set the facility ID (for WebSocket sync connection).
 */
export async function setFacilityId(facilityId: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('set_facility_id', { facilityId });
}

/**
 * Set the organization ID.
 */
export async function setOrganizationId(organizationId: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('set_organization_id', { organizationId });
}

/**
 * Save full hub connection config at once (used by setup wizard).
 * In LAN client mode, this also sets the API URL to the hub URL.
 */
export async function saveHubConfig(
  hubUrl: string,
  facilityId: string,
  organizationId: string
): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('save_hub_config', { hubUrl, facilityId, organizationId });
}

// ---------------------------------------------------------------------------
// Secure Key Storage
// ---------------------------------------------------------------------------

/**
 * Get or generate the database encryption key from the OS keystore.
 * The key is generated once (random 256-bit) and persisted securely.
 * Returns hex-encoded key (64 chars) or null in browser mode.
 */
export async function getDbEncryptionKey(): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string>('get_db_encryption_key');
}

/**
 * Store the Fernet key in the secure keystore.
 * The Fernet key is used for PII encryption (national_id, phone, etc).
 */
export async function setFernetKey(key: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('set_fernet_key', { key });
}

/**
 * Retrieve the Fernet key from the secure keystore.
 * Returns the base64-encoded Fernet key or null if not stored.
 */
export async function getFernetKey(): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    return await invoke<string>('get_fernet_key');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// License / Installation ID
// ---------------------------------------------------------------------------

/**
 * Get the stable installation ID from Tauri's config (generated on first run).
 * Returns null in browser mode — caller should fall back to localStorage UUID.
 */
export async function getInstallationId(): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string>('get_installation_id');
}

/**
 * Store the license JWT in the OS-level secure keystore.
 * Falls back to localStorage in browser mode (handled by caller).
 */
export async function storeLicenseToken(token: string): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) return false;
  try {
    await invoke('store_license_token', { token });
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieve the license JWT from the OS-level secure keystore.
 * Returns null in browser mode or if no token is stored.
 */
export async function getLicenseToken(): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const token = await invoke<string>('get_license_token');
  return token || null; // empty string → null
}

/**
 * Clear the stored license token (on revocation or factory reset).
 */
export async function clearLicenseToken(): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('clear_license_token');
}

// ---------------------------------------------------------------------------
// Saved Credentials (Remember Me — Desktop Only)
// ---------------------------------------------------------------------------

/**
 * Store login credentials in the OS-level secure keystore.
 * Only available in desktop (Tauri) mode; no-op in browser.
 */
export async function storeCredentials(username: string, password: string): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) return false;
  try {
    await invoke('store_credentials', { username, password });
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieve saved login credentials from the OS-level secure keystore.
 * Returns null in browser mode or if no credentials are stored.
 */
export async function getCredentials(): Promise<{ username: string; password: string } | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    const [username, password] = await invoke<[string, string]>('get_credentials');
    if (!username) return null;
    return { username, password };
  } catch {
    return null;
  }
}

/**
 * Clear saved credentials (used on explicit logout).
 */
export async function clearCredentials(): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  try {
    await invoke('clear_credentials');
  } catch {
    // ignore
  }
}
