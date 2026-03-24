'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Pill,
  Printer,
  Stethoscope,
  User,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAdmission, useDischargeByAdmission } from '@/lib/hooks/use-inpatient';
import { useFacility } from '@/lib/context/facility-context';
import { printDischargeDocument } from '@/lib/documents';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import type { Discharge, DischargeType } from '@/lib/types/inpatient';

// =============================================================================
// Helpers
// =============================================================================

function getDischargeTypeBadge(type: DischargeType) {
  const map: Record<DischargeType, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'warning' | 'success' }> = {
    NORMAL: { label: 'Normal', variant: 'success' },
    ROUTINE: { label: 'Routine', variant: 'success' },
    AGAINST_ADVICE: { label: 'Against Medical Advice', variant: 'warning' },
    TRANSFERRED: { label: 'Transferred', variant: 'secondary' },
    DECEASED: { label: 'Deceased', variant: 'destructive' },
    ABSCONDED: { label: 'Absconded', variant: 'destructive' },
  };
  const info = map[type] || { label: type, variant: 'secondary' as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

function ClearanceBadge({ cleared, label }: { cleared: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {cleared ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive" />
      )}
      <span className="text-sm">{label}</span>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {icon && <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function DischargeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const admissionId = Number(params.id);

  const { data: admission, isLoading: admissionLoading } = useAdmission(admissionId);
  const { data: discharge, isLoading: dischargeLoading } = useDischargeByAdmission(admissionId);
  const { facility, facilityDetail } = useFacility();

  const isLoading = admissionLoading || dischargeLoading;

  if (isLoading) {
    return <DischargeDetailSkeleton />;
  }

  if (!admission) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">Admission not found</p>
        <Button onClick={() => router.push('/admissions')} className="mt-4">
          View Admissions
        </Button>
      </div>
    );
  }

  if (!discharge) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-xl font-semibold">No discharge record found</p>
        <p className="text-muted-foreground mt-2">
          This admission does not have a discharge record yet.
        </p>
        <Button onClick={() => router.push(`/admissions/${admissionId}`)} className="mt-4">
          View Admission
        </Button>
      </div>
    );
  }

  const diagPrimary = discharge.diagnoses?.find((d) => d.role === 'PRIMARY');
  const diagSecondary = discharge.diagnoses?.filter((d) => d.role !== 'PRIMARY') || [];

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Discharge Details"
        helpContent={`Discharge record for ${admission.patient_name} (${admission.admission_number})`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admissions/${admissionId}`}>View Admission</Link>
            </Button>
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-lg sm:text-xl font-bold truncate">
            {admission.admission_number}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            <span className="font-medium">{admission.patient_name}</span>
            {admission.patient_age ? ` • ${admission.patient_age}y` : ''}
            {admission.patient_gender ? ` • ${admission.patient_gender === 'M' ? 'Male' : admission.patient_gender === 'F' ? 'Female' : 'Other'}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {getDischargeTypeBadge(discharge.discharge_type)}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Discharged</p>
                <p className="text-sm font-medium">{formatDateTime(discharge.discharge_date)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Length of Stay</p>
                <p className="text-sm font-medium">{discharge.length_of_stay ?? '—'} days</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Discharged By</p>
                <p className="text-sm font-medium">{discharge.discharged_by_username || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Ward</p>
                <p className="text-sm font-medium">{admission.ward_name || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Diagnoses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Diagnoses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Admitting Diagnosis</p>
            <p className="text-sm">{discharge.admission_diagnosis || '—'}</p>
          </div>
          <Separator />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Final Diagnosis (Primary)</p>
            {diagPrimary ? (
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-xs">Primary</Badge>
                <span className="text-sm">{diagPrimary.code && `${diagPrimary.code} — `}{diagPrimary.description}</span>
              </div>
            ) : (
              <p className="text-sm">
                {discharge.final_diagnosis_text || discharge.final_diagnosis || '—'}
              </p>
            )}
          </div>
          {diagSecondary.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-2">Secondary / Complications</p>
                <div className="space-y-1.5">
                  {diagSecondary.map((d, i) => (
                    <div key={d.id ?? i} className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${d.role === 'COMPLICATION' ? 'border-amber-300 text-amber-700' : ''}`}
                      >
                        {d.role_display || d.role}
                      </Badge>
                      <span className="text-sm">{d.code && `${d.code} — `}{d.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Discharge Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Discharge Summary
          </CardTitle>
          {discharge.treatment_summary && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                printDischargeDocument({
                  documentTitle: 'Discharge Summary',
                  content: discharge.treatment_summary,
                  patientName: admission.patient_name || '',
                  admissionNumber: admission.admission_number,
                  wardName: admission.ward_name || '',
                  admissionDate: admission.admission_date,
                  dischargeDate: discharge.discharge_date,
                  admittingDiagnosis: discharge.admission_diagnosis,
                  facilityName: facility?.name,
                  facilityMflCode: facility?.mfl_code,
                  facilityLocation: facilityDetail ? `${facilityDetail.sub_county_name}, ${facilityDetail.county_name}` : undefined,
                })
              }
              className="gap-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {discharge.treatment_summary ? (
            <div className="tibabot-markdown text-sm break-words overflow-hidden">
              <Markdown remarkPlugins={[remarkGfm]}>{discharge.treatment_summary}</Markdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No discharge summary recorded.</p>
          )}
        </CardContent>
      </Card>

      {/* Patient Instructions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Patient Instructions
          </CardTitle>
          {discharge.patient_instructions && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                printDischargeDocument({
                  documentTitle: 'Patient Discharge Instructions',
                  content: discharge.patient_instructions,
                  patientName: admission.patient_name || '',
                  admissionNumber: admission.admission_number,
                  wardName: admission.ward_name || '',
                  admissionDate: admission.admission_date,
                  dischargeDate: discharge.discharge_date,
                  admittingDiagnosis: discharge.admission_diagnosis,
                  facilityName: facility?.name,
                  facilityMflCode: facility?.mfl_code,
                  facilityLocation: facilityDetail ? `${facilityDetail.sub_county_name}, ${facilityDetail.county_name}` : undefined,
                })
              }
              className="gap-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {discharge.patient_instructions ? (
            <div className="tibabot-markdown text-sm break-words overflow-hidden">
              <Markdown remarkPlugins={[remarkGfm]}>{discharge.patient_instructions}</Markdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No patient instructions recorded.</p>
          )}
        </CardContent>
      </Card>

      {/* Discharge Medications */}
      {discharge.discharge_medications && discharge.discharge_medications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Pill className="h-5 w-5" />
              Discharge Medications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {discharge.discharge_medications.map((med, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <p className="font-medium text-sm">{med.drug_name}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5 text-xs text-muted-foreground">
                    <span>Dosage: <span className="text-foreground">{med.dosage}</span></span>
                    <span>Frequency: <span className="text-foreground">{med.frequency}</span></span>
                    <span>Duration: <span className="text-foreground">{med.duration || '—'}</span></span>
                    {med.instructions && (
                      <span>Notes: <span className="text-foreground">{med.instructions}</span></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Follow-up & Clearances */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Follow-up */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Follow-up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <InfoRow
              label="Follow-up Date"
              value={discharge.follow_up_date ? formatDate(discharge.follow_up_date) : 'Not scheduled'}
              icon={<Calendar className="h-4 w-4" />}
            />
            {discharge.follow_up_instructions && (
              <InfoRow
                label="Follow-up Instructions"
                value={discharge.follow_up_instructions}
              />
            )}
            {discharge.referral_facility && (
              <InfoRow
                label="Referral Facility"
                value={discharge.referral_facility}
              />
            )}
            {discharge.referral_reason && (
              <InfoRow
                label="Referral Reason"
                value={discharge.referral_reason}
              />
            )}
          </CardContent>
        </Card>

        {/* Clearances */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Clearances</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ClearanceBadge cleared={discharge.billing_cleared} label="Billing Clearance" />
            <ClearanceBadge cleared={discharge.pharmacy_cleared} label="Pharmacy Clearance" />
            <ClearanceBadge cleared={discharge.lab_results_acknowledged} label="Lab Results Acknowledged" />
          </CardContent>
        </Card>
      </div>

      {/* Maternity Continuity (if applicable) */}
      {discharge.mch_registration && discharge.maternity_continuity_action !== 'NONE' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Maternity Continuity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <InfoRow
              label="MCH Registration"
              value={
                discharge.mch_registration_number ? (
                  <Link href={`/mch/${discharge.mch_registration}`} className="text-primary underline">
                    {discharge.mch_registration_number}
                  </Link>
                ) : (
                  `#${discharge.mch_registration}`
                )
              }
            />
            <InfoRow
              label="Continuity Action"
              value={discharge.maternity_continuity_action_display || discharge.maternity_continuity_action}
            />
            <InfoRow
              label="Status"
              value={discharge.maternity_continuity_status_display || discharge.maternity_continuity_status}
            />
          </CardContent>
        </Card>
      )}

      {/* Procedures (if any) */}
      {discharge.procedures_performed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Procedures Performed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{discharge.procedures_performed}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

function DischargeDetailSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-32 rounded-lg" />
    </div>
  );
}
