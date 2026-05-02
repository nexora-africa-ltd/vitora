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
