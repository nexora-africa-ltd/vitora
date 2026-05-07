/**
 * DHIS2/KHIS Settings Tab Component
 *
 * Manage DHIS2 connection configurations per organization.
 * Allows admins to create, edit, test, and delete DHIS2 configs.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Pencil,
  Trash2,
  Wifi,
  Plus,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { HelpPopover } from '@/components/shared/help-popover';
import { useToast } from '@/lib/hooks/use-toast';
import { dhis2Api } from '@/lib/api/dhis2';
import type {
  DHIS2ConfigListItem,
  DHIS2ConfigCreateData,
  DHIS2ConfigUpdateData,
  DHIS2Environment,
} from '@/lib/types/dhis2';

const ENVIRONMENT_LABELS: Record<DHIS2Environment, string> = {
  local: 'Local (dev/test)',
  staging: 'Staging',
  production: 'Production (KHIS)',
};

export function DHIS2SettingsTab() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<DHIS2ConfigListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DHIS2ConfigListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: '',
    base_url: '',
    username: '',
    password: '',
    environment: 'production' as DHIS2Environment,
    is_active: true,
  });

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dhis2Api.list();
      setConfigs(data.results);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load DHIS2 configurations.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      base_url: 'https://hiskenya.org',
      username: '',
      password: '',
      environment: 'production',
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (config: DHIS2ConfigListItem) => {
    setEditing(config);
    setForm({
      name: config.name,
      base_url: config.base_url,
      username: config.username,
      password: '',
      environment: config.environment,
      is_active: config.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        const update: DHIS2ConfigUpdateData = {
          name: form.name,
          base_url: form.base_url,
          username: form.username,
          environment: form.environment,
          is_active: form.is_active,
        };
        if (form.password) update.password = form.password;
        await dhis2Api.update(editing.id, update);
        toast({ title: 'Updated', description: 'DHIS2 configuration updated.' });
      } else {
        const create: DHIS2ConfigCreateData = {
          name: form.name,
          base_url: form.base_url,
          username: form.username,
          password: form.password,
          environment: form.environment,
          is_active: form.is_active,
        };
        await dhis2Api.create(create);
        toast({ title: 'Created', description: 'DHIS2 configuration created.' });
      }
      setDialogOpen(false);
      fetchConfigs();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save DHIS2 configuration.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await dhis2Api.remove(id);
      toast({ title: 'Deleted', description: 'DHIS2 configuration removed.' });
      fetchConfigs();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete configuration.',
        variant: 'destructive',
      });
    }
  };

  const handleTestConnection = async (id: number) => {
    setTesting(id);
    try {
      const result = await dhis2Api.testConnection(id);
      if (result.status === 'ok') {
        toast({
          title: 'Connection Successful',
          description: `Authenticated as ${result.dhis2_user || 'unknown'}${result.server_version ? ` (DHIS2 v${result.server_version})` : ''}`,
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: result.detail || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Connection Failed',
        description: 'Could not reach the DHIS2 server.',
        variant: 'destructive',
      });
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base sm:text-lg">DHIS2 / KHIS Connections</CardTitle>
            <HelpPopover content="Configure DHIS2 (Kenya Health Information System) credentials for automated MOH report submission, IDSR surveillance, and AEFI reporting." />
          </div>
          <Button size="sm" onClick={openCreate} className="w-full sm:w-auto gap-1.5">
            <Plus className="h-4 w-4" />
            Add Connection
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : configs.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Server className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p>No DHIS2 connections configured.</p>
              <p className="mt-1">Add a connection to enable automated health reporting.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{config.name}</span>
                      <Badge
                        variant={config.is_active ? 'default' : 'secondary'}
                        className="shrink-0"
                      >
                        {config.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="outline" className="shrink-0">
                        {ENVIRONMENT_LABELS[config.environment]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {config.base_url} &middot; {config.username}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(config.id)}
                      disabled={testing === config.id}
                      className="gap-1"
                    >
                      {testing === config.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wifi className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">Test</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(config)}
                      className="gap-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Edit</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(config.id)}
                      className="gap-1 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>
                {editing ? 'Edit DHIS2 Connection' : 'New DHIS2 Connection'}
              </DialogTitle>
              <HelpPopover content="Enter the DHIS2 instance URL and credentials. For KHIS (Kenya), the URL is typically https://hiskenya.org." />
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="dhis2-name">Name</Label>
              <Input
                id="dhis2-name"
                placeholder="e.g. Mombasa Sub-County KHIS"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dhis2-url">Base URL</Label>
              <Input
                id="dhis2-url"
                type="url"
                placeholder="https://hiskenya.org"
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dhis2-username">Username</Label>
                <Input
                  id="dhis2-username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dhis2-password">
                  Password {editing && '(leave blank to keep)'}
                </Label>
                <Input
                  id="dhis2-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editing}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dhis2-env">Environment</Label>
              <Select
                value={form.environment}
                onValueChange={(v) =>
                  setForm({ ...form, environment: v as DHIS2Environment })
                }
              >
                <SelectTrigger id="dhis2-env">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Production (KHIS)</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="local">Local (dev/test)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label>{form.is_active ? 'Active' : 'Inactive'}</Label>
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.base_url || !form.username || (!editing && !form.password)}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Saving...
                </>
              ) : editing ? (
                'Update'
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
