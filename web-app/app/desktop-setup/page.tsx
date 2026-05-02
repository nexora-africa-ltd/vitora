'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isDesktop, setApiUrl } from '@/lib/desktop';

/**
 * Desktop-only first-run setup page.
 * Prompts for API server URL, validates connectivity, saves config.
 * Only accessible when running inside Tauri desktop shell.
 */
export default function DesktopSetupPage() {
  const router = useRouter();
  const [url, setUrl] = useState('https://api.vitora.digital');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleTest() {
    setError('');
    setTesting(true);

    try {
      const testUrl = url.replace(/\/$/, '');
      const res = await fetch(`${testUrl}/api/health/`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        setError(`Server responded with status ${res.status}`);
      } else {
        setSuccess(true);
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

  async function handleSave() {
    if (!isDesktop()) {
      router.push('/login');
      return;
    }

    const trimmed = url.replace(/\/$/, '');
    await setApiUrl(trimmed);
    // Redirect to login — the sidecar will use the new URL on next restart
    router.push('/login');
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
              Server Configuration
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Enter the URL of your Vitora HMIS API server. For most users,
              the default works.
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
          <button
            onClick={handleTest}
            disabled={testing || !url}
            className="w-full rounded-md bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testing ? 'Testing connection...' : 'Test Connection'}
          </button>

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
