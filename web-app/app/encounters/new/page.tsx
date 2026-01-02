'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  SendHorizontal,
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
import { useToast } from '@/lib/hooks/use-toast';
import { usePatient } from '@/lib/hooks/use-patients';
import { 
  useCreateEncounterWithValidation, 
  getVitalAlerts 
} from '@/lib/hooks/use-encounter-form';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { VitalsForm } from '@/components/encounters/vitals-form';
import { MedicalHistoryForm } from '@/components/encounters/medical-history-form';
import { DiagnosisForm } from '@/components/encounters/diagnosis-form';
import { ENCOUNTER_TYPES } from '@/lib/utils/constants';
import type { 
  EncounterFormData, 
  DiagnosisFormData,
  defaultEncounterFormData 
} from '@/lib/types/encounter-form';
import type { Patient } from '@/lib/types/patient';

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
  plan: '',
  
  status: 'DRAFT',
};

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
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState('basics');
  
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
  
  // Calculate vital alerts
  const vitalAlerts = getVitalAlerts(formData);
  const criticalAlerts = vitalAlerts.filter(a => a.severity === 'critical');
  
  // Field change handler
  const handleFieldChange = useCallback(<K extends keyof EncounterFormData>(
    field: K,
    value: EncounterFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
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
    setIsDirty(true);
  }, []);
  
  const handleRemoveDiagnosis = useCallback((index: number) => {
    setDiagnoses(prev => prev.filter((_, i) => i !== index));
    setIsDirty(true);
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
    
    if (!formData.encounter_date) {
      newErrors.encounter_date = 'Encounter date is required';
    }
    
    // Validate encounter date is not in future
    if (formData.encounter_date && new Date(formData.encounter_date) > new Date()) {
      newErrors.encounter_date = 'Encounter date cannot be in the future';
    }
    
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
      await createEncounter.mutateAsync({
        ...formData,
        status: 'DRAFT',
      });
      
      toast({
        title: 'Draft Saved',
        description: 'Encounter has been saved as draft',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save encounter',
        variant: 'destructive',
      });
    }
  }, [formData, validateForm, createEncounter, toast]);
  
  // Submit encounter
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }
    
    // Warn about critical vitals
    if (criticalAlerts.length > 0) {
      const confirmed = window.confirm(
        `This encounter has ${criticalAlerts.length} critical vital sign alert(s). Are you sure you want to submit?`
      );
      if (!confirmed) return;
    }
    
    try {
      await createEncounter.mutateAsync({
        ...formData,
        status: 'IN_PROGRESS',
      });
      
      toast({
        title: 'Encounter Created',
        description: 'Encounter has been created successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create encounter',
        variant: 'destructive',
      });
    }
  }, [formData, validateForm, criticalAlerts, createEncounter, toast]);
  
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
  
  return (
    <div className="container mx-auto py-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/encounters">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to Encounters</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">New Encounter</h1>
            <p className="text-muted-foreground">Create a new patient encounter</p>
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
            onClick={handleSaveDraft}
            disabled={createEncounter.isPending}
          >
            {createEncounter.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Draft
          </Button>
          
          <Button
            onClick={handleSubmit}
            disabled={createEncounter.isPending}
          >
            {createEncounter.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4 mr-2" />
            )}
            Create Encounter
          </Button>
        </div>
      </div>
      
      {/* Critical alerts banner */}
      {criticalAlerts.length > 0 && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Critical Vital Sign Alerts</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside mt-2">
              {criticalAlerts.map((alert, i) => (
                <li key={i}>{alert.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Main Form */}
      <div className="space-y-6">
        {/* Patient Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Patient
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                />
                {errors.encounter_date && (
                  <p className="text-sm text-destructive">{errors.encounter_date}</p>
                )}
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
          </CardContent>
        </Card>
        
        {/* Tabbed Sections */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="vitals" className="gap-2">
              Vitals
              {criticalAlerts.length > 0 && (
                <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center">
                  {criticalAlerts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">Medical History</TabsTrigger>
            <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
            <TabsTrigger value="notes">Clinical Notes</TabsTrigger>
          </TabsList>
          
          <TabsContent value="vitals" className="mt-4">
            <VitalsForm
              data={formData}
              onChange={(field, value) => handleFieldChange(field, value)}
              errors={errors}
            />
          </TabsContent>
          
          <TabsContent value="history" className="mt-4">
            <MedicalHistoryForm
              data={formData}
              onChange={(field, value) => handleFieldChange(field, value)}
            />
          </TabsContent>
          
          <TabsContent value="diagnosis" className="mt-4">
            <DiagnosisForm
              diagnoses={diagnoses}
              onAdd={handleAddDiagnosis}
              onRemove={handleRemoveDiagnosis}
            />
          </TabsContent>
          
          <TabsContent value="notes" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Clinical Notes
                </CardTitle>
                <CardDescription>
                  Additional clinical documentation for this encounter
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="history_of_present_illness">History of Present Illness (HPI)</Label>
                  <Textarea
                    id="history_of_present_illness"
                    placeholder="Detailed history of the current illness..."
                    value={formData.history_of_present_illness}
                    onChange={(e) => handleFieldChange('history_of_present_illness', e.target.value)}
                    rows={4}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="physical_examination">Physical Examination</Label>
                  <Textarea
                    id="physical_examination"
                    placeholder="Physical examination findings..."
                    value={formData.physical_examination}
                    onChange={(e) => handleFieldChange('physical_examination', e.target.value)}
                    rows={4}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="assessment">Assessment</Label>
                  <Textarea
                    id="assessment"
                    placeholder="Clinical assessment and reasoning..."
                    value={formData.assessment}
                    onChange={(e) => handleFieldChange('assessment', e.target.value)}
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="plan">Plan</Label>
                  <Textarea
                    id="plan"
                    placeholder="Treatment plan and next steps..."
                    value={formData.plan}
                    onChange={(e) => handleFieldChange('plan', e.target.value)}
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any other relevant notes..."
                    value={formData.notes}
                    onChange={(e) => handleFieldChange('notes', e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Bottom Action Bar (Fixed on Mobile) */}
      <div className="sticky bottom-0 mt-6 -mx-4 px-4 py-4 bg-background/95 backdrop-blur border-t md:hidden">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={createEncounter.isPending}
            className="flex-1"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createEncounter.isPending}
            className="flex-1"
          >
            <SendHorizontal className="h-4 w-4 mr-2" />
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
