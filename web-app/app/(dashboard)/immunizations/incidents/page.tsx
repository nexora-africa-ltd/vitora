'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Plus,
  CheckCircle2,
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
import { incidentApi } from '@/lib/api/immunizations';
import type {
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
  VaccineIncidentListItem,
} from '@/lib/types/immunizations';

const severityColors: Record<IncidentSeverity, string> = {
  LOW: 'bg-blue-100 text-blue-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

const statusColors: Record<IncidentStatus, string> = {
  OPEN: 'bg-red-100 text-red-800',
  INVESTIGATING: 'bg-yellow-100 text-yellow-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
};

const incidentTypeLabels: Record<IncidentType, string> = {
  POWER_OUTAGE: 'Power Outage',
  COLD_CHAIN_BREAK: 'Cold Chain Break',
  EQUIPMENT_FAILURE: 'Equipment Failure',
  STOCK_DAMAGE: 'Stock Damage',
  THEFT: 'Theft',
  EXPIRED_STOCK: 'Expired Stock',
  OTHER: 'Other',
};

const INCIDENT_TYPE_OPTIONS: { value: IncidentType; label: string }[] = [
  { value: 'POWER_OUTAGE', label: 'Power Outage' },
  { value: 'COLD_CHAIN_BREAK', label: 'Cold Chain Break' },
  { value: 'EQUIPMENT_FAILURE', label: 'Equipment Failure' },
  { value: 'STOCK_DAMAGE', label: 'Stock Damage' },
  { value: 'THEFT', label: 'Theft' },
  { value: 'EXPIRED_STOCK', label: 'Expired Stock' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITY_OPTIONS: { value: IncidentSeverity; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const STATUS_FILTER: { value: IncidentStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'INVESTIGATING', label: 'Investigating' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const SEVERITY_FILTER: { value: IncidentSeverity | ''; label: string }[] = [
  { value: '', label: 'All Severities' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

export default function IncidentsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | ''>('');
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | ''>('');

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState('');
  const [incidentType, setIncidentType] = useState<IncidentType>('COLD_CHAIN_BREAK');
  const [severity, setSeverity] = useState<IncidentSeverity>('MEDIUM');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [dosesAffected, setDosesAffected] = useState('');
  const [dosesLost, setDosesLost] = useState('');

  // Resolve dialog
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveTouched, setResolveTouched] = useState<Record<string, boolean>>({});
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [resolveTitle, setResolveTitle] = useState('');
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [preventiveActions, setPreventiveActions] = useState('');
  const [resolveDosesLost, setResolveDosesLost] = useState('');

  // Fetch incidents
  const { data, isLoading } = useQuery({
    queryKey: ['incidents', statusFilter, severityFilter],
    queryFn: () =>
      incidentApi.list({
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        ordering: '-occurred_at',
      }),
  });

  const incidents = data?.results || [];

  // Stats
  const openCount = incidents.filter((i) => i.status === 'OPEN' || i.status === 'INVESTIGATING').length;
  const totalDosesLost = incidents.reduce((sum, i) => sum + i.doses_lost, 0);
  const criticalCount = incidents.filter((i) => i.severity === 'CRITICAL' && i.status !== 'CLOSED').length;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: () =>
      incidentApi.create({
        title,
        incident_type: incidentType,
        severity,
        description,
        occurred_at: new Date(occurredAt).toISOString(),
        doses_affected: dosesAffected ? parseInt(dosesAffected, 10) : undefined,
        doses_lost: dosesLost ? parseInt(dosesLost, 10) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast({ title: 'Incident Reported', description: 'Vaccine incident has been recorded.' });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to report incident.', variant: 'destructive' });
    },
  });

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: () =>
      incidentApi.resolve(resolveId!, {
        corrective_actions: correctiveActions,
        preventive_actions: preventiveActions || undefined,
        doses_lost: resolveDosesLost ? parseInt(resolveDosesLost, 10) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast({ title: 'Incident Resolved', description: 'Incident has been marked as resolved.' });
      setResolveDialogOpen(false);
      resetResolveForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to resolve incident.', variant: 'destructive' });
    },
  });

  function resetForm() {
    setTouched({});
    setTitle('');
    setIncidentType('COLD_CHAIN_BREAK');
    setSeverity('MEDIUM');
    setDescription('');
    setOccurredAt(new Date().toISOString().slice(0, 16));
    setDosesAffected('');
    setDosesLost('');
  }

  function resetResolveForm() {
    setResolveTouched({});
    setResolveId(null);
    setResolveTitle('');
    setCorrectiveActions('');
    setPreventiveActions('');
    setResolveDosesLost('');
  }

  function openResolveDialog(incident: VaccineIncidentListItem) {
    setResolveId(incident.id);
    setResolveTitle(incident.title);
    setResolveDialogOpen(true);
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Vaccine Incidents"
          helpContent="Report and track vaccine incidents including power outages, cold chain breaks, equipment failures, stock damage, and theft. Document corrective/preventive actions and doses lost."
          actions={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Report Incident</span>
              <span className="sm:hidden">Report</span>
            </Button>
          }
        />

        {/* Summary stats */}
        {incidents.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
              <CardContent className="relative pt-3 pb-3">
                <p className="text-2xl font-bold">{incidents.length}</p>
                <p className="text-xs text-muted-foreground">Total Incidents</p>
              </CardContent>
            </Card>
            {openCount > 0 && (
              <Card className="border-red-200">
                <CardContent className="pt-3 pb-3">
                  <p className="text-2xl font-bold text-destructive">{openCount}</p>
                  <p className="text-xs text-muted-foreground">Open / Investigating</p>
                </CardContent>
              </Card>
            )}
            {criticalCount > 0 && (
              <Card className="border-red-200">
                <CardContent className="pt-3 pb-3">
                  <p className="text-2xl font-bold text-destructive">{criticalCount}</p>
                  <p className="text-xs text-muted-foreground">Critical Active</p>
                </CardContent>
              </Card>
            )}
            {totalDosesLost > 0 && (
              <Card className="border-orange-200">
                <CardContent className="pt-3 pb-3">
                  <p className="text-2xl font-bold text-orange-600">{totalDosesLost.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Doses Lost</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v === '_all' ? '' : (v as IncidentStatus))}
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
          <Select
            value={severityFilter}
            onValueChange={(v) => setSeverityFilter(v === '_all' ? '' : (v as IncidentSeverity))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_FILTER.map((opt) => (
                <SelectItem key={opt.value} value={opt.value || '_all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Incidents table */}
        <ResponsiveTable
          data={incidents}
          keyExtractor={(i) => i.id}
          isLoading={isLoading}
          emptyMessage="No vaccine incidents reported."
          defaultSortColumn="occurred_at"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'title',
              header: 'Incident',
              sortable: true,
              cell: (i) => (
                <div>
                  <p className="font-medium">{i.title}</p>
                  <p className="text-xs text-muted-foreground">{incidentTypeLabels[i.incident_type]}</p>
                </div>
              ),
            },
            {
              key: 'occurred_at',
              header: 'Date',
              sortable: true,
              sortType: 'date',
              cell: (i) => <span className="text-sm">{formatDate(i.occurred_at)}</span>,
              hideOnMobile: true,
            },
            {
              key: 'severity',
              header: 'Severity',
              sortable: true,
              cell: (i) => (
                <Badge className={`${severityColors[i.severity]} shrink-0 w-fit`}>
                  {i.severity}
                </Badge>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (i) => (
                <Badge className={`${statusColors[i.status]} shrink-0 w-fit`}>
                  {i.status}
                </Badge>
              ),
            },
            {
              key: 'doses_lost',
              header: 'Doses Lost',
              sortable: true,
              sortType: 'number',
              cell: (i) => (
                <span className={`text-sm ${i.doses_lost > 0 ? 'text-destructive font-medium' : ''}`}>
                  {i.doses_lost > 0 ? i.doses_lost.toLocaleString() : '—'}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'actions',
              header: '',
              cell: (i) =>
                (i.status === 'OPEN' || i.status === 'INVESTIGATING') ? (
                  <Button size="sm" variant="ghost" onClick={() => openResolveDialog(i)}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null,
            },
          ]}
          mobileCard={(i: VaccineIncidentListItem) => (
            <Card className="p-3">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <p className="font-medium truncate">{i.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {incidentTypeLabels[i.incident_type]} • {formatDate(i.occurred_at)}
                  </p>
                  {i.doses_lost > 0 && (
                    <p className="text-xs text-destructive mt-1">{i.doses_lost} doses lost</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={`${severityColors[i.severity]} shrink-0 w-fit text-xs`}>
                    {i.severity}
                  </Badge>
                  <Badge className={`${statusColors[i.status]} shrink-0 w-fit text-xs`}>
                    {i.status}
                  </Badge>
                  {(i.status === 'OPEN' || i.status === 'INVESTIGATING') && (
                    <Button size="sm" variant="ghost" onClick={() => openResolveDialog(i)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}
        />

        {/* Report Incident Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Report Vaccine Incident</DialogTitle>
                <HelpPopover content="Report a vaccine supply chain incident. Include the type, severity, and estimated doses affected. Critical incidents should also be reported to county authorities." />
              </div>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <div>
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, title: true }))}
                  placeholder="e.g. Power outage in pharmacy store"
                  className={touched.title && !title ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {touched.title && !title && <p className="text-xs text-destructive mt-1">Title is required</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Incident Type <span className="text-destructive">*</span></Label>
                  <Select value={incidentType} onValueChange={(v) => setIncidentType(v as IncidentType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INCIDENT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Severity <span className="text-destructive">*</span></Label>
                  <Select value={severity} onValueChange={(v) => setSeverity(v as IncidentSeverity)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Occurred At <span className="text-destructive">*</span></Label>
                <Input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </div>
              <div>
                <Label>Description <span className="text-destructive">*</span></Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, description: true }))}
                  placeholder="Describe what happened, how it was discovered, and immediate impact..."
                  rows={3}
                  className={touched.description && !description ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {touched.description && !description && <p className="text-xs text-destructive mt-1">Description is required</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Doses Affected</Label>
                  <Input type="number" value={dosesAffected} onChange={(e) => setDosesAffected(e.target.value)} placeholder="Estimated total" />
                </div>
                <div>
                  <Label>Doses Lost</Label>
                  <Input type="number" value={dosesLost} onChange={(e) => setDosesLost(e.target.value)} placeholder="Confirmed lost" />
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!title || !description || createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Report Incident
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Resolve Incident Dialog */}
        <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Resolve Incident</DialogTitle>
                <HelpPopover content="Document corrective and preventive actions taken. Update the final count of doses lost." />
              </div>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Incident: <span className="font-medium text-foreground">{resolveTitle}</span>
              </p>
              <div>
                <Label>Corrective Actions <span className="text-destructive">*</span></Label>
                <Textarea
                  value={correctiveActions}
                  onChange={(e) => setCorrectiveActions(e.target.value)}
                  onBlur={() => setResolveTouched((t) => ({ ...t, correctiveActions: true }))}
                  placeholder="Describe what was done to address the incident..."
                  rows={3}
                  className={resolveTouched.correctiveActions && !correctiveActions ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {resolveTouched.correctiveActions && !correctiveActions && <p className="text-xs text-destructive mt-1">Corrective actions are required</p>}
              </div>
              <div>
                <Label>Preventive Actions</Label>
                <Textarea
                  value={preventiveActions}
                  onChange={(e) => setPreventiveActions(e.target.value)}
                  placeholder="Describe measures to prevent recurrence..."
                  rows={2}
                />
              </div>
              <div>
                <Label>Final Doses Lost</Label>
                <Input
                  type="number"
                  value={resolveDosesLost}
                  onChange={(e) => setResolveDosesLost(e.target.value)}
                  placeholder="Confirmed total doses lost"
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => resolveMutation.mutate()}
                  disabled={!correctiveActions || resolveMutation.isPending}
                >
                  {resolveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Resolve
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
