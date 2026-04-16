'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, PlugZap, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/page-header';
import { inventoryApi } from '@/lib/api/inventory';
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';
import type { ETIMSConfig, ETIMSEnvironment } from '@/lib/types/inventory';

export default function ETIMSConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: configs,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['etims-configs'],
    queryFn: () => inventoryApi.listETIMSConfigs(),
  });

  // Singleton — take first config or null
  const config = configs?.[0] ?? null;
  const isNew = !config;

  // Form state
  const [dvcSrlNo, setDvcSrlNo] = useState('');
  const [tin, setTin] = useState('');
  const [bhfId, setBhfId] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [environment, setEnvironment] = useState<ETIMSEnvironment>('SANDBOX');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (config) {
      setDvcSrlNo(config.dvc_srl_no);
      setTin(config.tin);
      setBhfId(config.bhf_id);
      setApiBaseUrl(config.api_base_url);
      setEnvironment(config.environment);
      setIsActive(config.is_active);
      setApiKey(''); // Never returned by backend
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        dvc_srl_no: dvcSrlNo,
        tin,
        bhf_id: bhfId,
        api_base_url: apiBaseUrl,
        ...(apiKey ? { api_key: apiKey } : {}),
        environment,
        is_active: isActive,
      };
      if (isNew) {
        return inventoryApi.createETIMSConfig(payload);
      }
      return inventoryApi.updateETIMSConfig(config!.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['etims-configs'] });
      toast({ variant: 'success', title: `Configuration ${isNew ? 'created' : 'updated'}` });
      setApiKey('');
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to save configuration',
        description: getApiErrorMessage(err),
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => inventoryApi.testETIMSConnection(config!.id),
    onSuccess: (result) => {
      toast({
        variant: result.success ? 'success' : 'destructive',
        title: result.success ? 'Connection successful' : 'Connection failed',
        description: result.message,
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Connection test failed',
        description: getApiErrorMessage(err),
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load eTIMS configuration.</AlertDescription>
      </Alert>
    );
  }

  const anyPending = saveMutation.isPending || testMutation.isPending;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="eTIMS Configuration"
        helpContent="Configure the KRA eTIMS integration for this facility. eTIMS (electronic Tax Invoice Management System) enables real-time tax invoice reporting to KRA."
        actions={
          !isNew ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={anyPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="mr-1 h-4 w-4" />
              )}
              Test Connection
            </Button>
          ) : undefined
        }
      />

      {/* Status banner */}
      {config && (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">
              {config.environment === 'PRODUCTION' ? 'Production' : 'Sandbox'} Environment
            </p>
            <p className="text-xs text-muted-foreground">
              Last sync: {config.last_sync_at ? new Date(config.last_sync_at).toLocaleString() : 'Never'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={config.is_active ? 'default' : 'secondary'}>
              {config.is_active ? 'Active' : 'Inactive'}
            </Badge>
            <Badge
              variant="outline"
              className={
                config.environment === 'PRODUCTION'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
              }
            >
              {config.environment}
            </Badge>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isNew ? 'Set Up eTIMS' : 'Configuration Details'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="tin">TIN (Tax ID Number) *</Label>
                <Input
                  id="tin"
                  value={tin}
                  onChange={(e) => setTin(e.target.value)}
                  placeholder="e.g., P000000000A"
                  required
                />
              </div>
              <div>
                <Label htmlFor="bhf-id">BHF ID (Branch ID)</Label>
                <Input
                  id="bhf-id"
                  value={bhfId}
                  onChange={(e) => setBhfId(e.target.value)}
                  placeholder="e.g., 00"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="dvc-srl-no">Device Serial Number *</Label>
              <Input
                id="dvc-srl-no"
                value={dvcSrlNo}
                onChange={(e) => setDvcSrlNo(e.target.value)}
                placeholder="eTIMS device serial"
                required
              />
            </div>

            <div>
              <Label htmlFor="api-base-url">API Base URL *</Label>
              <Input
                id="api-base-url"
                type="url"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="https://etims-api.kra.go.ke/etims-api"
                required
              />
            </div>

            <div>
              <Label htmlFor="api-key">
                API Key {isNew ? '*' : '(leave blank to keep current)'}
              </Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isNew ? 'Enter API key' : '••••••••'}
                required={isNew}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="environment">Environment *</Label>
                <Select
                  value={environment}
                  onValueChange={(v) => setEnvironment(v as ETIMSEnvironment)}
                >
                  <SelectTrigger id="environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SANDBOX">
                      <span className="flex items-center gap-1">Sandbox (Testing)</span>
                    </SelectItem>
                    <SelectItem value="PRODUCTION">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> Production
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-1">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 w-fit cursor-default">
                        <Switch
                          checked={isActive}
                          onCheckedChange={setIsActive}
                        />
                        <span className="text-sm font-medium">
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Switch to {isActive ? 'inactive' : 'active'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 mt-4">
          <Button type="submit" disabled={anyPending || !tin || !dvcSrlNo || !apiBaseUrl}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-1 h-4 w-4" />
            {isNew ? 'Create Configuration' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
