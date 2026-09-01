'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { imagingApi } from '@/lib/api/imaging';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { toast } from '@/lib/hooks';
import { Loader2, Network, Save } from 'lucide-react';

type FormState = {
  listener_enabled: boolean;
  ae_title: string;
  bind_host: string;
  port: string;
  allowed_peers: string;
  notes: string;
};

export default function ImagingSettingsPage() {
  const queryClient = useQueryClient();
  const { canPerformAction } = usePermissions();
  const canManage = canPerformAction('imaging.manage_equipment');
  const [form, setForm] = useState<FormState>({
    listener_enabled: false,
    ae_title: 'VITORA',
    bind_host: '0.0.0.0',
    port: '11112',
    allowed_peers: '',
    notes: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['imaging-integration-settings'],
    queryFn: () => imagingApi.getIntegrationSettings(),
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      listener_enabled: data.listener_enabled,
      ae_title: data.ae_title,
      bind_host: data.bind_host,
      port: String(data.port),
      allowed_peers: data.allowed_peers,
      notes: data.notes || '',
    });
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!data) {
        throw new Error('Settings record not loaded');
      }
      return imagingApi.updateIntegrationSettings(data.id, {
        listener_enabled: form.listener_enabled,
        ae_title: form.ae_title,
        bind_host: form.bind_host,
        port: Number(form.port),
        allowed_peers: form.allowed_peers,
        notes: form.notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imaging-integration-settings'] });
      toast({ title: 'Imaging settings saved' });
    },
    onError: (error: unknown) => {
      const detail =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { data?: unknown } }).response?.data
          : undefined;
      const firstError =
        typeof detail === 'object' && detail ? Object.values(detail).flat().find(Boolean) : null;
      toast({
        title: 'Failed to save settings',
        description:
          typeof firstError === 'string' ? firstError : 'Check form values and try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Imaging Integration Settings"
        helpContent="Configure your facility's DICOM listener profile for X-ray/ultrasound/CT/MRI modalities. Save the AE title, bind host, port, and allowed peers used by your device integration runbook."
      />

      {!canManage && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You do not have permission to manage imaging integration settings.
          </CardContent>
        </Card>
      )}

      {canManage && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-4 w-4" />
                DICOM Listener Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading settings...</div>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label htmlFor="listener_enabled" className="text-sm font-medium">
                        Enable inbound C-STORE listener
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Use this when modalities push studies directly to Vitora.
                      </p>
                    </div>
                    <Switch
                      id="listener_enabled"
                      checked={form.listener_enabled}
                      onCheckedChange={(checked) =>
                        setForm((prev) => ({ ...prev, listener_enabled: checked }))
                      }
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="ae_title">AE Title</Label>
                      <Input
                        id="ae_title"
                        value={form.ae_title}
                        maxLength={16}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, ae_title: e.target.value.toUpperCase() }))
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="bind_host">Bind Host</Label>
                      <Input
                        id="bind_host"
                        value={form.bind_host}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, bind_host: e.target.value }))
                        }
                        placeholder="0.0.0.0"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="port">Port</Label>
                      <Input
                        id="port"
                        type="number"
                        min={1}
                        max={65535}
                        value={form.port}
                        onChange={(e) => setForm((prev) => ({ ...prev, port: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="allowed_peers">Allowed Calling AEs</Label>
                      <Input
                        id="allowed_peers"
                        value={form.allowed_peers}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            allowed_peers: e.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="XRAY_ROOM_1,US_CONSOLE_A"
                      />
                      <p className="text-xs text-muted-foreground">
                        Comma-separated AE titles. Leave blank to allow all peers.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      rows={3}
                      value={form.notes}
                      onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Firewall rules, modality IPs, vendor escalation contact..."
                    />
                  </div>

                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p className="mb-1 font-medium">Runbook values</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">AE: {form.ae_title || 'VITORA'}</Badge>
                      <Badge variant="outline">Bind: {form.bind_host || '0.0.0.0'}</Badge>
                      <Badge variant="outline">Port: {form.port || '11112'}</Badge>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() => updateMutation.mutate()}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-1 h-4 w-4" />
                      )}
                      Save Settings
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
