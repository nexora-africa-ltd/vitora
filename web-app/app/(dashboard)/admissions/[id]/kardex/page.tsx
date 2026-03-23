'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Plus, AlertTriangle, FileText, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CarePlanPanel } from '@/components/encounters/care-plan-panel';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { StaffSearchCombobox } from '@/components/clinics/staff-search-combobox';
import {
  useAdmission,
  useKardexByAdmission,
  useUpdateKardex,
  useAddKardexShiftNote,
  useAddKardexHandoverNote,
  useAddCarePlanEntry,
  useUpdateCarePlanEntry,
  useResolveAllCarePlans,
  useDiscontinueCarePlanEntry,
} from '@/lib/hooks/use-inpatient';
import { useAIEnabled, useAIStatus } from '@/lib/hooks/use-ai';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import { ConsumableUsagePanel } from '@/components/inpatient';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import type { CarePlanEntryStatus, MaternityContinuityAction, RiskLevel, ShiftType } from '@/lib/types/inpatient';
import type { AIQuickAction } from '@/lib/types/ai';

const RISK_LEVELS: { value: RiskLevel; label: string }[] = [
  { value: 'LOW', label: 'Low Risk' },
  { value: 'MODERATE', label: 'Medium Risk' },
  { value: 'HIGH', label: 'High Risk' },
];

const SHIFT_TYPES: { value: ShiftType; label: string }[] = [
  { value: 'DAY', label: 'Day Shift' },
  { value: 'NIGHT', label: 'Night Shift' },
];

const MATERNITY_CONTINUITY_ACTIONS: { value: MaternityContinuityAction; label: string }[] = [
  { value: 'NONE', label: 'No postpartum workflow set' },
  { value: 'CONTINUE_POSTPARTUM_OBSERVATION', label: 'Continue Postpartum Observation' },
  { value: 'SCHEDULE_EARLY_PNC', label: 'Prepare Early PNC Scheduling' },
  { value: 'ROUTE_TO_PNC_QUEUE', label: 'Prepare Direct PNC Queue Routing' },
];

const KARDEX_QUICK_ACTIONS: AIQuickAction[] = [
  {
    id: 'kardex-care-plan',
    label: 'Suggest care plan',
    query: '',
    userMessage: '📋 Generating care plan suggestions...',
    panelAction: 'care-plan',
  },
  {
    id: 'kardex-nursing-priorities',
    label: 'Nursing priorities',
    query:
      'Based on the kardex details, admission diagnosis, allergies, risks, diet, isolation requirements, and current nursing notes, summarize the most important nursing priorities for this patient over the next shift.',
    userMessage: '🩺 Summarizing nursing priorities...',
  },
  {
    id: 'kardex-shift-handover-summary',
    label: 'Summarize shift notes',
    query:
      'Summarize the most recent shift notes and handover priorities for this admitted patient. Highlight urgent nursing concerns, pending tasks, escalations, isolation or safety risks, and what the incoming team should act on first.',
    userMessage: '📝 Summarizing recent shift notes and handover priorities...',
  },
];

export default function KardexPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();
  const { toast } = useToast();
  const admissionId = Number(params.id);
  const aiEnabled = useAIEnabled();
  const { data: aiStatus } = useAIStatus();

  const chatCtx = useOptionalAIChatContext();
  const setEncounterAwareContext = chatCtx?.setEncounterAwareContext;
  const setQuickActions = chatCtx?.setQuickActions;
  const activePanelAction = chatCtx?.activePanelAction ?? null;
  const clearPanelAction = chatCtx?.clearPanelAction;

  // Auto-open shift note dialog from URL param
  const action = searchParams.get('action');

  const { data: admission, isLoading: admissionLoading } = useAdmission(admissionId);
  const { data: kardex, isLoading: kardexLoading, refetch } = useKardexByAdmission(admissionId);
  const updateKardex = useUpdateKardex();
  const addShiftNote = useAddKardexShiftNote();
  const addHandoverNote = useAddKardexHandoverNote();
  const addCarePlanEntry = useAddCarePlanEntry();
  const updateCarePlanEntry = useUpdateCarePlanEntry();
  const resolveAllCarePlans = useResolveAllCarePlans();
  const discontinueCarePlanEntry = useDiscontinueCarePlanEntry();

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [mobilityStatus, setMobilityStatus] = useState('');
  const [dietaryRequirements, setDietaryRequirements] = useState('');
  const [allergies, setAllergies] = useState('');
  const [ivAccess, setIvAccess] = useState('');
  const [maternityContinuityAction, setMaternityContinuityAction] = useState<MaternityContinuityAction>('NONE');
  const [maternityContinuityNotes, setMaternityContinuityNotes] = useState('');

  const [fallRisk, setFallRisk] = useState<RiskLevel>('LOW');
  const [pressureSoreRisk, setPressureSoreRisk] = useState<RiskLevel>('LOW');
  const [isolationRequired, setIsolationRequired] = useState(false);
  const [isolationType, setIsolationType] = useState('');

  // Care plan entry dialog state
  const [carePlanDialogOpen, setCarePlanDialogOpen] = useState(false);
  const [cpAssessment, setCpAssessment] = useState('');
  const [cpDiagnosis, setCpDiagnosis] = useState('');
  const [cpGoal, setCpGoal] = useState('');
  const [cpPlanOfAction, setCpPlanOfAction] = useState('');
  const [cpRationale, setCpRationale] = useState('');
  const [cpImplementation, setCpImplementation] = useState('');
  const [cpEvaluation, setCpEvaluation] = useState('');

  // Update care plan entry dialog state
  const [updateCpDialogOpen, setUpdateCpDialogOpen] = useState(false);
  const [updateCpEntryId, setUpdateCpEntryId] = useState<number | null>(null);
  const [updateCpImplementation, setUpdateCpImplementation] = useState('');
  const [updateCpEvaluation, setUpdateCpEvaluation] = useState('');
  const [updateCpStatus, setUpdateCpStatus] = useState<CarePlanEntryStatus>('ACTIVE');

  // Discontinue care plan entry dialog state
  const [discontinueCpDialogOpen, setDiscontinueCpDialogOpen] = useState(false);
  const [discontinueCpEntryId, setDiscontinueCpEntryId] = useState<number | null>(null);
  const [discontinueCpReason, setDiscontinueCpReason] = useState('');

  // Bulk resolve dialog state
  const [resolveAllDialogOpen, setResolveAllDialogOpen] = useState(false);
  const [resolveAllEvaluation, setResolveAllEvaluation] = useState('');

  // New note dialogs
  const [shiftNoteOpen, setShiftNoteOpen] = useState(false);
  const [shiftNoteContent, setShiftNoteContent] = useState('');
  const [shiftNoteType, setShiftNoteType] = useState<ShiftType>('DAY');

  // Handover note state - matches backend API
  const [handoverNoteOpen, setHandoverNoteOpen] = useState(false);
  const [handoverShiftEnding, setHandoverShiftEnding] = useState<ShiftType>('DAY');
  const [handoverIncomingNurse, setHandoverIncomingNurse] = useState<number | undefined>(undefined);
  const [handoverPendingTasks, setHandoverPendingTasks] = useState('');
  const [handoverEscalations, setHandoverEscalations] = useState('');
  const [autoTriggerCarePlan, setAutoTriggerCarePlan] = useState(false);

  const isLoading = admissionLoading || kardexLoading;
  const hasNursingCarePlanEntries = (kardex?.care_plan_entries?.length ?? 0) > 0;
  const isTibaBotOnline = Boolean(aiStatus?.enabled && aiStatus?.service_available);
  const shouldShowAICarePlanPanel = !hasNursingCarePlanEntries && aiEnabled && isTibaBotOnline;
  const patientAllergies = useMemo(
    () => kardex?.allergies?.split(',').map((allergy) => allergy.trim()).filter(Boolean) ?? [],
    [kardex?.allergies]
  );
  const recentShiftNotesSummary = useMemo(() => {
    return kardex?.shift_notes
      ?.slice(0, 3)
      .map((note) => {
        const noteText = (note.content || note.notes || '').trim();
        if (!noteText) return null;
        return `${note.shift_display || note.shift}: ${noteText}`;
      })
      .filter(Boolean)
      .join(' | ');
  }, [kardex?.shift_notes]);
  const recentHandoverSummary = useMemo(() => {
    return kardex?.handover_notes
      ?.slice(0, 2)
      .map((note) => {
        const pendingTasks = note.pending_tasks?.trim();
        const escalations = note.escalations?.trim();
        const parts = [
          note.shift_ending ? `${note.shift_ending} handover` : 'handover',
          pendingTasks ? `pending: ${pendingTasks}` : null,
          escalations ? `escalations: ${escalations}` : null,
        ].filter(Boolean);
        return parts.join(', ');
      })
      .filter(Boolean)
      .join(' | ');
  }, [kardex?.handover_notes]);

  useEffect(() => {
    if (!activePanelAction || !clearPanelAction) return;
    if (activePanelAction === 'care-plan') {
      setAutoTriggerCarePlan(true);
      clearPanelAction();
    }
  }, [activePanelAction, clearPanelAction]);

  useEffect(() => {
    if (!setEncounterAwareContext || !admission || !kardex) return;

    const daysLOS = Math.ceil(
      (Date.now() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
    );

    setEncounterAwareContext(
      {
        patient_age: admission.patient_age ?? 0,
        patient_sex: admission.patient_gender ?? 'O',
        allergies: patientAllergies,
      },
      {
        chief_complaint:
          admission.admitting_diagnosis_text || admission.admitting_diagnosis || undefined,
        admission_diagnosis:
          admission.admitting_diagnosis_text || admission.admitting_diagnosis || undefined,
        ward_name: admission.ward_name ?? undefined,
        bed_number: admission.bed_number ?? undefined,
        admission_status: admission.admission_status ?? undefined,
        length_of_stay_days: daysLOS,
        diet: kardex.dietary_requirements || admission.diet || undefined,
        special_instructions: [
          kardex.isolation_required && kardex.isolation_type
            ? `Isolation required: ${kardex.isolation_type}`
            : admission.special_instructions || null,
          recentShiftNotesSummary ? `Recent shift notes: ${recentShiftNotesSummary}` : null,
          recentHandoverSummary ? `Recent handover: ${recentHandoverSummary}` : null,
        ].filter(Boolean).join(' | ') || undefined,
      }
    );

    return () => {
      setEncounterAwareContext(null, null);
    };
  }, [
    admission,
    kardex,
    patientAllergies,
    recentHandoverSummary,
    recentShiftNotesSummary,
    setEncounterAwareContext,
  ]);

  useEffect(() => {
    if (!setQuickActions) return;
    setQuickActions(KARDEX_QUICK_ACTIONS);
    return () => {
      setQuickActions([]);
    };
  }, [setQuickActions]);

  // Auto-open shift note dialog when navigating with action=shift-note
  useEffect(() => {
    if (action === 'shift-note' && kardex && !isLoading) {
      setShiftNoteOpen(true);
      // Clear the URL param after opening
      router.replace(`/admissions/${admissionId}/kardex`, { scroll: false });
    }
  }, [action, kardex, isLoading, router, admissionId]);

  // Initialize edit form when kardex loads
  const initEditForm = () => {
    if (kardex) {
      setMobilityStatus(kardex.mobility_status || '');
      setDietaryRequirements(kardex.dietary_requirements || '');
      setAllergies(kardex.allergies || '');
      setIvAccess(kardex.iv_access || '');
      setMaternityContinuityAction(kardex.maternity_continuity_action || 'NONE');
      setMaternityContinuityNotes(kardex.maternity_continuity_notes || '');

      setFallRisk(kardex.fall_risk || 'LOW');
      setPressureSoreRisk(kardex.pressure_sore_risk || 'LOW');
      setIsolationRequired(kardex.isolation_required || false);
      setIsolationType(kardex.isolation_type || '');
    }
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!kardex) return;
    try {
      await updateKardex.mutateAsync({
        id: kardex.id,
        data: {
          mobility_status: mobilityStatus || undefined,
          dietary_requirements: dietaryRequirements || undefined,
          allergies: allergies || undefined,
          iv_access: ivAccess || undefined,
          maternity_continuity_action: admission?.mch_registration ? maternityContinuityAction : undefined,
          maternity_continuity_notes: admission?.mch_registration ? maternityContinuityNotes || undefined : undefined,

          fall_risk: fallRisk,
          pressure_sore_risk: pressureSoreRisk,
          isolation_required: isolationRequired,
          isolation_type: isolationRequired ? isolationType : undefined,
        },
      });
      toast({
        title: 'Success',
        description: 'Kardex updated successfully',
      });
      setEditDialogOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update kardex',
        variant: 'destructive',
      });
      console.error(error);
    }
  };

  const handleAddShiftNote = async () => {
    if (!kardex || !shiftNoteContent) return;
    try {
      await addShiftNote.mutateAsync({
        kardexId: kardex.id,
        data: {
          shift: shiftNoteType,
          content: shiftNoteContent,
        },
      });
      toast({
        title: 'Success',
        description: 'Shift note added successfully',
      });
      setShiftNoteOpen(false);
      setShiftNoteContent('');
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add shift note',
        variant: 'destructive',
      });
      console.error(error);
    }
  };

  const handleAddHandoverNote = async () => {
    if (!kardex || !handoverPendingTasks.trim() || !handoverIncomingNurse) return;
    try {
      await addHandoverNote.mutateAsync({
        kardexId: kardex.id,
        data: {
          incoming_nurse: handoverIncomingNurse,
          shift_ending: handoverShiftEnding,
          pending_tasks: handoverPendingTasks.trim(),
          escalations: handoverEscalations.trim() || undefined,
        },
      });
      toast({
        title: 'Success',
        description: 'Handover note added successfully',
      });
      setHandoverNoteOpen(false);
      setHandoverIncomingNurse(undefined);
      setHandoverPendingTasks('');
      setHandoverEscalations('');
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add handover note',
        variant: 'destructive',
      });
      console.error(error);
    }
  };

  const handleAddCarePlanEntry = async () => {
    if (!kardex || !cpAssessment.trim() || !cpDiagnosis.trim() || !cpGoal.trim() || !cpPlanOfAction.trim() || !cpRationale.trim()) return;
    try {
      await addCarePlanEntry.mutateAsync({
        kardexId: kardex.id,
        data: {
          recorded_at: new Date().toISOString(),
          assessment: cpAssessment.trim(),
          nursing_diagnosis: cpDiagnosis.trim(),
          goal_and_outcome_criteria: cpGoal.trim(),
          plan_of_action: cpPlanOfAction.trim(),
          scientific_rationale: cpRationale.trim(),
          implementation: cpImplementation.trim() || undefined,
          evaluation: cpEvaluation.trim() || undefined,
        },
      });
      toast({ title: 'Success', description: 'Care plan entry added' });
      setCarePlanDialogOpen(false);
      setCpAssessment('');
      setCpDiagnosis('');
      setCpGoal('');
      setCpPlanOfAction('');
      setCpRationale('');
      setCpImplementation('');
      setCpEvaluation('');
      refetch();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to add care plan entry', variant: 'destructive' });
      console.error(error);
    }
  };

  const openUpdateCarePlanEntry = (entry: { id: number; implementation: string; evaluation: string; status: CarePlanEntryStatus }) => {
    setUpdateCpEntryId(entry.id);
    setUpdateCpImplementation(entry.implementation || '');
    setUpdateCpEvaluation(entry.evaluation || '');
    setUpdateCpStatus(entry.status);
    setUpdateCpDialogOpen(true);
  };

  const handleUpdateCarePlanEntry = async () => {
    if (!kardex || !updateCpEntryId) return;
    try {
      await updateCarePlanEntry.mutateAsync({
        kardexId: kardex.id,
        entryId: updateCpEntryId,
        data: {
          implementation: updateCpImplementation.trim() || undefined,
          evaluation: updateCpEvaluation.trim() || undefined,
          status: updateCpStatus,
        },
      });
      toast({ title: 'Success', description: 'Care plan entry updated' });
      setUpdateCpDialogOpen(false);
      setUpdateCpEntryId(null);
      refetch();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update care plan entry', variant: 'destructive' });
      console.error(error);
    }
  };

  const handleDiscontinueCarePlanEntry = async () => {
    if (!kardex || !discontinueCpEntryId || !discontinueCpReason.trim()) return;
    try {
      await discontinueCarePlanEntry.mutateAsync({
        kardexId: kardex.id,
        entryId: discontinueCpEntryId,
        reason: discontinueCpReason.trim(),
      });
      toast({ title: 'Success', description: 'Care plan entry discontinued' });
      setDiscontinueCpDialogOpen(false);
      setDiscontinueCpEntryId(null);
      setDiscontinueCpReason('');
      refetch();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to discontinue care plan entry', variant: 'destructive' });
      console.error(error);
    }
  };

  const handleResolveAllCarePlans = async () => {
    if (!kardex) return;
    try {
      const result = await resolveAllCarePlans.mutateAsync({
        kardexId: kardex.id,
        evaluation: resolveAllEvaluation.trim() || undefined,
      });
      toast({ title: 'Success', description: result.message });
      setResolveAllDialogOpen(false);
      setResolveAllEvaluation('');
      refetch();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to resolve care plan entries', variant: 'destructive' });
      console.error(error);
    }
  };

  const openDiscontinueEntry = (entryId: number) => {
    setDiscontinueCpEntryId(entryId);
    setDiscontinueCpReason('');
    setDiscontinueCpDialogOpen(true);
  };

  const pendingCarePlanCount = kardex?.care_plan_entries?.filter(
    (e) => e.status === 'ACTIVE' || e.status === 'ONGOING'
  ).length ?? 0;

  if (isLoading) {
    return <KardexSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          View Admissions
        </Button>
      </div>
    );
  }

  if (!kardex) {
    return (
      <div className="container mx-auto py-12 text-center">
        <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-xl font-semibold">No Kardex Found</p>
        <p className="text-muted-foreground mt-2">
          A nursing kardex should be automatically created on admission.
        </p>
        <Button onClick={() => router.push(`/admissions/${admissionId}`)} className="mt-4">
          View Admission
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Nursing Kardex"
        helpContent={`${kardex.patient_name} - ${kardex.ward_name} - Bed ${kardex.bed_number}. Manage nursing care information, shift notes, and handover documentation.`}
        actions={
          <Button variant="outline" onClick={initEditForm}>Edit Kardex</Button>
        }
      />

      {/* Quick Summary Cards - Always Visible */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        {/* Allergies */}
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Allergies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-destructive">
              {kardex.allergies || 'No known allergies'}
            </p>
          </CardContent>
        </Card>

        {/* Diet */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Diet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {kardex.dietary_requirements || kardex.diet || 'Regular diet'}
            </p>
          </CardContent>
        </Card>

        {/* Mobility */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Mobility</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {kardex.mobility_status || 'Not specified'}
            </p>
          </CardContent>
        </Card>

        {/* IV Access */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">IV Access</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {kardex.iv_access || 'None'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Risk Assessment Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-3">
        {/* Fall Risk */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Fall Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={kardex.fall_risk === 'HIGH' ? 'destructive' : kardex.fall_risk === 'MODERATE' ? 'warning' : 'success'}>
              {kardex.fall_risk_display || kardex.fall_risk}
            </Badge>
          </CardContent>
        </Card>

        {/* Pressure Sore Risk */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              <span className="sm:hidden">Pressure Risk</span>
              <span className="hidden sm:inline">Pressure Sore Risk</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={kardex.pressure_sore_risk === 'HIGH' ? 'destructive' : kardex.pressure_sore_risk === 'MODERATE' ? 'warning' : 'success'}>
              {kardex.pressure_sore_risk_display || kardex.pressure_sore_risk}
            </Badge>
          </CardContent>
        </Card>

        {/* Isolation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Isolation</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={kardex.isolation_required ? 'destructive' : 'secondary'}>
              {kardex.isolation_required ? 'Required' : 'Not Required'}
            </Badge>
            {kardex.isolation_required && kardex.isolation_type && (
              <p className="text-xs text-muted-foreground mt-1">{kardex.isolation_type}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {admission.mch_registration && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">Postpartum Continuity</CardTitle>
              <HelpPopover content="Keep nursing handoff aligned with the planned postpartum workflow so discharge, early PNC, and inpatient teaching all stay connected." />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant="outline" className="w-fit border-amber-300 bg-white/70">
              {kardex.maternity_continuity_action_display || 'No postpartum workflow set'}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {kardex.maternity_continuity_notes || 'No postpartum workflow notes recorded yet.'}
            </p>
          </CardContent>
        </Card>
      )}

      <ConsumableUsagePanel
        admissionId={admissionId}
        isActive={admission.admission_status === 'ACTIVE'}
      />

      {/* Edit Kardex Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Kardex</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mobility Status</Label>
                <Input
                  value={mobilityStatus}
                  onChange={(e) => setMobilityStatus(e.target.value)}
                  placeholder="e.g., Ambulatory, Wheelchair"
                />
              </div>
              <div className="space-y-2">
                <Label>Dietary Requirements</Label>
                <Input
                  value={dietaryRequirements}
                  onChange={(e) => setDietaryRequirements(e.target.value)}
                  placeholder="e.g., Regular, Diabetic, NPO"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Allergies</Label>
                <Input
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="e.g., Penicillin, Latex"
                />
              </div>
              <div className="space-y-2">
                <Label>IV Access</Label>
                <Input
                  value={ivAccess}
                  onChange={(e) => setIvAccess(e.target.value)}
                  placeholder="e.g., Right arm IV cannula"
                />
              </div>
            </div>
            {admission.mch_registration && (
              <>
                <div className="space-y-2">
                  <Label>Postpartum Workflow</Label>
                  <Select value={maternityContinuityAction} onValueChange={(value) => setMaternityContinuityAction(value as MaternityContinuityAction)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MATERNITY_CONTINUITY_ACTIONS.map((action) => (
                        <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Postpartum Workflow Notes</Label>
                  <Textarea
                    value={maternityContinuityNotes}
                    onChange={(e) => setMaternityContinuityNotes(e.target.value)}
                    placeholder="Document nursing tasks that still need to happen before postpartum transition or early PNC handoff."
                    rows={3}
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fall Risk</Label>
                <Select value={fallRisk} onValueChange={(v) => setFallRisk(v as RiskLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pressure Sore Risk</Label>
                <Select value={pressureSoreRisk} onValueChange={(v) => setPressureSoreRisk(v as RiskLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Isolation Required</Label>
                <Switch checked={isolationRequired} onCheckedChange={setIsolationRequired} />
              </div>
              {isolationRequired && (
                <Input
                  value={isolationType}
                  onChange={(e) => setIsolationType(e.target.value)}
                  placeholder="e.g., Contact, Droplet, Airborne"
                />
              )}
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateKardex.isPending}>
              {updateKardex.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Recent Shift Notes - Always Visible */}
      {(kardex.shift_notes?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Shift Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {kardex.shift_notes?.slice(0, 3).map((note) => (
                <div key={note.id} className="border-l-2 border-primary/50 pl-3 py-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium">{note.nurse_username}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {note.shift_display || note.shift}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(note.timestamp || note.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 break-words">{note.content || note.notes}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="care-plan" className="space-y-4">
        <TabsList className="w-full grid grid-cols-3 h-auto">
          <TabsTrigger value="care-plan" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">
            <span className="sm:hidden">Plan</span>
            <span className="hidden sm:inline">Care Plan</span>
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">
            <span className="sm:hidden">Notes</span>
            <span className="hidden sm:inline">Shift Notes</span>
          </TabsTrigger>
          <TabsTrigger value="handover" className="text-xs sm:text-sm md:text-base md:data-[state=active]:text-lg md:data-[state=active]:font-semibold transition-all">
            Handover
          </TabsTrigger>
        </TabsList>

        {/* Nursing Care Plan Tab (ADPIE structure) */}
        <TabsContent value="care-plan" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Nursing Care Plan (24 Hours)</h3>
              <HelpPopover content="Structured nursing care plan following the ADPIE process: Assessment, Diagnosis, Planning, Implementation, Evaluation. Each row represents one nursing problem and its care plan." />
              {pendingCarePlanCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {pendingCarePlanCount} pending
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {pendingCarePlanCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => setResolveAllDialogOpen(true)}
                >
                  <CheckCircle2 className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Resolve All</span>
                </Button>
              )}
              <Dialog open={carePlanDialogOpen} onOpenChange={setCarePlanDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full sm:w-auto" size="sm">
                    <Plus className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Add Entry</span>
                  </Button>
                </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <div className="flex items-center gap-2">
                    <DialogTitle>New Care Plan Entry</DialogTitle>
                    <HelpPopover content="Document a nursing care plan entry following the ADPIE process. Assessment and Diagnosis are required. Implementation and Evaluation can be added later." />
                  </div>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Assessment (Cluster of Cues) <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={cpAssessment}
                      onChange={(e) => setCpAssessment(e.target.value)}
                      placeholder="Patient assessment findings, signs and symptoms observed..."
                      className="min-h-[80px] resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Nursing Diagnosis <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={cpDiagnosis}
                      onChange={(e) => setCpDiagnosis(e.target.value)}
                      placeholder="e.g., Risk for infection related to..."
                      className="min-h-[60px] resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Goal &amp; Outcome Criteria <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={cpGoal}
                      onChange={(e) => setCpGoal(e.target.value)}
                      placeholder="Expected goals and measurable outcomes..."
                      className="min-h-[60px] resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Plan of Action / Intervention <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={cpPlanOfAction}
                      onChange={(e) => setCpPlanOfAction(e.target.value)}
                      placeholder="Nursing interventions to be carried out..."
                      className="min-h-[60px] resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Scientific Rationale <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={cpRationale}
                      onChange={(e) => setCpRationale(e.target.value)}
                      placeholder="Scientific basis for the planned interventions..."
                      className="min-h-[60px] resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Implementation (optional)</Label>
                    <Textarea
                      value={cpImplementation}
                      onChange={(e) => setCpImplementation(e.target.value)}
                      placeholder="What has been implemented so far..."
                      className="min-h-[60px] resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Evaluation (optional)</Label>
                    <Textarea
                      value={cpEvaluation}
                      onChange={(e) => setCpEvaluation(e.target.value)}
                      placeholder="Evaluation of outcomes..."
                      className="min-h-[60px] resize-none"
                    />
                  </div>
                </div>
                <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                  <Button variant="outline" onClick={() => setCarePlanDialogOpen(false)} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddCarePlanEntry}
                    disabled={!cpAssessment.trim() || !cpDiagnosis.trim() || !cpGoal.trim() || !cpPlanOfAction.trim() || !cpRationale.trim() || addCarePlanEntry.isPending}
                    className="w-full sm:w-auto"
                  >
                    {addCarePlanEntry.isPending ? 'Saving...' : 'Save Entry'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {shouldShowAICarePlanPanel && (
            <CarePlanPanel
              admissionId={admission.id}
              primaryDiagnosis={
                admission.admitting_diagnosis_text || admission.admitting_diagnosis || undefined
              }
              patientAge={admission.patient_age ?? 0}
              patientSex={admission.patient_gender === 'F' ? 'female' : 'male'}
              allergies={patientAllergies}
              autoTrigger={autoTriggerCarePlan}
              onAutoTriggerConsumed={() => setAutoTriggerCarePlan(false)}
            />
          )}

          {/* Update Care Plan Entry Dialog */}
          <Dialog open={updateCpDialogOpen} onOpenChange={setUpdateCpDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>Update Care Plan Entry</DialogTitle>
                  <HelpPopover content="Add implementation details and evaluation. Change status to Resolved when goals are met, or use Discontinue for abandoned plans." />
                </div>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Implementation</Label>
                  <Textarea
                    value={updateCpImplementation}
                    onChange={(e) => setUpdateCpImplementation(e.target.value)}
                    placeholder="What was actually carried out..."
                    className="min-h-[80px] resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Evaluation</Label>
                  <Textarea
                    value={updateCpEvaluation}
                    onChange={(e) => setUpdateCpEvaluation(e.target.value)}
                    placeholder="Were goals and outcomes met?"
                    className="min-h-[80px] resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Status</Label>
                  <Select value={updateCpStatus} onValueChange={(v) => setUpdateCpStatus(v as CarePlanEntryStatus)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="ONGOING">Ongoing</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button variant="outline" onClick={() => setUpdateCpDialogOpen(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button onClick={handleUpdateCarePlanEntry} disabled={updateCarePlanEntry.isPending} className="w-full sm:w-auto">
                  {updateCarePlanEntry.isPending ? 'Saving...' : 'Update'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Discontinue Care Plan Entry Dialog */}
          <Dialog open={discontinueCpDialogOpen} onOpenChange={setDiscontinueCpDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>Discontinue Care Plan Entry</DialogTitle>
                  <HelpPopover content="Discontinue a care plan that is no longer applicable — e.g., patient refused, condition changed, or plan superseded." />
                </div>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Reason for Discontinuation <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={discontinueCpReason}
                    onChange={(e) => setDiscontinueCpReason(e.target.value)}
                    placeholder="e.g., Patient refused intervention, condition resolved spontaneously, plan superseded by new diagnosis..."
                    className="min-h-[80px] resize-none"
                  />
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button variant="outline" onClick={() => setDiscontinueCpDialogOpen(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDiscontinueCarePlanEntry}
                  disabled={!discontinueCpReason.trim() || discontinueCarePlanEntry.isPending}
                  className="w-full sm:w-auto"
                >
                  {discontinueCarePlanEntry.isPending ? 'Discontinuing...' : 'Discontinue'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Resolve All Care Plans Dialog */}
          <Dialog open={resolveAllDialogOpen} onOpenChange={setResolveAllDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>Resolve All Care Plans</DialogTitle>
                  <HelpPopover content="Bulk-resolve all active and ongoing care plan entries. Typically used during discharge clearance when all nursing goals have been met." />
                </div>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  This will resolve <span className="font-medium text-foreground">{pendingCarePlanCount}</span> active/ongoing care plan {pendingCarePlanCount === 1 ? 'entry' : 'entries'}.
                </p>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Evaluation Note (optional)</Label>
                  <Textarea
                    value={resolveAllEvaluation}
                    onChange={(e) => setResolveAllEvaluation(e.target.value)}
                    placeholder="Brief note on overall care plan outcomes..."
                    className="min-h-[60px] resize-none"
                  />
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                <Button variant="outline" onClick={() => setResolveAllDialogOpen(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button onClick={handleResolveAllCarePlans} disabled={resolveAllCarePlans.isPending} className="w-full sm:w-auto">
                  {resolveAllCarePlans.isPending ? 'Resolving...' : `Resolve ${pendingCarePlanCount} ${pendingCarePlanCount === 1 ? 'Entry' : 'Entries'}`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {(kardex.care_plan_entries?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No care plan entries recorded yet.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click &quot;Add Entry&quot; to document a nursing care plan following the ADPIE process.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {kardex.care_plan_entries?.map((entry) => {
                const isTerminal = entry.status === 'RESOLVED' || entry.status === 'DISCONTINUED';
                return (
                <Card key={entry.id} className={isTerminal ? 'opacity-75' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={
                            entry.status === 'ACTIVE' ? 'default'
                            : entry.status === 'RESOLVED' ? 'success'
                            : entry.status === 'DISCONTINUED' ? 'destructive'
                            : 'warning'
                          }
                          className="shrink-0 w-fit"
                        >
                          {entry.status_display || entry.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDateTime(entry.recorded_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          By {entry.recorded_by_username}
                        </span>
                        {!isTerminal && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openUpdateCarePlanEntry(entry)}>
                              Update
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => openDiscontinueEntry(entry.id)}
                            >
                              <Ban className="h-3.5 w-3.5 sm:mr-1" />
                              <span className="hidden sm:inline">Discontinue</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Assessment</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{entry.assessment}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Nursing Diagnosis</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{entry.nursing_diagnosis}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Goal &amp; Outcome Criteria</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{entry.goal_and_outcome_criteria}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Plan of Action</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{entry.plan_of_action}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Scientific Rationale</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{entry.scientific_rationale}</p>
                      </div>
                      {entry.implementation && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Implementation</p>
                          <p className="text-sm whitespace-pre-wrap break-words">{entry.implementation}</p>
                        </div>
                      )}
                      {entry.evaluation && (
                        <div className="md:col-span-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Evaluation</p>
                          <p className="text-sm whitespace-pre-wrap break-words">{entry.evaluation}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Shift Notes Tab */}
        <TabsContent value="notes" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
            <h3 className="text-lg font-semibold">Shift Notes</h3>
            <Dialog open={shiftNoteOpen} onOpenChange={setShiftNoteOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto" size="sm">
                  <Plus className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Add Shift Note</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <div className="flex items-center gap-2">
                    <DialogTitle>Add Shift Note</DialogTitle>
                    <HelpPopover content="Record your clinical observations, patient responses to treatment, and care activities performed during your shift." />
                  </div>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Shift</Label>
                    <Select value={shiftNoteType} onValueChange={(v) => setShiftNoteType(v as ShiftType)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIFT_TYPES.map((shift) => (
                          <SelectItem key={shift.value} value={shift.value}>
                            {shift.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Note</Label>
                    <Textarea
                      value={shiftNoteContent}
                      onChange={(e) => setShiftNoteContent(e.target.value)}
                      placeholder="Patient condition, vitals, medications given, interventions performed..."
                      className="min-h-[120px] resize-none"
                    />
                  </div>
                </div>
                <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                  <Button variant="outline" onClick={() => setShiftNoteOpen(false)} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleAddShiftNote} 
                    disabled={!shiftNoteContent.trim() || addShiftNote.isPending}
                    className="w-full sm:w-auto"
                  >
                    {addShiftNote.isPending ? 'Saving...' : 'Save Note'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {(kardex.shift_notes?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No shift notes recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {kardex.shift_notes?.map((note) => (
                <Card key={note.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <Badge variant="outline" className="w-fit">{note.shift} Shift</Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDateTime(note.timestamp)}
                      </span>
                    </div>
                    <CardDescription>
                      By {note.nurse_username}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Handover Tab */}
        <TabsContent value="handover" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
            <h3 className="text-lg font-semibold">Handover Notes</h3>
            <Dialog open={handoverNoteOpen} onOpenChange={setHandoverNoteOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto" size="sm">
                  <Plus className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Add Handover</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <div className="flex items-center gap-2">
                    <DialogTitle>Add Handover Note</DialogTitle>
                    <HelpPopover content="Document critical patient information, pending tasks, and escalations for the incoming nursing team." />
                  </div>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Shift Ending <span className="text-destructive">*</span></Label>
                    <Select value={handoverShiftEnding} onValueChange={(v) => setHandoverShiftEnding(v as ShiftType)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIFT_TYPES.map((shift) => (
                          <SelectItem key={shift.value} value={shift.value}>
                            {shift.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Incoming Nurse <span className="text-destructive">*</span></Label>
                    <StaffSearchCombobox
                      value={handoverIncomingNurse}
                      onSelect={(userId) => setHandoverIncomingNurse(userId)}
                      placeholder="Select incoming nurse..."
                      excludeUserIds={user?.id ? [user.id] : []}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Pending Tasks <span className="text-destructive">*</span></Label>
                    <Textarea
                      value={handoverPendingTasks}
                      onChange={(e) => setHandoverPendingTasks(e.target.value)}
                      placeholder="Pending treatments, medications due, vital sign monitoring, family updates..."
                      className="min-h-[100px] resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Escalations (optional)</Label>
                    <Textarea
                      value={handoverEscalations}
                      onChange={(e) => setHandoverEscalations(e.target.value)}
                      placeholder="Issues requiring urgent attention, abnormal findings, safety concerns..."
                      className="min-h-[80px] resize-none"
                    />
                  </div>
                </div>
                <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
                  <Button variant="outline" onClick={() => setHandoverNoteOpen(false)} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleAddHandoverNote} 
                    disabled={!handoverPendingTasks.trim() || !handoverIncomingNurse || addHandoverNote.isPending}
                    className="w-full sm:w-auto"
                  >
                    {addHandoverNote.isPending ? 'Saving...' : 'Save Handover'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {(kardex.handover_notes?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No handover notes recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {kardex.handover_notes?.map((note) => (
                <Card key={note.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{note.shift_ending}</Badge>
                        <span>→</span>
                        <Badge variant="outline">{note.shift_ending === 'DAY' ? 'NIGHT' : 'DAY'}</Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatDateTime(note.created_at)}
                      </span>
                    </div>
                    <CardDescription className="truncate">
                      From {note.outgoing_nurse_username} to {note.incoming_nurse_username}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap break-words">{note.pending_tasks}</p>
                    {note.escalations && (
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-sm font-medium text-destructive">Escalations:</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{note.escalations}</p>
                      </div>
                    )}
                    {note.acknowledged_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Acknowledged at {formatDateTime(note.acknowledged_at)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KardexSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
