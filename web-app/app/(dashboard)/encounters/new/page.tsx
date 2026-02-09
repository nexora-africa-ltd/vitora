'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Save,
  SendHorizontal,
  Clock,
  AlertTriangle,
  Loader2,
  User,
  FileText,
  Stethoscope,
  Activity,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/lib/hooks/use-toast';
import { useDraftSave } from '@/lib/hooks/use-draft-save';
import { usePatient } from '@/lib/hooks/use-patients';
import {
  useCreateEncounterWithValidation,
} from '@/lib/hooks/use-encounter-form';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { MedicalHistoryForm } from '@/components/encounters/medical-history-form';
import { ClinicalNotesForm } from '@/components/encounters/clinical-notes-form';
import { DiagnosisForm } from '@/components/encounters/diagnosis-form';
import { ENCOUNTER_TYPES, ENCOUNTER_TYPE_GROUPS, getEncounterTypesByGroup } from '@/lib/utils/constants';
import type {
  EncounterFormData,
  DiagnosisFormData,
} from '@/lib/types/encounter-form';
import type { Patient } from '@/lib/types/patient';

// Helper functions to check if sections have data
function hasMedicalHistory(data: EncounterFormData): boolean {
  return !!(
    data.allergies?.trim() ||
    data.chronic_conditions?.trim() ||
    data.current_medications?.trim() ||
    data.past_surgeries?.trim() ||
    data.family_history?.trim() ||
    data.social_history?.trim()
  );
}

function hasClinicalNotes(data: EncounterFormData): boolean {
  return !!(
    data.history_of_present_illness?.trim() ||
    data.physical_examination?.trim() ||
    data.assessment?.trim() ||
    data.plan?.trim() ||
    data.notes?.trim()
  );
}

const initialFormData: EncounterFormData = {
  patient: null,
  encounter_type: 'OPD',
  encounter_date: new Date().toISOString().split('T')[0] || '',
  chief_complaint: '',

  temperature: null,
  pulse: null,
  blood_pressure_systolic: null,
  blood_pressure_diastolic: null,
  respiratory_rate: null,
  spo2: null,
  weight: null,
  height: null,

  allergies: '',
  chronic_conditions: '',
  current_medications: '',
  past_surgeries: '',
  family_history: '',
  social_history: '',

  notes: '',
  history_of_present_illness: '',
  physical_examination: '',
  assessment: '',

  status: 'CREATED',
};

// Type for draft data (includes diagnoses)
interface EncounterDraftData {
  formData: EncounterFormData;
  diagnoses: DiagnosisFormData[];
  patientId: number | null;
}

export default function NewEncounterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Check if patient ID is provided in URL
  const patientIdParam = searchParams.get('patient');

  // Form state
  const [formData, setFormData] = useState<EncounterFormData>(initialFormData);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [diagnoses, setDiagnoses] = useState<DiagnosisFormData[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('history');
  const [showTriageModal, setShowTriageModal] = useState(false);
  const [createdEncounterId, setCreatedEncounterId] = useState<number | null>(null);

  // Draft data for auto-save
  const draftData = useMemo<EncounterDraftData>(() => ({
    formData,
    diagnoses,
    patientId: formData.patient,
  }), [formData, diagnoses]);

  // Auto-save draft to localStorage
  const draft = useDraftSave<EncounterDraftData>({
    draftKey: 'new-encounter',
    data: draftData,
    debounceMs: 1500,
    enabled: true,
    onRecover: (recovered) => {
      setFormData(recovered.formData);
      setDiagnoses(recovered.diagnoses);
      toast({
        title: 'Draft Recovered',
        description: 'Your previous work has been restored.',
      });
    },
  });

  // Fetch patient if ID provided
  const { data: prefetchedPatient } = usePatient(patientIdParam || '');

  // Create mutation
  const createEncounter = useCreateEncounterWithValidation();

  // Set prefetched patient
  useEffect(() => {
    if (prefetchedPatient && !selectedPatient) {
      setSelectedPatient(prefetchedPatient);
      setFormData(prev => ({ ...prev, patient: prefetchedPatient.id }));
    }
  }, [prefetchedPatient, selectedPatient]);

  // Field change handler
  const handleFieldChange = useCallback(<K extends keyof EncounterFormData>(
    field: K,
    value: EncounterFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [errors]);

  // Patient selection handler
  const handlePatientChange = useCallback((patientId: number | null, patient: Patient | null) => {
    setSelectedPatient(patient);
    handleFieldChange('patient', patientId);

    // Pre-fill medical history from patient's last encounter if available
    // This would require fetching patient's previous encounters
  }, [handleFieldChange]);

  // Diagnosis handlers
  const handleAddDiagnosis = useCallback((diagnosis: DiagnosisFormData) => {
    setDiagnoses(prev => [...prev, diagnosis]);
  }, []);

  const handleRemoveDiagnosis = useCallback((index: number) => {
    setDiagnoses(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateDiagnosis = useCallback((index: number, updatedDiagnosis: DiagnosisFormData) => {
    setDiagnoses(prev => prev.map((d, i) => i === index ? updatedDiagnosis : d));
  }, []);

  // Validation
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.patient) {
      newErrors.patient = 'Please select a patient';
    }

    if (!formData.chief_complaint.trim()) {
      newErrors.chief_complaint = 'Chief complaint is required';
    }

    // encounter_date is auto-set and non-editable, no validation needed

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Save as draft
  const handleSaveDraft = useCallback(async () => {
    if (!validateForm()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await createEncounter.mutateAsync({
        ...formData,
        status: 'CREATED',
      });

      toast({
        title: 'Draft Saved',
        description: 'Encounter has been saved as draft',
      });

      // Clear local draft after saving to API
      draft.clearDraft();

      // Redirect to encounters list
      router.push('/encounters');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save encounter',
        variant: 'destructive',
      });
    }
  }, [formData, validateForm, createEncounter, toast, router, draft]);

  // Check if encounter type requires immediate attention (skip triage prompt)
  const isUrgentEncounterType = formData.encounter_type === 'EMERGENCY' || formData.encounter_type === 'IPD';

  // Submit encounter - creates encounter and shows triage prompt (unless urgent)
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await createEncounter.mutateAsync({
        ...formData,
        status: 'IN_PROGRESS',
      });

      // For EMERGENCY or IPD encounters, skip triage modal and go directly to encounter
      if (isUrgentEncounterType) {
        toast({
          title: 'Encounter Created',
          description: `${formData.encounter_type} encounter created. Vitals can be recorded later.`,
        });
        draft.clearDraft();
        router.push(`/encounters/${result.id}`);
        return;
      }

      // For OPD encounters, show triage modal
      setCreatedEncounterId(result.id);
      setShowTriageModal(true);
      // Clear draft after successful creation
      draft.clearDraft();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create encounter',
        variant: 'destructive',
      });
    }
  }, [formData, validateForm, createEncounter, toast, isUrgentEncounterType, router, draft]);

  // Handle triage modal response
  const handleGoToTriage = useCallback(() => {
    if (createdEncounterId && selectedPatient) {
      router.push(`/triage/new?patientId=${selectedPatient.id}&encounterId=${createdEncounterId}`);
    }
  }, [createdEncounterId, selectedPatient, router]);

  const handleSkipTriage = useCallback(() => {
    setShowTriageModal(false);
    toast({
      title: 'Encounter Created',
      description: 'Encounter has been created. You can record vitals later in Triage.',
    });
    router.push('/encounters');
  }, [toast, router]);

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (draft.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [draft.isDirty]);

  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 max-w-5xl space-y-4 sm:space-y-6">
      {/* Triage Redirect Modal */}
      <Dialog open={showTriageModal} onOpenChange={setShowTriageModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              Record Vital Signs?
            </DialogTitle>
            <DialogDescription>
              The encounter has been created successfully. Vital signs have not been recorded yet.
              Would you like to record vitals now through Triage?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Vitals Required</AlertTitle>
              <AlertDescription>
                Vital signs are essential for proper patient assessment and triage prioritization.
                Recording vitals through Triage ensures the patient is properly categorized in the queue.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleSkipTriage}>
              Skip for Now
            </Button>
            <Button onClick={handleGoToTriage}>
              <Activity className="h-4 w-4 mr-2" />
              Record Vitals in Triage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <PageHeader
        title="New Encounter"
        helpContent="Create a new patient encounter. Vital signs are recorded through Triage after creation."
        actions={
          draft.isDirty ? (
            <Badge variant="secondary" className="gap-1 shrink-0">
              <Clock className="h-3 w-3" />
              <span className="hidden sm:inline">{draft.lastSaved ? 'Draft saved' : 'Unsaved changes'}</span>
              <span className="sm:hidden">{draft.lastSaved ? 'Saved' : 'Unsaved'}</span>
            </Badge>
          ) : null
        }
      />

      {/* Draft Recovery Banner */}
      {draft.hasDraft && (
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <RotateCcw className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800 dark:text-blue-200">Unsaved Draft Found</AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            You have an unsaved draft from a previous session. Would you like to recover it?
            <div className="flex flex-col gap-2 mt-3 sm:flex-row">
              <Button size="sm" onClick={draft.recoverDraft} className="w-full sm:w-auto">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Recover Draft
              </Button>
              <Button size="sm" variant="outline" onClick={draft.dismissDraft} className="w-full sm:w-auto">
                <X className="h-3.5 w-3.5 mr-1" />
                Discard
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Vitals Info Banner */}
      <Alert>
        <Activity className="h-4 w-4" />
        <AlertTitle className="text-sm sm:text-base">Vital Signs Recording</AlertTitle>
        <AlertDescription className="text-xs sm:text-sm">
          Vital signs are recorded through the <strong>Triage module</strong> to ensure proper patient prioritization.
          After creating this encounter, you&apos;ll be prompted to record vitals.
        </AlertDescription>
      </Alert>

      {/* Main Form */}
      <div className="space-y-4 sm:space-y-6">
        {/* Patient Selection */}
        <Card>
          <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <User className="h-4 w-4 sm:h-5 sm:w-5" />
              Patient
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <PatientSelector
              value={formData.patient}
              selectedPatient={selectedPatient}
              onChange={handlePatientChange}
              error={errors.patient}
            />
          </CardContent>
        </Card>

        {/* Encounter Details */}
        <Card>
          <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5" />
              Encounter Details
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Encounter Type */}
              <div className="space-y-2">
                <Label htmlFor="encounter_type">Encounter Type</Label>
                <Select
                  value={formData.encounter_type}
                  onValueChange={(value) => handleFieldChange('encounter_type', value as EncounterFormData['encounter_type'])}
                >
                  <SelectTrigger id="encounter_type">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Walk-in / Mandatory triage */}
                    <SelectGroup>
                      <SelectLabel>{ENCOUNTER_TYPE_GROUPS['walk-in'].label}</SelectLabel>
                      {getEncounterTypesByGroup('walk-in').map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    {/* Scheduled / Optional triage */}
                    <SelectGroup>
                      <SelectLabel>{ENCOUNTER_TYPE_GROUPS['scheduled'].label}</SelectLabel>
                      {getEncounterTypesByGroup('scheduled').map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    {/* Pre-assessed / No triage */}
                    <SelectGroup>
                      <SelectLabel>{ENCOUNTER_TYPE_GROUPS['pre-assessed'].label}</SelectLabel>
                      {getEncounterTypesByGroup('pre-assessed').map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {/* Encounter Date */}
              <div className="space-y-2">
                <Label htmlFor="encounter_date">
                  Date <span className="text-muted-foreground text-xs">(today)</span>
                </Label>
                <Input
                  id="encounter_date"
                  type="date"
                  value={formData.encounter_date}
                  disabled
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
              </div>

              {/* Status Badge */}
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="h-10 flex items-center">
                  <Badge variant="secondary">Draft</Badge>
                </div>
              </div>
            </div>

            {/* Chief Complaint */}
            <div className="space-y-2">
              <Label htmlFor="chief_complaint">
                Chief Complaint <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="chief_complaint"
                placeholder="What brings the patient in today? Describe the main complaint..."
                value={formData.chief_complaint}
                onChange={(e) => handleFieldChange('chief_complaint', e.target.value)}
                rows={3}
                className={errors.chief_complaint ? 'border-destructive' : ''}
              />
              {errors.chief_complaint && (
                <p className="text-sm text-destructive">{errors.chief_complaint}</p>
              )}
            </div>

            {/* Urgent Encounter Info - show when Emergency or IPD is selected */}
            {isUrgentEncounterType && (
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-200">
                  {formData.encounter_type === 'EMERGENCY' ? 'Emergency Encounter' : 'Inpatient Encounter'}
                </AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  Triage will be skipped for this encounter type. Vital signs can be recorded later
                  once the patient is stabilized. The patient will proceed directly to consultation.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Tabbed Sections - Clinical workflow (no vitals - handled in triage) */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="history" className="gap-1">
              1. History
              {!hasMedicalHistory(formData) && (
                <span className="ml-1 text-muted-foreground">+</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-1">
              2. Clinical Notes
              {!hasClinicalNotes(formData) && (
                <span className="ml-1 text-muted-foreground">+</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="diagnosis" className="gap-1">
              3. Diagnosis
              {diagnoses.length === 0 ? (
                <span className="ml-1 text-muted-foreground">+</span>
              ) : (
                <Badge variant="secondary" className="ml-1">{diagnoses.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-4">
            <MedicalHistoryForm
              data={formData}
              onChange={(field, value) => handleFieldChange(field, value)}
              onNext={() => setActiveTab('notes')}
            />
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <ClinicalNotesForm
              data={formData}
              onChange={(field, value) => handleFieldChange(field, value)}
              onPrevious={() => setActiveTab('history')}
              onNext={() => setActiveTab('diagnosis')}
            />
          </TabsContent>

          <TabsContent value="diagnosis" className="mt-4">
            <DiagnosisForm
              diagnoses={diagnoses}
              onAdd={handleAddDiagnosis}
              onRemove={handleRemoveDiagnosis}
              onUpdate={handleUpdateDiagnosis}
              onPrevious={() => setActiveTab('notes')}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-0 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 sm:py-4 bg-background/95 backdrop-blur border-t">
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3 sm:justify-end">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={createEncounter.isPending}
            className="w-full sm:w-auto"
          >
            {createEncounter.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            <span className="sm:hidden">Draft</span>
            <span className="hidden sm:inline">Save Draft</span>
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createEncounter.isPending}
            className="w-full sm:w-auto"
          >
            {createEncounter.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4 mr-2" />
            )}
            <span className="sm:hidden">Create</span>
            <span className="hidden sm:inline">Create Encounter</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
