'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Plus, AlertTriangle, FileText } from 'lucide-react';
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
} from '@/lib/hooks/use-inpatient';
import { useUser } from '@/lib/auth';
import { useToast } from '@/lib/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';
import type { RiskLevel, ShiftType, CarePlanEntryStatus } from '@/lib/types/inpatient';

const RISK_LEVELS: { value: RiskLevel; label: string }[] = [
  { value: 'LOW', label: 'Low Risk' },
  { value: 'MODERATE', label: 'Medium Risk' },
  { value: 'HIGH', label: 'High Risk' },
];

const SHIFT_TYPES: { value: ShiftType; label: string }[] = [
  { value: 'DAY', label: 'Day Shift' },
  { value: 'NIGHT', label: 'Night Shift' },
];

export default function KardexPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();
  const { toast } = useToast();
  const admissionId = Number(params.id);

  // Auto-open shift note dialog from URL param
  const action = searchParams.get('action');

  const { data: admission, isLoading: admissionLoading } = useAdmission(admissionId);
  const { data: kardex, isLoading: kardexLoading, refetch } = useKardexByAdmission(admissionId);
  const updateKardex = useUpdateKardex();
  const addShiftNote = useAddKardexShiftNote();
  const addHandoverNote = useAddKardexHandoverNote();
  const addCarePlanEntry = useAddCarePlanEntry();
  const updateCarePlanEntry = useUpdateCarePlanEntry();

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [mobilityStatus, setMobilityStatus] = useState('');
  const [dietaryRequirements, setDietaryRequirements] = useState('');
  const [allergies, setAllergies] = useState('');
  const [ivAccess, setIvAccess] = useState('');

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

  const isLoading = admissionLoading || kardexLoading;

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
            </div>
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

          {/* Update Care Plan Entry Dialog */}
          <Dialog open={updateCpDialogOpen} onOpenChange={setUpdateCpDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>Update Care Plan Entry</DialogTitle>
                  <HelpPopover content="Add implementation details and evaluation. Update the status to Resolved when goals are met." />
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
              {kardex.care_plan_entries?.map((entry) => (
                <Card key={entry.id} className={entry.status === 'RESOLVED' ? 'opacity-75' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={entry.status === 'ACTIVE' ? 'default' : entry.status === 'RESOLVED' ? 'success' : 'warning'}
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
                        {entry.status !== 'RESOLVED' && (
                          <Button variant="outline" size="sm" onClick={() => openUpdateCarePlanEntry(entry)}>
                            Update
                          </Button>
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
              ))}
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
