'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, PlayCircle, User, Calendar, Stethoscope, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterDiagnoses, useEncounterTreatmentPlan } from '@/lib/hooks/use-encounters';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { useEncounterImagingOrders } from '@/lib/hooks/use-imaging';
import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';
import { formatDate } from '@/lib/utils/format';
import { ENCOUNTER_STATUS, ENCOUNTER_TYPES } from '@/lib/utils/constants';
import { VitalsDisplay } from '@/components/encounters/vitals-display';
import { DiagnosesList } from '@/components/encounters/diagnoses-list';
import { TreatmentPlanView } from '@/components/encounters/treatment-plan-view';
import { MedicalHistoryView } from '@/components/encounters/medical-history-view';
import { EncounterLabOrders } from '@/components/encounters/encounter-lab-orders';
import { EncounterImagingOrders } from '@/components/encounters/encounter-imaging-orders';
import { EncounterPrescriptions } from '@/components/encounters/encounter-prescriptions';
import { SOAPNoteSummary } from '@/components/encounters/soap-note-summary';
import { ClinicalSnapshotBanner } from '@/components/encounters/clinical-snapshot-banner';
import Link from 'next/link';
import type { EncounterFormData, DiagnosisFormData } from '@/lib/types/encounter-form';

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

export default function EncounterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const encounterId = Number(params.id);

  // Use encounter context instead of independent fetch
  const { encounter, isLoading, error, canPlaceOrders } = useEncounterContext();
  const { data: diagnoses } = useEncounterDiagnoses(encounterId);
  const { data: treatmentPlan } = useEncounterTreatmentPlan(encounterId);
  const { data: labOrders } = useEncounterLabOrders(encounterId);
  const { data: imagingOrders } = useEncounterImagingOrders(encounterId);
  const { data: prescriptions } = useEncounterPrescriptions(encounterId);

  // Convert encounter to formData format for SOAP Note Summary
  const formData = useMemo((): EncounterFormData | null => {
    if (!encounter) return null;
    const bp = parseBP(encounter.blood_pressure);
    return {
      patient: encounter.patient,
      encounter_type: encounter.encounter_type,
      encounter_date: encounter.encounter_date,
      chief_complaint: encounter.chief_complaint || '',
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
        status: encounter.status === 'CANCELLED' ? 'CREATED' : encounter.status,
      clinical_template: encounter.clinical_template || null,
      clinical_template_data: encounter.clinical_template_data || null,
    };
  }, [encounter]);

  // Convert diagnoses to form format
  const diagnosisFormData = useMemo((): DiagnosisFormData[] => {
    if (!diagnoses) return [];
    // Handle both array and paginated response formats
    const diagnosisArray = Array.isArray(diagnoses) ? diagnoses : (diagnoses as { results?: typeof diagnoses })?.results || [];
    return diagnosisArray.map(d => ({
      icd10_code: d.icd10_code,
      icd10_display: d.icd10_code_display || d.icd10_description,
      diagnosis_type: d.diagnosis_type,
      free_text_diagnosis: d.free_text_diagnosis || '',
      notes: d.notes || '',
      is_confirmed: d.is_confirmed,
      certainty: d.certainty,
    }));
  }, [diagnoses]);

  if (isLoading) {
    return <EncounterDetailSkeleton />;
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
  const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);

  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-start gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 sm:h-10 sm:w-10" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold truncate">
                {type?.label} Encounter
              </h1>
              <Badge className={status?.color}>{status?.label}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs sm:text-sm text-muted-foreground">
              <Link
                href={`/patients/${encounter.patient}`}
                className="flex items-center gap-1 hover:text-primary truncate max-w-[200px] sm:max-w-none"
              >
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span className="truncate">{encounter.patient_name}</span>
                <span className="hidden sm:inline">({encounter.patient_mrn})</span>
              </Link>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {formatDate(encounter.encounter_date)}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons - Full width on mobile, inline on desktop */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:self-end">
          {/* Show "Continue Encounter" for active encounters, "View Details" for completed */}
          {encounter.status === 'CLOSED' || encounter.status === 'CANCELLED' ? (
            <Button variant="outline" className="w-full sm:w-auto" asChild>
              <Link href={`/encounters/${encounter.id}/edit`}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </Link>
            </Button>
          ) : (
            <Button className="w-full sm:w-auto" asChild>
              <Link href={`/encounters/${encounter.id}/edit`}>
                <PlayCircle className="h-4 w-4 mr-2" />
                Continue Encounter
              </Link>
            </Button>
          )}

          {encounter.encounter_type === 'OPD' && (
            <Button variant="secondary" className="w-full sm:w-auto text-sm" asChild>
              <Link href={`/admissions/recommendations/new?encounter=${encounter.id}`}>
                <span className="sm:hidden">Admit</span>
                <span className="hidden sm:inline">Recommend for Admission</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      <ClinicalSnapshotBanner encounterId={encounterId} />

      {/* Chief Complaint */}
      <Card>
        <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Stethoscope className="h-4 w-4 sm:h-5 sm:w-5" />
            Chief Complaint
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <p className="text-sm sm:text-base">{encounter.chief_complaint}</p>
        </CardContent>
      </Card>

      {/* Vitals */}
      <VitalsDisplay encounter={encounter} />

      {/* Tabs */}
      <Tabs defaultValue="soap" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 justify-start">
          <TabsTrigger value="soap" className="text-xs sm:text-sm">📋 SOAP</TabsTrigger>
          <TabsTrigger value="assessment" className="text-xs sm:text-sm">Assessment</TabsTrigger>
          <TabsTrigger value="diagnoses" className="text-xs sm:text-sm">Dx ({diagnoses?.length || 0})</TabsTrigger>
          <TabsTrigger value="treatment" className="text-xs sm:text-sm">Treatment</TabsTrigger>
          <TabsTrigger value="lab" className="text-xs sm:text-sm">Lab ({labOrders?.length || 0})</TabsTrigger>
          <TabsTrigger value="imaging" className="text-xs sm:text-sm">Imaging ({imagingOrders?.length || 0})</TabsTrigger>
          <TabsTrigger value="pharmacy" className="text-xs sm:text-sm">Rx ({prescriptions?.length || 0})</TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm">Hx</TabsTrigger>
        </TabsList>

        <TabsContent value="soap">
          {formData && (
            <SOAPNoteSummary
              formData={formData}
              diagnoses={diagnosisFormData}
              labOrders={labOrders || []}
              prescriptions={prescriptions || []}
              patientName={encounter.patient_name ?? undefined}
              patientMrn={encounter.patient_mrn ?? undefined}
              encounterDate={encounter.encounter_date}
              providerName={encounter.created_by_name ?? undefined}
              disabled={true}
            />
          )}
        </TabsContent>

        <TabsContent value="assessment">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {encounter.history_of_present_illness && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">
                    History of Present Illness
                  </h4>
                  <p className="text-sm">{encounter.history_of_present_illness}</p>
                </div>
              )}
              {encounter.physical_examination && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">
                    Physical Examination
                  </h4>
                  <p className="text-sm">{encounter.physical_examination}</p>
                </div>
              )}
              {encounter.assessment && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">
                    Assessment
                  </h4>
                  <p className="text-sm">{encounter.assessment}</p>
                </div>
              )}
              {treatmentPlan?.clinical_notes && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">
                    Plan
                  </h4>
                  <p className="text-sm">{treatmentPlan.clinical_notes}</p>
                </div>
              )}
              {!encounter.history_of_present_illness &&
                !encounter.physical_examination &&
                !encounter.assessment &&
                !treatmentPlan?.clinical_notes && (
                  <p className="text-center text-muted-foreground py-4">
                    No assessment details recorded.
                  </p>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnoses">
          <DiagnosesList diagnoses={diagnoses || []} />
        </TabsContent>

        <TabsContent value="treatment">
          <TreatmentPlanView treatmentPlan={treatmentPlan} />
        </TabsContent>

        <TabsContent value="lab">
          <EncounterLabOrders
            encounterId={encounterId}
            patientId={encounter.patient}
            disabled={encounter.status === 'CLOSED' || encounter.status === 'CANCELLED'}
          />
        </TabsContent>

        <TabsContent value="imaging">
          <EncounterImagingOrders
            encounterId={encounterId}
            patientId={encounter.patient}
            disabled={encounter.status === 'CLOSED' || encounter.status === 'CANCELLED'}
          />
        </TabsContent>

        <TabsContent value="pharmacy">
          <EncounterPrescriptions
            encounterId={encounterId}
            patientId={encounter.patient}
            disabled={encounter.status === 'CLOSED' || encounter.status === 'CANCELLED'}
          />
        </TabsContent>

        <TabsContent value="history">
          <MedicalHistoryView encounter={encounter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EncounterDetailSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
