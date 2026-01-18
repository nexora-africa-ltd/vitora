'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Stethoscope, Activity, Calendar, User } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdmission, useAdmissionWardRounds } from '@/lib/hooks/use-inpatient';
import type { WardRound } from '@/lib/types/inpatient';

// Map condition status to semantic Badge variants
const CONDITION_STATUS_VARIANTS: Record<string, 'success' | 'info' | 'warning' | 'destructive'> = {
  STABLE: 'success',
  IMPROVING: 'info',
  DETERIORATING: 'warning',
  CRITICAL: 'destructive',
};

/**
 * Get vital signs from a ward round entry.
 * Handles both nested vital_signs object and flat fields.
 */
function getVitalSigns(wardRound: WardRound) {
  // Prefer nested vital_signs if available
  if (wardRound.vital_signs) {
    return wardRound.vital_signs;
  }
  // Fall back to flat fields
  return {
    temperature: wardRound.temperature,
    pulse: wardRound.pulse,
    blood_pressure: wardRound.blood_pressure,
    respiratory_rate: wardRound.respiratory_rate,
    spo2: wardRound.spo2,
  };
}

export default function WardRoundHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const admissionId = Number(params.id);

  const { data: admission, isLoading: admissionLoading } = useAdmission(admissionId);
  const { data: wardRoundsResponse, isLoading: wardRoundsLoading } = useAdmissionWardRounds(admissionId);

  const wardRounds = wardRoundsResponse?.results || [];
  const isLoading = admissionLoading || wardRoundsLoading;

  if (isLoading) {
    return <WardRoundHistorySkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Admission not found</h2>
        <p className="text-accent-foreground mt-2">
          Cannot view ward rounds without an active admission.
        </p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          Back to Admissions
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Link href={`/admissions/${admissionId}`} className="text-sm text-accent-foreground hover:text-primary">
          Back to Admission
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <PageHeader
          title="Ward Rounds"
          description={`Ward round history for ${admission.patient_name}`}
        />
        {admission.admission_status === 'ACTIVE' && (
          <Button asChild>
            <Link href={`/admissions/${admissionId}/ward-round/new`}>
              <Plus className="h-4 w-4 mr-2" />
              New Ward Round
            </Link>
          </Button>
        )}
      </div>

      {/* Patient Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Patient Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-accent-foreground">Patient</p>
              <p className="font-medium">{admission.patient_name}</p>
            </div>
            <div>
              <p className="text-sm text-accent-foreground">Ward / Bed</p>
              <p className="font-medium">{admission.ward_name} - {admission.bed_number}</p>
            </div>
            <div>
              <p className="text-sm text-accent-foreground">Diagnosis</p>
              <p className="font-medium">{admission.admitting_diagnosis_text || admission.admitting_diagnosis}</p>
            </div>
            <div>
              <p className="text-sm text-accent-foreground">Days Admitted</p>
              <p className="font-medium">
                {Math.ceil(
                  (new Date().getTime() - new Date(admission.admission_date).getTime()) / (1000 * 60 * 60 * 24)
                )} days
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ward Round History */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Stethoscope className="h-5 w-5" />
          Ward Round History
        </h2>

        {wardRounds.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Stethoscope className="h-12 w-12 mx-auto text-accent-foreground mb-4" />
              <h3 className="text-lg font-medium">No Ward Rounds Recorded</h3>
              <p className="text-accent-foreground mt-1">
                Start documenting ward rounds for this admission.
              </p>
              {admission.admission_status === 'ACTIVE' && (
                <Button asChild className="mt-4">
                  <Link href={`/admissions/${admissionId}/ward-round/new`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Ward Round
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {wardRounds.map((wardRound) => {
              const vitals = getVitalSigns(wardRound);
              const conductedByName = wardRound.conducted_by_name || wardRound.conducted_by_username || 'Unknown';

              return (
                <Card key={wardRound.id} data-testid="ward-round-card">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {wardRound.round_date}
                          <span className="text-accent-foreground font-normal">
                            at {wardRound.round_time}
                          </span>
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {conductedByName}
                        </CardDescription>
                      </div>
                      {wardRound.condition_status && (
                        <Badge variant={CONDITION_STATUS_VARIANTS[wardRound.condition_status] || 'secondary'}>
                          {wardRound.condition_status_display || wardRound.condition_status}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Vital Signs */}
                    {(vitals.temperature || vitals.pulse || vitals.blood_pressure || vitals.respiratory_rate || vitals.spo2) && (
                      <div className="bg-muted/50 rounded-lg p-4">
                        <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                          <Activity className="h-4 w-4" />
                          Vital Signs
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          {vitals.temperature && (
                            <div>
                              <p className="text-xs text-accent-foreground">Temperature</p>
                              <p className="font-medium">{vitals.temperature}°C</p>
                            </div>
                          )}
                          {vitals.pulse && (
                            <div>
                              <p className="text-xs text-accent-foreground">Pulse</p>
                              <p className="font-medium">{vitals.pulse} BPM</p>
                            </div>
                          )}
                          {vitals.blood_pressure && (
                            <div>
                              <p className="text-xs text-accent-foreground">Blood Pressure</p>
                              <p className="font-medium">{vitals.blood_pressure}</p>
                            </div>
                          )}
                          {vitals.respiratory_rate && (
                            <div>
                              <p className="text-xs text-accent-foreground">Respiratory Rate</p>
                              <p className="font-medium">{vitals.respiratory_rate}/min</p>
                            </div>
                          )}
                          {vitals.spo2 && (
                            <div>
                              <p className="text-xs text-accent-foreground">SpO2</p>
                              <p className="font-medium">{vitals.spo2}%</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Clinical Notes / SOAP Notes */}
                    {wardRound.clinical_notes && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">Clinical Notes</h4>
                        <p className="text-sm text-accent-foreground">{wardRound.clinical_notes}</p>
                      </div>
                    )}

                    {/* SOAP Format */}
                    <div className="grid md:grid-cols-2 gap-4">
                      {wardRound.subjective && (
                        <div>
                          <h4 className="text-sm font-medium mb-1">Subjective</h4>
                          <p className="text-sm text-accent-foreground">{wardRound.subjective}</p>
                        </div>
                      )}
                      {wardRound.objective && (
                        <div>
                          <h4 className="text-sm font-medium mb-1">Objective</h4>
                          <p className="text-sm text-accent-foreground">{wardRound.objective}</p>
                        </div>
                      )}
                    </div>

                    {wardRound.assessment && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">Assessment</h4>
                        <p className="text-sm text-accent-foreground">{wardRound.assessment}</p>
                      </div>
                    )}

                    {wardRound.plan && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">Plan</h4>
                        <p className="text-sm text-accent-foreground">{wardRound.plan}</p>
                      </div>
                    )}

                    {/* Additional Orders */}
                    {(wardRound.diet_orders || wardRound.activity_level) && (
                      <div className="grid md:grid-cols-2 gap-4 pt-2 border-t">
                        {wardRound.diet_orders && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">Diet Orders</h4>
                            <p className="text-sm text-accent-foreground">{wardRound.diet_orders}</p>
                          </div>
                        )}
                        {wardRound.activity_level && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">Activity Level</h4>
                            <p className="text-sm text-accent-foreground">{wardRound.activity_level}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function WardRoundHistorySkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-36" />
      </div>
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  );
}
