'use client';

/**
 * Hub Setup Wizard — Desktop-only page for installing/configuring the facility hub.
 *
 * Shown when the user selects "Facility Server (Hub)" mode during desktop-setup.
 * Guides through:
 *   Step 1: System requirements check
 *   Step 2: Configuration (IDs, encryption key)
 *   Step 3: Installation (runs install-hub.sh via shell)
 *   Step 4: Verification (health check)
 *
 * For single-PC facilities, this installs the Django backend on the same machine.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  Loader2,
  Server,
  Shield,
  Wifi,
  AlertTriangle,
  Copy,
  Terminal,
  Monitor,
} from 'lucide-react';

type Step = 'requirements' | 'configure' | 'install' | 'verify';
type OsPlatform = 'linux' | 'windows';

interface HubConfig {
  hubId: string;
  facilityId: string;
  organizationId: string;
  encryptionKey: string;
  syncUrl: string;
  port: string;
}

const DEFAULT_CONFIG: HubConfig = {
  hubId: '',
  facilityId: '',
  organizationId: '',
  encryptionKey: '',
  syncUrl: 'https://api.vitora.digital/api/sync',
  port: '9088',
};

export default function HubSetupWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('requirements');
  const [platform, setPlatform] = useState<OsPlatform>('linux');
  const [config, setConfig] = useState<HubConfig>(DEFAULT_CONFIG);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [installError, setInstallError] = useState('');
  const [verified, setVerified] = useState(false);
  const [copied, setCopied] = useState(false);

  const steps: Array<{ key: Step; label: string; icon: React.ReactNode }> = [
    { key: 'requirements', label: 'Requirements', icon: <Shield className="h-4 w-4" /> },
    { key: 'configure', label: 'Configure', icon: <Server className="h-4 w-4" /> },
    { key: 'install', label: 'Install', icon: <Terminal className="h-4 w-4" /> },
    { key: 'verify', label: 'Verify', icon: <Wifi className="h-4 w-4" /> },
  ];

  const stepIndex = steps.findIndex((s) => s.key === step);

  const generateInstallCommand = useCallback(() => {
    if (platform === 'windows') {
      const envVars = [
        `$env:HUB_ID="${config.hubId}"`,
        `$env:HUB_FACILITY_ID="${config.facilityId}"`,
        `$env:HUB_ORGANIZATION_ID="${config.organizationId}"`,
        `$env:ENCRYPTION_KEY="${config.encryptionKey}"`,
        `$env:SYNC_URL="${config.syncUrl}"`,
        `$env:HUB_PORT="${config.port}"`,
      ];
      return `${envVars.join('; ')}; irm https://get.vitora.digital/hub.ps1 | iex`;
    }

    // Linux
    const envVars = [
      `HUB_ID="${config.hubId}"`,
      `HUB_FACILITY_ID="${config.facilityId}"`,
      `HUB_ORGANIZATION_ID="${config.organizationId}"`,
      `ENCRYPTION_KEY="${config.encryptionKey}"`,
      `SYNC_URL="${config.syncUrl}"`,
      `HUB_PORT="${config.port}"`,
    ];
    return `sudo ${envVars.join(' ')} bash -c "$(curl -sSL https://get.vitora.digital/hub)" -- --non-interactive`;
  }, [config, platform]);

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(generateInstallCommand());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async () => {
    const port = config.port || '9088';
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/hub/health/`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.hub_id) {
          setVerified(true);
          setInstallLog((prev) => [
            ...prev,
            `✓ Hub is running: ${data.hub_id} (v${data.version})`,
          ]);
        }
      } else {
        setInstallError(`Hub responded with status ${res.status}. Check the service logs.`);
      }
    } catch {
      setInstallError(
        'Cannot reach the hub. Make sure the installation completed and the service is running.'
      );
    }
  };

  const handleFinish = () => {
    router.push('/activate');
  };

  const isConfigValid =
    config.hubId.trim() &&
    config.facilityId.trim() &&
    config.organizationId.trim() &&
    config.encryptionKey.trim();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Facility Hub Setup</h1>
          <p className="mt-2 text-sm text-slate-400">
            Install and configure the Vitora backend server on this machine.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <button
                onClick={() => i <= stepIndex && setStep(s.key)}
                disabled={i > stepIndex}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  s.key === step
                    ? 'bg-cyan-600 text-white'
                    : i < stepIndex
                      ? 'bg-cyan-900/50 text-cyan-300 hover:bg-cyan-800/50'
                      : 'bg-slate-700 text-slate-400'
                }`}
              >
                {i < stepIndex ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < steps.length - 1 && (
                <div className={`mx-1 h-px w-6 ${i < stepIndex ? 'bg-cyan-500' : 'bg-slate-600'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
          {/* Step 1: Requirements */}
          {step === 'requirements' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">System Requirements</h2>
              <p className="text-sm text-slate-400">
                Select your operating system and verify the requirements.
              </p>

              {/* OS Platform Selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => setPlatform('linux')}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-md border p-3 transition-colors ${
                    platform === 'linux'
                      ? 'border-cyan-500 bg-cyan-950/30 text-white'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <Terminal className="h-4 w-4" />
                  <span className="text-sm font-medium">Linux / Raspberry Pi</span>
                </button>
                <button
                  onClick={() => setPlatform('windows')}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-md border p-3 transition-colors ${
                    platform === 'windows'
                      ? 'border-cyan-500 bg-cyan-950/30 text-white'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <Monitor className="h-4 w-4" />
                  <span className="text-sm font-medium">Windows</span>
                </button>
              </div>

              <div className="space-y-2">
                {platform === 'linux' ? (
                  <>
                    {[
                      { label: 'Operating System', detail: 'Ubuntu 22.04+, Debian 12+, or Raspberry Pi OS' },
                      { label: 'Python', detail: 'Python 3.11 or higher' },
                      { label: 'RAM', detail: '2GB minimum (4GB recommended)' },
                      { label: 'Storage', detail: '1GB free disk space' },
                      { label: 'Network', detail: 'LAN connectivity (internet for initial setup and cloud sync)' },
                      { label: 'Permissions', detail: 'Root/sudo access for installation' },
                    ].map((req) => (
                      <div key={req.label} className="flex items-start gap-3 rounded-md border border-slate-600 p-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                        <div>
                          <span className="text-sm font-medium text-white">{req.label}</span>
                          <p className="text-xs text-slate-400">{req.detail}</p>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {[
                      { label: 'Operating System', detail: 'Windows 10/11 or Windows Server 2019+' },
                      { label: 'Python', detail: 'Python 3.11+ installed and on PATH (python.org)' },
                      { label: 'RAM', detail: '4GB minimum (8GB recommended)' },
                      { label: 'Storage', detail: '2GB free disk space' },
                      { label: 'Network', detail: 'LAN connectivity (internet for initial setup and cloud sync)' },
                      { label: 'Permissions', detail: 'Administrator privileges (Run as Admin)' },
                    ].map((req) => (
                      <div key={req.label} className="flex items-start gap-3 rounded-md border border-slate-600 p-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                        <div>
                          <span className="text-sm font-medium text-white">{req.label}</span>
                          <p className="text-xs text-slate-400">{req.detail}</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <button
                onClick={() => setStep('configure')}
                className="w-full rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 transition-colors"
              >
                Requirements Met — Continue
              </button>
            </div>
          )}

          {/* Step 2: Configure */}
          {step === 'configure' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Hub Configuration</h2>
              <p className="text-sm text-slate-400">
                Enter the values from your Vitora cloud admin panel.
                <br />
                <span className="text-cyan-400">
                  Found at: Settings → Facilities → Hub Setup
                </span>
              </p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Hub ID</label>
                  <input
                    type="text"
                    value={config.hubId}
                    onChange={(e) => setConfig({ ...config, hubId: e.target.value })}
                    placeholder="e.g., reception-hub-1"
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-slate-500">A unique name for this hub device.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Facility ID</label>
                  <input
                    type="text"
                    value={config.facilityId}
                    onChange={(e) => setConfig({ ...config, facilityId: e.target.value })}
                    placeholder="From cloud admin panel"
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Organization ID</label>
                  <input
                    type="text"
                    value={config.organizationId}
                    onChange={(e) => setConfig({ ...config, organizationId: e.target.value })}
                    placeholder="From cloud admin panel"
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Encryption Key</label>
                  <input
                    type="password"
                    value={config.encryptionKey}
                    onChange={(e) => setConfig({ ...config, encryptionKey: e.target.value })}
                    placeholder="Must match cloud key"
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-slate-500">The Fernet encryption key from your cloud deployment.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-300">Sync URL</label>
                    <input
                      type="url"
                      value={config.syncUrl}
                      onChange={(e) => setConfig({ ...config, syncUrl: e.target.value })}
                      placeholder="https://api.vitora.digital/api/sync"
                      className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-300">Port</label>
                    <input
                      type="number"
                      value={config.port}
                      onChange={(e) => setConfig({ ...config, port: e.target.value })}
                      placeholder="9088"
                      className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep('install')}
                disabled={!isConfigValid}
                className="w-full rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue to Installation
              </button>
            </div>
          )}

          {/* Step 3: Install */}
          {step === 'install' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Install Hub</h2>
              <p className="text-sm text-slate-400">
                {platform === 'windows'
                  ? 'Open PowerShell as Administrator and run the following command:'
                  : 'Open a terminal on this machine and run the following command:'}
              </p>

              {/* Platform indicator */}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {platform === 'windows' ? (
                  <><Monitor className="h-3.5 w-3.5" /> Windows (PowerShell)</>
                ) : (
                  <><Terminal className="h-3.5 w-3.5" /> Linux / macOS (Bash)</>
                )}
                <button
                  onClick={() => setPlatform(platform === 'linux' ? 'windows' : 'linux')}
                  className="text-cyan-400 hover:underline ml-2"
                >
                  Switch to {platform === 'linux' ? 'Windows' : 'Linux'}
                </button>
              </div>

              {/* Install command */}
              <div className="relative">
                <pre className="rounded-md bg-slate-900 border border-slate-600 p-4 text-xs text-green-300 overflow-x-auto whitespace-pre-wrap break-all">
                  {generateInstallCommand()}
                </pre>
                <button
                  onClick={handleCopyCommand}
                  className="absolute top-2 right-2 rounded-md bg-slate-700 p-1.5 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>

              <div className="rounded-md bg-yellow-900/30 border border-yellow-700 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400 mt-0.5" />
                  <div className="text-xs text-yellow-200 space-y-1">
                    <p className="font-medium">Important:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-yellow-300">
                      {platform === 'windows' ? (
                        <>
                          <li>Must be run in <code className="bg-slate-800 px-1 rounded">PowerShell as Administrator</code></li>
                          <li>Python 3.11+ must be installed and on PATH</li>
                          <li>It will download ~50MB and install Python dependencies</li>
                          <li>A Windows service (VitoraHub) will be created and started</li>
                        </>
                      ) : (
                        <>
                          <li>The command requires <code className="bg-slate-800 px-1 rounded">sudo</code> (root access)</li>
                          <li>It will download ~50MB and install Python dependencies</li>
                          <li>Installation takes 2-5 minutes depending on internet speed</li>
                          <li>A systemd service will be created and started automatically</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Log output (if install triggered via Tauri shell) */}
              {installLog.length > 0 && (
                <div className="rounded-md bg-slate-900 border border-slate-600 p-3 max-h-48 overflow-y-auto">
                  {installLog.map((line, i) => (
                    <p key={i} className="text-xs text-slate-300 font-mono">{line}</p>
                  ))}
                </div>
              )}

              {installError && (
                <div className="rounded-md bg-red-900/50 border border-red-700 px-3 py-2 text-sm text-red-300">
                  {installError}
                </div>
              )}

              <p className="text-sm text-slate-400">
                Once the installation completes, click &quot;Verify&quot; below to confirm it&apos;s running.
              </p>

              <button
                onClick={() => {
                  setInstallError('');
                  setStep('verify');
                }}
                className="w-full rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 transition-colors"
              >
                Installation Done — Verify
              </button>
            </div>
          )}

          {/* Step 4: Verify */}
          {step === 'verify' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Verify Hub</h2>
              <p className="text-sm text-slate-400">
                Check that the hub is running and accessible on this machine.
              </p>

              <div className="flex flex-col items-center gap-4 py-4">
                {verified ? (
                  <>
                    <CheckCircle2 className="h-12 w-12 text-green-400" />
                    <p className="text-green-300 font-medium">Hub is running!</p>
                    <p className="text-xs text-slate-400">
                      Listening on port {config.port}. Desktop app will connect to{' '}
                      <code className="bg-slate-700 px-1 rounded">http://127.0.0.1:{config.port}</code>
                    </p>
                  </>
                ) : (
                  <>
                    <Server className="h-12 w-12 text-slate-500" />
                    <p className="text-slate-400 text-sm">
                      Click below to check if the hub is responding.
                    </p>
                  </>
                )}
              </div>

              {installError && (
                <div className="rounded-md bg-red-900/50 border border-red-700 px-3 py-2 text-sm text-red-300">
                  {installError}
                </div>
              )}

              {!verified && (
                <button
                  onClick={handleVerify}
                  disabled={installing}
                  className="w-full rounded-md bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50 transition-colors"
                >
                  {installing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Checking...
                    </span>
                  ) : (
                    'Check Hub Health'
                  )}
                </button>
              )}

              {verified && (
                <button
                  onClick={handleFinish}
                  className="w-full rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 transition-colors"
                >
                  Continue to License Activation →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Skip link */}
        <p className="text-center text-xs text-slate-500">
          Already have a hub running?{' '}
          <button onClick={() => router.push('/desktop-setup')} className="text-cyan-400 hover:underline">
            Go back to server setup
          </button>
        </p>
      </div>
    </div>
  );
}
