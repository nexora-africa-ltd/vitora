'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2,
  Thermometer,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wrench,
  Zap,
  Calendar,
  MapPin,
  Tag,
  Hash,
  Factory,
  Edit,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { HelpPopover } from '@/components/shared/help-popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { coldChainApi, temperatureLogApi, incidentApi } from '@/lib/api/immunizations';
import type {
  ColdChainEquipmentStatus,
  ColdChainEquipmentType as EquipmentTypeEnum,
  TemperatureLog,
  VaccineIncidentListItem,
} from '@/lib/types/immunizations';

const statusColors: Record<ColdChainEquipmentStatus, string> = {
  OPERATIONAL: 'bg-green-100 text-green-800',
  FAULTY: 'bg-red-100 text-red-800',
  UNDER_REPAIR: 'bg-yellow-100 text-yellow-800',
  DECOMMISSIONED: 'bg-gray-100 text-gray-800',
};

const statusIcons: Record<ColdChainEquipmentStatus, typeof CheckCircle2> = {
  OPERATIONAL: CheckCircle2,
  FAULTY: XCircle,
  UNDER_REPAIR: Wrench,
  DECOMMISSIONED: XCircle,
};

const equipmentTypeLabels: Record<EquipmentTypeEnum, string> = {
  FRIDGE: 'Refrigerator',
  FREEZER: 'Freezer',
  COLD_BOX: 'Cold Box',
  VACCINE_CARRIER: 'Vaccine Carrier',
  COLD_ROOM: 'Cold Room',
};

const STATUS_OPTIONS: { value: ColdChainEquipmentStatus; label: string }[] = [
  { value: 'OPERATIONAL', label: 'Operational' },
  { value: 'FAULTY', label: 'Faulty' },
  { value: 'UNDER_REPAIR', label: 'Under Repair' },
  { value: 'DECOMMISSIONED', label: 'Decommissioned' },
];

const severityColors: Record<string, string> = {
  LOW: 'bg-blue-100 text-blue-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

const incidentStatusColors: Record<string, string> = {
  OPEN: 'bg-red-100 text-red-800',
  INVESTIGATING: 'bg-yellow-100 text-yellow-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
};

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const equipmentId = Number(params.id);

  // Log temperature dialog
  const [tempDialogOpen, setTempDialogOpen] = useState(false);
  const [tempTouched, setTempTouched] = useState<Record<string, boolean>>({});
  const [temperature, setTemperature] = useState('');
  const [recordedAt, setRecordedAt] = useState(new Date().toISOString().slice(0, 16));
  const [actionTaken, setActionTaken] = useState('');

  // Edit status dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editStatus, setEditStatus] = useState<ColdChainEquipmentStatus>('OPERATIONAL');
  const [editNotes, setEditNotes] = useState('');

  // Fetch equipment detail
  const { data: equipment, isLoading } = useQuery({
    queryKey: ['cold-chain', equipmentId],
    queryFn: () => coldChainApi.get(equipmentId),
    enabled: !isNaN(equipmentId),
  });

  // Fetch temperature logs for this equipment
  const { data: tempData } = useQuery({
    queryKey: ['temp-logs', equipmentId],
    queryFn: () => temperatureLogApi.list({ equipment: equipmentId }),
    enabled: !isNaN(equipmentId),
  });

  // Fetch incidents (filtered client-side for this equipment)
  const { data: incidentData } = useQuery({
    queryKey: ['incidents', 'all'],
    queryFn: () => incidentApi.list({ ordering: '-occurred_at' }),
    enabled: !isNaN(equipmentId),
  });

  const logs = tempData?.results || [];
  const allIncidents = incidentData?.results || [];
  // Note: M2M filtering not available server-side; show all incidents for now
  const incidents = allIncidents;
  const excursionCount = logs.filter((l) => l.is_excursion).length;
  const latestTemp = logs[0];

  // Log temperature mutation
  const logTempMutation = useMutation({
    mutationFn: () =>
      temperatureLogApi.create({
        equipment: equipmentId,
        temperature: parseFloat(temperature),
        recorded_at: new Date(recordedAt).toISOString(),
        action_taken: actionTaken || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temp-logs', equipmentId] });
      queryClient.invalidateQueries({ queryKey: ['cold-chain'] });
      toast({ title: 'Temperature Logged', description: 'Reading has been recorded.' });
      setTempDialogOpen(false);
      resetTempForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to log temperature.', variant: 'destructive' });
    },
  });

  // Update equipment mutation
  const updateMutation = useMutation({
    mutationFn: () =>
      coldChainApi.update(equipmentId, {
        status: editStatus,
        notes: editNotes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cold-chain', equipmentId] });
      queryClient.invalidateQueries({ queryKey: ['cold-chain'] });
      toast({ title: 'Equipment Updated', description: 'Status has been updated.' });
      setEditDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update equipment.', variant: 'destructive' });
    },
  });

  function resetTempForm() {
    setTempTouched({});
    setTemperature('');
    setRecordedAt(new Date().toISOString().slice(0, 16));
    setActionTaken('');
  }

  function openEditDialog() {
    if (equipment) {
      setEditStatus(equipment.status);
      setEditNotes(equipment.notes);
    }
    setEditDialogOpen(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-2">
        <p className="text-muted-foreground">Equipment not found.</p>
        <Button variant="outline" onClick={() => router.push('/immunizations/cold-chain')}>
          Back to Cold Chain
        </Button>
      </div>
    );
  }

  const StatusIcon = statusIcons[equipment.status];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={equipment.name}
          helpContent="View equipment details, temperature history, and linked incidents. Log temperature readings and update equipment status."
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={openEditDialog}>
                <Edit className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
              <Button size="sm" onClick={() => setTempDialogOpen(true)}>
                <Thermometer className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Log Temp</span>
                <span className="sm:hidden">Log</span>
              </Button>
            </div>
          }
        />

        {/* Summary Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {equipmentTypeLabels[equipment.equipment_type]}
              <span className="text-muted-foreground"> • S/N: {equipment.serial_number}</span>
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {equipment.min_temp}°C – {equipment.max_temp}°C
              {equipment.location && ` • ${equipment.location}`}
            </p>
          </div>
          <Badge className={`${statusColors[equipment.status]} shrink-0 w-fit self-start sm:self-auto`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {equipment.status.replace('_', ' ')}
          </Badge>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative pt-3 pb-3">
              <p className="text-2xl font-bold">{logs.length}</p>
              <p className="text-xs text-muted-foreground">Temp Readings</p>
            </CardContent>
          </Card>
          {excursionCount > 0 && (
            <Card className="border-orange-200">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <p className="text-2xl font-bold text-orange-600">{excursionCount}</p>
                </div>
                <p className="text-xs text-muted-foreground">Excursions</p>
              </CardContent>
            </Card>
          )}
          {latestTemp && (
            <Card className={latestTemp.is_excursion ? 'border-red-200' : ''}>
              <CardContent className="pt-3 pb-3">
                <p className={`text-2xl font-bold font-mono ${latestTemp.is_excursion ? 'text-destructive' : ''}`}>
                  {latestTemp.temperature}°C
                </p>
                <p className="text-xs text-muted-foreground">Latest Reading</p>
              </CardContent>
            </Card>
          )}
          {incidents.length > 0 && (
            <Card className="border-red-200">
              <CardContent className="pt-3 pb-3">
                <p className="text-2xl font-bold text-destructive">{incidents.length}</p>
                <p className="text-xs text-muted-foreground">Incidents</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Equipment Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Equipment Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{equipmentTypeLabels[equipment.equipment_type]}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-muted-foreground">Serial Number</p>
                  <p className="font-medium font-mono">{equipment.serial_number}</p>
                </div>
              </div>
              {equipment.model_number && (
                <div className="flex items-start gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-muted-foreground">Model Number</p>
                    <p className="font-medium">{equipment.model_number}</p>
                  </div>
                </div>
              )}
              {equipment.manufacturer && (
                <div className="flex items-start gap-2">
                  <Factory className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-muted-foreground">Manufacturer</p>
                    <p className="font-medium">{equipment.manufacturer}</p>
                  </div>
                </div>
              )}
              {equipment.location && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-muted-foreground">Location</p>
                    <p className="font-medium">{equipment.location}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Thermometer className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-muted-foreground">Temp Range</p>
                  <p className="font-medium font-mono">{equipment.min_temp}°C – {equipment.max_temp}°C</p>
                </div>
              </div>
              {equipment.capacity_litres != null && (
                <div className="flex items-start gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-muted-foreground">Capacity</p>
                    <p className="font-medium">{equipment.capacity_litres} litres</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-muted-foreground">Power</p>
                  <p className="font-medium">
                    {equipment.power_source || 'Not specified'}
                    {equipment.has_backup_power && ' (+ backup)'}
                  </p>
                </div>
              </div>
            </div>

            {/* Maintenance dates */}
            {(equipment.installation_date || equipment.last_maintenance_date || equipment.next_maintenance_date) && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Maintenance Schedule
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  {equipment.installation_date && (
                    <div>
                      <p className="text-muted-foreground">Installed</p>
                      <p className="font-medium">{formatDate(equipment.installation_date)}</p>
                    </div>
                  )}
                  {equipment.last_maintenance_date && (
                    <div>
                      <p className="text-muted-foreground">Last Maintenance</p>
                      <p className="font-medium">{formatDate(equipment.last_maintenance_date)}</p>
                    </div>
                  )}
                  {equipment.next_maintenance_date && (
                    <div>
                      <p className="text-muted-foreground">Next Maintenance</p>
                      <p className={`font-medium ${new Date(equipment.next_maintenance_date) < new Date() ? 'text-destructive' : ''}`}>
                        {formatDate(equipment.next_maintenance_date)}
                        {new Date(equipment.next_maintenance_date) < new Date() && ' (overdue)'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {equipment.notes && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{equipment.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Temperature History */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Temperature History</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setTempDialogOpen(true)}>
              <Thermometer className="h-3.5 w-3.5 mr-1" /> Log
            </Button>
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 sm:px-0">No temperature readings recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[450px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pl-6 sm:pl-0 font-medium">Temp</th>
                      <th className="pb-2 font-medium">Recorded</th>
                      <th className="pb-2 font-medium">By</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 pr-6 sm:pr-0 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className={`border-b last:border-0 ${log.is_excursion ? 'bg-red-50' : ''}`}>
                        <td className="py-2 pl-6 sm:pl-0 font-mono font-medium">
                          <span className={log.is_excursion ? 'text-destructive' : ''}>
                            {log.temperature}°C
                          </span>
                        </td>
                        <td className="py-2">{formatDateTime(log.recorded_at)}</td>
                        <td className="py-2">{log.recorded_by_name || '—'}</td>
                        <td className="py-2">
                          {log.is_excursion ? (
                            <Badge variant="destructive" className="text-xs">Excursion</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 text-xs">Normal</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-6 sm:pr-0 max-w-[200px] truncate">
                          {log.action_taken || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Linked Incidents */}
        {incidents.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Linked Incidents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push('/immunizations/incidents')}
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{inc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(inc.occurred_at)}
                        {inc.doses_lost > 0 && ` • ${inc.doses_lost} doses lost`}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Badge className={`${severityColors[inc.severity] || ''} text-xs w-fit`}>
                        {inc.severity}
                      </Badge>
                      <Badge className={`${incidentStatusColors[inc.status] || ''} text-xs w-fit`}>
                        {inc.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Log Temperature Dialog */}
        <Dialog open={tempDialogOpen} onOpenChange={setTempDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Log Temperature</DialogTitle>
                <HelpPopover content="Record a temperature reading. Excursion alerts are triggered automatically if the reading falls outside the acceptable range." />
              </div>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Equipment: <span className="font-medium text-foreground">{equipment.name}</span>
                <span className="text-xs ml-1">({equipment.min_temp}°C – {equipment.max_temp}°C)</span>
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

        {/* Edit Status Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Edit Equipment</DialogTitle>
                <HelpPopover content="Update equipment status and notes. Mark equipment as faulty, under repair, or decommissioned." />
              </div>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <div>
                <Label>Status <span className="text-destructive">*</span></Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ColdChainEquipmentStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Equipment notes..."
                  rows={3}
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
