/**
 * Triage Module - View/Edit Assessment Page
 *
 * View details of an existing triage assessment or edit it.
 *
 * Route: /triage/[id]
 */
'use client';

import { useCallback, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Edit2, Save, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TriageAssessmentForm,
  TriageCategoryBadge,
  VitalAlertsPanel,
} from '@/components/triage';
import {
  useTriageAssessment,
  useUpdateTriageAssessment,
} from '@/lib/hooks/use-triage';
import { useToast } from '@/components/ui/use-toast';
import type { TriageAssessmentFormData } from '@/lib/types/triage';

export default function TriageAssessmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const assessmentId = params.id as string;

  const [isEditing, setIsEditing] = useState(false);

  // Fetch assessment data
  const {
    data: assessment,
    isLoading,
    error,
    refetch,
  } = useTriageAssessment(parseInt(assessmentId, 10));

  // Update mutation
  const { mutateAsync: updateAssessment, isLoading: isUpdating } = useUpdateTriageAssessment();

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSubmit = useCallback(
    async (data: TriageAssessmentFormData) => {
      try {
        await updateAssessment({
          id: parseInt(assessmentId, 10),
          data,
        });

        toast({
          title: 'Assessment Updated',
          description: 'Triage assessment has been updated successfully.',
        });

        setIsEditing(false);
        refetch();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to update assessment. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [assessmentId, updateAssessment, refetch, toast]
  );

  const handleBack = useCallback(() => {
    router.push('/triage');
  }, [router]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Assessment Not Found"
          description="The requested triage assessment could not be found."
          actions={
            <Button variant="ghost" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Queue
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <span>Triage Assessment</span>
            <TriageCategoryBadge category={assessment.triage_category} size="lg" />
          </div>
        }
        description={`${assessment.patient_name} (${assessment.patient_mrn}) • ${new Date(assessment.assessment_time).toLocaleString()}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            {!isEditing && (
              <Button onClick={handleEdit}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {isEditing ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit Assessment</CardTitle>
                <CardDescription>Update triage assessment details</CardDescription>
              </CardHeader>
              <CardContent>
                <TriageAssessmentForm
                  patientId={assessment.patient_id}
                  encounterId={assessment.encounter_id}
                  initialData={{
                    arrival_mode: assessment.arrival_mode,
                    arrival_time: assessment.arrival_time,
                    chief_complaint: assessment.chief_complaint,
                    chief_complaint_category: assessment.chief_complaint_category,
                    pain_score: assessment.pain_score,
                    mental_status: assessment.mental_status,
                    mobility: assessment.mobility,
                    spo2: assessment.vitals?.spo2,
                    systolic_bp: assessment.vitals?.systolic_bp,
                    diastolic_bp: assessment.vitals?.diastolic_bp,
                    heart_rate: assessment.vitals?.heart_rate,
                    temperature: assessment.vitals?.temperature,
                    respiratory_rate: assessment.vitals?.respiratory_rate,
                    triage_category: assessment.triage_category,
                    category_override_reason: assessment.category_override_reason,
                    assigned_area: assessment.assigned_area,
                    nurse_notes: assessment.nurse_notes,
                    allergies_snapshot: assessment.allergies_snapshot,
                  }}
                  suggestedCategory={assessment.auto_calculated_category}
                  onSubmit={handleSubmit}
                  onCancel={handleCancelEdit}
                  isSubmitting={isUpdating}
                />
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="vitals">Vitals</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Assessment Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Arrival Mode</p>
                        <p className="font-medium capitalize">{assessment.arrival_mode?.replace('_', ' ')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Arrival Time</p>
                        <p className="font-medium">{new Date(assessment.arrival_time).toLocaleString()}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">Chief Complaint</p>
                        <p className="font-medium">{assessment.chief_complaint}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Pain Score</p>
                        <p className="font-medium">{assessment.pain_score ?? 'N/A'} / 10</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Mental Status (AVPU)</p>
                        <p className="font-medium">{assessment.mental_status}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Mobility</p>
                        <p className="font-medium capitalize">{assessment.mobility?.replace('_', ' ')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Assigned Area</p>
                        <p className="font-medium">{assessment.assigned_area_label}</p>
                      </div>
                    </div>

                    {assessment.category_override_reason && (
                      <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
                        <p className="text-sm font-medium text-orange-800 dark:text-orange-200">Category Override Reason</p>
                        <p className="text-sm text-orange-700 dark:text-orange-300">{assessment.category_override_reason}</p>
                      </div>
                    )}

                    {assessment.nurse_notes && (
                      <div className="mt-4">
                        <p className="text-sm text-muted-foreground">Nurse Notes</p>
                        <p className="font-medium whitespace-pre-wrap">{assessment.nurse_notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="vitals">
                <Card>
                  <CardHeader>
                    <CardTitle>Vital Signs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">SpO2</p>
                        <p className="text-2xl font-bold">{assessment.vitals?.spo2 ?? 'N/A'}%</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Blood Pressure</p>
                        <p className="text-2xl font-bold">
                          {assessment.vitals?.systolic_bp ?? '--'}/{assessment.vitals?.diastolic_bp ?? '--'}
                        </p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Heart Rate</p>
                        <p className="text-2xl font-bold">{assessment.vitals?.heart_rate ?? 'N/A'} bpm</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Temperature</p>
                        <p className="text-2xl font-bold">{assessment.vitals?.temperature ?? 'N/A'}°C</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Respiratory Rate</p>
                        <p className="text-2xl font-bold">{assessment.vitals?.respiratory_rate ?? 'N/A'} /min</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history">
                <Card>
                  <CardHeader>
                    <CardTitle>Assessment History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Created</span>
                        <span>{new Date(assessment.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Triaged By</span>
                        <span>{assessment.triaged_by_name}</span>
                      </div>
                      {assessment.seen_by_clinician_time && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Seen by Clinician</span>
                          <span>{new Date(assessment.seen_by_clinician_time).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-muted-foreground">Wait Time</span>
                        <span>{assessment.wait_time_minutes} minutes</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-muted-foreground">Last Updated</span>
                        <span>{new Date(assessment.updated_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Alerts */}
          <VitalAlertsPanel
            alerts={assessment.alerts || []}
            showEmptyState={!assessment.alerts?.length}
          />

          {/* Allergies */}
          {assessment.allergies_snapshot && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-red-600">Known Allergies</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">{assessment.allergies_snapshot}</p>
              </CardContent>
            </Card>
          )}

          {/* Category Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Triage Category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Final Category</span>
                <TriageCategoryBadge category={assessment.triage_category} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Auto-Calculated</span>
                <TriageCategoryBadge category={assessment.auto_calculated_category} />
              </div>
              {assessment.triage_category !== assessment.auto_calculated_category && (
                <p className="text-xs text-orange-600 mt-2">
                  Category was overridden from auto-calculated value
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
