'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
} from 'lucide-react';
import { AxiosError } from 'axios';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { theatreApi } from '@/lib/api/theatre';
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';
import type {
  OperatingTheatreCreateData,
  OperatingTheatreList,
  TheatreType,
} from '@/lib/types/theatre';
import { THEATRE_TYPES } from '@/lib/schemas/theatre.schema';
import { TheatreMetricCard, THEATRE_TYPE_LABELS } from '@/components/theatre/theatre-display';
import { OperatingTheatreTable } from '@/components/theatre/operating-theatre-table';
import { OperatingTheatreFormDialog } from '@/components/theatre/operating-theatre-form-dialog';

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

const DEFAULT_FORM: OperatingTheatreCreateData = {
  code: '',
  name: '',
  theatre_type: 'GENERAL',
  location: '',
  has_laminar_flow: false,
  has_cath_lab: false,
  has_image_intensifier: false,
  equipment_notes: '',
  operating_hours_start: '08:00',
  operating_hours_end: '18:00',
  slot_duration_minutes: 30,
  is_active: true,
  maintenance_notes: '',
};

export default function TheatreSettingsPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TheatreType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<OperatingTheatreCreateData>(DEFAULT_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const theatresQuery = useQuery({
    queryKey: ['theatre-settings-theatres'],
    queryFn: () => theatreApi.listTheatres({ page_size: 200 }),
  });

  const theatres = theatresQuery.data?.results ?? [];

  const filteredTheatres = useMemo(() => {
    return theatres.filter((theatre) => {
      const matchesSearch =
        !search ||
        theatre.name.toLowerCase().includes(search.toLowerCase()) ||
        theatre.code.toLowerCase().includes(search.toLowerCase()) ||
        (theatre.location || '').toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'ALL' || theatre.theatre_type === typeFilter;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' ? theatre.is_active : !theatre.is_active);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [search, theatres, typeFilter, statusFilter]);

  const activeCount = theatres.filter((theatre) => theatre.is_active).length;
  const schedulingReadyCount = theatres.filter((theatre) => theatre.has_resource_schedule).length;

  const createMutation = useMutation({
    mutationFn: (data: OperatingTheatreCreateData) => theatreApi.createTheatre(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['theatre-settings-theatres'] });
      toast({ title: 'Operating theatre created' });
      closeDialog();
    },
    onError: (error: unknown) => {
      setFormErrors(extractFieldErrors(error));
      toast({ title: 'Failed to create theatre', description: getApiErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<OperatingTheatreCreateData> }) => theatreApi.updateTheatre(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['theatre-settings-theatres'] });
      toast({ title: 'Operating theatre updated' });
      closeDialog();
    },
    onError: (error: unknown) => {
      setFormErrors(extractFieldErrors(error));
      toast({ title: 'Failed to update theatre', description: getApiErrorMessage(error), variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      theatreApi.updateTheatre(id, { is_active }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['theatre-settings-theatres'] });
      toast({ title: variables.is_active ? 'Theatre activated' : 'Theatre deactivated' });
    },
    onError: (error: unknown) => {
      toast({ title: 'Failed to update theatre status', description: getApiErrorMessage(error), variant: 'destructive' });
    },
  });

  function closeDialog() {
    setOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setFormErrors({});
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setFormErrors({});
    setOpen(true);
  }

  async function openEditDialog(theatre: OperatingTheatreList) {
    setFormErrors({});
    setEditingId(theatre.id);
    setOpen(true);
    const detail = await theatreApi.getTheatre(theatre.id);
    setForm({
      code: detail.code,
      name: detail.name,
      theatre_type: detail.theatre_type,
      location: detail.location,
      has_laminar_flow: detail.has_laminar_flow,
      has_cath_lab: detail.has_cath_lab,
      has_image_intensifier: detail.has_image_intensifier,
      equipment_notes: detail.equipment_notes,
      operating_hours_start: detail.operating_hours_start.slice(0, 5),
      operating_hours_end: detail.operating_hours_end.slice(0, 5),
      slot_duration_minutes: detail.slot_duration_minutes,
      is_active: detail.is_active,
      maintenance_notes: detail.maintenance_notes,
    });
  }

  function updateForm<K extends keyof OperatingTheatreCreateData>(key: K, value: OperatingTheatreCreateData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submitForm() {
    setFormErrors({});
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <PermissionGate
      action="theatre.manage_settings"
      fallback={
        <div className="space-y-4 sm:space-y-6">
          <PageHeader
            title="Theatre Setup"
            helpContent="Configure operating theatres, working hours, capabilities, and the linked scheduling resource bridge used for theatre availability."
          />
          <Card>
            <CardContent className="space-y-4 py-10 text-center">
              <p className="text-base font-medium">Theatre setup is restricted to theatre administrators.</p>
              <p className="text-sm text-muted-foreground">You need the theatre setup permission to manage operating rooms, capabilities, and scheduling linkage.</p>
              <div className="flex justify-center">
                <Button variant="outline" asChild>
                  <Link href="/theatre">Back to Theatre Dashboard</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <PullToRefresh
        onRefresh={() => {
          refresh();
          return queryClient.invalidateQueries({ queryKey: ['theatre-settings-theatres'] });
        }}
        isRefreshing={isRefreshing}
        className="min-h-full"
      >
        <div className="space-y-4 sm:space-y-6">
          <PageHeader
            title="Theatre Setup"
            helpContent="Configure operating theatres, working hours, capabilities, and the linked scheduling resource bridge used for theatre availability."
            actions={
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">New Theatre</span>
              </Button>
            }
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <TheatreMetricCard label="Total theatres" value={theatres.length} />
            <TheatreMetricCard label="Active theatres" value={activeCount} />
            <TheatreMetricCard label="Scheduling ready" value={schedulingReadyCount} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Search by code, name, or location"
              />
            </div>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TheatreType | 'ALL')}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {THEATRE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{THEATRE_TYPE_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'ALL' | 'ACTIVE' | 'INACTIVE')}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <OperatingTheatreTable
            theatres={filteredTheatres}
            isLoading={theatresQuery.isLoading}
            isToggling={toggleMutation.isPending}
            onEdit={openEditDialog}
            onToggle={(theatre) => toggleMutation.mutate({ id: theatre.id, is_active: !theatre.is_active })}
          />

          <OperatingTheatreFormDialog
            open={open}
            editingId={editingId}
            form={form}
            formErrors={formErrors}
            isPending={isPending}
            onOpenChange={(next) => (!next ? closeDialog() : setOpen(next))}
            onFieldChange={updateForm}
            onSubmit={submitForm}
          />
        </div>
      </PullToRefresh>
    </PermissionGate>
  );
}
