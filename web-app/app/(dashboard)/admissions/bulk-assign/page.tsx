'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BedDouble,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Search,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useToast } from '@/lib/hooks/use-toast';
import { useUser } from '@/lib/auth';
import {
  useAdmissionRecommendations,
  useBulkCompatibilityCheck,
  useInpatientWards,
  useWardBeds,
  useCreateAdmission,
} from '@/lib/hooks/use-inpatient';
import type {
  AdmissionRecommendation,
  PatientCompatibilityResult,
  CompatibleWardInfo,
  InpatientWard,
  Bed,
} from '@/lib/types/inpatient';

interface PatientAssignment {
  patientId: number;
  patientName: string;
  patientMrn: string;
  recommendationId?: number;
  diagnosis?: string;
  urgency: string;
  wardId?: number;
  bedId?: number;
  status: 'pending' | 'assigned' | 'admitted' | 'error';
  error?: string;
  compatibleWards?: CompatibleWardInfo[];
}

export default function BulkAssignmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const user = useUser();

  // Data fetching
  const { data: recommendationsData, isLoading: recommendationsLoading } =
    useAdmissionRecommendations({ status: 'PENDING', ordering: '-created_at' });
  const { data: wardsData } = useInpatientWards();
  const bulkCheck = useBulkCompatibilityCheck();
  const createAdmission = useCreateAdmission();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatients, setSelectedPatients] = useState<Set<number>>(new Set());
  const [assignments, setAssignments] = useState<Map<number, PatientAssignment>>(new Map());
  const [compatibilityResults, setCompatibilityResults] = useState<PatientCompatibilityResult[]>([]);
  const [activeWardId, setActiveWardId] = useState<number | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derived data
  const recommendations = useMemo(
    () => recommendationsData?.results ?? [],
    [recommendationsData?.results]
  );
  const wards = (wardsData?.results ?? []) as InpatientWard[];

  // Filter recommendations by search
  const filteredRecommendations = useMemo(() => {
    if (!searchQuery) return recommendations;
    const q = searchQuery.toLowerCase();
    return recommendations.filter((r: AdmissionRecommendation) => {
      const patientName = r.patient_name?.toLowerCase() || '';
      const patientMrn = r.patient_mrn?.toLowerCase() || '';
      return patientName.includes(q) || patientMrn.includes(q);
    });
  }, [recommendations, searchQuery]);

  // Get beds for active ward
  const { data: bedsData } = useWardBeds(activeWardId ?? undefined);
  const availableBeds = useMemo(() => {
    const bedsList = Array.isArray(bedsData) ? bedsData : bedsData?.results ?? [];
    return bedsList.filter((b: Bed) => b.status === 'AVAILABLE');
  }, [bedsData]);

  // Toggle patient selection
  const togglePatient = useCallback((patientId: number) => {
    setSelectedPatients((prev) => {
      const next = new Set(prev);
      if (next.has(patientId)) {
        next.delete(patientId);
      } else {
        next.add(patientId);
      }
      return next;
    });
  }, []);

  // Select all patients
  const selectAll = useCallback(() => {
    const allIds = new Set(
      filteredRecommendations
        .map((r: AdmissionRecommendation) => r.patient_id)
        .filter((id): id is number => id !== undefined)
    );
    setSelectedPatients(allIds);
  }, [filteredRecommendations]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedPatients(new Set());
    setAssignments(new Map());
    setCompatibilityResults([]);
  }, []);

  // Check compatibility for selected patients
  const checkCompatibility = useCallback(async () => {
    if (selectedPatients.size === 0) return;

    const patientIds = Array.from(selectedPatients);
    try {
      const result = await bulkCheck.mutateAsync({ patientIds });
      setCompatibilityResults(result.results);

      // Initialize assignments from results
      const newAssignments = new Map<number, PatientAssignment>();
      for (const patientResult of result.results) {
        const rec = filteredRecommendations.find(
          (r: AdmissionRecommendation) => r.patient_id === patientResult.patient_id
        );
        newAssignments.set(patientResult.patient_id, {
          patientId: patientResult.patient_id,
          patientName: patientResult.patient_name || 'Unknown',
          patientMrn: patientResult.patient_mrn || '',
          recommendationId: rec?.id,
          diagnosis: rec?.provisional_diagnosis_text || rec?.provisional_diagnosis,
          urgency: rec?.urgency || 'ROUTINE',
          status: 'pending',
          compatibleWards: patientResult.compatible_wards,
        });
      }
      setAssignments(newAssignments);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check compatibility. Please try again.',
        variant: 'destructive',
      });
    }
  }, [selectedPatients, bulkCheck, filteredRecommendations, toast]);

  // Assign ward to patient
  const assignWard = useCallback((patientId: number, wardId: number) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      const assignment = next.get(patientId);
      if (assignment) {
        next.set(patientId, { ...assignment, wardId, bedId: undefined });
      }
      return next;
    });
    setActiveWardId(wardId);
  }, []);

  // Assign bed to patient
  const assignBed = useCallback((patientId: number, bedId: number) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      const assignment = next.get(patientId);
      if (assignment) {
        next.set(patientId, { ...assignment, bedId, status: 'assigned' });
      }
      return next;
    });
  }, []);

  // Count assigned patients
  const assignedCount = useMemo(() => {
    return Array.from(assignments.values()).filter((a) => a.status === 'assigned').length;
  }, [assignments]);

  // Submit all assignments
  const submitAssignments = useCallback(async () => {
    if (!user) return;

    setIsSubmitting(true);
    const assignedPatients = Array.from(assignments.values()).filter(
      (a) => a.status === 'assigned' && a.wardId && a.bedId
    );

    let successCount = 0;
    let errorCount = 0;

    for (const assignment of assignedPatients) {
      try {
        await createAdmission.mutateAsync({
          patient: assignment.patientId,
          ward: assignment.wardId!,
          bed: assignment.bedId!,
          payer_type: 'CASH',
          admission_date: new Date().toISOString(),
          admitting_diagnosis: assignment.diagnosis || 'Pending',
          admitting_diagnosis_text: assignment.diagnosis || 'Pending assessment',
          admitting_officer: user.id,
        });

        setAssignments((prev) => {
          const next = new Map(prev);
          next.set(assignment.patientId, { ...assignment, status: 'admitted' });
          return next;
        });
        successCount++;
      } catch (error) {
        setAssignments((prev) => {
          const next = new Map(prev);
          next.set(assignment.patientId, {
            ...assignment,
            status: 'error',
            error: 'Failed to create admission',
          });
          return next;
        });
        errorCount++;
      }
    }

    setIsSubmitting(false);
    setConfirmDialogOpen(false);

    toast({
      title: 'Bulk Admission Complete',
      description: `${successCount} admitted successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      variant: errorCount > 0 ? 'destructive' : 'default',
    });

    if (successCount > 0 && errorCount === 0) {
      router.push('/admissions');
    }
  }, [assignments, createAdmission, user, toast, router]);

  if (recommendationsLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 sm:py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Bulk Bed Assignment"
        helpContent="Quickly assign multiple patients to compatible wards and beds during emergency or surge scenarios. Select patients, check compatibility, then assign beds."
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        }
      />

      {/* Alert for emergency mode */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <span className="font-medium">Emergency Mode:</span> Use this tool for mass casualty or surge scenarios.
          Compatibility checks are performed but can be overridden.
        </AlertDescription>
      </Alert>

      {/* Step 1: Select Patients */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">1. Select Patients</CardTitle>
              <HelpPopover content="Select patients from pending admission recommendations. Use search to filter." />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{selectedPatients.size} selected</Badge>
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Select All
              </Button>
              {selectedPatients.size > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search patients by name or MRN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Patient list */}
          {filteredRecommendations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No pending admission recommendations</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredRecommendations.map((rec: AdmissionRecommendation) => {
                const patientId = rec.patient_id;
                if (!patientId) return null;
                const isSelected = selectedPatients.has(patientId);
                return (
                  <div
                    key={rec.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isSelected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => togglePatient(patientId)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{rec.patient_name || 'Unknown Patient'}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {rec.patient_mrn} • {rec.provisional_diagnosis_text || rec.provisional_diagnosis || 'No diagnosis'}
                      </p>
                    </div>
                    <Badge
                      className={
                        rec.urgency === 'EMERGENCY'
                          ? 'bg-red-100 text-red-800'
                          : rec.urgency === 'URGENT'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-blue-100 text-blue-800'
                      }
                    >
                      {rec.urgency}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          {/* Check Compatibility Button */}
          {selectedPatients.size > 0 && (
            <Button
              onClick={checkCompatibility}
              disabled={bulkCheck.isPending}
              className="w-full sm:w-auto"
            >
              {bulkCheck.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Check Compatibility ({selectedPatients.size} patients)
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Assign Wards & Beds */}
      {compatibilityResults.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">2. Assign Wards & Beds</CardTitle>
                  <HelpPopover content="Select a compatible ward and available bed for each patient. Wards are sorted by availability." />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0">
                    {assignedCount} of {assignments.size} assigned
                  </Badge>
                  {assignedCount > 0 && (
                    <Badge variant="default" className="shrink-0 bg-green-600">
                      {Math.round((assignedCount / assignments.size) * 100)}% Ready
                    </Badge>
                  )}
                </div>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(assignedCount / assignments.size) * 100}%` }}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Assignment Cards Grid */}
            <div className="grid gap-3 sm:gap-4">
              {Array.from(assignments.values()).map((assignment) => {
                const hasCompatibleWards = (assignment.compatibleWards?.length || 0) > 0;
                const statusColors = {
                  pending: 'border-muted-foreground/20',
                  assigned: 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20',
                  admitted: 'border-green-600 bg-green-100/50 dark:bg-green-900/30',
                  error: 'border-destructive/50 bg-destructive/5',
                };
                const urgencyColors = {
                  EMERGENCY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                  URGENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
                  ROUTINE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                };

                return (
                  <div
                    key={assignment.patientId}
                    className={`rounded-lg border-2 p-3 sm:p-4 transition-colors ${statusColors[assignment.status]}`}
                  >
                    {/* Patient Header Row */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-3">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        {/* Status Icon */}
                        <div className="shrink-0 mt-0.5">
                          {assignment.status === 'pending' && (
                            <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                          )}
                          {assignment.status === 'assigned' && (
                            <Check className="h-5 w-5 text-green-600" />
                          )}
                          {assignment.status === 'admitted' && (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          )}
                          {assignment.status === 'error' && (
                            <XCircle className="h-5 w-5 text-destructive" />
                          )}
                        </div>
                        {/* Patient Info */}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate">{assignment.patientName}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {assignment.patientMrn}
                          </p>
                          {assignment.diagnosis && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {assignment.diagnosis}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Badges */}
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        <Badge className={`text-xs ${urgencyColors[assignment.urgency as keyof typeof urgencyColors] || urgencyColors.ROUTINE}`}>
                          {assignment.urgency === 'EMERGENCY' && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {assignment.urgency}
                        </Badge>
                        {hasCompatibleWards ? (
                          <Badge variant="outline" className="text-xs shrink-0">
                            <Building2 className="h-3 w-3 mr-1" />
                            {assignment.compatibleWards?.length} ward{(assignment.compatibleWards?.length || 0) > 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs shrink-0">
                            No wards
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Error Message */}
                    {assignment.error && (
                      <Alert variant="destructive" className="mb-3 py-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-sm">{assignment.error}</AlertDescription>
                      </Alert>
                    )}

                    {/* Ward & Bed Selection Row */}
                    {hasCompatibleWards && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        {/* Ward Selection */}
                        <div className="flex-1 min-w-0">
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                            Ward
                          </label>
                          <Select
                            value={assignment.wardId?.toString() || ''}
                            onValueChange={(v) => assignWard(assignment.patientId, Number(v))}
                            disabled={assignment.status === 'admitted'}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select ward..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {assignment.compatibleWards?.map((w) => (
                                <SelectItem key={w.ward_id} value={w.ward_id.toString()}>
                                  <div className="flex items-center gap-2">
                                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="truncate">{w.ward_name}</span>
                                    <Badge variant="secondary" className="text-xs ml-auto shrink-0">
                                      <BedDouble className="h-3 w-3 mr-1" />
                                      {w.available_beds}
                                    </Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Bed Selection */}
                        <div className="w-full sm:w-40">
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                            Bed
                          </label>
                          <Select
                            value={assignment.bedId?.toString() || ''}
                            onValueChange={(v) => assignBed(assignment.patientId, Number(v))}
                            disabled={!assignment.wardId || assignment.status === 'admitted'}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={
                                !assignment.wardId
                                  ? 'Select ward first'
                                  : assignment.wardId !== activeWardId
                                    ? 'Loading...'
                                    : 'Select bed...'
                              } />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {assignment.wardId === activeWardId && availableBeds.length > 0 ? (
                                availableBeds.map((b: Bed) => (
                                  <SelectItem key={b.id} value={b.id.toString()}>
                                    <div className="flex items-center gap-2">
                                      <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span>{b.bed_number}</span>
                                    </div>
                                  </SelectItem>
                                ))
                              ) : assignment.wardId === activeWardId ? (
                                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                  No beds available
                                </div>
                              ) : assignment.wardId ? (
                                <div className="px-2 py-1.5 text-sm text-muted-foreground flex items-center gap-2">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Loading beds...
                                </div>
                              ) : null}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Status indicator on larger screens */}
                        <div className="hidden sm:flex items-center justify-center w-10 shrink-0">
                          {assignment.status === 'assigned' && (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          )}
                          {assignment.status === 'admitted' && (
                            <CheckCircle2 className="h-5 w-5 text-green-700" />
                          )}
                        </div>
                      </div>
                    )}

                    {/* No compatible wards message */}
                    {!hasCompatibleWards && (
                      <Alert className="py-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          No compatible wards found for this patient. Check ward constraints or override manually.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Submit Button */}
            {assignedCount > 0 && (
              <div className="pt-4 border-t flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{assignedCount}</span> patient{assignedCount > 1 ? 's' : ''} ready for admission
                </p>
                <Button
                  onClick={() => setConfirmDialogOpen(true)}
                  disabled={isSubmitting}
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Admit {assignedCount} Patient{assignedCount > 1 ? 's' : ''}
                </Button>
              </div>
            )}

            {/* No assignments ready message */}
            {assignedCount === 0 && assignments.size > 0 && (
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-sm">Select a ward and bed for each patient to enable bulk admission.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Confirm Bulk Admission</DialogTitle>
              <HelpPopover content="This will create admission records for all assigned patients." />
            </div>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-muted-foreground">
              You are about to admit <span className="font-semibold text-foreground">{assignedCount}</span> patient
              {assignedCount > 1 ? 's' : ''} to their assigned wards and beds.
            </p>

            {/* Summary of assignments */}
            <div className="max-h-48 overflow-y-auto space-y-2">
              {Array.from(assignments.values())
                .filter((a) => a.status === 'assigned')
                .map((a) => {
                  const ward = a.compatibleWards?.find((w) => w.ward_id === a.wardId);
                  const bed = availableBeds.find((b: Bed) => b.id === a.bedId);
                  return (
                    <div
                      key={a.patientId}
                      className="flex items-center gap-3 p-2 rounded-md bg-muted/50 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{a.patientName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {ward?.ward_name || 'Ward'} → Bed {bed?.bed_number || a.bedId}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                This action will create admission records and mark beds as occupied.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={submitAssignments}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm & Admit All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
