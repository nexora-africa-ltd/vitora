'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Wrench,
  Monitor,
  HeartPulse,
  Scissors,
  Wind,
  Sparkles,
  Package,
  Loader2,
} from 'lucide-react';
import { AxiosError } from 'axios';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { theatreApi } from '@/lib/api/theatre';
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';
import type {
  TheatreEquipmentTypeCreateData,
  TheatreEquipmentTypeList,
  EquipmentCategory,
} from '@/lib/types/theatre';
import { EQUIPMENT_CATEGORIES } from '@/lib/schemas/theatre.schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EQUIPMENT_CATEGORY_LABELS: Record<string, string> = {
  IMAGING: 'Imaging',
  MONITORING: 'Monitoring',
  SURGICAL_INSTRUMENT: 'Surgical Instrument',
  LIFE_SUPPORT: 'Life Support',
  STERILIZATION: 'Sterilization',
  OTHER: 'Other',
};

const EQUIPMENT_CATEGORY_ICONS: Record<string, typeof Monitor> = {
  IMAGING: Monitor,
  MONITORING: HeartPulse,
  SURGICAL_INSTRUMENT: Scissors,
  LIFE_SUPPORT: Wind,
  STERILIZATION: Sparkles,
  OTHER: Package,
};

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  IMAGING: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  MONITORING: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  SURGICAL_INSTRUMENT: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  LIFE_SUPPORT: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  STERILIZATION: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  OTHER: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};

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

const DEFAULT_FORM: TheatreEquipmentTypeCreateData = {
  name: '',
  code: '',
  category: 'OTHER',
  description: '',
  is_portable: false,
  setup_time_minutes: 0,
  cleanup_time_minutes: 0,
  is_active: true,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TheatreEquipmentPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<EquipmentCategory | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TheatreEquipmentTypeCreateData>(DEFAULT_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const equipmentQuery = useQuery({
    queryKey: ['theatre-equipment-types'],
    queryFn: () => theatreApi.listEquipmentTypes({ page_size: 200 }),
  });

  const allEquipment = equipmentQuery.data?.results ?? [];

  const filteredEquipment = useMemo(() => {
    return allEquipment.filter((eq) => {
      const matchesSearch =
        !search ||
        eq.name.toLowerCase().includes(search.toLowerCase()) ||
        eq.code.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'ALL' || eq.category === categoryFilter;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && eq.is_active) ||
        (statusFilter === 'INACTIVE' && !eq.is_active);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [allEquipment, search, categoryFilter, statusFilter]);

  // Stats
  const activeCount = allEquipment.filter((e) => e.is_active).length;
  const portableCount = allEquipment.filter((e) => e.is_portable).length;
  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const eq of allEquipment) {
      counts[eq.category] = (counts[eq.category] || 0) + 1;
    }
    return counts;
  }, [allEquipment]);

  const createMutation = useMutation({
    mutationFn: (data: TheatreEquipmentTypeCreateData) => theatreApi.createEquipmentType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['theatre-equipment-types'] });
      toast({ title: 'Equipment type created' });
      closeDialog();
    },
    onError: (error) => {
      const fieldErrors = extractFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        setFormErrors(fieldErrors);
      } else {
        toast({ title: 'Error', description: getApiErrorMessage(error), variant: 'destructive' });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TheatreEquipmentTypeCreateData> }) =>
      theatreApi.updateEquipmentType(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['theatre-equipment-types'] });
      toast({ title: 'Equipment type updated' });
      closeDialog();
    },
    onError: (error) => {
      const fieldErrors = extractFieldErrors(error);
      if (Object.keys(fieldErrors).length > 0) {
        setFormErrors(fieldErrors);
      } else {
        toast({ title: 'Error', description: getApiErrorMessage(error), variant: 'destructive' });
      }
    },
  });

  function closeDialog() {
    setOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setFormErrors({});
  }

  function handleEdit(eq: TheatreEquipmentTypeList) {
    setEditingId(eq.id);
    setForm({
      name: eq.name,
      code: eq.code,
      category: eq.category,
      is_portable: eq.is_portable,
      is_active: eq.is_active,
    });
    setFormErrors({});
    setOpen(true);
  }

  function handleSubmit() {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Equipment Types"
          helpContent="Manage the catalogue of surgical equipment types available at this facility. Equipment types can be linked to scheduling resources and assigned to surgery cases."
          actions={
            <Button onClick={() => { setEditingId(null); setForm(DEFAULT_FORM); setFormErrors({}); setOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add Equipment Type</span>
              <span className="sm:hidden">Add</span>
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Total Types</p>
              <p className="text-xl sm:text-2xl font-bold">{allEquipment.length}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{activeCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Portable</p>
              <p className="text-xl sm:text-2xl font-bold">{portableCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Categories</p>
              <p className="text-xl sm:text-2xl font-bold">{Object.keys(categoryBreakdown).length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search equipment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as EquipmentCategory | 'ALL')}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {EQUIPMENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{EQUIPMENT_CATEGORY_LABELS[c] || c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'ALL' | 'ACTIVE' | 'INACTIVE')}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable
          data={filteredEquipment}
          keyExtractor={(eq) => eq.id}
          isLoading={equipmentQuery.isLoading}
          emptyMessage="No equipment types found. Add your first equipment type to get started."
          onRowClick={handleEdit}
          columns={[
            {
              key: 'code',
              header: 'Code',
              sortable: true,
              cell: (eq) => <span className="font-mono text-xs">{eq.code}</span>,
            },
            {
              key: 'name',
              header: 'Name',
              sortable: true,
              cell: (eq) => <span className="font-medium">{eq.name}</span>,
            },
            {
              key: 'category',
              header: 'Category',
              sortable: true,
              cell: (eq) => {
                const Icon = EQUIPMENT_CATEGORY_ICONS[eq.category] || Package;
                return (
                  <Badge className={`text-xs ${CATEGORY_BADGE_STYLES[eq.category] || ''}`}>
                    <Icon className="h-3 w-3 mr-1" />
                    {EQUIPMENT_CATEGORY_LABELS[eq.category] || eq.category}
                  </Badge>
                );
              },
            },
            {
              key: 'is_portable',
              header: 'Portable',
              cell: (eq) => eq.is_portable ? <Badge variant="outline" className="text-xs">Yes</Badge> : <span className="text-muted-foreground text-xs">No</span>,
              hideOnMobile: true,
            },
            {
              key: 'is_active',
              header: 'Status',
              sortable: true,
              cell: (eq) => (
                <Badge className={eq.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs' : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300 text-xs'}>
                  {eq.is_active ? 'Active' : 'Inactive'}
                </Badge>
              ),
            },
          ]}
          mobileCard={(eq) => (
            <Card className="p-3">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{eq.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{eq.code}</p>
                </div>
                <Badge className={`text-xs shrink-0 ${eq.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'}`}>
                  {eq.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={`text-xs ${CATEGORY_BADGE_STYLES[eq.category] || ''}`}>
                  {EQUIPMENT_CATEGORY_LABELS[eq.category] || eq.category}
                </Badge>
                {eq.is_portable && <Badge variant="outline" className="text-xs">Portable</Badge>}
              </div>
            </Card>
          )}
        />

        {/* Create/Edit Dialog */}
        <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>{editingId ? 'Edit' : 'Add'} Equipment Type</DialogTitle>
                <HelpPopover content="Define a type of surgical equipment. Equipment types can later be linked to scheduling resources and assigned to surgery cases." />
              </div>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="eq-code">Code</Label>
                  <Input
                    id="eq-code"
                    placeholder="EQ-CARM-01"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                  {formErrors.code && <p className="text-xs text-destructive">{formErrors.code}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eq-name">Name</Label>
                  <Input
                    id="eq-name"
                    placeholder="C-Arm Fluoroscopy"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{EQUIPMENT_CATEGORY_LABELS[c] || c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eq-desc">Description</Label>
                <Textarea
                  id="eq-desc"
                  placeholder="Optional description..."
                  value={form.description || ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="eq-setup">Setup Time (min)</Label>
                  <Input
                    id="eq-setup"
                    type="number"
                    min={0}
                    value={form.setup_time_minutes ?? 0}
                    onChange={(e) => setForm({ ...form, setup_time_minutes: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eq-cleanup">Cleanup Time (min)</Label>
                  <Input
                    id="eq-cleanup"
                    type="number"
                    min={0}
                    value={form.cleanup_time_minutes ?? 0}
                    onChange={(e) => setForm({ ...form, cleanup_time_minutes: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="eq-portable"
                    checked={form.is_portable ?? false}
                    onCheckedChange={(v) => setForm({ ...form, is_portable: v })}
                  />
                  <Label htmlFor="eq-portable" className="text-sm">Portable</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="eq-active"
                    checked={form.is_active ?? true}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                  <Label htmlFor="eq-active" className="text-sm">Active</Label>
                </div>
              </div>
              {formErrors.non_field_errors && (
                <p className="text-xs text-destructive">{formErrors.non_field_errors}</p>
              )}
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={closeDialog} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSaving || !form.name || !form.code} className="w-full sm:w-auto">
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? 'Save Changes' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
