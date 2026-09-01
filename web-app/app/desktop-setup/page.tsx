'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  isDesktop,
  setApiUrl,
  setDeploymentMode,
  saveHubConfig,
  type DeploymentMode,
} from '@/lib/desktop';
import { discoverHub, probeHub, type HubInfo } from '@/lib/desktop/hub-discovery';

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088';
const LEGACY_LAN_DEFAULT_URL = 'http://192.168.1.100:9088';

const DEPLOYMENT_MODES: Array<{ value: DeploymentMode; label: string; description: string }> = [
  {
    value: 'standalone',
    label: 'Standalone',
    description: 'Single user. Syncs to cloud when internet is available.',
  },
  {
    value: 'lan_client',
    label: 'Facility Workstation',
    description: 'Connects to a local facility server on LAN for multi-user sync.',
  },
  {
    value: 'lan_hub',
    label: 'Facility Server (Hub)',
    description: 'This machine runs the local server. Other workstations connect to it.',
  },
];

/**
 * Desktop-only first-run setup page.
 * Prompts for deployment mode and API server URL, validates connectivity, saves config.
 * Only accessible when running inside Tauri desktop shell.
 */
export default function DesktopSetupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<DeploymentMode>('standalone');
  const [url, setUrl] = useState(DEFAULT_API_URL);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Hub discovery (LAN client mode)
  const [discovering, setDiscovering] = useState(false);
  const [hubInfo, setHubInfo] = useState<HubInfo | null>(null);

  function normalizeServerUrl(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `http://${trimmed}`;
  }

  async function handleTest() {
    setError('');
    setTesting(true);

    try {
      const testUrl = url.replace(/\/$/, '');

      if (mode === 'lan_client') {
        // For LAN client, probe the hub health endpoint
        const hub = await probeHub(testUrl);
        if (hub) {
          setHubInfo(hub);
          setSuccess(true);
        } else {
          setError('Could not reach the facility hub at this address.');
        }
      } else {
        const res = await fetch(`${testUrl}/api/health/`, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          setError(`Server responded with status ${res.status}`);
        } else {
          setSuccess(true);
        }
      }
    } catch (e) {
      setError(
        e instanceof Error ? `Cannot connect: ${e.message}` : 'Cannot connect to the server'
      );
    } finally {
      setTesting(false);
    }
  }

  async function handleDiscover() {
    setError('');
    setDiscovering(true);
    setHubInfo(null);

    try {
      const hub = await discoverHub(url || undefined);
      if (hub) {
        setHubInfo(hub);
        setUrl(hub.url);
        setSuccess(true);
      } else {
        setError(
          'No hub found on the local network. Make sure the facility server is running and you are on the same Wi-Fi/LAN.'
        );
      }
    } catch {
      setError('Network scan failed. Enter the hub address manually.');
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSave() {
    setError('');

    if (!isDesktop()) {
      router.push('/login');
      return;
    }

    const normalizedUrl = normalizeServerUrl(url);
    if (!normalizedUrl) {
      setError('Enter a valid server URL before continuing.');
      return;
    }

    try {
      await setApiUrl(normalizedUrl);
      await setDeploymentMode(mode);

      // Save hub-specific config for LAN client mode
      if (mode === 'lan_client' && hubInfo) {
        await saveHubConfig(
          normalizedUrl,
          String(hubInfo.facilityId ?? ''),
          String(hubInfo.organizationId ?? '')
        );
      }

      // Hub mode: redirect to hub setup wizard for installation
      if (mode === 'lan_hub') {
        router.push('/hub-setup');
        return;
      }

      // LAN client (Facility Workstation): skip activation — workstations
      // authenticate with the hub using staff username/password, not an
      // activation code. Only the hub itself needs activation.
      if (mode === 'lan_client') {
        router.push('/login');
        return;
      }

      // Standalone mode: go to license activation (activation code validates the install)
      router.push('/activate');
    } catch (e) {
      const errorMessage =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : (() => {
                try {
                  return JSON.stringify(e);
                } catch {
                  return '';
                }
              })();

      setError(
        errorMessage
          ? `Failed to save desktop configuration: ${errorMessage}`
          : 'Failed to save desktop configuration. Please try again.'
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Vitora HMIS</h1>
          <p className="mt-2 text-sm text-slate-400">Desktop Application Setup</p>
        </div>

        {/* Config card */}
        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Deployment Mode</h2>
            <p className="mt-1 text-sm text-slate-400">
              Choose how this device connects to the Vitora system.
            </p>
          </div>

          <div className="space-y-2">
            {DEPLOYMENT_MODES.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  mode === option.value
                    ? 'border-cyan-500 bg-cyan-950/30'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <input
                  type="radio"
                  name="deployment-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => {
                    setMode(option.value);
                    // Keep manual overrides as-is. Only adjust obviously generic defaults.
                    if (option.value === 'standalone') {
                      if (!url.trim()) {
                        setUrl(DEFAULT_API_URL);
                      }
                    } else if (
                      url.trim() === DEFAULT_API_URL ||
                      url.trim() === LEGACY_LAN_DEFAULT_URL
                    ) {
                      setUrl('');
                    }

                    if (option.value === 'standalone' && url.trim() === LEGACY_LAN_DEFAULT_URL) {
                      setUrl(DEFAULT_API_URL);
                    }
                    setError('');
                    setSuccess(false);
                  }}
                  className="mt-1 accent-cyan-500"
                />
                <div>
                  <span className="text-sm font-medium text-white">{option.label}</span>
                  <p className="mt-0.5 text-xs text-slate-400">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Server URL card */}
        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Server Configuration</h2>
            <p className="mt-1 text-sm text-slate-400">
              {mode === 'lan_client'
                ? 'Enter the LAN IP address of your facility server.'
                : mode === 'lan_hub'
                  ? 'This machine will serve other workstations. Enter the cloud sync URL.'
                  : 'Enter the URL of your Vitora HMIS API server.'}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="api-url" className="block text-sm font-medium text-slate-300">
              API Server URL
            </label>
            <input
              id="api-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError('');
                setSuccess(false);
              }}
              placeholder={
                mode === 'lan_client' || mode === 'lan_hub'
                  ? 'http://192.168.100.87:9099'
                  : DEFAULT_API_URL
              }
              className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* Test connection */}
          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing || discovering || !url}
              className="flex-1 rounded-md bg-slate-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            {mode === 'lan_client' && (
              <button
                onClick={handleDiscover}
                disabled={testing || discovering}
                className="rounded-md bg-cyan-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {discovering ? 'Scanning...' : 'Scan Network'}
              </button>
            )}
          </div>

          {/* Hub info (when discovered) */}
          {hubInfo && (
            <div className="space-y-1 rounded-md border border-cyan-700 bg-cyan-900/30 px-3 py-2 text-sm text-cyan-200">
              <p className="font-medium">Hub found!</p>
              <p className="text-xs text-cyan-300">
                ID: {hubInfo.hubId} · Facility: {hubInfo.facilityId} · v{hubInfo.version}
              </p>
            </div>
          )}

          {/* Status messages */}
          {error && (
            <div className="rounded-md border border-red-700 bg-red-900/50 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-green-700 bg-green-900/50 px-3 py-2 text-sm text-green-300">
              Connected successfully
            </div>
          )}

          {/* Save & Continue */}
          <button
            onClick={handleSave}
            disabled={!url.trim()}
            className="w-full rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save & Continue
          </button>

          <p className="text-center text-xs text-slate-500">
            You can change this later in Settings → Server Configuration
          </p>
        </div>
      </div>
    </div>
  );
}
