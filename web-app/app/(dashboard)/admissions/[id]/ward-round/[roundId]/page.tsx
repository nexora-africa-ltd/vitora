'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Stethoscope, Activity, Calendar, User, FileText, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdmission, useWardRound } from '@/lib/hooks/use-inpatient';
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
  if (wardRound.vital_signs) {
    return wardRound.vital_signs;
  }
  return {
    temperature: wardRound.temperature,
    pulse: wardRound.pulse,
    blood_pressure: wardRound.blood_pressure,
    respiratory_rate: wardRound.respiratory_rate,
    spo2: wardRound.spo2,
  };
}

export default function WardRoundDetailPage() {
  const params = useParams();
  const router = useRouter();
  const admissionId = Number(params.id);
  const roundId = Number(params.roundId);

  const { data: admission, isLoading: admissionLoading } = useAdmission(admissionId);
  const { data: wardRound, isLoading: wardRoundLoading } = useWardRound(roundId);

  const isLoading = admissionLoading || wardRoundLoading;

  if (isLoading) {
    return <WardRoundDetailSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <p className="text-muted-foreground mt-2">
          Cannot view ward round without an active admission.
        </p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          View Admissions
        </Button>
      </div>
    );
  }

  if (!wardRound) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Ward Round not found</p>
        <p className="text-muted-foreground mt-2">
          The ward round record you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button onClick={() => router.push(`/admissions/${admissionId}/ward-round`)} className="mt-4">
          View Ward Rounds
        </Button>
      </div>
    );
  }

  const vitals = getVitalSigns(wardRound);
  const conductedByName = wardRound.conducted_by_name || wardRound.conducted_by_username || 'Unknown';
  const hasVitals = vitals.temperature || vitals.pulse || vitals.blood_pressure || vitals.respiratory_rate || vitals.spo2;

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Ward Round Details"
        helpContent={`Ward round for ${admission.patient_name} on ${wardRound.round_date}.`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/admissions/${admissionId}/ward-round`}>
              View All Rounds
            </Link>
          </Button>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <p className="text-lg font-semibold">
              {wardRound.round_date} at {wardRound.round_time}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span>Conducted by {conductedByName}</span>
          </div>
        </div>
        {wardRound.condition_status && (
          <Badge
            variant={CONDITION_STATUS_VARIANTS[wardRound.condition_status] || 'secondary'}
            className="shrink-0 w-fit self-start sm:self-auto"
          >
            {wardRound.condition_status_display || wardRound.condition_status}
          </Badge>
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
              <p className="text-sm text-muted-foreground">Patient</p>
              <p className="font-medium">{admission.patient_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ward / Bed</p>
              <p className="font-medium">{admission.ward_name} - {admission.bed_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Diagnosis</p>
              <p className="font-medium">{admission.admitting_diagnosis_text || admission.admitting_diagnosis}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Admission Status</p>
              <p className="font-medium">{admission.admission_status_display || admission.admission_status}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vital Signs */}
      {hasVitals && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Vital Signs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {vitals.temperature && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Temperature</p>
                  <p className="text-lg font-semibold">{vitals.temperature}°C</p>
                </div>
              )}
              {vitals.pulse && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Pulse</p>
                  <p className="text-lg font-semibold">{vitals.pulse} BPM</p>
                </div>
              )}
              {vitals.blood_pressure && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Blood Pressure</p>
                  <p className="text-lg font-semibold">{vitals.blood_pressure}</p>
                </div>
              )}
              {vitals.respiratory_rate && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Respiratory Rate</p>
                  <p className="text-lg font-semibold">{vitals.respiratory_rate}/min</p>
                </div>
              )}
              {vitals.spo2 && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">SpO2</p>
                  <p className="text-lg font-semibold">{vitals.spo2}%</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clinical Notes */}
      {wardRound.clinical_notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Clinical Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{wardRound.clinical_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* SOAP Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            SOAP Notes
          </CardTitle>
          <CardDescription>Structured clinical documentation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {wardRound.subjective && (
            <div>
              <h4 className="text-sm font-semibold text-primary mb-2">Subjective</h4>
              <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">
                {wardRound.subjective}
              </p>
            </div>
          )}
          {wardRound.objective && (
            <div>
              <h4 className="text-sm font-semibold text-primary mb-2">Objective</h4>
              <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">
                {wardRound.objective}
              </p>
            </div>
          )}
          {wardRound.assessment && (
            <div>
              <h4 className="text-sm font-semibold text-primary mb-2">Assessment</h4>
              <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">
                {wardRound.assessment}
              </p>
            </div>
          )}
          {wardRound.plan && (
            <div>
              <h4 className="text-sm font-semibold text-primary mb-2">Plan</h4>
              <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">
                {wardRound.plan}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Orders */}
      {(wardRound.diet_orders || wardRound.activity_level || wardRound.requires_consultant_review) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {wardRound.diet_orders && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Diet Orders</h4>
                  <p className="text-sm text-muted-foreground">{wardRound.diet_orders}</p>
                </div>
              )}
              {wardRound.activity_level && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Activity Level</h4>
                  <p className="text-sm text-muted-foreground">{wardRound.activity_level}</p>
                </div>
              )}
            </div>
            {wardRound.requires_consultant_review && (
              <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-warning" />
                <span className="text-sm font-medium">
                  Consultant Review Required
                  {wardRound.consultant_specialty && ` - ${wardRound.consultant_specialty}`}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      {(wardRound.created_at || wardRound.updated_at) && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {wardRound.created_at && (
                <span>Created: {new Date(wardRound.created_at).toLocaleString()}</span>
              )}
              {wardRound.updated_at && (
                <span>Updated: {new Date(wardRound.updated_at).toLocaleString()}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WardRoundDetailSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-20" />
      <Skeleton className="h-32" />
      <Skeleton className="h-40" />
      <Skeleton className="h-64" />
    </div>
  );
}
