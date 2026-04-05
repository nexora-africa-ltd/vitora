'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { HelpPopover } from '@/components/shared/help-popover';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { aefiApi } from '@/lib/api/immunizations';
import type {
  AEFIEventType,
  AEFISeverity,
  AEFIListItem,
} from '@/lib/types/immunizations';

const severityColors: Record<AEFISeverity, string> = {
  MILD: 'bg-green-100 text-green-800',
  MODERATE: 'bg-yellow-100 text-yellow-800',
  SEVERE: 'bg-red-100 text-red-800',
};

const eventTypeLabels: Record<AEFIEventType, string> = {
  LOCAL_REACTION: 'Local Reaction',
  SYSTEMIC_REACTION: 'Systemic Reaction',
  SEVERE: 'Severe Adverse Event',
  DEATH: 'Death',
};

const SEVERITY_FILTER: { value: AEFISeverity | ''; label: string }[] = [
  { value: '', label: 'All Severities' },
  { value: 'MILD', label: 'Mild' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'SEVERE', label: 'Severe' },
];

const EVENT_TYPE_OPTIONS: { value: AEFIEventType; label: string }[] = [
  { value: 'LOCAL_REACTION', label: 'Local Reaction' },
  { value: 'SYSTEMIC_REACTION', label: 'Systemic Reaction' },
  { value: 'SEVERE', label: 'Severe Adverse Event' },
  { value: 'DEATH', label: 'Death' },
];

const SEVERITY_OPTIONS: { value: AEFISeverity; label: string }[] = [
  { value: 'MILD', label: 'Mild' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'SEVERE', label: 'Severe' },
];

export default function AEFIPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const [severityFilter, setSeverityFilter] = useState<AEFISeverity | ''>('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [immunizationRecordId, setImmunizationRecordId] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]!);
  const [eventType, setEventType] = useState<AEFIEventType>('LOCAL_REACTION');
  const [severity, setSeverity] = useState<AEFISeverity>('MILD');
  const [description, setDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['aefi', severityFilter],
    queryFn: () =>
      aefiApi.list({
        severity: severityFilter || undefined,
        ordering: '-event_date',
      }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      aefiApi.create({
        immunization_record: parseInt(immunizationRecordId, 10),
        event_date: eventDate,
        event_type: eventType,
        severity,
        description,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aefi'] });
      toast({ title: 'AEFI Reported', description: 'Adverse event has been recorded.' });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to report AEFI.', variant: 'destructive' });
    },
  });

  function resetForm() {
    setTouched({});
    setImmunizationRecordId('');
    setEventDate(new Date().toISOString().split('T')[0]!);
    setEventType('LOCAL_REACTION');
    setSeverity('MILD');
    setDescription('');
  }

  const reports = data?.results || [];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="AEFI Reports"
          helpContent="Adverse Event Following Immunization reports. Track and report vaccine adverse events per KEPI pharmacovigilance guidelines. Severe cases must be reported to national authorities."
          actions={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Report AEFI</span>
              <span className="sm:hidden">Report</span>
            </Button>
          }
        />

        {/* Filter */}
        <div className="flex gap-2">
          <Select
            value={severityFilter}
            onValueChange={(v) => setSeverityFilter(v === '_all' ? '' : (v as AEFISeverity))}
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

        {/* AEFI Table */}
        <ResponsiveTable
          data={reports}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No AEFI reports found."
          columns={[
            {
              key: 'vaccine_code',
              header: 'Vaccine',
              sortable: true,
              cell: (r) => <span className="font-medium">{r.vaccine_code}</span>,
            },
            {
              key: 'event_date',
              header: 'Event Date',
              sortable: true,
              sortType: 'date',
              cell: (r) => <span className="text-sm">{formatDate(r.event_date)}</span>,
              hideOnMobile: true,
            },
            {
              key: 'event_type',
              header: 'Type',
              sortable: true,
              cell: (r) => (
                <span className="text-sm">{eventTypeLabels[r.event_type] || r.event_type}</span>
              ),
            },
            {
              key: 'severity',
              header: 'Severity',
              sortable: true,
              cell: (r) => (
                <Badge className={`${severityColors[r.severity]} shrink-0 w-fit`}>
                  {r.severity}
                </Badge>
              ),
            },
            {
              key: 'reported_to_authorities',
              header: 'Reported',
              cell: (r) => (
                <span className="text-sm">{r.reported_to_authorities ? 'Yes' : 'No'}</span>
              ),
              hideOnMobile: true,
            },
          ]}
          mobileCard={(r: AEFIListItem) => (
            <Card className="p-3">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <p className="font-medium">{r.vaccine_code}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {eventTypeLabels[r.event_type]} • {formatDate(r.event_date)}
                  </p>
                </div>
                <Badge className={`${severityColors[r.severity]} shrink-0 w-fit self-start`}>
                  {r.severity}
                </Badge>
              </div>
            </Card>
          )}
        />

        {/* Report AEFI Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Report Adverse Event (AEFI)</DialogTitle>
                <HelpPopover content="Report an adverse event following immunization. Provide the immunization record ID, event type, severity, and a detailed description." />
              </div>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <div>
                <Label>Immunization Record ID <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  value={immunizationRecordId}
                  onChange={(e) => setImmunizationRecordId(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, recordId: true }))}
                  placeholder="Enter the immunization record ID"
                  className={touched.recordId && !immunizationRecordId ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {touched.recordId && !immunizationRecordId && <p className="text-xs text-destructive mt-1">Record ID is required</p>}
              </div>
              <div>
                <Label>Event Date <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Event Type <span className="text-destructive">*</span></Label>
                  <Select value={eventType} onValueChange={(v) => setEventType(v as AEFIEventType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Severity <span className="text-destructive">*</span></Label>
                  <Select value={severity} onValueChange={(v) => setSeverity(v as AEFISeverity)}>
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
                <Label>Description <span className="text-destructive">*</span></Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, description: true }))}
                  placeholder="Describe the adverse event..."
                  rows={3}
                  className={touched.description && !description ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {touched.description && !description && <p className="text-xs text-destructive mt-1">Description is required</p>}
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!immunizationRecordId || !description || createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Submit Report
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
