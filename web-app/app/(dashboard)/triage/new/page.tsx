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
import { TriageAssessmentForm, VitalAlertsPanel } from '@/components/triage';
import { useCreateTriageAssessment, useCalculateTriageCategory } from '@/lib/hooks/use-triage';
import { usePatient } from '@/lib/hooks/use-patients-enhanced';
import { useToast } from '@/components/ui/use-toast';
import type { TriageAssessmentFormData, TriageAlert } from '@/lib/types/triage';

export default function NewTriagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Get patient/encounter from query params if provided
  const patientId = searchParams.get('patientId');
  const encounterId = searchParams.get('encounterId');

  const [currentAlerts, setCurrentAlerts] = useState<TriageAlert[]>([]);
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null);

  // Fetch patient data if patientId is provided
  const { data: patient, isLoading: isPatientLoading } = usePatient(
    patientId ? parseInt(patientId, 10) : undefined
  );

  // Mutations
  const { mutateAsync: createAssessment, isLoading: isCreating } = useCreateTriageAssessment();
  const { mutateAsync: calculateCategory, isLoading: isCalculating } = useCalculateTriageCategory();

  // Handle vital changes to calculate category
  const handleVitalsChange = useCallback(
    async (vitals: Partial<TriageAssessmentFormData>) => {
      if (!vitals.mental_status) return;

      try {
        const result = await calculateCategory({
          spo2: vitals.spo2,
          systolic_bp: vitals.systolic_bp,
          diastolic_bp: vitals.diastolic_bp,
          heart_rate: vitals.heart_rate,
          temperature: vitals.temperature,
          respiratory_rate: vitals.respiratory_rate,
          mental_status: vitals.mental_status,
          chief_complaint_category: vitals.chief_complaint_category || 'OTHER',
          pain_score: vitals.pain_score,
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
    async (data: TriageAssessmentFormData) => {
      try {
        const assessment = await createAssessment({
          ...data,
          encounter_id: encounterId ? parseInt(encounterId, 10) : undefined,
        });

        toast({
          title: 'Triage Assessment Created',
          description: `Patient triaged as ${assessment.triage_category}`,
        });

        // Navigate to queue or patient detail
        if (assessment.queue_entry_id) {
          router.push('/triage');
        } else {
          router.push(`/patients/${assessment.patient_id}`);
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to create triage assessment. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [createAssessment, encounterId, router, toast]
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

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
              <TriageAssessmentForm
                patientId={patientId ? parseInt(patientId, 10) : undefined}
                encounterId={encounterId ? parseInt(encounterId, 10) : undefined}
                suggestedCategory={suggestedCategory ?? undefined}
                onVitalsChange={handleVitalsChange}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                isSubmitting={isCreating}
              />
            </CardContent>
          </Card>
        </div>

        {/* Alerts Panel - Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Vital Alerts */}
          <VitalAlertsPanel
            alerts={currentAlerts}
            showEmptyState={currentAlerts.length === 0}
          />

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
                  <span className="font-medium">{patient.age} years</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gender:</span>
                  <span className="font-medium">{patient.gender}</span>
                </div>
                {patient.allergies && (
                  <div className="pt-2 border-t">
                    <span className="text-muted-foreground">Known Allergies:</span>
                    <p className="font-medium text-red-600 mt-1">{patient.allergies}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
