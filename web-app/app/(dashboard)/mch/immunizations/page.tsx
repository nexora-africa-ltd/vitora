'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Syringe,
  AlertTriangle,
  Loader2,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HelpPopover } from '@/components/shared/help-popover';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { immunizationsApi } from '@/lib/api/mch';
import { patientsApi } from '@/lib/api/patients';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import type {
  ImmunizationStatus,
  ImmunizationRecordListItem,
  InjectionSite,
} from '@/lib/types/mch';

const STATUS_OPTIONS: { value: ImmunizationStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ADMINISTERED', label: 'Administered' },
  { value: 'MISSED', label: 'Missed' },
  { value: 'CONTRAINDICATED', label: 'Contraindicated' },
  { value: 'DEFERRED', label: 'Deferred' },
];

const statusColors: Record<ImmunizationStatus, string> = {
  ADMINISTERED: 'bg-green-100 text-green-800',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  MISSED: 'bg-orange-100 text-orange-800',
  CONTRAINDICATED: 'bg-gray-100 text-gray-800',
  DEFERRED: 'bg-yellow-100 text-yellow-800',
};

const statusIcons: Record<ImmunizationStatus, string> = {
  ADMINISTERED: '\u2705',
  SCHEDULED: '\uD83D\uDCC5',
  MISSED: '\u26A0\uFE0F',
  CONTRAINDICATED: '\uD83D\uDEAB',
  DEFERRED: '\u23F8\uFE0F',
};

const SITE_OPTIONS: { value: InjectionSite; label: string }[] = [
  { value: '', label: 'Not specified' },
  { value: 'LEFT_THIGH', label: 'Left Thigh' },
  { value: 'RIGHT_THIGH', label: 'Right Thigh' },
  { value: 'LEFT_ARM', label: 'Left Arm' },
  { value: 'RIGHT_ARM', label: 'Right Arm' },
  { value: 'ORAL', label: 'Oral' },
];

export default function ImmunizationsPage() {
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get('patient')
    ? parseInt(searchParams.get('patient')!, 10)
    : null;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(initialPatientId);
  const [statusFilter, setStatusFilter] = useState<ImmunizationStatus | ''>('');
  const [page, setPage] = useState(1);

  // Administer dialog state
  const [administerDialogOpen, setAdministerDialogOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [adminDate, setAdminDate] = useState(new Date().toISOString().split('T')[0]!);
  const [batchNumber, setBatchNumber] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [site, setSite] = useState<InjectionSite>('');
  const [adminNotes, setAdminNotes] = useState('');

  // Expanded vaccine groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Fetch patient info
  const { data: patient } = useQuery({
    queryKey: ['patient-detail', selectedPatientId],
    queryFn: () => (selectedPatientId ? patientsApi.getPatient(selectedPatientId) : null),
    enabled: !!selectedPatientId,
  });

  // Fetch immunization records
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['immunizations', selectedPatientId, statusFilter, page],
    queryFn: () =>
      immunizationsApi.list({
        patient: selectedPatientId || undefined,
        status: statusFilter || undefined,
        page,
        page_size: 100,
        ordering: 'scheduled_date',
      }),
    enabled: !!selectedPatientId,
  });

  const records = useMemo(() => data?.results || [], [data?.results]);
  const totalPages = Math.ceil((data?.count || 0) / 100);

  // Generate schedule mutation
  const generateMutation = useMutation({
    mutationFn: () => immunizationsApi.generateSchedule(selectedPatientId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['immunizations', selectedPatientId] });
      toast({ title: 'Schedule Generated', description: 'KEPI immunization schedule has been created.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to generate schedule.', variant: 'destructive' });
    },
  });

  // Administer mutation
  const administerMutation = useMutation({
    mutationFn: () =>
      immunizationsApi.administer(selectedRecordId!, {
        administered_date: adminDate,
        batch_number: batchNumber || undefined,
        lot_number: lotNumber || undefined,
        expiry_date: expiryDate || undefined,
        site: site || undefined,
        notes: adminNotes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['immunizations', selectedPatientId] });
      toast({ title: 'Vaccine Administered', description: 'Immunization record updated.' });
      setAdministerDialogOpen(false);
      resetAdminForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to administer vaccine.', variant: 'destructive' });
    },
  });

  function resetAdminForm() {
    setSelectedRecordId(null);
    setAdminDate(new Date().toISOString().split('T')[0]!);
    setBatchNumber('');
    setLotNumber('');
    setExpiryDate('');
    setSite('');
    setAdminNotes('');
  }

  function openAdministerDialog(recordId: number) {
    setSelectedRecordId(recordId);
    setAdminDate(new Date().toISOString().split('T')[0]!);
    setAdministerDialogOpen(true);
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  // Group records by vaccine name
  const grouped = useMemo(() => {
    return records.reduce(
      (acc, record) => {
        const key = record.vaccine_name;
        if (!acc[key]) acc[key] = [];
        acc[key]!.push(record);
        return acc;
      },
      {} as Record<string, ImmunizationRecordListItem[]>,
    );
  }, [records]);

  // Stats
  const overdueCount = records.filter((r) => r.is_overdue).length;
  const administeredCount = records.filter((r) => r.status === 'ADMINISTERED').length;
  const scheduledCount = records.filter((r) => r.status === 'SCHEDULED').length;
  const missedCount = records.filter((r) => r.status === 'MISSED').length;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Immunizations"
          helpContent="KEPI vaccination schedule tracking. View and manage immunization records, administer vaccines, and track overdue doses per Kenya's Expanded Programme on Immunization."
        />

        {/* Patient selection */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label className="text-sm text-muted-foreground mb-1 block">Select Patient</Label>
                <PatientSearchInput
                  value={selectedPatientId}
                  onChange={(patientId) => {
                    setSelectedPatientId(patientId);
                    setPage(1);
                  }}
                />
              </div>
              {patient && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {patient.first_name} {patient.last_name}
                  </span>
                  <span className="ml-2">{patient.mrn}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {!selectedPatientId ? (
          <Card className="p-8 text-center text-muted-foreground">
            Select a patient to view their immunization records.
          </Card>
        ) : isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-destructive">Failed to load immunization records.</p>
          </div>
        ) : (
          <>
            {/* Stats bar */}
            {records.length > 0 && (
              <div className="flex flex-wrap gap-3 text-sm">
                <Badge variant="outline" className="gap-1">
                  <Syringe className="h-3 w-3" />
                  {administeredCount}/{records.length} administered
                </Badge>
                {scheduledCount > 0 && (
                  <Badge className="bg-blue-100 text-blue-800 gap-1">
                    {scheduledCount} scheduled
                  </Badge>
                )}
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {overdueCount} overdue
                  </Badge>
                )}
                {missedCount > 0 && (
                  <Badge className="bg-orange-100 text-orange-800 gap-1">
                    {missedCount} missed
                  </Badge>
                )}
              </div>
            )}

            {/* Filter + actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as ImmunizationStatus | '');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {records.length === 0 && (
                <Button
                  size="sm"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  className="gap-2"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CalendarCheck className="h-4 w-4" />
                  )}
                  Generate KEPI Schedule
                </Button>
              )}
            </div>

            {/* Vaccine groups */}
            {records.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                No immunization records found. Generate the KEPI schedule to get started.
              </Card>
            ) : (
              <div className="space-y-3">
                {Object.entries(grouped).map(([vaccineName, recs]) => {
                  const isExpanded = expandedGroups.has(vaccineName);
                  const groupAdministered = recs.filter((r) => r.status === 'ADMINISTERED').length;
                  const groupOverdue = recs.filter((r) => r.is_overdue).length;

                  return (
                    <Card key={vaccineName}>
                      <CardHeader
                        className="py-3 pb-2 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => toggleGroup(vaccineName)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-sm font-medium">{vaccineName}</CardTitle>
                            <span className="text-xs text-muted-foreground">
                              ({groupAdministered}/{recs.length})
                            </span>
                            {groupOverdue > 0 && (
                              <Badge variant="destructive" className="text-xs px-1.5 py-0">
                                {groupOverdue} overdue
                              </Badge>
                            )}
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </CardHeader>
                      {isExpanded && (
                        <CardContent className="py-2">
                          <div className="space-y-2">
                            {recs.map((record) => (
                              <div
                                key={record.id}
                                className="flex items-center justify-between gap-2 text-sm"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span>{statusIcons[record.status]}</span>
                                  <span className="text-muted-foreground shrink-0">
                                    Dose {record.dose_number}
                                  </span>
                                  <span className="text-muted-foreground">•</span>
                                  <span className="truncate">
                                    {record.administered_date
                                      ? `Given ${formatDate(record.administered_date)}`
                                      : `Due ${formatDate(record.scheduled_date)}`}
                                  </span>
                                  {record.is_overdue && (
                                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge
                                    className={`${statusColors[record.status]} text-xs`}
                                  >
                                    {record.status.replace(/_/g, ' ')}
                                  </Badge>
                                  {record.status === 'SCHEDULED' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openAdministerDialog(record.id);
                                      }}
                                    >
                                      Administer
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="flex items-center text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}

        {/* Administer Dialog */}
        <Dialog open={administerDialogOpen} onOpenChange={setAdministerDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Administer Vaccine</DialogTitle>
                <HelpPopover content="Record the administration of a scheduled vaccine. Fill in batch/lot numbers for traceability." />
              </div>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                administerMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Administration Date</Label>
                <Input
                  type="date"
                  value={adminDate}
                  onChange={(e) => setAdminDate(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Batch Number</Label>
                  <Input
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    placeholder="e.g. BN-12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Lot Number</Label>
                  <Input
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    placeholder="e.g. LN-67890"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Injection Site</Label>
                  <Select value={site} onValueChange={(v) => setSite(v as InjectionSite)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {SITE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdministerDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={administerMutation.isPending}>
                  {administerMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Administer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
