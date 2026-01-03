/**
 * Triage Module - New Triage Assessment Page
 *
 * Create a new triage assessment for a patient encounter.
 *
 * Route: /triage/new
 */
'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VitalAlertsPanel } from '@/components/triage';
import { useCreateTriageAssessment, useCalculateTriageCategory } from '@/lib/hooks/use-triage';
import { usePatient } from '@/lib/hooks/use-patients-enhanced';
import { toast } from '@/lib/hooks/use-toast';
import type { TriageAssessment, TriageAlert, TriageAssessmentCreateData } from '@/lib/types/triage';

export default function NewTriagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get patient/encounter from query params if provided
  const patientId = searchParams.get('patientId');
  const encounterId = searchParams.get('encounterId');

  const [currentAlerts, setCurrentAlerts] = useState<TriageAlert[]>([]);
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null);

  // Parse patient ID
  const parsedPatientId = patientId ? parseInt(patientId, 10) : 0;

  // Fetch patient data if patientId is provided
  const { data: patient, isLoading: isPatientLoading } = usePatient(parsedPatientId);

  // Mutations
  const { mutateAsync: createAssessment, isPending: isCreating } = useCreateTriageAssessment();
  const { mutateAsync: calculateCategory, isPending: isCalculating } = useCalculateTriageCategory();

  // Handle vital changes to calculate category
  const handleVitalsChange = useCallback(
    async (vitals: Partial<TriageAssessmentCreateData>) => {
      if (!vitals.mental_status) return;

      try {
        const result = await calculateCategory({
          spo2: undefined, // Would need to add vitals to TriageAssessmentCreateData
          systolic_bp: undefined,
          diastolic_bp: undefined,
          heart_rate: undefined,
          temperature: undefined,
          respiratory_rate: undefined,
          mental_status: vitals.mental_status,
          chief_complaint_category: vitals.chief_complaint_category || 'OTHER',
          pain_score: vitals.pain_score ?? undefined,
          mobility: vitals.mobility,
        });

        setSuggestedCategory(result.suggested_category);
        setCurrentAlerts(result.alerts || []);
      } catch (error) {
        // Silently fail - category calculation is optional
        console.error('Failed to calculate category:', error);
      }
    },
    [calculateCategory]
  );

  // Handle form submission
  const handleSubmit = useCallback(
    async (data: TriageAssessmentCreateData) => {
      try {
        const assessment = await createAssessment({
          ...data,
          encounter: encounterId ? parseInt(encounterId, 10) : 0,
        });

        toast({
          title: 'Triage Assessment Created',
          description: `Patient triaged as ${assessment.triage_category}`,
        });

        // Navigate back to queue
        router.push('/triage');
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to create triage assessment. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [createAssessment, encounterId, router]
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  // Calculate age from date_of_birth
  const calculateAge = (dob: string): number => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Triage Assessment"
        description={patient ? `Triaging: ${patient.first_name} ${patient.last_name} (${patient.mrn})` : 'Create a new triage assessment'}
        actions={
          <Button variant="ghost" onClick={handleCancel}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Assessment Details</CardTitle>
              <CardDescription>
                Record vital signs, symptoms, and triage category
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Triage assessment form is under development. 
                Please use the desktop app or backend API to create assessments.
              </p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts Panel - Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Vital Alerts */}
          <VitalAlertsPanel alerts={currentAlerts} />

          {/* Patient Info Card (if patient selected) */}
          {patient && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Patient Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{patient.first_name} {patient.last_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MRN:</span>
                  <span className="font-medium">{patient.mrn}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Age:</span>
                  <span className="font-medium">{calculateAge(patient.date_of_birth)} years</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gender:</span>
                  <span className="font-medium">{patient.gender}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
