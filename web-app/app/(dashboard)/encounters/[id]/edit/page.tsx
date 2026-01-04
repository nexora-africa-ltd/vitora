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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/lib/hooks/use-toast';
import { useEncounter, useUpdateEncounter, useEncounterDiagnoses } from '@/lib/hooks/use-encounters';
import { MedicalHistoryForm } from '@/components/encounters/medical-history-form';
import { ClinicalNotesForm } from '@/components/encounters/clinical-notes-form';
import { DiagnosisForm } from '@/components/encounters/diagnosis-form';
import { ENCOUNTER_TYPES, ENCOUNTER_STATUS } from '@/lib/utils/constants';
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
  const encounterId = Number(params.id as string);
  
  const { data: encounter, isLoading: isLoadingEncounter, error } = useEncounter(encounterId);
  const { data: existingDiagnoses } = useEncounterDiagnoses(encounterId);
  const updateEncounter = useUpdateEncounter();
  
  const [activeTab, setActiveTab] = useState('history');
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [diagnoses, setDiagnoses] = useState<DiagnosisFormData[]>([]);
  
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
  });
  
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
  
  // Validation
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.chief_complaint.trim()) {
      newErrors.chief_complaint = 'Chief complaint is required';
    }
    
    if (!formData.encounter_date) {
      newErrors.encounter_date = 'Encounter date is required';
    }
    
    if (formData.encounter_date && new Date(formData.encounter_date) > new Date()) {
      newErrors.encounter_date = 'Encounter date cannot be in the future';
    }
    
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
                  onValueChange={(value) => handleFieldChange('encounter_type', value as 'OPD' | 'IPD' | 'EMERGENCY')}
                  disabled={!isEditable}
                >
                  <SelectTrigger id="encounter_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENCOUNTER_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Encounter Date */}
              <div className="space-y-2">
                <Label htmlFor="encounter_date">Date</Label>
                <Input
                  id="encounter_date"
                  type="date"
                  value={formData.encounter_date}
                  onChange={(e) => handleFieldChange('encounter_date', e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className={errors.encounter_date ? 'border-destructive' : ''}
                  disabled={!isEditable}
                />
                {errors.encounter_date && (
                  <p className="text-sm text-destructive">{errors.encounter_date}</p>
                )}
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
                disabled={!isEditable}
              />
              {errors.chief_complaint && (
                <p className="text-sm text-destructive">{errors.chief_complaint}</p>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Tabbed Sections */}
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
              disabled={!isEditable}
            />
          </TabsContent>
          
          <TabsContent value="notes" className="mt-4">
            <ClinicalNotesForm
              data={formData}
              onChange={(field, value) => handleFieldChange(field, value)}
              onPrevious={() => setActiveTab('history')}
              onNext={() => setActiveTab('diagnosis')}
              disabled={!isEditable}
            />
          </TabsContent>
          
          <TabsContent value="diagnosis" className="mt-4">
            <DiagnosisForm
              diagnoses={diagnoses}
              onAdd={handleAddDiagnosis}
              onRemove={handleRemoveDiagnosis}
              onPrevious={() => setActiveTab('notes')}
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
