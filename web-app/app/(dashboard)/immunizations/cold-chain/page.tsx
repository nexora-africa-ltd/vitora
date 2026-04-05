'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Plus,
  Thermometer,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { HelpPopover } from '@/components/shared/help-popover';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { coldChainApi, temperatureLogApi } from '@/lib/api/immunizations';
import type {
  ColdChainEquipmentType,
  ColdChainEquipmentStatus,
  ColdChainEquipmentListItem,
  TemperatureLog,
} from '@/lib/types/immunizations';

const statusColors: Record<ColdChainEquipmentStatus, string> = {
  OPERATIONAL: 'bg-green-100 text-green-800',
  FAULTY: 'bg-red-100 text-red-800',
  UNDER_REPAIR: 'bg-yellow-100 text-yellow-800',
  DECOMMISSIONED: 'bg-gray-100 text-gray-800',
};

const equipmentTypeLabels: Record<ColdChainEquipmentType, string> = {
  FRIDGE: 'Fridge',
  FREEZER: 'Freezer',
  COLD_BOX: 'Cold Box',
  VACCINE_CARRIER: 'Vaccine Carrier',
  COLD_ROOM: 'Cold Room',
};

const EQUIPMENT_TYPE_OPTIONS: { value: ColdChainEquipmentType; label: string }[] = [
  { value: 'FRIDGE', label: 'Fridge' },
  { value: 'FREEZER', label: 'Freezer' },
  { value: 'COLD_BOX', label: 'Cold Box' },
  { value: 'VACCINE_CARRIER', label: 'Vaccine Carrier' },
  { value: 'COLD_ROOM', label: 'Cold Room' },
];

const STATUS_OPTIONS: { value: ColdChainEquipmentStatus; label: string }[] = [
  { value: 'OPERATIONAL', label: 'Operational' },
  { value: 'FAULTY', label: 'Faulty' },
  { value: 'UNDER_REPAIR', label: 'Under Repair' },
  { value: 'DECOMMISSIONED', label: 'Decommissioned' },
];

const STATUS_FILTER: { value: ColdChainEquipmentStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  ...STATUS_OPTIONS,
];

export default function ColdChainPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const [statusFilter, setStatusFilter] = useState<ColdChainEquipmentStatus | ''>('');

  // Add equipment dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [equipmentType, setEquipmentType] = useState<ColdChainEquipmentType>('FRIDGE');
  const [serialNumber, setSerialNumber] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [manufacturer, setManufacturer] = useState('');
  const [location, setLocation] = useState('');
  const [minTemp, setMinTemp] = useState('2');
  const [maxTemp, setMaxTemp] = useState('8');
  const [powerSource, setPowerSource] = useState('');
  const [hasBackupPower, setHasBackupPower] = useState(false);

  // Log temperature dialog
  const [tempDialogOpen, setTempDialogOpen] = useState(false);
  const [tempTouched, setTempTouched] = useState<Record<string, boolean>>({});
  const [tempEquipmentId, setTempEquipmentId] = useState<number | null>(null);
  const [tempEquipmentName, setTempEquipmentName] = useState('');
  const [temperature, setTemperature] = useState('');
  const [recordedAt, setRecordedAt] = useState(new Date().toISOString().slice(0, 16));
  const [actionTaken, setActionTaken] = useState('');

  // Fetch equipment
  const { data, isLoading } = useQuery({
    queryKey: ['cold-chain', statusFilter],
    queryFn: () =>
      coldChainApi.list({
        status: statusFilter || undefined,
      }),
  });

  // Fetch recent temperature logs
  const { data: tempData } = useQuery({
    queryKey: ['temp-logs-recent'],
    queryFn: () => temperatureLogApi.list({ is_excursion: true }),
  });

  const equipment = data?.results || [];
  const excursions = tempData?.results || [];

  // Stats
  const operationalCount = equipment.filter((e) => e.status === 'OPERATIONAL').length;
  const faultyCount = equipment.filter((e) => e.status === 'FAULTY' || e.status === 'UNDER_REPAIR').length;

  // Create equipment mutation
  const createMutation = useMutation({
    mutationFn: () =>
      coldChainApi.create({
        name,
        equipment_type: equipmentType,
        serial_number: serialNumber,
        manufacturer: manufacturer || undefined,
        location: location || undefined,
        min_temp: parseFloat(minTemp),
        max_temp: parseFloat(maxTemp),
        power_source: powerSource || undefined,
        has_backup_power: hasBackupPower,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cold-chain'] });
      toast({ title: 'Equipment Added', description: 'Cold chain equipment has been registered.' });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add equipment.', variant: 'destructive' });
    },
  });

  // Log temperature mutation
  const logTempMutation = useMutation({
    mutationFn: () =>
      temperatureLogApi.create({
        equipment: tempEquipmentId!,
        temperature: parseFloat(temperature),
        recorded_at: new Date(recordedAt).toISOString(),
        action_taken: actionTaken || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cold-chain'] });
      queryClient.invalidateQueries({ queryKey: ['temp-logs-recent'] });
      toast({ title: 'Temperature Logged', description: 'Reading has been recorded.' });
      setTempDialogOpen(false);
      resetTempForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to log temperature.', variant: 'destructive' });
    },
  });

  function resetForm() {
    setName('');
    setEquipmentType('FRIDGE');
    setSerialNumber('');
    setTouched({});
    setManufacturer('');
    setLocation('');
    setMinTemp('2');
    setMaxTemp('8');
    setPowerSource('');
    setHasBackupPower(false);
  }

  function resetTempForm() {
    setTempTouched({});
    setTempEquipmentId(null);
    setTempEquipmentName('');
    setTemperature('');
    setRecordedAt(new Date().toISOString().slice(0, 16));
    setActionTaken('');
  }

  function openTempDialog(equipmentId: number, equipmentName: string) {
    setTempEquipmentId(equipmentId);
    setTempEquipmentName(equipmentName);
    setTempDialogOpen(true);
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Cold Chain"
          helpContent="Monitor cold chain equipment (fridges, freezers, cold boxes). Log temperatures, track excursions, and ensure vaccine storage meets WHO/KEPI standards (+2°C to +8°C for most vaccines)."
          actions={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Add Equipment</span>
              <span className="sm:hidden">Add</span>
            </Button>
          }
        />

        {/* Summary stats */}
        {equipment.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardContent className="relative pt-3 pb-3">
                <p className="text-2xl font-bold">{equipment.length}</p>
                <p className="text-xs text-muted-foreground">Total Equipment</p>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardContent className="relative pt-3 pb-3">
                <p className="text-2xl font-bold text-green-600">{operationalCount}</p>
                <p className="text-xs text-muted-foreground">Operational</p>
              </CardContent>
            </Card>
            {faultyCount > 0 && (
              <Card className="border-red-200">
                <CardContent className="pt-3 pb-3">
                  <p className="text-2xl font-bold text-destructive">{faultyCount}</p>
                  <p className="text-xs text-muted-foreground">Faulty / Under Repair</p>
                </CardContent>
              </Card>
            )}
            {excursions.length > 0 && (
              <Card className="border-orange-200">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <p className="text-2xl font-bold text-orange-600">{excursions.length}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Temp Excursions</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v === '_all' ? '' : (v as ColdChainEquipmentStatus))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER.map((opt) => (
                <SelectItem key={opt.value} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Equipment table */}
        <ResponsiveTable
          data={equipment}
          keyExtractor={(e) => e.id}
          onRowClick={(e) => router.push(`/immunizations/cold-chain/${e.id}`)}
          isLoading={isLoading}
          emptyMessage="No cold chain equipment registered."
          defaultSortColumn="name"
          defaultSortDirection="asc"
          columns={[
            {
              key: 'name',
              header: 'Equipment',
              sortable: true,
              cell: (e) => (
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{equipmentTypeLabels[e.equipment_type]} • {e.serial_number || 'No S/N'}</p>
                </div>
              ),
            },
            {
              key: 'location',
              header: 'Location',
              sortable: true,
              cell: (e) => <span className="text-sm">{e.location || '—'}</span>,
              hideOnMobile: true,
            },
            {
              key: 'temp_range',
              header: 'Temp Range',
              cell: (e) => (
                <span className="text-sm font-mono">
                  {e.min_temp}°C – {e.max_temp}°C
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (e) => (
                <Badge className={`${statusColors[e.status]} shrink-0 w-fit`}>
                  {e.status.replace('_', ' ')}
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: '',
              cell: (e) => (
                <Button size="sm" variant="ghost" onClick={() => openTempDialog(e.id, e.name)}>
                  <Thermometer className="h-3.5 w-3.5" />
                </Button>
              ),
            },
          ]}
          mobileCard={(e: ColdChainEquipmentListItem) => (
            <Card className="p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => router.push(`/immunizations/cold-chain/${e.id}`)}>
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {equipmentTypeLabels[e.equipment_type]} • {e.serial_number || 'No S/N'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {e.min_temp}°C – {e.max_temp}°C
                    {e.location ? ` • ${e.location}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={`${statusColors[e.status]} shrink-0 w-fit text-xs`}>
                    {e.status.replace('_', ' ')}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => openTempDialog(e.id, e.name)}>
                    <Thermometer className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        />

        {/* Add Equipment Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Add Cold Chain Equipment</DialogTitle>
                <HelpPopover content="Register a fridge, freezer, cold box, or cold room. Set the acceptable temperature range for monitoring." />
              </div>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <div>
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="e.g. Main Vaccine Fridge"
                  className={touched.name && !name ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {touched.name && !name && <p className="text-xs text-destructive mt-1">Name is required</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Type <span className="text-destructive">*</span></Label>
                  <Select value={equipmentType} onValueChange={(v) => setEquipmentType(v as ColdChainEquipmentType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EQUIPMENT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Serial Number <span className="text-destructive">*</span></Label>
                  <Input
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, serialNumber: true }))}
                    placeholder="e.g. VF-2024-0031"
                    className={touched.serialNumber && !serialNumber ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {touched.serialNumber && !serialNumber && <p className="text-xs text-destructive mt-1">Serial number is required</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Manufacturer</Label>
                  <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Pharmacy Store" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Min Temp (°C)</Label>
                  <Input type="number" step="0.1" value={minTemp} onChange={(e) => setMinTemp(e.target.value)} />
                </div>
                <div>
                  <Label>Max Temp (°C)</Label>
                  <Input type="number" step="0.1" value={maxTemp} onChange={(e) => setMaxTemp(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Power Source</Label>
                  <Input value={powerSource} onChange={(e) => setPowerSource(e.target.value)} placeholder="e.g. Mains + Solar" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasBackupPower}
                      onChange={(e) => setHasBackupPower(e.target.checked)}
                      className="rounded"
                    />
                    Has backup power
                  </label>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!name || !serialNumber || createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Add Equipment
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Log Temperature Dialog */}
        <Dialog open={tempDialogOpen} onOpenChange={setTempDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Log Temperature</DialogTitle>
                <HelpPopover content="Record a temperature reading for this equipment. An excursion alert is triggered automatically if the reading falls outside the acceptable range." />
              </div>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Equipment: <span className="font-medium text-foreground">{tempEquipmentName}</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Temperature (°C) <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    onBlur={() => setTempTouched((t) => ({ ...t, temperature: true }))}
                    placeholder="e.g. 4.5"
                    className={tempTouched.temperature && !temperature ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {tempTouched.temperature && !temperature && <p className="text-xs text-destructive mt-1">Temperature is required</p>}
                </div>
                <div>
                  <Label>Recorded At <span className="text-destructive">*</span></Label>
                  <Input
                    type="datetime-local"
                    value={recordedAt}
                    onChange={(e) => setRecordedAt(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Action Taken (if excursion)</Label>
                <Textarea
                  value={actionTaken}
                  onChange={(e) => setActionTaken(e.target.value)}
                  placeholder="Describe corrective action if temperature was out of range..."
                  rows={2}
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setTempDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => logTempMutation.mutate()}
                  disabled={!temperature || logTempMutation.isPending}
                >
                  {logTempMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Log Reading
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
