'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, RotateCcw, Monitor, Wifi, HardDrive, Server } from 'lucide-react';
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
import { useToast } from '@/lib/hooks/use-toast';

const DEPLOYMENT_MODES: Array<{ value: DeploymentMode; label: string; description: string }> = [
  { value: 'standalone', label: 'Standalone', description: 'Single user, syncs to cloud when online' },
  { value: 'lan_client', label: 'LAN Client', description: 'Multi-user facility, connects to local hub' },
  { value: 'lan_hub', label: 'LAN Hub', description: 'This machine runs the server locally' },
  { value: 'web_only', label: 'Web Only', description: 'Connects directly to cloud (PowerSync)' },
];

export function DesktopSettingsTab() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [installationId, setInstallationId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const [appConfig, instId] = await Promise.all([
        getAppConfig(),
        getInstallationId(),
      ]);
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
      toast({ title: 'Settings saved', description: 'Desktop configuration updated. Restart the app for changes to take effect.' });
      await loadConfig();
    } catch {
      toast({ title: 'Save failed', description: 'Failed to update desktop settings.', variant: 'destructive' });
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
    toast({ title: 'Credentials cleared', description: 'Saved login credentials have been removed.' });
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
              placeholder="https://api.vitora.digital"
            />
            <p className="text-xs text-muted-foreground">
              The base URL of the Vitora backend API.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deployment-mode">Deployment Mode</Label>
            <Select value={deploymentMode} onValueChange={(v) => setDeploymentModeState(v as DeploymentMode)}>
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

      {/* Sync & Backup Settings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">Sync & Backup</CardTitle>
            <HelpPopover content="Configure automatic data synchronization and backup intervals. Set to 0 to disable." />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sync-interval">Sync Interval (seconds)</Label>
              <Input
                id="sync-interval"
                type="number"
                min={0}
                value={syncInterval}
                onChange={(e) => setSyncIntervalState(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                How often to sync data. 0 = disabled.
              </p>
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
            <HelpPopover content="Read-only device identifiers used for licensing and sync." />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Installation ID</span>
            <Badge variant="secondary" className="font-mono text-xs">
              {installationId || 'N/A'}
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
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Reset
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
