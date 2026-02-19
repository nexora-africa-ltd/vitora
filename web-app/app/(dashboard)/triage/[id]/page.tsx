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
import { ArrowLeft, Edit2, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TriageCategoryBadge,
  VitalAlertsPanel,
  RouteToClinicDialog,
} from '@/components/triage';
import {
  useTriageAssessment,
  useUpdateTriageAssessment,
} from '@/lib/hooks/use-triage';
import { toast } from '@/lib/hooks/use-toast';
import type { TriageAssessment } from '@/lib/types/triage';
import { ASSIGNED_AREA_CONFIG } from '@/lib/types/triage';

export default function TriageAssessmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const assessmentId = params.id as string;

  const [isEditing, setIsEditing] = useState(false);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);

  // Fetch assessment data
  const {
    data: assessment,
    isLoading,
    error,
    refetch,
  } = useTriageAssessment(parseInt(assessmentId, 10));

  // Update mutation
  const { mutateAsync: updateAssessment, isPending: isUpdating } = useUpdateTriageAssessment();

  const handleEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSubmit = useCallback(
    async (data: Partial<TriageAssessment>) => {
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
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to update assessment. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [assessmentId, updateAssessment, refetch]
  );

  const handleBack = useCallback(() => {
    router.push('/triage');
  }, [router]);

  const handleRouteSuccess = useCallback(() => {
    refetch();
    toast({
      title: 'Success',
      description: 'Patient has been routed to clinic queue.',
    });
  }, [refetch]);

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

  // Helper to get area label - handle empty/null assigned_area
  const areaLabel = assessment.assigned_area && assessment.assigned_area in ASSIGNED_AREA_CONFIG
    ? ASSIGNED_AREA_CONFIG[assessment.assigned_area as keyof typeof ASSIGNED_AREA_CONFIG].label
    : assessment.assigned_clinic_name ?? assessment.assigned_area ?? 'Not assigned';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Triage Assessment"
        description={`${assessment.patient_name ?? 'Unknown Patient'} (${assessment.encounter_mrn ?? 'No MRN'}) • ${new Date(assessment.triage_start_time).toLocaleString()}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            {!isEditing && (
              <>
                <Button variant="outline" onClick={() => setRouteDialogOpen(true)}>
                  <Building2 className="h-4 w-4 mr-2" />
                  Route to Clinic
                </Button>
                <Button onClick={handleEdit}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Category badge display */}
      <div className="flex items-center gap-3">
        <TriageCategoryBadge category={assessment.triage_category} size="lg" />
      </div>

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
                <p className="text-muted-foreground">
                  Edit form is under development. Please use the queue actions to update assessments.
                </p>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
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
                        <p className="font-medium">{areaLabel}</p>
                      </div>
                    </div>

                    {assessment.category_override_reason && (
                      <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
                        <p className="text-sm font-medium text-orange-800 dark:text-orange-200">Category Override Reason</p>
                        <p className="text-sm text-orange-700 dark:text-orange-300">{assessment.category_override_reason}</p>
                      </div>
                    )}
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
                        <span>{assessment.triaged_by_name ?? 'Unknown'}</span>
                      </div>
                      {assessment.seen_by_clinician_time && (
                        <div className="flex justify-between py-2 border-b">
                          <span className="text-muted-foreground">Seen by Clinician</span>
                          <span>{new Date(assessment.seen_by_clinician_time).toLocaleString()}</span>
                        </div>
                      )}
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
          <VitalAlertsPanel alerts={assessment.alerts || []} />

          {/* Allergies */}
          {assessment.allergies_noted && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-red-600">Known Allergies</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">{assessment.allergies_noted}</p>
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

      {/* Route to Clinic Dialog */}
      <RouteToClinicDialog
        open={routeDialogOpen}
        onOpenChange={setRouteDialogOpen}
        assessment={assessment}
        onSuccess={handleRouteSuccess}
      />
    </div>
  );
}
