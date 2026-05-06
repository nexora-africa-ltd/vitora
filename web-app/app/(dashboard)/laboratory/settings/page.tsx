'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { laboratoryApi } from '@/lib/api/laboratory';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Settings2,
  Cpu,
  Plus,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Instrument, InterfaceType } from '@/lib/types/laboratory';

const interfaceTypeLabels: Record<InterfaceType, string> = {
  HL7_MLLP: 'HL7 v2 (MLLP)',
  ASTM: 'ASTM / LIS2-A2',
  FHIR: 'FHIR R4',
  MANUAL: 'Manual Entry',
};

export default function LaboratorySettingsPage() {
  const queryClient = useQueryClient();
  const { refresh, isRefreshing } = usePageRefresh();
  const [tab, setTab] = useState('instruments');
  const [showInstrumentDialog, setShowInstrumentDialog] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null);

  // --- Queries ---
  const { data: instruments = [], isLoading: instrumentsLoading } = useQuery<Instrument[]>({
    queryKey: ['instruments'],
    queryFn: () => laboratoryApi.listInstruments(),
  });

  // --- Mutations ---
  const createInstrument = useMutation({
    mutationFn: (data: Partial<Instrument>) => laboratoryApi.createInstrument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
      toast.success('Instrument registered successfully');
      setShowInstrumentDialog(false);
      setEditingInstrument(null);
    },
    onError: () => toast.error('Failed to create instrument'),
  });

  const updateInstrument = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Instrument> }) =>
      laboratoryApi.updateInstrument(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
      toast.success('Instrument updated');
      setShowInstrumentDialog(false);
      setEditingInstrument(null);
    },
    onError: () => toast.error('Failed to update instrument'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      laboratoryApi.updateInstrument(id, { is_active }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['instruments'] });
      toast.success(variables.is_active ? 'Instrument activated' : 'Instrument deactivated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const handleEdit = (instrument: Instrument) => {
    setEditingInstrument(instrument);
    setShowInstrumentDialog(true);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Lab Settings"
          helpContent="Manage laboratory instruments, equipment registry, and configuration. Instruments registered here can be linked to analyzer channels, QC runs, and result entries."
          actions={
            <Button onClick={() => { setEditingInstrument(null); setShowInstrumentDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Add Instrument</span>
              <span className="sm:hidden">Add</span>
            </Button>
          }
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="instruments" className="gap-1.5">
              <Cpu className="h-4 w-4" />
              <span className="hidden sm:inline">Instruments</span>
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-1.5">
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
          </TabsList>

          {/* Instruments Tab */}
          <TabsContent value="instruments" className="mt-4">
            {instruments.length === 0 && !instrumentsLoading ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Cpu className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No instruments registered</h3>
                  <p className="text-sm text-muted-foreground max-w-md mb-6">
                    Register your laboratory analyzers and equipment here. Instruments can then be linked to
                    analyzer channels for automated result interfacing, and to QC runs for quality monitoring.
                  </p>
                  <Button onClick={() => { setEditingInstrument(null); setShowInstrumentDialog(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Register First Instrument
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base sm:text-lg">Instruments & Equipment</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {instruments.filter((i) => i.is_active).length} active of {instruments.length} total
                  </p>
                </CardHeader>
                <CardContent className="px-0 sm:px-6">
                  <ResponsiveTable
                    data={instruments}
                    keyExtractor={(inst) => inst.id}
                    isLoading={instrumentsLoading}
                    columns={[
                      {
                        key: 'code',
                        header: 'Code',
                        sortable: true,
                        cell: (inst) => (
                          <span className="font-mono text-sm">{inst.code}</span>
                        ),
                      },
                      {
                        key: 'name',
                        header: 'Name',
                        sortable: true,
                        cell: (inst) => (
                          <div>
                            <p className="font-medium">{inst.name}</p>
                            {inst.manufacturer && (
                              <p className="text-xs text-muted-foreground">
                                {inst.manufacturer}
                                {inst.model ? ` ${inst.model}` : ''}
                              </p>
                            )}
                          </div>
                        ),
                      },
                      {
                        key: 'department',
                        header: 'Department',
                        sortable: true,
                        cell: (inst) => inst.department || <span className="text-muted-foreground">—</span>,
                        hideOnMobile: true,
                      },
                      {
                        key: 'interface_type',
                        header: 'Interface',
                        sortable: true,
                        cell: (inst) => (
                          <Badge variant="outline">{inst.interface_type_display}</Badge>
                        ),
                        hideOnMobile: true,
                      },
                      {
                        key: 'is_active',
                        header: 'Status',
                        sortable: true,
                        cell: (inst) => (
                          <Badge
                            className={
                              inst.is_active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                            }
                          >
                            {inst.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        ),
                      },
                      {
                        key: 'actions',
                        header: '',
                        cell: (inst) => (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Edit"
                              onClick={(e) => { e.stopPropagation(); handleEdit(inst); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title={inst.is_active ? 'Deactivate' : 'Activate'}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleActive.mutate({ id: inst.id, is_active: !inst.is_active });
                              }}
                            >
                              {inst.is_active ? (
                                <PowerOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Power className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                          </div>
                        ),
                      },
                    ]}
                    mobileCard={(inst) => (
                      <div className="flex items-center justify-between p-3">
                        <div>
                          <p className="font-medium">{inst.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {inst.code} • {inst.interface_type_display}
                            {inst.department ? ` • ${inst.department}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={`shrink-0 w-fit ${
                              inst.is_active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                            }`}
                          >
                            {inst.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(inst)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* General Settings Tab */}
          <TabsContent value="general" className="mt-4">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Settings2 className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">General Lab Settings</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Additional configuration options (result templates, department mappings, notification preferences)
                  will be available here in a future update.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add/Edit Instrument Dialog */}
        <InstrumentFormDialog
          open={showInstrumentDialog}
          onOpenChange={(v) => { setShowInstrumentDialog(v); if (!v) setEditingInstrument(null); }}
          instrument={editingInstrument}
          onSubmit={(data) => {
            if (editingInstrument) {
              updateInstrument.mutate({ id: editingInstrument.id, data });
            } else {
              createInstrument.mutate(data);
            }
          }}
          isLoading={createInstrument.isPending || updateInstrument.isPending}
        />
      </div>
    </PullToRefresh>
  );
}

// =============================================================================
// Instrument Form Dialog
// =============================================================================

function InstrumentFormDialog({
  open,
  onOpenChange,
  instrument,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instrument: Instrument | null;
  onSubmit: (data: Partial<Instrument>) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    manufacturer: '',
    model: '',
    serial_number: '',
    department: '',
    interface_type: 'MANUAL' as InterfaceType,
    is_active: true,
  });

  // Reset form when dialog opens or instrument changes
  const handleOpenChange = (v: boolean) => {
    if (v && instrument) {
      setFormData({
        code: instrument.code,
        name: instrument.name,
        manufacturer: instrument.manufacturer || '',
        model: instrument.model || '',
        serial_number: instrument.serial_number || '',
        department: instrument.department || '',
        interface_type: instrument.interface_type,
        is_active: instrument.is_active,
      });
    } else if (v) {
      setFormData({
        code: '',
        name: '',
        manufacturer: '',
        model: '',
        serial_number: '',
        department: '',
        interface_type: 'MANUAL',
        is_active: true,
      });
    }
    onOpenChange(v);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;
    onSubmit(formData);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{instrument ? 'Edit Instrument' : 'Register Instrument'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Code & Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inst-code">Code *</Label>
              <Input
                id="inst-code"
                className="mt-1 font-mono"
                placeholder="e.g. SYS-XN1000"
                value={formData.code}
                onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                disabled={!!instrument}
              />
              {!instrument && (
                <p className="text-xs text-muted-foreground mt-0.5">Unique identifier, cannot be changed later</p>
              )}
            </div>
            <div>
              <Label htmlFor="inst-name">Name *</Label>
              <Input
                id="inst-name"
                className="mt-1"
                placeholder="e.g. Sysmex XN-1000"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
          </div>

          {/* Manufacturer & Model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inst-mfr">Manufacturer</Label>
              <Input
                id="inst-mfr"
                className="mt-1"
                placeholder="e.g. Sysmex"
                value={formData.manufacturer}
                onChange={(e) => setFormData((prev) => ({ ...prev, manufacturer: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="inst-model">Model</Label>
              <Input
                id="inst-model"
                className="mt-1"
                placeholder="e.g. XN-1000"
                value={formData.model}
                onChange={(e) => setFormData((prev) => ({ ...prev, model: e.target.value }))}
              />
            </div>
          </div>

          {/* Serial & Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inst-serial">Serial Number</Label>
              <Input
                id="inst-serial"
                className="mt-1"
                placeholder="e.g. SN-2024-001"
                value={formData.serial_number}
                onChange={(e) => setFormData((prev) => ({ ...prev, serial_number: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="inst-dept">Department</Label>
              <Input
                id="inst-dept"
                className="mt-1"
                placeholder="e.g. Hematology"
                value={formData.department}
                onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value }))}
              />
            </div>
          </div>

          {/* Interface Type */}
          <div>
            <Label htmlFor="inst-interface">Interface Type</Label>
            <Select
              value={formData.interface_type}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, interface_type: v as InterfaceType }))}
            >
              <SelectTrigger id="inst-interface" className="mt-1">
                <SelectValue placeholder="Select interface..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Manual Entry</SelectItem>
                <SelectItem value="ASTM">ASTM / LIS2-A2</SelectItem>
                <SelectItem value="HL7_MLLP">HL7 v2 (MLLP)</SelectItem>
                <SelectItem value="FHIR">FHIR R4</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-0.5">
              How this instrument communicates with the LIS
            </p>
          </div>

          {/* Active Toggle (edit mode only) */}
          {instrument && (
            <div className="flex items-center gap-3 pt-2">
              <Switch
                id="inst-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="inst-active" className="text-sm">
                {formData.is_active ? 'Active' : 'Inactive'}
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.code || !formData.name}
            >
              {isLoading && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              {instrument ? 'Save Changes' : 'Register Instrument'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
