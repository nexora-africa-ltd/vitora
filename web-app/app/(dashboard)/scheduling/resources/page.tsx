'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Loader2,
  User,
  MapPin,
  Box,
  Power,
  PowerOff,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/dialog';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { resourcesApi } from '@/lib/api/scheduling';
import type { ResourceType, ResourceListItem, ResourceCreateData } from '@/lib/types/scheduling';

const typeIcons: Record<ResourceType, React.ReactNode> = {
  PERSON: <User className="h-4 w-4" />,
  PLACE: <MapPin className="h-4 w-4" />,
  ASSET: <Box className="h-4 w-4" />,
};

const typeColors: Record<ResourceType, string> = {
  PERSON: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PLACE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  ASSET: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

const TYPE_OPTIONS: { value: ResourceType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'PERSON', label: 'Person' },
  { value: 'PLACE', label: 'Place' },
  { value: 'ASSET', label: 'Asset' },
];

export default function SchedulingResourcesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const [typeFilter, setTypeFilter] = useState<ResourceType | ''>('');
  const [showCreate, setShowCreate] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState<ResourceType>('PLACE');
  const [formCapacity, setFormCapacity] = useState('1');
  const [formDescription, setFormDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['scheduling-resources', typeFilter],
    queryFn: () =>
      resourcesApi.list({
        resource_type: typeFilter || undefined,
        page_size: 200,
        ordering: 'resource_type,name',
      }),
  });

  const resources = data?.results || [];

  const createMutation = useMutation({
    mutationFn: (d: ResourceCreateData) => resourcesApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-resources'] });
      toast({ title: 'Resource Created', description: 'Scheduling resource has been created.' });
      closeDialog();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create resource.', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: number; data: Partial<ResourceCreateData> }) =>
      resourcesApi.update(id, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-resources'] });
      toast({ title: 'Resource Updated' });
      closeDialog();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update resource.', variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      resourcesApi.update(id, { is_active }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-resources'] });
      toast({ title: vars.is_active ? 'Resource Activated' : 'Resource Deactivated' });
    },
  });

  function closeDialog() {
    setShowCreate(false);
    setEditingId(null);
    setFormName('');
    setFormCode('');
    setFormType('PLACE');
    setFormCapacity('1');
    setFormDescription('');
  }

  function openEdit(r: ResourceListItem) {
    setEditingId(r.id);
    setFormName(r.name);
    setFormCode(r.code);
    setFormType(r.resource_type);
    setFormCapacity('1');
    setFormDescription('');
    // Fetch full resource for capacity/description
    resourcesApi.get(r.id).then((full) => {
      setFormCapacity(full.capacity.toString());
      setFormDescription(full.description);
    });
    setShowCreate(true);
  }

  function handleSubmit() {
    const data: ResourceCreateData = {
      name: formName,
      code: formCode,
      resource_type: formType,
      capacity: parseInt(formCapacity, 10) || 1,
      description: formDescription,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const canSubmit = formName.trim() && formCode.trim();
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Scheduling Resources"
          helpContent="Manage schedulable resources — rooms, clinics, staff, and equipment. Resources are used by the scheduling module for appointments. Immunizations require an IMM-CLINIC resource to auto-generate vaccination appointments."
          actions={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Add Resource</span>
              <span className="sm:hidden">Add</span>
            </Button>
          }
        />

        {/* Filter */}
        <div className="flex flex-wrap gap-2">
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v === '_all' ? '' : (v as ResourceType))}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable
          data={resources}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          onRowClick={openEdit}
          emptyMessage="No scheduling resources found. Create one to get started."
          defaultSortColumn="name"
          defaultSortDirection="asc"
          columns={[
            {
              key: 'name',
              header: 'Name',
              sortable: true,
              cell: (r) => (
                <div className="flex items-center gap-2">
                  {typeIcons[r.resource_type]}
                  <span className="font-medium">{r.name}</span>
                </div>
              ),
            },
            {
              key: 'code',
              header: 'Code',
              sortable: true,
              cell: (r) => <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.code}</code>,
            },
            {
              key: 'resource_type',
              header: 'Type',
              sortable: true,
              cell: (r) => (
                <Badge className={`${typeColors[r.resource_type]} shrink-0 w-fit`}>
                  {r.resource_type}
                </Badge>
              ),
              hideOnMobile: true,
            },
            {
              key: 'is_active',
              header: 'Status',
              sortable: true,
              sortFn: (a, b) => Number(a.is_active) - Number(b.is_active),
              cell: (r) => (
                <Button
                  size="sm"
                  variant="ghost"
                  className={r.is_active ? 'text-green-600' : 'text-muted-foreground'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMutation.mutate({ id: r.id, is_active: !r.is_active });
                  }}
                >
                  {r.is_active ? (
                    <><Power className="h-3.5 w-3.5 mr-1" /> Active</>
                  ) : (
                    <><PowerOff className="h-3.5 w-3.5 mr-1" /> Inactive</>
                  )}
                </Button>
              ),
            },
          ]}
          mobileCard={(r: ResourceListItem) => (
            <Card className="p-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2 min-w-0">
                  {typeIcons[r.resource_type]}
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.name}</p>
                    <code className="text-xs text-muted-foreground">{r.code}</code>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={`${typeColors[r.resource_type]} w-fit`}>
                    {r.resource_type}
                  </Badge>
                  <Badge
                    variant={r.is_active ? 'default' : 'outline'}
                    className="w-fit"
                  >
                    {r.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </Card>
          )}
        />

        {/* Create / Edit Dialog */}
        <Dialog open={showCreate} onOpenChange={(open) => { if (!open) closeDialog(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>{editingId ? 'Edit Resource' : 'Create Resource'}</DialogTitle>
                <HelpPopover content="Resources represent schedulable items — clinic rooms (PLACE), staff members (PERSON), or equipment (ASSET). Each resource needs a unique code within the facility." />
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Immunization Clinic"
                  />
                </div>
                <div>
                  <Label>Code <span className="text-destructive">*</span></Label>
                  <Input
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="e.g. IMM-CLINIC"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={formType} onValueChange={(v) => setFormType(v as ResourceType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERSON">Person (Staff)</SelectItem>
                      <SelectItem value="PLACE">Place (Room/Clinic)</SelectItem>
                      <SelectItem value="ASSET">Asset (Equipment)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Capacity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={2}
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {editingId ? 'Save Changes' : 'Create Resource'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
