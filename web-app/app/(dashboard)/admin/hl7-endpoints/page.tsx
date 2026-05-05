/**
 * HL7 Endpoints Configuration Page
 *
 * Admin page for managing facility-scoped HL7/MLLP endpoint connections.
 * Allows creating, editing, testing, and toggling endpoints.
 */
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Network,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Pencil,
  Trash2,
  Zap,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { hl7EndpointApi } from '@/lib/api/hl7';
import type { HL7Endpoint, HL7EndpointListItem, HL7EndpointPayload, HL7EndpointType } from '@/lib/types/hl7';

const ENDPOINT_TYPES: { value: HL7EndpointType; label: string }[] = [
  { value: 'LIS', label: 'Laboratory Information System' },
  { value: 'RIS', label: 'Radiology Information System' },
  { value: 'PAS', label: 'Patient Administration System' },
  { value: 'PHARMACY', label: 'Pharmacy System' },
  { value: 'OTHER', label: 'Other' },
];

const DEFAULT_FORM: HL7EndpointPayload = {
  name: '',
  endpoint_type: 'LIS',
  mllp_host: '',
  mllp_port: 2575,
  receiving_application: 'LAB_LIS',
  receiving_facility: '',
  sending_application: 'VITORA_HMIS',
  sending_facility: '',
  lis_code_system: 'LIS_DEFAULT',
  is_active: true,
  use_ssl: false,
  timeout: 30,
  max_retries: 5,
  notes: '',
};

export default function HL7EndpointsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HL7EndpointPayload>(DEFAULT_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  // Fetch endpoints
  const { data, isLoading } = useQuery({
    queryKey: ['hl7-endpoints'],
    queryFn: () => hl7EndpointApi.list({ page_size: 50 }),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: HL7EndpointPayload) => hl7EndpointApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hl7-endpoints'] });
      toast({ title: 'Endpoint created' });
      closeForm();
    },
    onError: () => toast({ title: 'Failed to create endpoint', variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<HL7EndpointPayload> }) =>
      hl7EndpointApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hl7-endpoints'] });
      toast({ title: 'Endpoint updated' });
      closeForm();
    },
    onError: () => toast({ title: 'Failed to update endpoint', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => hl7EndpointApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hl7-endpoints'] });
      toast({ title: 'Endpoint deleted' });
      setDeleteId(null);
    },
    onError: () => toast({ title: 'Failed to delete endpoint', variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => hl7EndpointApi.toggleActive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hl7-endpoints'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => hl7EndpointApi.testConnection(id),
    onMutate: (id) => setTestingId(id),
    onSuccess: (result) => {
      if (result.success) {
        toast({ title: `Connection successful (${result.latency_ms}ms)` });
      } else {
        toast({ title: `Connection failed: ${result.error}`, variant: 'destructive' });
      }
      setTestingId(null);
    },
    onError: () => {
      toast({ title: 'Test failed', variant: 'destructive' });
      setTestingId(null);
    },
  });

  function openCreate() {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(endpoint: HL7EndpointListItem) {
    // Fetch full detail to populate form
    hl7EndpointApi.get(endpoint.id).then((full) => {
      setForm({
        name: full.name,
        endpoint_type: full.endpoint_type,
        mllp_host: full.mllp_host,
        mllp_port: full.mllp_port,
        receiving_application: full.receiving_application,
        receiving_facility: full.receiving_facility,
        sending_application: full.sending_application,
        sending_facility: full.sending_facility,
        lis_code_system: full.lis_code_system,
        is_active: full.is_active,
        use_ssl: full.use_ssl,
        timeout: full.timeout,
        max_retries: full.max_retries,
        notes: full.notes,
      });
      setEditingId(endpoint.id);
      setShowForm(true);
    });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
  }

  function handleSubmit() {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const endpoints = data?.results ?? [];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="HL7 Endpoints"
          helpContent="Configure external system connections (LIS, RIS, etc.) for HL7/MLLP messaging. Each endpoint is scoped to the current facility."
          actions={
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Endpoint
            </Button>
          }
        />

        {/* Endpoints List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : endpoints.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Network className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No endpoints configured</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Add an external system endpoint to start sending HL7 messages.
              </p>
              <Button onClick={openCreate} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Endpoint
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ResponsiveTable
            data={endpoints}
            keyExtractor={(item) => item.id}
            columns={[
              {
                key: 'name',
                header: 'Name',
                sortable: true,
                cell: (item) => (
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.mllp_host}:{item.mllp_port}
                    </p>
                  </div>
                ),
              },
              {
                key: 'endpoint_type',
                header: 'Type',
                sortable: true,
                cell: (item) => (
                  <Badge variant="outline">{item.endpoint_type}</Badge>
                ),
              },
              {
                key: 'receiving_facility',
                header: 'Receiving Facility',
                sortable: true,
                hideOnMobile: true,
                cell: (item) => item.receiving_facility,
              },
              {
                key: 'is_active',
                header: 'Status',
                sortable: true,
                cell: (item) =>
                  item.is_active ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <Wifi className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <WifiOff className="h-3 w-3 mr-1" />
                      Inactive
                    </Badge>
                  ),
              },
              {
                key: 'message_count',
                header: 'Messages',
                sortable: true,
                sortType: 'number',
                hideOnMobile: true,
                cell: (item) => item.message_count,
              },
              {
                key: 'actions',
                header: '',
                cell: (item) => (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); testMutation.mutate(item.id); }}
                      disabled={testingId === item.id}
                      title="Test connection"
                    >
                      {testingId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); }}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ),
              },
            ]}
            mobileCard={(item) => (
              <Card className="p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.mllp_host}:{item.mllp_port} • {item.endpoint_type}
                    </p>
                  </div>
                  {item.is_active ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">Inactive</Badge>
                  )}
                </div>
                <div className="flex gap-1 mt-2">
                  <Button variant="ghost" size="sm" onClick={() => testMutation.mutate(item.id)}>
                    <Zap className="h-3 w-3 mr-1" />Test
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                    <Pencil className="h-3 w-3 mr-1" />Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(item.id)}>
                    <Trash2 className="h-3 w-3 mr-1 text-destructive" />Delete
                  </Button>
                </div>
              </Card>
            )}
          />
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Endpoint' : 'New HL7 Endpoint'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Lancet Lab"
                  />
                </div>
                <div>
                  <Label htmlFor="endpoint_type">Type</Label>
                  <Select
                    value={form.endpoint_type}
                    onValueChange={(v) => setForm({ ...form, endpoint_type: v as HL7EndpointType })}
                  >
                    <SelectTrigger id="endpoint_type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ENDPOINT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch
                    checked={form.is_active ?? true}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                  <Label>Active</Label>
                </div>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Connection</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="mllp_host">Host</Label>
                    <Input
                      id="mllp_host"
                      value={form.mllp_host}
                      onChange={(e) => setForm({ ...form, mllp_host: e.target.value })}
                      placeholder="lis.lab.co.ke"
                    />
                  </div>
                  <div>
                    <Label htmlFor="mllp_port">Port</Label>
                    <Input
                      id="mllp_port"
                      type="number"
                      value={form.mllp_port}
                      onChange={(e) => setForm({ ...form, mllp_port: parseInt(e.target.value) || 2575 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="timeout">Timeout (s)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      value={form.timeout}
                      onChange={(e) => setForm({ ...form, timeout: parseFloat(e.target.value) || 30 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="max_retries">Max Retries</Label>
                    <Input
                      id="max_retries"
                      type="number"
                      value={form.max_retries}
                      onChange={(e) => setForm({ ...form, max_retries: parseInt(e.target.value) || 5 })}
                    />
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Switch
                      checked={form.use_ssl ?? false}
                      onCheckedChange={(v) => setForm({ ...form, use_ssl: v })}
                    />
                    <Label>Use TLS/SSL</Label>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">HL7 Header Fields</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="sending_application">Sending Application</Label>
                    <Input
                      id="sending_application"
                      value={form.sending_application}
                      onChange={(e) => setForm({ ...form, sending_application: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="sending_facility">Sending Facility</Label>
                    <Input
                      id="sending_facility"
                      value={form.sending_facility}
                      onChange={(e) => setForm({ ...form, sending_facility: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="receiving_application">Receiving Application</Label>
                    <Input
                      id="receiving_application"
                      value={form.receiving_application}
                      onChange={(e) => setForm({ ...form, receiving_application: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="receiving_facility">Receiving Facility</Label>
                    <Input
                      id="receiving_facility"
                      value={form.receiving_facility}
                      onChange={(e) => setForm({ ...form, receiving_facility: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="lis_code_system">Code System</Label>
                    <Input
                      id="lis_code_system"
                      value={form.lis_code_system}
                      onChange={(e) => setForm({ ...form, lis_code_system: e.target.value })}
                      placeholder="e.g., LANCET, PATHCARE"
                    />
                  </div>
                </CardContent>
              </Card>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Internal notes about this endpoint..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={closeForm}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={!form.name || !form.mllp_host || createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                )}
                {editingId ? 'Save Changes' : 'Create Endpoint'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Endpoint</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this endpoint configuration. Messages already sent through it will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PullToRefresh>
  );
}
