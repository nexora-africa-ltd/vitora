'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Save, Users, AlertTriangle, Clock, Pill, ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInpatientWards, useCreateShiftHandover, useAdmissions } from '@/lib/hooks/use-inpatient';
import { useMyStaffProfile, useStaffList } from '@/lib/hooks/use-rbac';
import { useToast } from '@/lib/hooks/use-toast';
import { attendanceApi, shiftTypeConfigsApi } from '@/lib/api/scheduling';
import type { ShiftEndingType } from '@/lib/types/inpatient';

const DEFAULT_SHIFT_ORDER: ShiftEndingType[] = ['DAY', 'EVENING', 'NIGHT'];

const SHIFT_FALLBACK_LABELS: Record<ShiftEndingType, string> = {
  DAY: 'Day Shift',
  EVENING: 'Evening Shift',
  NIGHT: 'Night Shift',
};

const TASK_PRESETS = [
  'Review time-critical medications in first hour',
  'Continue vitals monitoring per plan',
  'Confirm fluid balance and intake/output charting',
  'Reassess pain and comfort interventions',
  'Update family/caregiver after rounds',
] as const;

const CRITICAL_CONCERN_PRESETS = [
  'Deterioration watch: escalate early warning signs immediately',
  'Infection-control risk: strict isolation and PPE checks',
  'Falls risk: maintain assisted mobility precautions',
  'Pressure sore prevention: strict turning schedule',
] as const;

type PatientPresetAssignment = {
  admissionId: number;
  patientLabel: string;
  pendingTasks: string[];
  criticalConcerns: string[];
};

function normalizeShiftTypeToHandoverShift(shiftType?: string): ShiftEndingType | undefined {
  if (!shiftType) return undefined;
  if (shiftType === 'DAY' || shiftType === 'MORNING') return 'DAY';
  if (shiftType === 'AFTERNOON') return 'EVENING';
  if (shiftType === 'NIGHT') return 'NIGHT';
  return undefined;
}

export default function NewHandoverPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: wards } = useInpatientWards();
  const { data: staffProfile } = useMyStaffProfile();
  const { data: staffList } = useStaffList({ page_size: 100, employment_status: 'ACTIVE' });
  const { data: shiftTypeConfigsData } = useQuery({
    queryKey: ['shift-type-configs', 'admissions-handover-new'],
    queryFn: () => shiftTypeConfigsApi.list(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: myTodayData } = useQuery({
    queryKey: ['attendance', 'my-today', 'admissions-handover-new'],
    queryFn: () => attendanceApi.myToday(),
    staleTime: 60 * 1000,
  });
  const createHandover = useCreateShiftHandover();

  const [wardId, setWardId] = useState<string>('');
  const [outgoingShift, setOutgoingShift] = useState<ShiftEndingType | ''>('');
  const [incomingShift, setIncomingShift] = useState<ShiftEndingType | ''>('');
  const [incomingNurseId, setIncomingNurseId] = useState<string>('');
  const [summary, setSummary] = useState('');
  const [criticalPatients, setCriticalPatients] = useState('');
  const [pendingTasks, setPendingTasks] = useState('');
  const [medicationsDue, setMedicationsDue] = useState('');
  const [criticalPatientsOpen, setCriticalPatientsOpen] = useState(false);
  const [selectedCriticalAdmissionIds, setSelectedCriticalAdmissionIds] = useState<number[]>([]);
  const [selectedPresetAdmissionId, setSelectedPresetAdmissionId] = useState<string>('');
  const [patientPresetAssignments, setPatientPresetAssignments] = useState<PatientPresetAssignment[]>([]);
  const [includeAutoSummary, setIncludeAutoSummary] = useState(true);

  const selectedWardId = wardId ? Number(wardId) : undefined;
  const { data: activeAdmissions } = useAdmissions({
    ward: selectedWardId,
    admission_status: 'ACTIVE',
    page_size: 50,
    ordering: 'bed_number',
  });

  const shiftOptions = useMemo(() => {
    const configured = (shiftTypeConfigsData?.results ?? []).filter((config) => config.is_active);
    const labelsByShift = new Map<ShiftEndingType, string>();

    for (const config of configured) {
      const normalized = normalizeShiftTypeToHandoverShift(config.shift_type);
      if (!normalized || labelsByShift.has(normalized)) continue;
      labelsByShift.set(normalized, config.display_label || config.label || SHIFT_FALLBACK_LABELS[normalized]);
    }

    for (const shift of myTodayData?.shifts ?? []) {
      const normalized = normalizeShiftTypeToHandoverShift(shift.shift_type);
      if (!normalized || labelsByShift.has(normalized)) continue;
      labelsByShift.set(
        normalized,
        shift.shift_type_display || SHIFT_FALLBACK_LABELS[normalized]
      );
    }

    const ordered = DEFAULT_SHIFT_ORDER
      .filter((shift) => labelsByShift.has(shift))
      .map((shift) => ({
        value: shift,
        label: labelsByShift.get(shift) || SHIFT_FALLBACK_LABELS[shift],
      }));

    if (ordered.length > 0) return ordered;

    return DEFAULT_SHIFT_ORDER.map((shift) => ({
      value: shift,
      label: SHIFT_FALLBACK_LABELS[shift],
    }));
  }, [myTodayData?.shifts, shiftTypeConfigsData?.results]);

  const shiftOptionOrder = useMemo(
    () => shiftOptions.map((option) => option.value),
    [shiftOptions]
  );

  const preferredOutgoingShift = useMemo(() => {
    const shifts = myTodayData?.shifts ?? [];
    if (shifts.length === 0) return undefined;
    const statusPriority = ['ACTIVE', 'ON_BREAK', 'SCHEDULED'] as const;

    for (const status of statusPriority) {
      const match = shifts.find((shift) => shift.status === status);
      const normalized = normalizeShiftTypeToHandoverShift(match?.shift_type);
      if (normalized) return normalized;
    }

    return normalizeShiftTypeToHandoverShift(shifts[0]?.shift_type);
  }, [myTodayData?.shifts]);

  useEffect(() => {
    if (outgoingShift) return;
    const preferred = preferredOutgoingShift;
    if (!preferred) return;
    setOutgoingShift(preferred);
  }, [outgoingShift, preferredOutgoingShift]);

  useEffect(() => {
    if (!outgoingShift) return;
    const currentIndex = shiftOptionOrder.indexOf(outgoingShift);
    if (currentIndex === -1) return;
    const nextShift = shiftOptionOrder[(currentIndex + 1) % shiftOptionOrder.length];
    if (!nextShift) return;
    setIncomingShift(nextShift);
  }, [outgoingShift, shiftOptionOrder]);

  useEffect(() => {
    if (!outgoingShift) return;
    if (!shiftOptionOrder.includes(outgoingShift)) {
      setOutgoingShift(shiftOptionOrder[0] || '');
    }
  }, [outgoingShift, shiftOptionOrder]);

  useEffect(() => {
    if (!incomingShift) return;
    if (!shiftOptionOrder.includes(incomingShift)) {
      setIncomingShift(shiftOptionOrder[0] || '');
    }
  }, [incomingShift, shiftOptionOrder]);

  const selectedWard = useMemo(
    () => wards?.results?.find((ward) => ward.id === selectedWardId),
    [selectedWardId, wards?.results]
  );

  const criticalPatientOptions = useMemo(() => {
    if (!selectedWardId) return [];
    return (activeAdmissions?.results ?? []).map((admission) => ({
      ward: admission.ward,
      id: admission.id,
      label: `${admission.patient_name || `Patient ${admission.patient}`} (${admission.bed_number || 'No bed'})`,
    })).filter((admission) => admission.ward === selectedWardId)
      .map(({ id, label }) => ({ id, label }));
  }, [activeAdmissions?.results, selectedWardId]);

  const selectedCriticalPatientLabels = useMemo(() => {
    const labelMap = new Map(criticalPatientOptions.map((option) => [option.id, option.label]));
    return selectedCriticalAdmissionIds
      .map((id) => labelMap.get(id))
      .filter((label): label is string => Boolean(label));
  }, [criticalPatientOptions, selectedCriticalAdmissionIds]);

  const selectedPresetPatientLabel = useMemo(() => {
    if (!selectedPresetAdmissionId) return '';
    return (
      criticalPatientOptions.find((option) => option.id === Number(selectedPresetAdmissionId))?.label || ''
    );
  }, [criticalPatientOptions, selectedPresetAdmissionId]);

  const selectedPresetAssignment = useMemo(() => {
    if (!selectedPresetAdmissionId) return undefined;
    return patientPresetAssignments.find(
      (assignment) => assignment.admissionId === Number(selectedPresetAdmissionId)
    );
  }, [patientPresetAssignments, selectedPresetAdmissionId]);

  const selectedPresetPatientIndex = useMemo(() => {
    if (!selectedPresetAdmissionId) return -1;
    return criticalPatientOptions.findIndex(
      (option) => option.id === Number(selectedPresetAdmissionId)
    );
  }, [criticalPatientOptions, selectedPresetAdmissionId]);

  const assignedPatients = useMemo(() => {
    return [...patientPresetAssignments].sort((a, b) =>
      a.patientLabel.localeCompare(b.patientLabel)
    );
  }, [patientPresetAssignments]);

  useEffect(() => {
    setSelectedCriticalAdmissionIds((current) =>
      current.filter((id) => criticalPatientOptions.some((option) => option.id === id))
    );
  }, [criticalPatientOptions]);

  useEffect(() => {
    setPatientPresetAssignments((current) =>
      current
        .map((assignment) => {
          const option = criticalPatientOptions.find((item) => item.id === assignment.admissionId);
          if (!option) return null;
          return { ...assignment, patientLabel: option.label };
        })
        .filter((assignment): assignment is PatientPresetAssignment => Boolean(assignment))
    );
  }, [criticalPatientOptions]);

  useEffect(() => {
    if (!selectedPresetAdmissionId) return;
    const exists = criticalPatientOptions.some(
      (option) => option.id === Number(selectedPresetAdmissionId)
    );
    if (!exists) {
      setSelectedPresetAdmissionId('');
    }
  }, [criticalPatientOptions, selectedPresetAdmissionId]);

  useEffect(() => {
    if (!selectedPresetAdmissionId && selectedCriticalAdmissionIds.length > 0) {
      setSelectedPresetAdmissionId(String(selectedCriticalAdmissionIds[0]));
    }
  }, [selectedCriticalAdmissionIds, selectedPresetAdmissionId]);

  const autoSummaryDraft = useMemo(() => {
    const blocks: string[] = [];
    const outgoingLabel = shiftOptions.find((item) => item.value === outgoingShift)?.label || outgoingShift;
    const incomingLabel = shiftOptions.find((item) => item.value === incomingShift)?.label || incomingShift;

    if (selectedWard?.name) {
      blocks.push(`Ward: ${selectedWard.name}`);
    }
    if (outgoingLabel || incomingLabel) {
      blocks.push(`Shift transition: ${outgoingLabel || 'Current shift'} -> ${incomingLabel || 'Next shift'}`);
    }
    if (selectedWard?.occupied_beds !== undefined) {
      blocks.push(`Current occupancy: ${selectedWard.occupied_beds} occupied beds`);
    }
    if (selectedCriticalPatientLabels.length > 0) {
      blocks.push(`Critical patients:\n${selectedCriticalPatientLabels.map((item) => `- ${item}`).join('\n')}`);
    }
    if (patientPresetAssignments.length > 0) {
      const assignmentLines = patientPresetAssignments.flatMap((assignment) => {
        const lines: string[] = [];
        if (assignment.pendingTasks.length > 0) {
          lines.push(`- ${assignment.patientLabel} - Pending: ${assignment.pendingTasks.join('; ')}`);
        }
        if (assignment.criticalConcerns.length > 0) {
          lines.push(`- ${assignment.patientLabel} - Critical: ${assignment.criticalConcerns.join('; ')}`);
        }
        return lines;
      });

      if (assignmentLines.length > 0) {
        blocks.push(`Patient-specific priorities:\n${assignmentLines.join('\n')}`);
      }
    }
    if (medicationsDue.trim()) {
      blocks.push(`Medications due:\n${medicationsDue.trim()}`);
    }

    return blocks.join('\n\n').trim();
  }, [
    incomingShift,
    medicationsDue,
    outgoingShift,
    selectedCriticalPatientLabels,
    patientPresetAssignments,
    selectedWard?.name,
    selectedWard?.occupied_beds,
    shiftOptions,
  ]);

  const togglePatientPreset = (
    category: 'pendingTasks' | 'criticalConcerns',
    presetValue: string
  ) => {
    if (!selectedPresetAdmissionId || !selectedPresetPatientLabel) return;

    const admissionId = Number(selectedPresetAdmissionId);
    setPatientPresetAssignments((current) => {
      const existing = current.find((assignment) => assignment.admissionId === admissionId);
      const currentValues = existing?.[category] ?? [];
      const nextValues = currentValues.includes(presetValue)
        ? currentValues.filter((item) => item !== presetValue)
        : [...currentValues, presetValue];

      const pendingTasks = category === 'pendingTasks' ? nextValues : existing?.pendingTasks ?? [];
      const criticalConcerns =
        category === 'criticalConcerns' ? nextValues : existing?.criticalConcerns ?? [];

      const withoutCurrent = current.filter((assignment) => assignment.admissionId !== admissionId);
      if (pendingTasks.length === 0 && criticalConcerns.length === 0) {
        return withoutCurrent;
      }

      return [
        ...withoutCurrent,
        {
          admissionId,
          patientLabel: selectedPresetPatientLabel,
          pendingTasks,
          criticalConcerns,
        },
      ];
    });
  };

  const clearSelectedPatientAssignment = () => {
    if (!selectedPresetAdmissionId) return;
    const admissionId = Number(selectedPresetAdmissionId);
    setPatientPresetAssignments((current) =>
      current.filter((assignment) => assignment.admissionId !== admissionId)
    );
  };

  const movePresetPatient = (direction: -1 | 1) => {
    if (criticalPatientOptions.length === 0) return;
    const currentIndex = selectedPresetPatientIndex;
    const fallbackIndex = direction === 1 ? 0 : criticalPatientOptions.length - 1;
    const nextIndex =
      currentIndex === -1
        ? fallbackIndex
        : (currentIndex + direction + criticalPatientOptions.length) % criticalPatientOptions.length;
    const next = criticalPatientOptions[nextIndex];
    if (!next) return;
    setSelectedPresetAdmissionId(String(next.id));
  };

  const toggleCriticalAdmission = (admissionId: number) => {
    setSelectedCriticalAdmissionIds((current) =>
      current.includes(admissionId)
        ? current.filter((id) => id !== admissionId)
        : [...current, admissionId]
    );
  };

  const appendLineItems = (existing: string, lines: string[]) => {
    if (lines.length === 0) return existing;
    const block = lines.map((line) => `- ${line}`).join('\n');
    const trimmed = existing.trim();
    return trimmed ? `${trimmed}\n${block}` : block;
  };

  const applyAssistDraft = () => {
    if (!autoSummaryDraft) return;
    setSummary((current) => {
      const trimmed = current.trim();
      if (!trimmed) return autoSummaryDraft;
      return `${trimmed}\n\n${autoSummaryDraft}`;
    });

    const pendingByPatient = patientPresetAssignments.flatMap((assignment) =>
      assignment.pendingTasks.map((task) => `${assignment.patientLabel}: ${task}`)
    );
    if (pendingByPatient.length > 0) {
      setPendingTasks((current) => appendLineItems(current, pendingByPatient));
    }

    if (selectedCriticalPatientLabels.length > 0) {
      setCriticalPatients((current) => appendLineItems(current, selectedCriticalPatientLabels));
    }

    const criticalByPatient = patientPresetAssignments.flatMap((assignment) =>
      assignment.criticalConcerns.map((concern) => `${assignment.patientLabel}: ${concern}`)
    );
    if (criticalByPatient.length > 0) {
      setCriticalPatients((current) => appendLineItems(current, criticalByPatient));
    }
  };

  const handleSubmit = async () => {
    if (!wardId || !outgoingShift || !incomingShift || !summary || !incomingNurseId) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (!staffProfile?.id) {
      toast({
        title: 'Error',
        description: 'Unable to identify your staff profile. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Build general_notes from the text fields
      const notes = [
        summary,
        criticalPatients && `Critical Patients: ${criticalPatients}`,
        pendingTasks && `Pending Tasks: ${pendingTasks}`,
        medicationsDue && `Medications Due: ${medicationsDue}`,
      ].filter(Boolean).join('\n\n');

      await createHandover.mutateAsync({
        ward: Number(wardId),
        shift_date: new Date().toISOString().slice(0, 10),
        shift_ending: outgoingShift,
        outgoing_nurse: staffProfile.id,
        incoming_nurse: Number(incomingNurseId),
        total_patients: selectedWard?.occupied_beds ?? 0,
        general_notes: notes,
      });
      toast({
        title: 'Success',
        description: 'Handover submitted successfully',
      });
      router.push('/admissions/handover');
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to submit handover',
        variant: 'destructive',
      });
    }
  };

  const isFormValid = wardId && outgoingShift && incomingShift && incomingNurseId && summary;

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="New Shift Handover"
        helpContent="Create a handover report for the incoming shift. Include patient status, critical information, and pending tasks."
      />

      {/* Ward and Shift Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Shift Details
          </CardTitle>
          <CardDescription>
            Select the ward and shift information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="ward">Ward *</Label>
              <Select value={wardId} onValueChange={setWardId}>
                <SelectTrigger id="ward" aria-label="Ward">
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {wards?.results?.map((ward) => (
                    <SelectItem key={ward.id} value={String(ward.id)}>
                      {ward.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="outgoing-shift">Outgoing Shift *</Label>
              <Select value={outgoingShift} onValueChange={(v) => setOutgoingShift(v as ShiftEndingType)}>
                <SelectTrigger id="outgoing-shift" aria-label="Outgoing Shift">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {shiftOptions.map((shift) => (
                    <SelectItem key={shift.value} value={shift.value}>
                      {shift.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="incoming-shift">Incoming Shift *</Label>
              <Select value={incomingShift} onValueChange={(v) => setIncomingShift(v as ShiftEndingType)}>
                <SelectTrigger id="incoming-shift" aria-label="Incoming Shift">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {shiftOptions.map((shift) => (
                    <SelectItem key={shift.value} value={shift.value}>
                      {shift.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="incoming-clinician">Incoming Clinician *</Label>
              <Select value={incomingNurseId} onValueChange={setIncomingNurseId}>
                <SelectTrigger id="incoming-clinician" aria-label="Incoming Clinician">
                  <SelectValue placeholder="Select incoming clinician" />
                </SelectTrigger>
                <SelectContent>
                  {staffList?.results
                    ?.filter((staff) => staff.id !== staffProfile?.id)
                    .map((staff) => (
                      <SelectItem key={staff.user} value={String(staff.user)}>
                        {staff.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Handover Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Handover Summary
          </CardTitle>
          <CardDescription>
            Provide a summary of the shift and key information for the incoming team
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-medium">Auto-summary assist</Label>
              <Switch checked={includeAutoSummary} onCheckedChange={setIncludeAutoSummary} />
            </div>
            <p className="text-xs text-muted-foreground">
              Generate a structured handover summary from selected shift details, critical patients, concerns, tasks, and medications due.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={applyAssistDraft}
              disabled={!includeAutoSummary || !autoSummaryDraft}
            >
              Insert Assisted Draft
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">Summary *</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Provide an overview of the shift - patient status, key events, etc."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Critical Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Critical Information
          </CardTitle>
          <CardDescription>
            Highlight any critical patients or urgent matters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedWardId && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Critical Patients</Label>
              <Popover open={criticalPatientsOpen} onOpenChange={setCriticalPatientsOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between font-normal">
                    <span className="truncate">
                      {selectedCriticalPatientLabels.length > 0
                        ? `${selectedCriticalPatientLabels.length} selected`
                        : 'Select critical patients'}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-2">
                  <div className="max-h-56 space-y-2 overflow-auto pr-1">
                    {criticalPatientOptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-1 py-2">No active admissions in this ward.</p>
                    ) : (
                      criticalPatientOptions.map((patientOption) => {
                        const checked = selectedCriticalAdmissionIds.includes(patientOption.id);
                        return (
                          <label
                            key={patientOption.id}
                            htmlFor={`critical-patient-${patientOption.id}`}
                            className="flex cursor-pointer items-start gap-2 rounded-md border p-2"
                          >
                            <Checkbox
                              id={`critical-patient-${patientOption.id}`}
                              checked={checked}
                              onCheckedChange={() => toggleCriticalAdmission(patientOption.id)}
                              className="mt-0.5"
                            />
                            <span className="text-xs leading-5">{patientOption.label}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Label className="text-sm font-medium">Patient-specific preset assignment</Label>
            <p className="text-xs text-muted-foreground">
              Select a patient first, then assign pending task and critical concern presets for that patient.
            </p>
            {assignedPatients.length > 0 && (
              <div className="space-y-2 rounded-md border bg-background p-2">
                <p className="text-xs font-medium text-muted-foreground">Assigned patients</p>
                <div className="flex flex-wrap gap-2">
                  {assignedPatients.map((assignment) => {
                    const isSelected = selectedPresetAdmissionId === String(assignment.admissionId);
                    return (
                      <Button
                        key={assignment.admissionId}
                        type="button"
                        size="sm"
                        variant={isSelected ? 'default' : 'outline'}
                        className="h-auto px-2 py-1.5 text-xs"
                        onClick={() => setSelectedPresetAdmissionId(String(assignment.admissionId))}
                      >
                        {assignment.patientLabel} ({assignment.pendingTasks.length} pending, {assignment.criticalConcerns.length} critical)
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => movePresetPatient(-1)}
                disabled={criticalPatientOptions.length === 0}
              >
                Previous patient
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => movePresetPatient(1)}
                disabled={criticalPatientOptions.length === 0}
              >
                Next patient
              </Button>
            </div>
            <Select value={selectedPresetAdmissionId} onValueChange={setSelectedPresetAdmissionId}>
              <SelectTrigger aria-label="Preset patient selection">
                <SelectValue placeholder="Select patient for preset assignment" />
              </SelectTrigger>
              <SelectContent>
                {criticalPatientOptions.length === 0 ? (
                  <div className="px-2 py-2 text-sm text-muted-foreground">No active admissions in ward</div>
                ) : (
                  criticalPatientOptions.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      {option.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSelectedPatientAssignment}
                disabled={!selectedPresetAssignment}
              >
                Clear selected patient presets
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Pending task presets</Label>
              <div className="flex flex-wrap gap-2">
                {TASK_PRESETS.map((task) => (
                  <Button
                    key={task}
                    type="button"
                    size="sm"
                    disabled={!selectedPresetAdmissionId || !selectedPresetPatientLabel}
                    variant={selectedPresetAssignment?.pendingTasks.includes(task) ? 'default' : 'outline'}
                    className="h-auto px-2 py-1.5 text-xs"
                    onClick={() => togglePatientPreset('pendingTasks', task)}
                  >
                    {task}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Critical concern presets</Label>
              <div className="flex flex-wrap gap-2">
                {CRITICAL_CONCERN_PRESETS.map((concern) => (
                  <Button
                    key={concern}
                    type="button"
                    size="sm"
                    disabled={!selectedPresetAdmissionId || !selectedPresetPatientLabel}
                    variant={selectedPresetAssignment?.criticalConcerns.includes(concern) ? 'destructive' : 'outline'}
                    className="h-auto px-2 py-1.5 text-xs"
                    onClick={() => togglePatientPreset('criticalConcerns', concern)}
                  >
                    {concern}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="critical-patients">Critical Patients</Label>
            <Textarea
              id="critical-patients"
              value={criticalPatients}
              onChange={(e) => setCriticalPatients(e.target.value)}
              placeholder="List patients requiring close monitoring or special attention"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pending-tasks">Pending Tasks</Label>
            <Textarea
              id="pending-tasks"
              value={pendingTasks}
              onChange={(e) => setPendingTasks(e.target.value)}
              placeholder="List any tasks that need to be completed by the incoming shift"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Medications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Medications Due
          </CardTitle>
          <CardDescription>
            List medications due during the incoming shift
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="medications-due">Medications Due</Label>
            <Textarea
              id="medications-due"
              value={medicationsDue}
              onChange={(e) => setMedicationsDue(e.target.value)}
              placeholder="List scheduled medications with times and bed numbers"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createHandover.isPending || !isFormValid}
        >
          <Save className="h-4 w-4 mr-2" />
          {createHandover.isPending ? 'Submitting...' : 'Submit Handover'}
        </Button>
      </div>
    </div>
  );
}
