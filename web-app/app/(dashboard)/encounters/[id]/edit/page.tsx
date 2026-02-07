'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  User,
  FileText,
  Stethoscope,
  Pencil,
  Lock,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { AutoSaveStatusIndicator } from '@/components/ui/auto-save-status';
import { useToast } from '@/lib/hooks/use-toast';
import { useAutoSave } from '@/lib/hooks/use-auto-save';
import { useNetworkStatus } from '@/lib/hooks/use-network-status';
import { useEncounter, useUpdateEncounter, useEncounterDiagnoses, useEditChiefComplaint, useAddDiagnosis, useDeleteDiagnosis, useUpdateDiagnosis } from '@/lib/hooks/use-encounters';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';
import { useAuth } from '@/lib/auth/context';
import { ClinicalFlowAccordion } from '@/components/encounters/clinical-flow-accordion';
import { VitalsForm } from '@/components/encounters/vitals-form';
import { SOAPNoteSummary } from '@/components/encounters/soap-note-summary';
import { ChiefComplaintEditDialog, ChiefComplaintEditReason } from '@/components/encounters/chief-complaint-edit-dialog';
import { useClinicalTemplate } from '@/lib/hooks/use-clinical-templates';
import type { ClinicalTemplate } from '@/lib/types/clinical-template';
import { ENCOUNTER_TYPES, ENCOUNTER_STATUS, ENCOUNTER_TYPE_GROUPS, getEncounterTypesByGroup } from '@/lib/utils/constants';
import { cn } from '@/lib/utils';
import type { EncounterFormData, DiagnosisFormData } from '@/lib/types/encounter-form';
import type { Patient } from '@/lib/types/patient';

// Parse blood pressure string "120/80" to systolic/diastolic
function parseBP(bp: string | null | undefined): { systolic: number | null; diastolic: number | null } {
  if (!bp) return { systolic: null, diastolic: null };
  const parts = bp.split('/');
  if (parts.length !== 2) return { systolic: null, diastolic: null };
  return {
    systolic: parseInt(parts[0] || '') || null,
    diastolic: parseInt(parts[1] || '') || null,
  };
}

export default function EditEncounterPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const encounterId = Number(params.id as string);

  const { data: encounter, isLoading: isLoadingEncounter, error } = useEncounter(encounterId);
  const { data: existingDiagnoses } = useEncounterDiagnoses(encounterId);
  const { data: labOrders } = useEncounterLabOrders(encounterId);
  const { data: prescriptions } = useEncounterPrescriptions(encounterId);
  const updateEncounter = useUpdateEncounter();
  const editChiefComplaint = useEditChiefComplaint();
  const addDiagnosis = useAddDiagnosis(encounterId);
  const deleteDiagnosis = useDeleteDiagnosis(encounterId);
  const updateDiagnosis = useUpdateDiagnosis(encounterId);

  // Get current provider name for SOAP note
  const providerName = user
    ? (user.first_name && user.last_name
        ? `${user.first_name} ${user.last_name}`
        : user.username)
    : undefined;

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [diagnoses, setDiagnoses] = useState<DiagnosisFormData[]>([]);
  const [isChiefComplaintDialogOpen, setIsChiefComplaintDialogOpen] = useState(false);
  const [showSOAPSummary, setShowSOAPSummary] = useState(false);

  // Determine if patient went through triage
  const wasTriaged = useMemo(() => {
    if (!encounter) return false;
    // Patient was triaged if triage_status is COMPLETED
    return encounter.triage_status === 'COMPLETED';
  }, [encounter]);

  // Form data state
  const [formData, setFormData] = useState<EncounterFormData>({
    patient: null,
    encounter_type: 'OPD',
    encounter_date: '',
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
    status: 'DRAFT',
    clinical_template: null,
    clinical_template_data: null,
  });

  // Selected clinical template state
  const [selectedTemplate, setSelectedTemplate] = useState<ClinicalTemplate | null>(null);

  // Fetch template if encounter has one
  const { data: existingTemplate } = useClinicalTemplate(encounter?.clinical_template || 0);

  // Set selected template when existing template loads
  useEffect(() => {
    if (existingTemplate) {
      setSelectedTemplate(existingTemplate);
    }
  }, [existingTemplate]);

  // Populate form with existing encounter data
  useEffect(() => {
    if (encounter) {
      const bp = parseBP(encounter.blood_pressure);
      setFormData({
        patient: encounter.patient,
        encounter_type: encounter.encounter_type,
        encounter_date: encounter.encounter_date,
        chief_complaint: encounter.chief_complaint,
        temperature: encounter.temperature,
        pulse: encounter.pulse,
        blood_pressure_systolic: bp.systolic,
        blood_pressure_diastolic: bp.diastolic,
        respiratory_rate: encounter.respiratory_rate,
        spo2: encounter.spo2,
        weight: encounter.weight,
        height: encounter.height,
        allergies: encounter.allergies || '',
        chronic_conditions: encounter.chronic_conditions || '',
        current_medications: encounter.current_medications || '',
        past_surgeries: encounter.past_surgeries || '',
        family_history: encounter.family_history || '',
        social_history: encounter.social_history || '',
        notes: encounter.notes || '',
        history_of_present_illness: encounter.history_of_present_illness || '',
        physical_examination: encounter.physical_examination || '',
        assessment: encounter.assessment || '',
        status: encounter.status === 'CANCELLED' ? 'DRAFT' : encounter.status,
        clinical_template: encounter.clinical_template || null,
        clinical_template_data: encounter.clinical_template_data || null,
      });
    }
  }, [encounter]);

  // Populate existing diagnoses
  useEffect(() => {
    if (existingDiagnoses && existingDiagnoses.length > 0) {
      setDiagnoses(existingDiagnoses.map(d => ({
        icd10_code: d.icd10_code,
        icd10_display: d.icd10_code_display || d.icd10_description,
        diagnosis_type: d.diagnosis_type,
        free_text_diagnosis: d.free_text_diagnosis || '',
        notes: d.notes || '',
        is_confirmed: d.is_confirmed,
        certainty: d.certainty,
      })));
    }
  }, [existingDiagnoses]);

  // Partial patient data from encounter (for display purposes)
  const selectedPatient = useMemo(() => {
    if (!encounter) return null;
    return {
      id: encounter.patient,
      mrn: encounter.patient_mrn || '',
      first_name: encounter.patient_name?.split(' ')[0] || '',
      last_name: encounter.patient_name?.split(' ').slice(1).join(' ') || '',
      date_of_birth: '', // Not available from encounter summary
      gender: 'O' as 'M' | 'F' | 'O',
      county: 0,
      sub_county: 0,
      created_at: '',
      updated_at: '',
      is_sensitive: false,
      consent_given: true,
      referral_source: 'self' as const,
      registered_by: 0,
    };  }, [encounter]);

  // Prepare data for auto-save (build the payload similar to handleSave)
  const autoSaveData = useMemo(() => {
    // Use empty string, not null, as backend expects string for blood_pressure
    const bp = formData.blood_pressure_systolic && formData.blood_pressure_diastolic
      ? `${formData.blood_pressure_systolic}/${formData.blood_pressure_diastolic}`
      : '';

    return {
      encounter_type: formData.encounter_type,
      encounter_date: formData.encounter_date,
      chief_complaint: formData.chief_complaint,
      temperature: formData.temperature,
      pulse: formData.pulse,
      blood_pressure: bp,
      respiratory_rate: formData.respiratory_rate,
      spo2: formData.spo2,
      weight: formData.weight,
      height: formData.height,
      allergies: formData.allergies,
      chronic_conditions: formData.chronic_conditions,
      current_medications: formData.current_medications,
      past_surgeries: formData.past_surgeries,
      family_history: formData.family_history,
      social_history: formData.social_history,
      notes: formData.notes,
      history_of_present_illness: formData.history_of_present_illness,
      physical_examination: formData.physical_examination,
      assessment: formData.assessment,
      clinical_template: formData.clinical_template,
      clinical_template_data: formData.clinical_template_data,
    };
  }, [formData]);

  // Check if encounter is editable for auto-save
  const isEncounterEditable = encounter?.status !== 'COMPLETED' && encounter?.status !== 'CANCELLED';

  // Auto-save hook - automatically saves changes when user is online
  const autoSave = useAutoSave({
    data: autoSaveData,
    onSave: async (data) => {
      if (!encounterId || !formData.chief_complaint.trim()) return;
      await updateEncounter.mutateAsync({ id: encounterId, data });
    },
    debounceMs: 2000,
    enabled: isEncounterEditable && !!encounter && formData.chief_complaint.trim().length > 0,
    onError: (error) => {
      console.error('Auto-save failed:', error);
    },
  });

  // Callback to save before navigating away (e.g., to create prescription)
  const handleBeforeNavigate = useCallback(async () => {
    if (autoSave.isDirty) {
      await autoSave.saveNow();
    }
  }, [autoSave]);

  // Handle field changes
  const handleFieldChange = useCallback((field: keyof EncounterFormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  // Diagnoses handlers - save to backend immediately
  const handleAddDiagnosis = useCallback(async (diagnosis: DiagnosisFormData) => {
    try {
      const savedDiagnosis = await addDiagnosis.mutateAsync({
        icd10_code: diagnosis.icd10_code,
        icd11_code: diagnosis.icd11_code || '',
        icd11_display: diagnosis.icd11_display || '',
        diagnosis_type: diagnosis.diagnosis_type,
        free_text_diagnosis: diagnosis.free_text_diagnosis || '',
        notes: diagnosis.notes || '',
        is_confirmed: diagnosis.is_confirmed || false,
        certainty: (diagnosis.certainty?.toLowerCase() || 'suspected') as 'confirmed' | 'provisional' | 'ruled_out' | 'suspected',
      });

      // Update local state with the saved diagnosis
      setDiagnoses(prev => [...prev, {
        icd10_code: savedDiagnosis.icd10_code,
        icd10_display: savedDiagnosis.icd10_code_display || savedDiagnosis.icd10_description,
        icd11_code: savedDiagnosis.icd11_code,
        icd11_display: savedDiagnosis.icd11_display,
        diagnosis_type: savedDiagnosis.diagnosis_type,
        free_text_diagnosis: savedDiagnosis.free_text_diagnosis || '',
        notes: savedDiagnosis.notes || '',
        is_confirmed: savedDiagnosis.is_confirmed,
        certainty: savedDiagnosis.certainty,
      }]);

      toast({
        title: 'Diagnosis Added',
        description: 'Diagnosis has been saved successfully.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save diagnosis. Please try again.',
        variant: 'destructive',
      });
    }
  }, [addDiagnosis, toast]);

  const handleRemoveDiagnosis = useCallback(async (index: number) => {
    // Get the diagnosis to remove
    const diagnosisArray = Array.isArray(existingDiagnoses)
      ? existingDiagnoses
      : (existingDiagnoses as unknown as { results?: typeof existingDiagnoses })?.results || [];
    const diagnosisToRemove = diagnosisArray[index];

    if (diagnosisToRemove?.id) {
      try {
        await deleteDiagnosis.mutateAsync(diagnosisToRemove.id);

        // Update local state
        setDiagnoses(prev => prev.filter((_, i) => i !== index));

        toast({
          title: 'Diagnosis Removed',
          description: 'Diagnosis has been removed successfully.',
        });
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to remove diagnosis. Please try again.',
          variant: 'destructive',
        });
      }
    } else {
      // Diagnosis was only local (not saved yet), just remove from local state
      setDiagnoses(prev => prev.filter((_, i) => i !== index));
    }
  }, [existingDiagnoses, deleteDiagnosis, toast]);

  // Handler for updating a diagnosis (e.g., changing certainty after lab results)
  const handleUpdateDiagnosis = useCallback(async (index: number, updatedDiagnosis: DiagnosisFormData) => {
    // Get the diagnosis to update
    const diagnosisArray = Array.isArray(existingDiagnoses)
      ? existingDiagnoses
      : (existingDiagnoses as unknown as { results?: typeof existingDiagnoses })?.results || [];
    const diagnosisToUpdate = diagnosisArray[index];

    if (diagnosisToUpdate?.id) {
      try {
        await updateDiagnosis.mutateAsync({
          diagnosisId: diagnosisToUpdate.id,
          data: {
            icd10_code: updatedDiagnosis.icd10_code,
            diagnosis_type: updatedDiagnosis.diagnosis_type,
            free_text_diagnosis: updatedDiagnosis.free_text_diagnosis || '',
            notes: updatedDiagnosis.notes || '',
            is_confirmed: updatedDiagnosis.is_confirmed || false,
            certainty: (updatedDiagnosis.certainty?.toLowerCase() || 'suspected') as 'confirmed' | 'provisional' | 'ruled_out' | 'suspected',
          },
        });

        // Update local state
        setDiagnoses(prev => prev.map((d, i) => i === index ? updatedDiagnosis : d));

        toast({
          title: 'Diagnosis Updated',
          description: 'Diagnosis certainty has been updated successfully.',
        });
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to update diagnosis. Please try again.',
          variant: 'destructive',
        });
      }
    } else {
      // Diagnosis was only local (not saved yet), just update local state
      setDiagnoses(prev => prev.map((d, i) => i === index ? updatedDiagnosis : d));
    }
  }, [existingDiagnoses, updateDiagnosis, toast]);

  // Clinical template handler - auto-populates from existing encounter data
  const handleTemplateSelect = useCallback(async (template: ClinicalTemplate) => {
    setSelectedTemplate(template);

    // Try to auto-populate template from existing encounter data
    try {
      const { encountersApi } = await import('@/lib/api/encounters');
      const { populated_data } = await encountersApi.populateTemplate(
        encounterId,
        template.id,
        true // structure by section
      );

      // Type cast to match expected shape
      const typedData = (populated_data || {}) as Record<string, Record<string, unknown>>;

      setFormData(prev => ({
        ...prev,
        clinical_template: template.id,
        clinical_template_data: typedData,
      }));

      toast({
        title: 'Template Applied',
        description: `${template.name} has been applied with existing data auto-populated.`,
      });
    } catch (error) {
      console.error('Failed to auto-populate template:', error);
      // Fall back to empty template data
      setFormData(prev => ({
        ...prev,
        clinical_template: template.id,
        clinical_template_data: prev.clinical_template_data || {},
      }));

      toast({
        title: 'Template Selected',
        description: `${template.name} has been applied to this encounter.`,
      });
    }

    // No need to set isDirty - auto-save will detect the change
  }, [encounterId, toast]);

  // Clinical template data handler - syncs back to encounter fields
  const handleTemplateDataChange = useCallback((data: Record<string, Record<string, unknown>>) => {
    setFormData(prev => {
      // Update template data
      const updated: EncounterFormData = {
        ...prev,
        clinical_template_data: data,
      };

      // Sync syncable fields back to encounter form
      // Flatten section data to find syncable fields
      for (const sectionName of Object.keys(data)) {
        const sectionData = data[sectionName];
        if (typeof sectionData !== 'object' || sectionData === null) continue;

        // Map template fields to encounter fields
        for (const [fieldName, value] of Object.entries(sectionData)) {
          switch (fieldName.toLowerCase()) {
            case 'temperature':
              if (value !== null && value !== undefined && value !== '') {
                updated.temperature = typeof value === 'number' ? value : parseFloat(String(value)) || null;
              }
              break;
            case 'pulse':
            case 'heart_rate':
              if (value !== null && value !== undefined && value !== '') {
                updated.pulse = typeof value === 'number' ? Math.round(value) : parseInt(String(value)) || null;
              }
              break;
            case 'respiratory_rate':
            case 'resp_rate':
              if (value !== null && value !== undefined && value !== '') {
                updated.respiratory_rate = typeof value === 'number' ? Math.round(value) : parseInt(String(value)) || null;
              }
              break;
            case 'spo2':
            case 'oxygen_saturation':
              if (value !== null && value !== undefined && value !== '') {
                updated.spo2 = typeof value === 'number' ? value : parseFloat(String(value)) || null;
              }
              break;
            case 'weight':
              if (value !== null && value !== undefined && value !== '') {
                updated.weight = typeof value === 'number' ? value : parseFloat(String(value)) || null;
              }
              break;
            case 'height':
              if (value !== null && value !== undefined && value !== '') {
                updated.height = typeof value === 'number' ? value : parseFloat(String(value)) || null;
              }
              break;
            case 'allergies':
              if (typeof value === 'string' && value.trim()) {
                updated.allergies = value;
              }
              break;
            case 'chronic_conditions':
              if (typeof value === 'string' && value.trim()) {
                updated.chronic_conditions = value;
              }
              break;
            case 'current_medications':
              if (typeof value === 'string' && value.trim()) {
                updated.current_medications = value;
              }
              break;
          }
        }
      }

      return updated;
    });
    // No need to set isDirty - auto-save will detect the change
  }, []);

  // Validation
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.chief_complaint.trim()) {
      newErrors.chief_complaint = 'Chief complaint is required';
    }

    // encounter_date is auto-set and non-editable, no validation needed

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Save encounter
  const handleSave = useCallback(async () => {
    if (!validateForm()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Build blood pressure string (use empty string, not null, as backend expects string)
      const bp = formData.blood_pressure_systolic && formData.blood_pressure_diastolic
        ? `${formData.blood_pressure_systolic}/${formData.blood_pressure_diastolic}`
        : '';

      await updateEncounter.mutateAsync({
        id: encounterId,
        data: {
          encounter_type: formData.encounter_type,
          encounter_date: formData.encounter_date,
          chief_complaint: formData.chief_complaint,
          temperature: formData.temperature,
          pulse: formData.pulse,
          blood_pressure: bp,
          respiratory_rate: formData.respiratory_rate,
          spo2: formData.spo2,
          weight: formData.weight,
          height: formData.height,
          allergies: formData.allergies,
          chronic_conditions: formData.chronic_conditions,
          current_medications: formData.current_medications,
          past_surgeries: formData.past_surgeries,
          family_history: formData.family_history,
          social_history: formData.social_history,
          notes: formData.notes,
          history_of_present_illness: formData.history_of_present_illness,
          physical_examination: formData.physical_examination,
          assessment: formData.assessment,
          clinical_template: formData.clinical_template,
          clinical_template_data: formData.clinical_template_data,
        },
      });

      // Reset auto-save state after manual save
      autoSave.reset();
      toast({
        title: 'Encounter Updated',
        description: 'Changes have been saved successfully',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update encounter',
        variant: 'destructive',
      });
    }
  }, [formData, encounterId, validateForm, updateEncounter, toast, autoSave]);

  // Finalize encounter
  const handleFinalize = useCallback(async () => {
    if (!validateForm()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields before finalizing',
        variant: 'destructive',
      });
      return;
    }

    try {
      // First save all the data
      const bp = formData.blood_pressure_systolic && formData.blood_pressure_diastolic
        ? `${formData.blood_pressure_systolic}/${formData.blood_pressure_diastolic}`
        : null;

      await updateEncounter.mutateAsync({
        id: encounterId,
        data: {
          encounter_type: formData.encounter_type,
          encounter_date: formData.encounter_date,
          chief_complaint: formData.chief_complaint,
          temperature: formData.temperature,
          pulse: formData.pulse,
          blood_pressure: bp,
          respiratory_rate: formData.respiratory_rate,
          spo2: formData.spo2,
          weight: formData.weight,
          height: formData.height,
          allergies: formData.allergies,
          chronic_conditions: formData.chronic_conditions,
          current_medications: formData.current_medications,
          past_surgeries: formData.past_surgeries,
          family_history: formData.family_history,
          social_history: formData.social_history,
          notes: formData.notes,
          history_of_present_illness: formData.history_of_present_illness,
          physical_examination: formData.physical_examination,
          assessment: formData.assessment,
          clinical_template: formData.clinical_template,
          clinical_template_data: formData.clinical_template_data,
        },
      });

      // Then call the finalize endpoint to change status to COMPLETED
      const { encountersApi } = await import('@/lib/api/encounters');
      await encountersApi.finalize(encounterId);

      toast({
        title: 'Encounter Finalized',
        description: 'The encounter has been marked as completed',
      });

      router.push(`/encounters/${encounterId}`);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to finalize encounter',
        variant: 'destructive',
      });
    }
  }, [formData, encounterId, validateForm, updateEncounter, toast, router]);

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (autoSave.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [autoSave.isDirty]);

  if (isLoadingEncounter) {
    return <EditEncounterSkeleton />;
  }

  if (error || !encounter) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Encounter not found</h2>
        <p className="text-muted-foreground mt-2">
          The encounter you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button onClick={() => router.push('/encounters')} className="mt-4">
          Back to Encounters
        </Button>
      </div>
    );
  }

  const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
  const isEditable = encounter.status !== 'COMPLETED' && encounter.status !== 'CANCELLED';

  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link href={`/encounters/${encounterId}`}>
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to Encounter</span>
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">Edit Encounter</h1>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
              <User className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="truncate max-w-[150px] sm:max-w-none">{encounter.patient_name}</span>
              <span className="hidden xs:inline text-muted-foreground/50">•</span>
              <span className="hidden xs:inline font-mono text-xs">{encounter.patient_mrn}</span>
              <Badge className={cn(status?.color, 'text-xs')}>{status?.label}</Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Auto-save status indicator */}
          <AutoSaveStatusIndicator
            status={autoSave.status}
            lastSaved={autoSave.lastSaved}
            error={autoSave.error}
            isDirty={autoSave.isDirty}
            pendingCount={autoSave.pendingCount}
          />
        </div>
      </div>

      {/* Non-editable warning */}
      {!isEditable && (
        <Alert className="mb-4 sm:mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription className="text-sm">
            This encounter is {encounter.status.toLowerCase()} and cannot be edited.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Form */}
      <div className="space-y-4 sm:space-y-6">
        {/* Encounter Details */}
        <Card>
          <CardHeader className="pb-3 px-3 sm:px-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5" />
              Encounter Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-3 sm:px-6">
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
              {/* Encounter Type */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="encounter_type" className="text-sm">Encounter Type</Label>
                <Select
                  value={formData.encounter_type}
                  onValueChange={(value) => handleFieldChange('encounter_type', value as EncounterFormData['encounter_type'])}
                  disabled={!isEditable}
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
                  Date <span className="text-muted-foreground text-xs">(from encounter start)</span>
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
                  <Badge className={status?.color}>{status?.label}</Badge>
                </div>
              </div>
            </div>

            {/* Chief Complaint */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="chief_complaint">
                  Chief Complaint <span className="text-destructive">*</span>
                  {wasTriaged && (
                    <span className="ml-2 text-xs text-muted-foreground">(from triage)</span>
                  )}
                </Label>
                {wasTriaged && isEditable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setIsChiefComplaintDialogOpen(true)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>

              {wasTriaged ? (
                // Read-only display for triaged patients
                <div className="relative">
                  <div className="min-h-[80px] rounded-md border bg-teal-400/10 px-3 py-2 text-sm">
                    {formData.chief_complaint || 'No chief complaint recorded'}
                  </div>
                  {encounter?.chief_complaint_edited && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Edited by {encounter.chief_complaint_edited_by_username} on{' '}
                      {encounter.chief_complaint_edited_at
                        ? new Date(encounter.chief_complaint_edited_at).toLocaleDateString()
                        : 'unknown date'}
                    </p>
                  )}
                </div>
              ) : (
                // Editable field for non-triaged patients
                <>
                  <Textarea
                    id="chief_complaint"
                    placeholder="What brings the patient in today? Describe the main complaint..."
                    value={formData.chief_complaint}
                    onChange={(e) => handleFieldChange('chief_complaint', e.target.value)}
                    rows={3}
                    className={errors.chief_complaint ? 'border-destructive' : ''}
                    disabled={!isEditable}
                  />
                  {errors.chief_complaint && (
                    <p className="text-sm text-destructive">{errors.chief_complaint}</p>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vitals Section */}
        <VitalsForm
          data={formData}
          onChange={(field, value) => handleFieldChange(field, value)}
          disabled={!isEditable}
          errors={errors}
          fromTriage={wasTriaged}
          vitalsSource={encounter?.vitals_source || (wasTriaged ? 'TRIAGE' : undefined)}
        />

        {/* Chief Complaint Edit Dialog */}
        <ChiefComplaintEditDialog
          open={isChiefComplaintDialogOpen}
          onOpenChange={setIsChiefComplaintDialogOpen}
          currentComplaint={formData.chief_complaint}
          originalComplaint={encounter?.chief_complaint_original ?? undefined}
          onConfirm={async (data) => {
            try {
              await editChiefComplaint.mutateAsync({
                encounterId,
                data: {
                  chief_complaint: data.chief_complaint,
                  edit_reason: data.edit_reason,
                  edit_reason_other: data.edit_reason_other,
                },
              });

              // Update local form data
              setFormData((prev) => ({
                ...prev,
                chief_complaint: data.chief_complaint,
              }));

              setIsChiefComplaintDialogOpen(false);

              toast({
                title: 'Chief Complaint Updated',
                description: 'The chief complaint has been updated with audit trail.',
              });
            } catch {
              toast({
                title: 'Error',
                description: 'Failed to update chief complaint',
                variant: 'destructive',
              });
            }
          }}
          isLoading={editChiefComplaint.isPending}
        />

        {/* Clinical Flow - Accordion-based SOAP Documentation */}
        <Card>
          <CardHeader className="pb-3 px-3 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                <span className="truncate">Clinical Documentation</span>
              </CardTitle>
              <Button
                variant={showSOAPSummary ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowSOAPSummary(!showSOAPSummary)}
                className="self-end sm:self-auto text-xs sm:text-sm"
              >
                📋 <span className="hidden xs:inline ml-1">{showSOAPSummary ? 'Hide SOAP Note' : 'View SOAP Note'}</span>
                <span className="xs:hidden ml-1">{showSOAPSummary ? 'Hide' : 'SOAP'}</span>
              </Button>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              Complete the sections below to document the clinical encounter
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showSOAPSummary ? (
              <SOAPNoteSummary
                formData={formData}
                diagnoses={diagnoses}
                labOrders={labOrders || []}
                prescriptions={prescriptions || []}
                patientName={encounter?.patient_name ?? undefined}
                patientMrn={encounter?.patient_mrn ?? undefined}
                encounterDate={encounter?.encounter_date ?? undefined}
                providerName={providerName}
                disabled={!isEditable}
              />
            ) : (
              <ClinicalFlowAccordion
                formData={formData}
                onFieldChange={handleFieldChange}
                diagnoses={diagnoses}
                onAddDiagnosis={handleAddDiagnosis}
                onRemoveDiagnosis={handleRemoveDiagnosis}
                onUpdateDiagnosis={handleUpdateDiagnosis}
                selectedTemplate={selectedTemplate}
                onTemplateSelect={handleTemplateSelect}
                onTemplateDataChange={handleTemplateDataChange}
                onSaveTemplateSnapshot={async () => {
                  if (!selectedTemplate) return;
                  try {
                    const { encountersApi } = await import('@/lib/api/encounters');
                    await encountersApi.createTemplateSnapshot(
                      encounterId,
                      selectedTemplate.id,
                      formData.clinical_template_data || {}
                    );
                    toast({
                      title: 'Template Saved',
                      description: 'Template assessment saved as attachment.',
                    });
                  } catch (err) {
                    console.error('Failed to save template snapshot:', err);
                    toast({
                      title: 'Error',
                      description: 'Failed to save template as attachment.',
                      variant: 'destructive',
                    });
                  }
                }}
                encounterId={encounterId}
                patientId={encounter?.patient || 0}
                labOrders={labOrders || []}
                prescriptions={prescriptions || []}
                disabled={!isEditable}
                onBeforeNavigate={handleBeforeNavigate}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sticky Floating Action Bar - Bottom bar on mobile, floating on desktop */}
      <div className="fixed bottom-0 left-0 right-0 sm:bottom-4 sm:left-auto sm:right-4 z-50 flex items-center justify-center sm:justify-end gap-2 p-3 sm:p-0 bg-background/95 sm:bg-transparent border-t sm:border-0 backdrop-blur">
        {/* Save Button - Icon only on mobile, full on desktop */}
        <Button
          variant="outline"
          onClick={handleSave}
          disabled={updateEncounter.isPending || !isEditable}
          className="h-11 flex-1 sm:flex-none sm:h-12 sm:w-auto shadow-lg bg-background/95 backdrop-blur border-2"
        >
          {updateEncounter.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin sm:mr-2" />
          ) : (
            <Save className="h-5 w-5 sm:mr-2" />
          )}
          <span className="ml-2 sm:ml-0">Save</span>
        </Button>

        {/* Finalize Button - Icon only on mobile, full on desktop */}
        {isEditable && encounter.status !== 'COMPLETED' && (
          <Button
            onClick={handleFinalize}
            disabled={updateEncounter.isPending}
            className="h-11 flex-1 sm:flex-none sm:h-12 sm:w-auto shadow-lg border-2"
          >
            {updateEncounter.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin sm:mr-2" />
            ) : (
              <CheckCircle className="h-5 w-5 sm:mr-2" />
            )}
            <span className="ml-2 sm:ml-0">Finalize</span>
          </Button>
        )}
      </div>

      {/* Bottom padding spacer for fixed action bar on mobile */}
      <div className="h-16 sm:hidden" aria-hidden="true" />
    </div>
  );
}

function EditEncounterSkeleton() {
  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-24 w-full mt-4" />
          </CardContent>
        </Card>

        <Skeleton className="h-10 w-full" />
        <Card>
          <CardContent className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
