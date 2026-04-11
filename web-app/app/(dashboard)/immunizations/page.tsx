'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Syringe,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  CalendarCheck,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { HelpPopover } from '@/components/shared/help-popover';
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

import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context/facility-context';
import { useImmunizationSocket } from '@/lib/hooks/use-websocket';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { immunizationRecordsApi, vaccineDefinitionsApi, vaccineStockApi } from '@/lib/api/immunizations';
import { PatientSearchInput } from '@/components/patients/patient-search-input';
import type {
  ImmunizationStatus,
  ImmunizationRecordListItem,
  AdministrationSite,
  VaccineProgram,
  VaccineStockListItem,
} from '@/lib/types/immunizations';

// =============================================================================
// Constants
// =============================================================================

const STATUS_OPTIONS: { value: ImmunizationStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'ADMINISTERED', label: 'Administered' },
  { value: 'MISSED', label: 'Missed' },
  { value: 'CONTRAINDICATED', label: 'Contraindicated' },
  { value: 'DEFERRED', label: 'Deferred' },
];

const PROGRAM_OPTIONS: { value: VaccineProgram | ''; label: string }[] = [
  { value: '', label: 'All Programs' },
  { value: 'KEPI', label: 'KEPI (Child)' },
  { value: 'ROUTINE', label: 'Routine' },
  { value: 'CAMPAIGN', label: 'Campaign' },
  { value: 'OCCUPATIONAL', label: 'Occupational' },
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'CATCH_UP', label: 'Catch-Up' },
];

const statusColors: Record<ImmunizationStatus, string> = {
  ADMINISTERED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  MISSED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  CONTRAINDICATED: 'bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400',
  DEFERRED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const SITE_OPTIONS: { value: AdministrationSite; label: string }[] = [
  { value: '', label: 'Not specified' },
  { value: 'LEFT_THIGH', label: 'Left Thigh' },
  { value: 'RIGHT_THIGH', label: 'Right Thigh' },
  { value: 'LEFT_ARM', label: 'Left Arm' },
  { value: 'RIGHT_ARM', label: 'Right Arm' },
  { value: 'ORAL', label: 'Oral' },
];

// =============================================================================
// Page Component
// =============================================================================

export default function ImmunizationsPage() {
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get('patient')
    ? parseInt(searchParams.get('patient')!, 10)
    : null;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facility } = useFacility();
  useImmunizationSocket(facility?.id ?? null);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(initialPatientId);
  const [statusFilter, setStatusFilter] = useState<ImmunizationStatus | ''>('');
  const [programFilter, setProgramFilter] = useState<VaccineProgram | ''>('');


  // Administer dialog state
  const [administerDialogOpen, setAdministerDialogOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [selectedRecordLabel, setSelectedRecordLabel] = useState('');
  const [selectedVaccineForAdmin, setSelectedVaccineForAdmin] = useState<number | null>(null);
  const [selectedStockBatchId, setSelectedStockBatchId] = useState<number | null>(null);
  const [adminDate, setAdminDate] = useState(new Date().toISOString().split('T')[0]!);
  const [batchNumber, setBatchNumber] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [site, setSite] = useState<AdministrationSite>('');
  const [vaccineManufacturer, setVaccineManufacturer] = useState('');
  const [diluentBatchNumber, setDiluentBatchNumber] = useState('');
  const [diluentManufacturer, setDiluentManufacturer] = useState('');
  const [diluentExpiryDate, setDiluentExpiryDate] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // Adult schedule dialog state
  const [adultScheduleDialogOpen, setAdultScheduleDialogOpen] = useState(false);
  const [selectedVaccineId, setSelectedVaccineId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]!);

  // Expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Fetch records
  const { data, isLoading, error } = useQuery({
    queryKey: ['imm-records', selectedPatientId, statusFilter, programFilter],
    queryFn: () =>
      immunizationRecordsApi.list({
        patient: selectedPatientId || undefined,
        status: statusFilter || undefined,
        program: programFilter || undefined,
        page_size: 200,
        ordering: 'scheduled_date',
      }),
    enabled: !!selectedPatientId,
  });

  // Fetch adult vaccines for the schedule generator
  const { data: adultVaccines } = useQuery({
    queryKey: ['vaccine-defs-adult'],
    queryFn: () => vaccineDefinitionsApi.list({ program: 'ROUTINE' }),
  });

  const records = useMemo(() => data?.results || [], [data?.results]);

  // Generate KEPI schedule mutation
  const generateKepiMutation = useMutation({
    mutationFn: () => immunizationRecordsApi.generateKepiSchedule(selectedPatientId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imm-records', selectedPatientId] });
      toast({ title: 'Schedule Generated', description: 'KEPI immunization schedule created.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to generate KEPI schedule.', variant: 'destructive' });
    },
  });

  // Generate adult schedule mutation
  const generateAdultMutation = useMutation({
    mutationFn: () =>
      immunizationRecordsApi.generateAdultSchedule({
        patient: selectedPatientId!,
        vaccine: selectedVaccineId!,
        start_date: startDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imm-records', selectedPatientId] });
      toast({ title: 'Schedule Generated', description: 'Adult vaccine schedule created.' });
      setAdultScheduleDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to generate adult schedule.', variant: 'destructive' });
    },
  });

  // Administer mutation
  const administerMutation = useMutation({
    mutationFn: () =>
      immunizationRecordsApi.administer(selectedRecordId!, {
        administered_date: adminDate,
        stock_batch: selectedStockBatchId || undefined,
        batch_number: selectedStockBatchId ? undefined : (batchNumber || undefined),
        lot_number: lotNumber || undefined,
        expiry_date: selectedStockBatchId ? undefined : (expiryDate || undefined),
        site: site || undefined,
        vaccine_manufacturer: selectedStockBatchId ? undefined : (vaccineManufacturer || undefined),
        diluent_batch_number: diluentBatchNumber || undefined,
        diluent_manufacturer: diluentManufacturer || undefined,
        diluent_expiry_date: diluentExpiryDate || undefined,
        notes: adminNotes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imm-records', selectedPatientId] });
      toast({ title: 'Vaccine Administered', description: 'Record updated.' });
      setAdministerDialogOpen(false);
      resetAdminForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to administer vaccine.', variant: 'destructive' });
    },
  });

  // Fetch available stock batches for the selected vaccine
  const { data: availableBatches } = useQuery({
    queryKey: ['available-stock', selectedVaccineForAdmin],
    queryFn: () =>
      vaccineStockApi.list({
        vaccine: selectedVaccineForAdmin!,
        available: true,
        ordering: 'expiry_date',
        page_size: 50,
      }),
    enabled: !!selectedVaccineForAdmin && administerDialogOpen,
  });

  const usableBatches: VaccineStockListItem[] = availableBatches?.results?.filter(
    (b) => b.quantity_on_hand > 0 && !b.is_expired,
  ) || [];

  function handleBatchSelect(stockId: string) {
    if (stockId === '_manual') {
      setSelectedStockBatchId(null);
      setBatchNumber('');
      setVaccineManufacturer('');
      setExpiryDate('');
      return;
    }
    const batch = usableBatches.find((b) => b.id === parseInt(stockId, 10));
    if (batch) {
      setSelectedStockBatchId(batch.id);
      setBatchNumber(batch.batch_number);
      setVaccineManufacturer(batch.vaccine_name); // Will be overridden if user edits
      setExpiryDate(batch.expiry_date);
    }
  }

  function resetAdminForm() {
    setSelectedRecordId(null);
    setSelectedRecordLabel('');
    setSelectedVaccineForAdmin(null);
    setSelectedStockBatchId(null);
    setAdminDate(new Date().toISOString().split('T')[0]!);
    setBatchNumber('');
    setLotNumber('');
    setExpiryDate('');
    setSite('');
    setVaccineManufacturer('');
    setDiluentBatchNumber('');
    setDiluentManufacturer('');
    setDiluentExpiryDate('');
    setAdminNotes('');
  }

  function openAdministerDialog(recordId: number, vaccineId: number, label: string) {
    setSelectedRecordId(recordId);
    setSelectedVaccineForAdmin(vaccineId);
    setSelectedRecordLabel(label);
    setSelectedStockBatchId(null);
    setAdminDate(new Date().toISOString().split('T')[0]!);
    setAdministerDialogOpen(true);
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Group records by vaccine series name
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

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Immunizations"
          helpContent="Facility-wide immunization management. Supports KEPI (child), adult routine, campaign, occupational, and travel vaccines. Generate schedules, administer vaccines, and track coverage."
        />

        {/* Patient selection */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <Label className="text-sm text-muted-foreground mb-1 block">Select Patient</Label>
            <PatientSearchInput
              value={selectedPatientId}
              onChange={(patientId) => {
                setSelectedPatientId(patientId);
              }}
            />
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
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 gap-1">
                    <CalendarCheck className="h-3 w-3" />
                    {scheduledCount} scheduled
                  </Badge>
                )}
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {overdueCount} overdue
                  </Badge>
                )}
              </div>
            )}

            {/* Filters + schedule actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as ImmunizationStatus | '')}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value || '_all'}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={programFilter}
                  onValueChange={(v) => setProgramFilter(v as VaccineProgram | '')}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Program" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROGRAM_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value || '_all'}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => generateKepiMutation.mutate()}
                  disabled={generateKepiMutation.isPending}
                >
                  {generateKepiMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  <Syringe className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Generate KEPI Schedule</span>
                  <span className="sm:hidden">KEPI</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setAdultScheduleDialogOpen(true)}
                >
                  <Users className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Adult Vaccine Schedule</span>
                  <span className="sm:hidden">Adult</span>
                </Button>
              </div>
            </div>

            {/* Records grouped by vaccine */}
            {records.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                No immunization records found. Generate a schedule to get started.
              </Card>
            ) : (
              <div className="space-y-3">
                {Object.entries(grouped).map(([name, groupRecords]) => {
                  const isExpanded = expandedGroups.has(name);
                  const groupAdministered = groupRecords.filter((r) => r.status === 'ADMINISTERED').length;
                  const groupOverdue = groupRecords.filter((r) => r.is_overdue).length;
                  const program = groupRecords[0]?.vaccine_program || '';

                  return (
                    <Card key={name}>
                      <button
                        className="w-full text-left"
                        onClick={() => toggleGroup(name)}
                      >
                        <CardHeader className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <CardTitle className="text-sm font-medium truncate">
                                {name}
                              </CardTitle>
                              <Badge variant="outline" className="text-xs shrink-0">
                                {program}
                              </Badge>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {groupAdministered}/{groupRecords.length}
                              </span>
                              {groupOverdue > 0 && (
                                <Badge variant="destructive" className="text-xs shrink-0">
                                  {groupOverdue} overdue
                                </Badge>
                              )}
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                          </div>
                        </CardHeader>
                      </button>
                      {isExpanded && (
                        <CardContent className="pt-0 pb-3 px-4">
                          <div className="space-y-2">
                            {groupRecords.map((record) => (
                              <div
                                key={record.id}
                                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between p-2 rounded-md bg-muted/30"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Badge className={`${statusColors[record.status]} text-xs shrink-0 w-fit`}>
                                    {record.status}
                                  </Badge>
                                  <span className="text-sm">Dose {record.dose_number}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(record.scheduled_date)}
                                  </span>
                                  {record.is_overdue && (
                                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {record.administered_date && (
                                    <span className="text-xs text-muted-foreground">
                                      Given: {formatDate(record.administered_date)}
                                    </span>
                                  )}
                                  {record.status === 'SCHEDULED' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openAdministerDialog(
                                          record.id,
                                          record.vaccine,
                                          `${record.vaccine_name} — Dose ${record.dose_number}`,
                                        );
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
          </>
        )}

        {/* Administer Dialog */}
        <Dialog open={administerDialogOpen} onOpenChange={setAdministerDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Administer Vaccine</DialogTitle>
                <HelpPopover content="Record vaccine administration with batch/lot details, manufacturer, injection site, and diluent information (if applicable). All fields except date are optional." />
              </div>
            </DialogHeader>
            {/* Vaccine context banner */}
            {selectedRecordLabel && (
              <div className="rounded-md bg-muted/50 p-2.5 text-sm font-medium">
                {selectedRecordLabel}
              </div>
            )}
            <div className="space-y-3 sm:space-y-4">
              {/* Date & Site */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <Label>Date Administered <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={adminDate}
                    onChange={(e) => setAdminDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Injection Site</Label>
                  <Select value={site} onValueChange={(v) => setSite(v as AdministrationSite)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {SITE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value || '_none'}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Stock Batch Selection (FEFO) */}
              <div>
                <Label>Stock Batch</Label>
                <Select
                  value={selectedStockBatchId?.toString() || '_manual'}
                  onValueChange={handleBatchSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch from stock" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_manual">Enter manually</SelectItem>
                    {usableBatches.map((b) => (
                      <SelectItem key={b.id} value={b.id.toString()} textValue={b.batch_number}>
                        <div className="flex flex-col">
                          <span>{b.batch_number}{b.is_near_expiry ? ' ⚠️' : ''}</span>
                          <span className="text-xs text-muted-foreground">
                            {b.quantity_on_hand} doses • exp {formatDate(b.expiry_date)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {usableBatches.length === 0 && selectedVaccineForAdmin && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No stock batches available. Enter details manually below.
                  </p>
                )}
              </div>
              {/* Auto-filled or manual batch/lot/expiry */}
              {selectedStockBatchId ? (
                <div className="rounded-md bg-muted/30 p-3 text-sm space-y-1">
                  <p><span className="text-muted-foreground">Batch:</span> {batchNumber}</p>
                  <p><span className="text-muted-foreground">Manufacturer:</span> {vaccineManufacturer}</p>
                  <p><span className="text-muted-foreground">Expiry:</span> {formatDate(expiryDate)}</p>
                  <p className="text-xs text-muted-foreground mt-1">1 dose will be deducted from this batch on submission.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                    <div>
                      <Label>Batch Number</Label>
                      <Input
                        value={batchNumber}
                        onChange={(e) => setBatchNumber(e.target.value)}
                        placeholder="e.g. BCG-2026-001"
                      />
                    </div>
                    <div>
                      <Label>Lot Number</Label>
                      <Input
                        value={lotNumber}
                        onChange={(e) => setLotNumber(e.target.value)}
                        placeholder="e.g. LOT-123"
                      />
                    </div>
                    <div>
                      <Label>Expiry Date</Label>
                      <Input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Vaccine Manufacturer</Label>
                    <Input
                      value={vaccineManufacturer}
                      onChange={(e) => setVaccineManufacturer(e.target.value)}
                      placeholder="e.g. Serum Institute of India"
                    />
                  </div>
                </>
              )}
              {/* Diluent (collapsible for reconstituted vaccines) */}
              <details className="group rounded-md border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Diluent Details <span className="text-xs font-normal">(for reconstituted vaccines)</span>
                </summary>
                <div className="px-3 pb-3 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Batch No.</Label>
                    <Input
                      value={diluentBatchNumber}
                      onChange={(e) => setDiluentBatchNumber(e.target.value)}
                      placeholder="e.g. DIL-2026-01"
                    />
                  </div>
                  <div>
                    <Label>Manufacturer</Label>
                    <Input
                      value={diluentManufacturer}
                      onChange={(e) => setDiluentManufacturer(e.target.value)}
                      placeholder="e.g. Serum Institute"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Expiry Date</Label>
                    <Input
                      type="date"
                      value={diluentExpiryDate}
                      onChange={(e) => setDiluentExpiryDate(e.target.value)}
                      className="w-full sm:w-1/2"
                    />
                  </div>
                </div>
              </details>
              {/* Notes */}
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={2}
                />
              </div>
              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setAdministerDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => administerMutation.mutate()}
                  disabled={administerMutation.isPending}
                >
                  {administerMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Administer
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Adult Schedule Dialog */}
        <Dialog open={adultScheduleDialogOpen} onOpenChange={setAdultScheduleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>Generate Adult Vaccine Schedule</DialogTitle>
                <HelpPopover content="Create a multi-dose schedule for an adult vaccine (e.g., Hep B 3-dose series). Doses will be spaced per the vaccine's configured interval." />
              </div>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4 pt-2">
              <div>
                <Label>Vaccine</Label>
                <Select
                  value={selectedVaccineId?.toString() || ''}
                  onValueChange={(v) => setSelectedVaccineId(parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a vaccine" />
                  </SelectTrigger>
                  <SelectContent>
                    {(adultVaccines || []).map((v) => (
                      <SelectItem key={v.id} value={v.id.toString()}>
                        {v.name} ({v.total_doses} dose{v.total_doses > 1 ? 's' : ''})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <Button variant="outline" onClick={() => setAdultScheduleDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => generateAdultMutation.mutate()}
                  disabled={!selectedVaccineId || generateAdultMutation.isPending}
                >
                  {generateAdultMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Generate Schedule
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
