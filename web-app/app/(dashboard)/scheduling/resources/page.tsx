'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Loader2,
  User,
  MapPin,
  Box,
  Power,
  PowerOff,
  RefreshCw,
  Users,
  Building2,
  BedDouble,
  ChevronRight,
  Pencil,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { resourcesApi } from '@/lib/api/scheduling';
import { departmentsApi } from '@/lib/api/rbac';
import { getApiErrorMessage } from '@/lib/api/client';
import { AxiosError } from 'axios';
import type { ResourceType, ResourceListItem, ResourceCreateData } from '@/lib/types/scheduling';
import { cn } from '@/lib/utils/cn';

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

const GROUP_CONFIG: Record<ResourceType, { label: string; description: string }> = {
  PERSON: { label: 'Staff', description: 'Doctors, nurses, lab technicians' },
  PLACE: { label: 'Places', description: 'Rooms, clinics, wards' },
  ASSET: { label: 'Assets', description: 'Beds, machines, equipment' },
};

const TYPE_ORDER: ResourceType[] = ['PERSON', 'PLACE', 'ASSET'];

const TYPE_OPTIONS: { value: ResourceType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'PERSON', label: 'Staff (Person)' },
  { value: 'PLACE', label: 'Places' },
  { value: 'ASSET', label: 'Assets' },
];

/** Extract per-field error strings from a DRF 400 response. */
function extractFieldErrors(error: unknown): Record<string, string> {
  if (error instanceof AxiosError && error.response?.status === 400) {
    const data = error.response.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const errors: Record<string, string> = {};
      for (const [field, msgs] of Object.entries(data as Record<string, unknown>)) {
        if (Array.isArray(msgs) && msgs.length > 0 && typeof msgs[0] === 'string') {
          errors[field] = msgs[0];
        } else if (typeof msgs === 'string') {
          errors[field] = msgs;
        }
      }
      return errors;
    }
  }
  return {};
}

export default function SchedulingResourcesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const [typeFilter, setTypeFilter] = useState<ResourceType | ''>('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState<ResourceType>('PLACE');
  const [formCapacity, setFormCapacity] = useState('1');
  const [formDescription, setFormDescription] = useState('');
  const [formDepartment, setFormDepartment] = useState<string>('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Track which groups are open (all open by default)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    PERSON: true,
    PLACE: true,
    ASSET: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['scheduling-resources', typeFilter],
    queryFn: () =>
      resourcesApi.list({
        resource_type: typeFilter || undefined,
        page_size: 500,
        ordering: 'resource_type,name',
      }),
  });

  const { data: departmentsData } = useQuery({
    queryKey: ['departments-list'],
    queryFn: () => departmentsApi.list({ page_size: 200, is_active: true }),
  });

  const departments = departmentsData?.results || [];

  const resources = data?.results || [];

  // Client-side search filter + grouping
  const grouped = useMemo(() => {
    const filtered = search
      ? resources.filter(
          (r) =>
            r.name.toLowerCase().includes(search.toLowerCase()) ||
            r.code.toLowerCase().includes(search.toLowerCase()),
        )
      : resources;

    const groups: Partial<Record<ResourceType, ResourceListItem[]>> = {};
    for (const r of filtered) {
      (groups[r.resource_type] ??= []).push(r);
    }
    return groups;
  }, [resources, search]);

  const visibleTypes = TYPE_ORDER.filter((t) => (grouped[t]?.length ?? 0) > 0);

  const createMutation = useMutation({
    mutationFn: (d: ResourceCreateData) => resourcesApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-resources'] });
      toast({ title: 'Resource Created', description: 'Scheduling resource has been created.' });
      closeDialog();
    },
    onError: (error: unknown) => {
      const fieldErrors = extractFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        setFormErrors(fieldErrors);
      }
      toast({ title: 'Error', description: getApiErrorMessage(error), variant: 'destructive' });
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
    onError: (error: unknown) => {
      const fieldErrors = extractFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        setFormErrors(fieldErrors);
      }
      toast({ title: 'Error', description: getApiErrorMessage(error), variant: 'destructive' });
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

  const syncStaffMutation = useMutation({
    mutationFn: () => resourcesApi.syncFromStaff(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-resources'] });
      toast({ title: 'Staff Synced', description: result.message });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to sync staff.', variant: 'destructive' }),
  });

  const syncClinicsMutation = useMutation({
    mutationFn: () => resourcesApi.syncFromClinics(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-resources'] });
      toast({ title: 'Clinics Synced', description: result.message });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to sync clinics.', variant: 'destructive' }),
  });

  const syncWardsMutation = useMutation({
    mutationFn: () => resourcesApi.syncFromWards(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling-resources'] });
      toast({ title: 'Wards Synced', description: result.message });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to sync wards.', variant: 'destructive' }),
  });

  const isSyncing = syncStaffMutation.isPending || syncClinicsMutation.isPending || syncWardsMutation.isPending;

  function closeDialog() {
    setShowCreate(false);
    setEditingId(null);
    setFormName('');
    setFormCode('');
    setFormType('PLACE');
    setFormCapacity('1');
    setFormDescription('');
    setFormDepartment('');
    setFormErrors({});
  }

  function openEdit(r: ResourceListItem) {
    setEditingId(r.id);
    setFormName(r.name);
    setFormCode(r.code);
    setFormType(r.resource_type);
    setFormCapacity('1');
    setFormDescription('');
    setFormDepartment(r.department?.toString() || '');
    // Fetch full resource for capacity/description
    resourcesApi.get(r.id).then((full) => {
      setFormCapacity(full.capacity.toString());
      setFormDescription(full.description);
    });
    setShowCreate(true);
  }

  function handleSubmit() {
    setFormErrors({});
    const data: ResourceCreateData = {
      name: formName,
      code: formCode,
      resource_type: formType,
      capacity: formType === 'PERSON' ? 1 : (parseInt(formCapacity, 10) || 1),
      description: formDescription,
      department: formDepartment ? parseInt(formDepartment, 10) : null,
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
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={isSyncing}>
                    {isSyncing ? (
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    <span className="hidden sm:inline">Sync</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => syncStaffMutation.mutate()} disabled={isSyncing}>
                    <Users className="h-4 w-4 mr-2" />
                    Sync Staff Profiles
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => syncClinicsMutation.mutate()} disabled={isSyncing}>
                    <Building2 className="h-4 w-4 mr-2" />
                    Sync Clinics
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => syncWardsMutation.mutate()} disabled={isSyncing}>
                    <BedDouble className="h-4 w-4 mr-2" />
                    Sync Wards
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Add Resource</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
          }
        />

        {/* Filter bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:w-56"
          />
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
          <div className="text-sm text-muted-foreground tabular-nums ml-auto hidden sm:block">
            {resources.length} resource{resources.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Grouped collapsible sections */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : visibleTypes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Box className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No resources match your search.' : 'No scheduling resources found. Create one to get started.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleTypes.map((type) => {
              const items = grouped[type] ?? [];
              const config = GROUP_CONFIG[type];
              const isOpen = openGroups[type] ?? true;

              return (
                <Collapsible
                  key={type}
                  open={isOpen}
                  onOpenChange={(open) =>
                    setOpenGroups((prev) => ({ ...prev, [type]: open }))
                  }
                >
                  <Card className="overflow-hidden">
                    <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                          isOpen && 'rotate-90',
                        )}
                      />
                      <div className="flex items-center gap-2">
                        <Badge className={cn(typeColors[type], 'gap-1')}>
                          {typeIcons[type]}
                          {config.label}
                        </Badge>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          ({items.length})
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground ml-auto hidden sm:block">
                        {config.description}
                      </span>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      {/* Desktop table */}
                      <div className="hidden md:block border-t">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Code</TableHead>
                                <TableHead className="w-[100px]">Status</TableHead>
                                <TableHead className="w-[60px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map((r) => (
                                <TableRow
                                  key={r.id}
                                  className="cursor-pointer"
                                  onClick={() => router.push(`/scheduling/resources/${r.id}`)}
                                >
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {typeIcons[r.resource_type]}
                                      <span className="font-medium">{r.name}</span>
                                      {r.department_name && (
                                        <span className="text-xs text-muted-foreground">
                                          • {r.department_name}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                      {r.code}
                                    </code>
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className={cn(
                                        'h-7 px-2',
                                        r.is_active ? 'text-green-600' : 'text-muted-foreground',
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleMutation.mutate({
                                          id: r.id,
                                          is_active: !r.is_active,
                                        });
                                      }}
                                    >
                                      {r.is_active ? (
                                        <><Power className="h-3.5 w-3.5 mr-1" />Active</>
                                      ) : (
                                        <><PowerOff className="h-3.5 w-3.5 mr-1" />Inactive</>
                                      )}
                                    </Button>
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEdit(r);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      <span className="sr-only">Edit</span>
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      {/* Mobile cards */}
                      <div className="md:hidden border-t divide-y">
                        {items.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50"
                            onClick={() => router.push(`/scheduling/resources/${r.id}`)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {typeIcons[r.resource_type]}
                              <div className="min-w-0">
                                <p className="font-medium truncate text-sm">{r.name}</p>
                                <code className="text-xs text-muted-foreground">{r.code}</code>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge
                                variant={r.is_active ? 'default' : 'outline'}
                                className="shrink-0 w-fit"
                              >
                                {r.is_active ? 'Active' : 'Off'}
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(r);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="sr-only">Edit</span>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        )}

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
                  <Label>Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (formErrors.name) setFormErrors((prev) => { const { name: _, ...rest } = prev; return rest; });
                    }}
                    placeholder={
                      formType === 'PERSON' ? 'e.g. Dr. Jane Doe' :
                      formType === 'ASSET' ? 'e.g. MRI Machine 1' :
                      'e.g. Consultation Room 1'
                    }
                    className={formErrors.name ? 'border-destructive' : ''}
                  />
                  {formErrors.name && (
                    <p className="text-xs text-destructive mt-1">{formErrors.name}</p>
                  )}
                </div>
              </div>
              <div className={cn('grid gap-3', formType === 'PERSON' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
                <div>
                  <Label>Code <span className="text-destructive">*</span></Label>
                  <Input
                    value={formCode}
                    onChange={(e) => {
                      setFormCode(e.target.value.toUpperCase());
                      if (formErrors.code) setFormErrors((prev) => { const { code: _, ...rest } = prev; return rest; });
                    }}
                    placeholder={
                      formType === 'PERSON' ? 'e.g. STAFF-001' :
                      formType === 'ASSET' ? 'e.g. MRI-01' :
                      'e.g. ROOM-101'
                    }
                    className={formErrors.code ? 'border-destructive' : ''}
                  />
                  {formErrors.code && (
                    <p className="text-xs text-destructive mt-1">{formErrors.code}</p>
                  )}
                </div>
                {formType !== 'PERSON' && (
                  <div>
                    <Label>
                      Capacity
                      <span className="text-xs text-muted-foreground font-normal ml-1">
                        {formType === 'ASSET' ? '(units available)' : '(concurrent patients)'}
                      </span>
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={formCapacity}
                      onChange={(e) => setFormCapacity(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {formType !== 'PERSON' && (
                <div>
                  <Label>Department</Label>
                  <Select value={formDepartment} onValueChange={(v) => setFormDepartment(v === '_none' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No department</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id.toString()}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
