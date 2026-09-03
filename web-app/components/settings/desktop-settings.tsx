'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Monitor,
  Wifi,
  HardDrive,
  Server,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type AppConfig,
  type DeploymentMode,
  getAppConfig,
  setApiUrl,
  setDeploymentMode,
  setSyncInterval,
  setBackupInterval,
  setHubUrl,
  getInstallationId,
  clearCredentials,
} from '@/lib/desktop';
import { apiClient } from '@/lib/api/client';
import { licensingApi } from '@/lib/api/licensing';
import { useToast } from '@/lib/hooks/use-toast';
import type { ActivationResponse } from '@/lib/types/licensing';

const DEPLOYMENT_MODES: Array<{ value: DeploymentMode; label: string; description: string }> = [
  {
    value: 'standalone',
    label: 'Standalone',
    description: 'Single user, syncs to cloud when online',
  },
  {
    value: 'lan_client',
    label: 'LAN Client',
    description: 'Multi-user facility, connects to local hub',
  },
  { value: 'lan_hub', label: 'LAN Hub', description: 'This machine runs the server locally' },
  { value: 'web_only', label: 'Web Only', description: 'Connects directly to cloud (PowerSync)' },
];

interface HubHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | string;
  hub_id: string;
  facility_id: string;
  organization_id: string;
  uptime_seconds: number;
  server_time: string;
  version: string;
  database?: { status: string; message?: string };
  sync?: {
    pending?: number;
    failed?: number;
    last_synced_at?: string | null;
    status?: string;
    message?: string;
  };
  license?: { present?: boolean };
}

interface HubSyncNowResult {
  status: string;
  pushed: number;
  pulled: number;
  pending_before: number;
  pending_after: number;
  failed_before: number;
  failed_after: number;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatUptime(seconds: number) {
  if (!seconds) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function healthBadgeVariant(statusValue?: string) {
  if (statusValue === 'healthy' || statusValue === 'ok') return 'default';
  if (statusValue === 'degraded') return 'secondary';
  return 'destructive';
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs">{value}</span>
    </div>
  );
}

export function DesktopSettingsTab() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [installationId, setInstallationId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [manualCheckIning, setManualCheckIning] = useState(false);
  const [lastLicenseCheckInAt, setLastLicenseCheckInAt] = useState<number | null>(null);
  const [lastManualCheckInResult, setLastManualCheckInResult] =
    useState<ActivationResponse | null>(null);
  const [hubHealth, setHubHealth] = useState<HubHealth | null>(null);
  const [hubHealthError, setHubHealthError] = useState<string>('');
  const { toast } = useToast();

  // Form state
  const [apiUrl, setApiUrlState] = useState('');
  const [deploymentMode, setDeploymentModeState] = useState<DeploymentMode>('standalone');
  const [syncInterval, setSyncIntervalState] = useState(30);
  const [backupInterval, setBackupIntervalState] = useState(60);
  const [hubUrl, setHubUrlState] = useState('');

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [appConfig, instId] = await Promise.all([getAppConfig(), getInstallationId()]);
      if (appConfig) {
        setConfig(appConfig);
        setApiUrlState(appConfig.api_url);
        setDeploymentModeState(appConfig.deployment_mode);
        setSyncIntervalState(appConfig.sync_interval_secs);
        setBackupIntervalState(appConfig.backup_interval_mins);
        setHubUrlState(appConfig.hub_url);
      }
      if (instId) {
        setInstallationId(instId);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('vitora_last_check_in');
    if (!raw) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      setLastLicenseCheckInAt(parsed);
    }
  }, []);

  const isHubMode = deploymentMode === 'lan_client' || deploymentMode === 'lan_hub';

  const loadHubHealth = useCallback(async () => {
    if (!isHubMode) return;
    setHealthLoading(true);
    setHubHealthError('');
    try {
      const response = await apiClient.get<HubHealth>('/api/hub/health/');
      setHubHealth(response.data);
    } catch {
      setHubHealth(null);
      setHubHealthError('Hub health is unavailable.');
    } finally {
      setHealthLoading(false);
    }
  }, [isHubMode]);

  useEffect(() => {
    if (!loading && isHubMode) {
      loadHubHealth();
    }
  }, [loading, isHubMode, loadHubHealth]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setApiUrl(apiUrl);
      await setDeploymentMode(deploymentMode);
      await setSyncInterval(syncInterval);
      await setBackupInterval(backupInterval);
      if (deploymentMode === 'lan_client') {
        await setHubUrl(hubUrl);
      }
      toast({
        title: 'Settings saved',
        description: 'Desktop configuration updated. Restart the app for changes to take effect.',
      });
      await loadConfig();
    } catch {
      toast({
        title: 'Save failed',
        description: 'Failed to update desktop settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (config) {
      setApiUrlState(config.api_url);
      setDeploymentModeState(config.deployment_mode);
      setSyncIntervalState(config.sync_interval_secs);
      setBackupIntervalState(config.backup_interval_mins);
      setHubUrlState(config.hub_url);
    }
  };

  const handleClearCredentials = async () => {
    await clearCredentials();
    toast({
      title: 'Credentials cleared',
      description: 'Saved login credentials have been removed.',
    });
  };

  const handleSyncNow = async () => {
    setSyncingNow(true);
    try {
      const response = await apiClient.post<HubSyncNowResult>('/api/hub/sync-now/');
      const result = response.data;
      toast({
        title: 'Sync complete',
        description: `Pushed ${result.pushed}, pulled ${result.pulled}. Pending ${result.pending_before} -> ${result.pending_after}.`,
      });
      await loadHubHealth();
    } catch {
      toast({
        title: 'Sync failed',
        description: 'The hub could not run a sync cycle right now.',
        variant: 'destructive',
      });
    } finally {
      setSyncingNow(false);
    }
  };

  const handleManualCheckIn = async () => {
    setManualCheckIning(true);
    try {
      const resolvedInstallationId =
        hubHealth?.hub_id || installationId || (await licensingApi.getInstallationIdAsync());
      const osInfo =
        typeof window !== 'undefined'
          ? `${window.navigator.platform} | ${window.navigator.userAgent}`
          : '';
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

      const response = await licensingApi.checkIn({
        installation_id: resolvedInstallationId,
        app_version: process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0',
        version: process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0',
        os_info: osInfo,
        hostname,
      });
      setLastManualCheckInResult(response);

      const now = Date.now();
      if (typeof window !== 'undefined') {
        localStorage.setItem('vitora_last_check_in', String(now));
      }
      setLastLicenseCheckInAt(now);

      toast({
        title: 'License check-in complete',
        description: 'Desktop license token has been refreshed successfully.',
      });
    } catch {
      toast({
        title: 'License check-in failed',
        description: 'Could not complete a manual check-in. Confirm internet access and try again.',
        variant: 'destructive',
      });
    } finally {
      setManualCheckIning(false);
    }
  };

  const hasChanges =
    config &&
    (apiUrl !== config.api_url ||
      deploymentMode !== config.deployment_mode ||
      syncInterval !== config.sync_interval_secs ||
      backupInterval !== config.backup_interval_mins ||
      hubUrl !== config.hub_url);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Settings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">Connection</CardTitle>
            <HelpPopover content="Configure how the desktop app connects to the Vitora backend server." />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-url">API Server URL</Label>
            <Input
              id="api-url"
              value={apiUrl}
              onChange={(e) => setApiUrlState(e.target.value)}
              placeholder="https://cloud-api.example.com"
            />
            <p className="text-xs text-muted-foreground">The base URL of the Vitora backend API.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deployment-mode">Deployment Mode</Label>
            <Select
              value={deploymentMode}
              onValueChange={(v) => setDeploymentModeState(v as DeploymentMode)}
            >
              <SelectTrigger id="deployment-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPLOYMENT_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    <div className="flex flex-col">
                      <span>{mode.label}</span>
                      <span className="text-xs text-muted-foreground">{mode.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {deploymentMode === 'lan_client' && (
            <div className="space-y-2">
              <Label htmlFor="hub-url">Hub URL</Label>
              <Input
                id="hub-url"
                value={hubUrl}
                onChange={(e) => setHubUrlState(e.target.value)}
                placeholder="http://192.168.1.100:9088"
              />
              <p className="text-xs text-muted-foreground">
                IP address and port of the facility hub on the local network.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hub Operations */}
      {isHubMode && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Hub Operations</CardTitle>
                <HelpPopover content="Monitor the local hub queue and run an immediate hub-to-cloud sync cycle." />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadHubHealth}
                  disabled={healthLoading || syncingNow}
                >
                  {healthLoading ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                  )}
                  Refresh
                </Button>
                <Button size="sm" onClick={handleSyncNow} disabled={syncingNow || healthLoading}>
                  {syncingNow ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="mr-1.5 h-4 w-4" />
                  )}
                  Sync Now
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {hubHealthError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{hubHealthError}</span>
              </div>
            )}

            {hubHealth ? (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Status
                    </div>
                    <Badge
                      variant={healthBadgeVariant(hubHealth.status)}
                      className="mt-2 w-fit capitalize"
                    >
                      {hubHealth.status}
                    </Badge>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <HardDrive className="h-3.5 w-3.5" />
                      Queue
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {hubHealth.sync?.pending ?? 0} pending
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {hubHealth.sync?.failed ?? 0} failed
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Last Sync
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {formatDateTime(hubHealth.sync?.last_synced_at)}
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Server className="h-3.5 w-3.5" />
                      License
                    </div>
                    <Badge
                      variant={hubHealth.license?.present ? 'default' : 'destructive'}
                      className="mt-2 w-fit"
                    >
                      {hubHealth.license?.present ? 'Present' : 'Missing'}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <InfoRow label="Hub ID" value={hubHealth.hub_id || 'N/A'} />
                  <InfoRow label="Facility ID" value={hubHealth.facility_id || 'N/A'} />
                  <InfoRow label="Organization ID" value={hubHealth.organization_id || 'N/A'} />
                  <InfoRow label="Uptime" value={formatUptime(hubHealth.uptime_seconds)} />
                </div>
              </>
            ) : (
              !hubHealthError && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading hub status...
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Sync & Backup Settings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">Sync & Backup</CardTitle>
            <HelpPopover content="Configure automatic data synchronization and backup intervals. Set to 0 to disable." />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sync-interval">Sync Interval (seconds)</Label>
              <Input
                id="sync-interval"
                type="number"
                min={0}
                value={syncInterval}
                onChange={(e) => setSyncIntervalState(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">How often to sync data. 0 = disabled.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="backup-interval">Backup Interval (minutes)</Label>
              <Input
                id="backup-interval"
                type="number"
                min={0}
                value={backupInterval}
                onChange={(e) => setBackupIntervalState(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                How often to auto-backup local data. 0 = disabled.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Device Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">Device Information</CardTitle>
            <HelpPopover content="Read-only device identifiers used for licensing and sync. You can also run a manual desktop license check-in." />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Desktop Client ID (tauri)</span>
            <Badge variant="secondary" className="font-mono text-xs">
              {installationId || 'N/A'}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Hub Installation ID (licensing)</span>
            <Badge variant="secondary" className="font-mono text-xs">
              {hubHealth?.hub_id || 'N/A'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Deployment Mode</span>
            <Badge variant="outline" className="gap-1">
              {deploymentMode === 'standalone' && <Monitor className="h-3 w-3" />}
              {deploymentMode === 'lan_client' && <Wifi className="h-3 w-3" />}
              {deploymentMode === 'lan_hub' && <Server className="h-3 w-3" />}
              {deploymentMode === 'web_only' && <HardDrive className="h-3 w-3" />}
              {DEPLOYMENT_MODES.find((m) => m.value === deploymentMode)?.label || deploymentMode}
            </Badge>
          </div>

          <div className="rounded-md border p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">License Check-in</p>
                <p className="text-xs text-muted-foreground">
                  Last check-in:{' '}
                  {lastLicenseCheckInAt
                    ? formatDateTime(new Date(lastLicenseCheckInAt).toISOString())
                    : 'Never'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleManualCheckIn}
                disabled={manualCheckIning}
              >
                {manualCheckIning ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="mr-1.5 h-4 w-4" />
                )}
                Check In Now
              </Button>
            </div>

            {lastManualCheckInResult && (
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <InfoRow
                  label="App Version"
                  value={lastManualCheckInResult.app_version || 'N/A'}
                />
                <InfoRow label="OS Info" value={lastManualCheckInResult.os_info || 'N/A'} />
                <InfoRow label="Hostname" value={lastManualCheckInResult.hostname || 'N/A'} />
                <InfoRow
                  label="Hardware Fingerprint"
                  value={lastManualCheckInResult.hardware_fingerprint || 'N/A'}
                />
                <InfoRow
                  label="Binary Manifest ID"
                  value={lastManualCheckInResult.binary_manifest_id || 'N/A'}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">Credentials</CardTitle>
            <HelpPopover content="Manage saved login credentials stored in the desktop keystore." />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Saved Login Credentials</p>
              <p className="text-xs text-muted-foreground">
                Clear remembered username and password from the device keystore.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleClearCredentials}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save / Reset */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleReset} disabled={!hasChanges || saving}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Reset
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
