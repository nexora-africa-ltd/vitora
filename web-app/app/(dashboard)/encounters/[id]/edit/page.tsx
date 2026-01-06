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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/lib/hooks/use-toast';
import { useEncounter, useUpdateEncounter, useEncounterDiagnoses, useEditChiefComplaint } from '@/lib/hooks/use-encounters';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';
import { useAuth } from '@/lib/auth/context';
import { MedicalHistoryForm } from '@/components/encounters/medical-history-form';
import { ClinicalNotesForm } from '@/components/encounters/clinical-notes-form';
import { DiagnosisForm } from '@/components/encounters/diagnosis-form';
import { VitalsForm } from '@/components/encounters/vitals-form';
import { EncounterLabOrders } from '@/components/encounters/encounter-lab-orders';
import { EncounterPrescriptions } from '@/components/encounters/encounter-prescriptions';
import { SOAPNoteSummary } from '@/components/encounters/soap-note-summary';
import { ChiefComplaintEditDialog, ChiefComplaintEditReason } from '@/components/encounters/chief-complaint-edit-dialog';
import { TemplateSelector } from '@/components/clinical-templates/template-selector';
import { ClinicalTemplateForm } from '@/components/clinical-templates/clinical-template-form';
import { useClinicalTemplate } from '@/lib/hooks/use-clinical-templates';
import type { ClinicalTemplate } from '@/lib/types/clinical-template';
import { ENCOUNTER_TYPES, ENCOUNTER_STATUS, ENCOUNTER_TYPE_GROUPS, getEncounterTypesByGroup } from '@/lib/utils/constants';
import type { EncounterFormData, DiagnosisFormData } from '@/lib/types/encounter-form';
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
  const encounterId = Number(params.id as string);
  
  const { data: encounter, isLoading: isLoadingEncounter, error } = useEncounter(encounterId);
  const { data: existingDiagnoses } = useEncounterDiagnoses(encounterId);
  const { data: labOrders } = useEncounterLabOrders(encounterId);
  const { data: prescriptions } = useEncounterPrescriptions(encounterId);
  const updateEncounter = useUpdateEncounter();
  const editChiefComplaint = useEditChiefComplaint();
  
  // Get current provider name for SOAP note
  const providerName = user 
    ? (user.first_name && user.last_name 
        ? `${user.first_name} ${user.last_name}` 
        : user.username)
    : undefined;
  
  const [activeTab, setActiveTab] = useState('history');
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [diagnoses, setDiagnoses] = useState<DiagnosisFormData[]>([]);
  const [isChiefComplaintDialogOpen, setIsChiefComplaintDialogOpen] = useState(false);
  
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
    plan: '',
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
        plan: encounter.plan || '',
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
  
  // Handle field changes
  const handleFieldChange = useCallback((field: keyof EncounterFormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);
  
  // Diagnoses handlers
  const handleAddDiagnosis = useCallback((diagnosis: DiagnosisFormData) => {
    setDiagnoses(prev => [...prev, diagnosis]);
    setIsDirty(true);
  }, []);
  
  const handleRemoveDiagnosis = useCallback((index: number) => {
    setDiagnoses(prev => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  }, []);
  
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
    
    setIsDirty(true);
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
    setIsDirty(true);
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
      // Build blood pressure string
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
          plan: formData.plan,
          clinical_template: formData.clinical_template,
          clinical_template_data: formData.clinical_template_data,
        },
      });
      
      setIsDirty(false);
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
  }, [formData, encounterId, validateForm, updateEncounter, toast]);
  
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
          plan: formData.plan,
          status: 'COMPLETED',
        },
      });
      
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
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
  
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
    <div className="container mx-auto py-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/encounters/${encounterId}`}>
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to Encounter</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Edit Encounter</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>{encounter.patient_name} ({encounter.patient_mrn})</span>
              <Badge className={status?.color}>{status?.label}</Badge>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isDirty && (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Unsaved changes
            </Badge>
          )}
          
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={updateEncounter.isPending || !isEditable}
          >
            {updateEncounter.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
          
          {isEditable && encounter.status !== 'COMPLETED' && (
            <Button
              onClick={handleFinalize}
              disabled={updateEncounter.isPending}
            >
              {updateEncounter.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Finalize
            </Button>
          )}
        </div>
      </div>
      
      {/* Non-editable warning */}
      {!isEditable && (
        <Alert className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            This encounter is {encounter.status.toLowerCase()} and cannot be edited.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Main Form */}
      <div className="space-y-6">
        {/* Encounter Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Encounter Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Encounter Type */}
              <div className="space-y-2">
                <Label htmlFor="encounter_type">Encounter Type</Label>
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
          fromTriage={wasTriaged && encounter?.vitals_source === 'TRIAGE'}
          vitalsSource={encounter?.vitals_source || undefined}
        />

        {/* Chief Complaint Edit Dialog */}
        <ChiefComplaintEditDialog
          open={isChiefComplaintDialogOpen}
          onOpenChange={setIsChiefComplaintDialogOpen}
          currentComplaint={formData.chief_complaint}
          originalComplaint={encounter?.chief_complaint_original}
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
        
        {/* Tabbed Sections - SOAP Flow */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {/* S - Subjective */}
            <TabsTrigger value="history" className="gap-1">
              1. Hx
              {!hasMedicalHistory(formData) && (
                <span className="ml-1 text-muted-foreground">+</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-1">
              2. HPI
              {!hasClinicalNotes(formData) && (
                <span className="ml-1 text-muted-foreground">+</span>
              )}
            </TabsTrigger>
            {/* Clinical Template - Focused Assessment */}
            <TabsTrigger value="template" className="gap-1">
              3. Template
              {selectedTemplate ? (
                <Badge variant="secondary" className="ml-1 text-xs">{selectedTemplate.name.slice(0, 10)}{selectedTemplate.name.length > 10 ? '…' : ''}</Badge>
              ) : (
                <span className="ml-1 text-muted-foreground">+</span>
              )}
            </TabsTrigger>
            {/* A - Assessment */}
            <TabsTrigger value="diagnosis" className="gap-1">
              4. Dx
              {diagnoses.length === 0 ? (
                <span className="ml-1 text-muted-foreground">+</span>
              ) : (
                <Badge variant="secondary" className="ml-1">{diagnoses.length}</Badge>
              )}
            </TabsTrigger>
            {/* P - Plan */}
            <TabsTrigger value="lab" className="gap-1">
              5. Labs
            </TabsTrigger>
            <TabsTrigger value="pharmacy" className="gap-1">
              6. Rx
            </TabsTrigger>
            {/* Summary */}
            <TabsTrigger value="soap" className="gap-1">
              📋 SOAP Note
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="history" className="mt-4">
            <MedicalHistoryForm
              data={formData}
              onChange={(field, value) => handleFieldChange(field, value)}
              onNext={() => setActiveTab('notes')}
              disabled={!isEditable}
            />
          </TabsContent>
          
          <TabsContent value="notes" className="mt-4">
            <ClinicalNotesForm
              data={formData}
              onChange={(field, value) => handleFieldChange(field, value)}
              onPrevious={() => setActiveTab('history')}
              onNext={() => setActiveTab('template')}
              disabled={!isEditable}
            />
          </TabsContent>
          
          <TabsContent value="template" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Clinical Template
                      {selectedTemplate && (
                        <Badge variant="secondary" className="ml-2">{selectedTemplate.name}</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Use a structured template to guide focused clinical assessment
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedTemplate && formData.clinical_template_data && isEditable && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
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
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Save as Attachment
                      </Button>
                    )}
                    {isEditable && (
                      <TemplateSelector
                        onSelect={handleTemplateSelect}
                        encounterType={formData.encounter_type}
                        chiefComplaint={formData.chief_complaint}
                      />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedTemplate ? (
                  <ClinicalTemplateForm
                    template={selectedTemplate}
                    value={formData.clinical_template_data || {}}
                    onChange={handleTemplateDataChange}
                    disabled={!isEditable}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">No template selected</p>
                    <p className="text-sm mt-1">
                      Select a template above to guide your clinical assessment
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab('notes')}
                >
                  ← Previous: HPI
                </Button>
                <Button
                  type="button"
                  onClick={() => setActiveTab('diagnosis')}
                >
                  Next: Diagnosis →
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="diagnosis" className="mt-4">
            <DiagnosisForm
              diagnoses={diagnoses}
              onAdd={handleAddDiagnosis}
              onRemove={handleRemoveDiagnosis}
              onPrevious={() => setActiveTab('template')}
              onNext={() => setActiveTab('lab')}
              disabled={!isEditable}
            />
          </TabsContent>
          
          <TabsContent value="lab" className="mt-4">
            <EncounterLabOrders
              encounterId={encounterId}
              patientId={encounter?.patient || 0}
              disabled={!isEditable}
              onNext={() => setActiveTab('pharmacy')}
            />
          </TabsContent>
          
          <TabsContent value="pharmacy" className="mt-4">
            <EncounterPrescriptions
              encounterId={encounterId}
              patientId={encounter?.patient || 0}
              disabled={!isEditable}
              onPrevious={() => setActiveTab('lab')}
            />
          </TabsContent>
          
          <TabsContent value="soap" className="mt-4">
            <SOAPNoteSummary
              formData={formData}
              diagnoses={diagnoses}
              labOrders={labOrders || []}
              prescriptions={prescriptions || []}
              patientName={encounter?.patient_name}
              patientMrn={encounter?.patient_mrn}
              encounterDate={encounter?.encounter_date}
              providerName={providerName}
              disabled={!isEditable}
            />
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Bottom Action Bar (Fixed on Mobile) */}
      <div className="sticky bottom-0 mt-6 -mx-4 px-4 py-4 bg-background/95 backdrop-blur border-t md:hidden">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={updateEncounter.isPending || !isEditable}
            className="flex-1"
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
          {isEditable && encounter.status !== 'COMPLETED' && (
            <Button
              onClick={handleFinalize}
              disabled={updateEncounter.isPending}
              className="flex-1"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Finalize
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EditEncounterSkeleton() {
  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
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
