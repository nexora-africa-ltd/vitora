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
  const [url, setUrl] = useState('https://api.vitora.digital');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Hub discovery (LAN client mode)
  const [discovering, setDiscovering] = useState(false);
  const [hubInfo, setHubInfo] = useState<HubInfo | null>(null);

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
        e instanceof Error
          ? `Cannot connect: ${e.message}`
          : 'Cannot connect to the server'
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
    if (!isDesktop()) {
      router.push('/login');
      return;
    }

    const trimmed = url.replace(/\/$/, '');
    await setApiUrl(trimmed);
    await setDeploymentMode(mode);

    // Save hub-specific config for LAN client mode
    if (mode === 'lan_client' && hubInfo) {
      await saveHubConfig(trimmed, hubInfo.facilityId, hubInfo.facilityName);
    }

    // Hub mode: redirect to hub setup wizard for installation
    if (mode === 'lan_hub') {
      router.push('/hub-setup');
      return;
    }

    // After setup, go to license activation (activation code validates the install)
    router.push('/activate');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Vitora HMIS</h1>
          <p className="mt-2 text-sm text-slate-400">
            Desktop Application Setup
          </p>
        </div>

        {/* Config card */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Deployment Mode
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Choose how this device connects to the Vitora system.
            </p>
          </div>

          <div className="space-y-2">
            {DEPLOYMENT_MODES.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
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
                    // Default URL based on mode
                    if (option.value === 'lan_client' || option.value === 'lan_hub') {
                      setUrl('http://192.168.1.100:9088');
                    } else {
                      setUrl('https://api.vitora.digital');
                    }
                    setError('');
                    setSuccess(false);
                  }}
                  className="mt-1 accent-cyan-500"
                />
                <div>
                  <span className="text-sm font-medium text-white">{option.label}</span>
                  <p className="text-xs text-slate-400 mt-0.5">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Server URL card */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Server Configuration
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {mode === 'lan_client'
                ? 'Enter the LAN IP address of your facility server.'
                : mode === 'lan_hub'
                  ? 'This machine will serve other workstations. Enter the cloud sync URL.'
                  : 'Enter the URL of your Vitora HMIS API server.'}
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="api-url"
              className="block text-sm font-medium text-slate-300"
            >
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
              placeholder="https://api.vitora.digital"
              className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {/* Test connection */}
          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing || discovering || !url}
              className="flex-1 rounded-md bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            {mode === 'lan_client' && (
              <button
                onClick={handleDiscover}
                disabled={testing || discovering}
                className="rounded-md bg-cyan-800 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {discovering ? 'Scanning...' : 'Scan Network'}
              </button>
            )}
          </div>

          {/* Hub info (when discovered) */}
          {hubInfo && (
            <div className="rounded-md bg-cyan-900/30 border border-cyan-700 px-3 py-2 text-sm text-cyan-200 space-y-1">
              <p className="font-medium">Hub found!</p>
              <p className="text-xs text-cyan-300">
                ID: {hubInfo.hubId} · Facility: {hubInfo.facilityId} · v{hubInfo.version}
              </p>
            </div>
          )}

          {/* Status messages */}
          {error && (
            <div className="rounded-md bg-red-900/50 border border-red-700 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md bg-green-900/50 border border-green-700 px-3 py-2 text-sm text-green-300">
              Connected successfully
            </div>
          )}

          {/* Save & Continue */}
          <button
            onClick={handleSave}
            disabled={!url}
            className="w-full rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save & Continue
          </button>

          <p className="text-xs text-slate-500 text-center">
            You can change this later in Settings → Server Configuration
          </p>
        </div>
      </div>
    </div>
  );
}
