'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  PlayCircle, User, Calendar, Stethoscope, Eye,
  ClipboardList, FileText, Beaker, ScanLine, Pill, Scissors,
  HeartHandshake, ArrowRightLeft, ScrollText, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader } from '@/components/shared/page-header';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterDiagnoses, useEncounterTreatmentPlan } from '@/lib/hooks/use-encounters';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { useEncounterImagingOrders } from '@/lib/hooks/use-imaging';
import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';
import { useEncounterProcedureOrders } from '@/lib/hooks/use-procedures';
import { useEncounterReferrals } from '@/lib/hooks/use-referrals';
import { useLabEncounterSocket } from '@/lib/hooks';
import {
  useEncounterPhysioOrders,
  useEncounterNutritionConsultations,
  useEncounterCounsellingReferrals,
  useEncounterOTOrders,
  useEncounterSWReferrals,
} from '@/lib/hooks/use-encounter-allied-health';
import { formatDate } from '@/lib/utils/format';
import { ENCOUNTER_STATUS, ENCOUNTER_TYPES } from '@/lib/utils/constants';
import { VitalsDisplay } from '@/components/encounters/vitals-display';
import { CDSAlertsPanel } from '@/components/encounters/cds-alerts-panel';
import { EnhancedCDSPanel } from '@/components/encounters/enhanced-cds-panel';
import { CarePlanPanel } from '@/components/encounters/care-plan-panel';
import { DiagnosesList } from '@/components/encounters/diagnoses-list';
import { TreatmentPlanView } from '@/components/encounters/treatment-plan-view';
import { MedicalHistoryView } from '@/components/encounters/medical-history-view';
import { EncounterLabOrders } from '@/components/encounters/encounter-lab-orders';
import { EncounterImagingOrders } from '@/components/encounters/encounter-imaging-orders';
import { EncounterPrescriptions } from '@/components/encounters/encounter-prescriptions';
import { SOAPNoteSummary } from '@/components/encounters/soap-note-summary';
import { ClinicalSnapshotBanner } from '@/components/encounters/clinical-snapshot-banner';
import { EncounterAuditTrail } from '@/components/encounters/encounter-audit-trail';
import { EncounterAlliedHealthContent } from '@/components/encounters/encounter-allied-health-content';
import { EncounterReferralsContent } from '@/components/encounters/encounter-referrals-content';
import { EncounterProcedureOrders } from '@/components/encounters/encounter-procedure-orders';
import { EncounterChiefComplaintCard } from '@/components/encounters/encounter-chief-complaint-card';
import { VitalsTrendChart } from '@/components/shared/vitals-trend-chart';
import { InvestigationSuggestionsPanel } from '@/components/encounters/investigation-suggestions-panel';
import { usePatientVitalsHistory } from '@/lib/hooks/use-patients';
import { useOptionalAIChatContext } from '@/lib/context/ai-chat-context';
import Link from 'next/link';
import type { EncounterFormData, DiagnosisFormData } from '@/lib/types/encounter-form';
import type { AIQuickAction } from '@/lib/types/ai';

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

function parseBPToMAP(bp: string | null | undefined): number | undefined {
  if (!bp) return undefined;
  const match = bp.match(/^(\d+)\/(\d+)$/);
  if (!match) return undefined;
  const sys = Number(match[1]);
  const dia = Number(match[2]);
  if (isNaN(sys) || isNaN(dia)) return undefined;
  return Math.round(dia + (sys - dia) / 3);
}

function calculateAge(dob: string | null | undefined): number {
  if (!dob) return 0;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

// =============================================================================
// Encounter Quick Actions for AI Chat Widget
// =============================================================================

const ENCOUNTER_QUICK_ACTIONS: AIQuickAction[] = [
  {
    id: 'encounter-ddx',
    label: 'Differential diagnosis',
    query:
      'Provide a differential diagnosis for this patient\'s presentation. Consider the chief complaint, vital signs, age, history, and any risk factors. Rank by likelihood.',
    userMessage: '\uD83E\uDE7A Requesting differential diagnosis...',
  },
  {
    id: 'encounter-care-plan',
    label: 'Suggest care plan',
    query: '',
    userMessage: '\uD83D\uDCCB Generating care plan...',
    panelAction: 'care-plan',
  },
  {
    id: 'encounter-cds-check',
    label: 'Safety check',
    query: '',
    userMessage: '\uD83D\uDEE1\uFE0F Running clinical safety checks...',
    panelAction: 'cds-evaluate',
  },
  {
    id: 'encounter-workup',
    label: 'Recommended workup',
    query: '',
    userMessage: '\uD83D\uDD2C Suggesting investigations...',
    panelAction: 'suggest-investigations',
  },
];

export default function EncounterDetailPage() {
  const params = useParams();
  const encounterId = Number(params.id);

  // Use encounter context instead of independent fetch
  const { encounter, isLoading, error } = useEncounterContext();
  const { data: diagnoses } = useEncounterDiagnoses(encounterId);
  const { data: treatmentPlan } = useEncounterTreatmentPlan(encounterId);
  const { data: labOrders } = useEncounterLabOrders(encounterId);
  const { data: imagingOrders } = useEncounterImagingOrders(encounterId);
  const { data: prescriptions } = useEncounterPrescriptions(encounterId);
  const { data: procedureOrdersData } = useEncounterProcedureOrders(encounterId);

  // Allied health data (for tab badge count)
  const { data: ahPhysio } = useEncounterPhysioOrders(encounterId);
  const { data: ahNutrition } = useEncounterNutritionConsultations(encounterId);
  const { data: ahOT } = useEncounterOTOrders(encounterId);
  const { data: ahCounselling } = useEncounterCounsellingReferrals(encounterId);
  const { data: ahSW } = useEncounterSWReferrals(encounterId);
  const alliedHealthCount =
    (ahPhysio?.results?.length || 0) +
    (ahNutrition?.results?.length || 0) +
    (ahOT?.results?.length || 0) +
    (ahCounselling?.results?.length || 0) +
    (ahSW?.results?.length || 0);

  // Referrals data (for tab badge count)
  const { data: referralsList } = useEncounterReferrals(encounterId);
  const referralsCount = referralsList?.length || 0;

  // Vitals history for trend chart
  const { data: vitalsHistory, isLoading: isLoadingVitals } = usePatientVitalsHistory(
    encounter?.patient ?? 0, 'all'
  );

  // Computed counts for grouped tabs
  const procedureOrdersCount = procedureOrdersData?.results?.length || 0;
  const ordersCount = (labOrders?.length || 0) + (imagingOrders?.length || 0) + (prescriptions?.length || 0) + procedureOrdersCount;
  const servicesCount = alliedHealthCount + referralsCount;

  // Real-time WebSocket subscription for lab result updates
  // Automatically invalidates lab orders cache when results are verified
  useLabEncounterSocket(encounterId);

  // =========================================================================
  // AI Chat Widget — encounter-aware context wiring
  // =========================================================================

  const chatCtx = useOptionalAIChatContext();
  const setEncounterAwareContext = chatCtx?.setEncounterAwareContext;
  const setQuickActions = chatCtx?.setQuickActions;
  const activePanelAction = chatCtx?.activePanelAction ?? null;
  const clearPanelAction = chatCtx?.clearPanelAction;

  // Track which panel was triggered by the AI widget
  const [autoTriggerCDS, setAutoTriggerCDS] = useState(false);
  const [autoTriggerCarePlan, setAutoTriggerCarePlan] = useState(false);
  const [autoTriggerInvestigations, setAutoTriggerInvestigations] = useState(false);

  useEffect(() => {
    if (!activePanelAction || !clearPanelAction) return;
    if (activePanelAction === 'cds-evaluate') {
      setAutoTriggerCDS(true);
      clearPanelAction();
    } else if (activePanelAction === 'care-plan') {
      setAutoTriggerCarePlan(true);
      clearPanelAction();
    } else if (activePanelAction === 'suggest-investigations') {
      setAutoTriggerInvestigations(true);
      clearPanelAction();
    }
  }, [activePanelAction, clearPanelAction]);

  // Wire encounter + patient data into the AI chat context
  useEffect(() => {
    if (!setEncounterAwareContext || !encounter) return;

    const allergies = encounter.allergies
      ?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [];
    const comorbidities = encounter.chronic_conditions
      ?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [];
    const meds = encounter.current_medications
      ?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [];

    setEncounterAwareContext(
      {
        patient_age: calculateAge(encounter.patient_date_of_birth),
        patient_sex: encounter.patient_gender ?? 'O',
        allergies,
        comorbidities,
        current_medications: meds,
      },
      {
        chief_complaint: encounter.chief_complaint ?? undefined,
        vitals: {
          spo2: encounter.spo2 != null ? Number(encounter.spo2) : undefined,
          pulse: encounter.pulse ?? undefined,
          temperature: encounter.temperature != null
            ? Number(encounter.temperature) : undefined,
          rr: encounter.respiratory_rate ?? undefined,
          map: parseBPToMAP(encounter.blood_pressure),
        },
      },
    );

    return () => { setEncounterAwareContext(null, null); };
  }, [encounter, setEncounterAwareContext]);

  // Register encounter-specific quick actions
  useEffect(() => {
    if (!setQuickActions) return;
    setQuickActions(ENCOUNTER_QUICK_ACTIONS);
    return () => { setQuickActions([]); };
  }, [setQuickActions]);

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
      <div className="container mx-auto px-3 py-12 sm:px-4 text-center">
        <h2 className="text-xl font-semibold">Encounter not found</h2>
        <p className="text-muted-foreground mt-2">
          The encounter you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button className="mt-4" asChild>
          <Link href="/encounters">Back to Encounters</Link>
        </Button>
      </div>
    );
  }

  const status = ENCOUNTER_STATUS.find((s) => s.value === encounter.status);
  const type = ENCOUNTER_TYPES.find((t) => t.value === encounter.encounter_type);

  // Action buttons for header
  const actionButtons = (
    <>
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

      {/* Admission referrals are now created through the Referrals tab */}
    </>
  );

  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Header with PageHeader component */}
      <PageHeader
        title={`${type?.label || ''} Encounter`}
        helpContent="View encounter details including vitals, diagnoses, treatment plans, lab orders, imaging, and prescriptions."
        actions={actionButtons}
      />

      {/* Patient Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <Link
            href={`/patients/${encounter.patient}`}
            className="flex items-center gap-1.5 hover:text-primary text-sm font-medium"
          >
            <User className="h-4 w-4 shrink-0" />
            <span className="truncate">{encounter.patient_name}</span>
            <span className="text-muted-foreground">({encounter.patient_mrn})</span>
          </Link>
          <p className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {formatDate(encounter.encounter_date)}
          </p>
        </div>
        <Badge className={`${status?.color} shrink-0 w-fit self-start sm:self-auto`}>
          {status?.label}
        </Badge>
      </div>

      <ClinicalSnapshotBanner encounterId={encounterId} />

      <EncounterChiefComplaintCard encounter={encounter} />

      {/* Vitals */}
      <VitalsDisplay encounter={encounter} />

      {/* Vitals Trends */}
      <VitalsTrendChart
        data={vitalsHistory ?? []}
        isLoading={isLoadingVitals}
        defaultRange="24h"
        compact
      />

      {/* CDS Alerts Panel — tiered advisory alerts from clinical rules */}
      <CDSAlertsPanel encounterId={encounterId} />

      {/* AI Enhanced CDS Panel (Phase 5) — drug interactions, contraindications */}
      <EnhancedCDSPanel
        medications={encounter.current_medications
          ?.split(',').map((s: string) => s.trim()).filter(Boolean)}
        diagnoses={diagnosisFormData.map(d =>
          d.icd10_display || d.free_text_diagnosis
        ).filter(Boolean)}
        allergies={encounter.allergies
          ?.split(',').map((s: string) => s.trim()).filter(Boolean)}
        patientAge={calculateAge(encounter.patient_date_of_birth)}
        patientSex={
          encounter.patient_gender === 'F' ? 'female' :
          encounter.patient_gender === 'M' ? 'male' : null
        }
        autoTrigger={autoTriggerCDS}
        onAutoTriggerConsumed={() => setAutoTriggerCDS(false)}
      />

      {/* AI Care Plan Panel (Phase 5) */}
      <CarePlanPanel
        primaryDiagnosis={
          diagnosisFormData[0]?.icd10_display
          || diagnosisFormData[0]?.free_text_diagnosis
          || undefined
        }
        chiefComplaint={encounter.chief_complaint || undefined}
        icd10Code={diagnosisFormData[0]?.icd10_code?.toString()}
        patientAge={calculateAge(encounter.patient_date_of_birth)}
        patientSex={encounter.patient_gender === 'F' ? 'female' : 'male'}
        allergies={encounter.allergies
          ?.split(',').map((s: string) => s.trim()).filter(Boolean)}
        currentMedications={encounter.current_medications
          ?.split(',').map((s: string) => s.trim()).filter(Boolean)}
        comorbidities={encounter.chronic_conditions
          ?.split(',').map((s: string) => s.trim()).filter(Boolean)}
        vitals={{
          ...(encounter.temperature != null && { temperature: Number(encounter.temperature) }),
          ...(encounter.pulse != null && { pulse: encounter.pulse }),
          ...(encounter.respiratory_rate != null && { respiratory_rate: encounter.respiratory_rate }),
          ...(encounter.spo2 != null && { spo2: Number(encounter.spo2) }),
          ...(encounter.weight != null && { weight: Number(encounter.weight) }),
          ...(encounter.height != null && { height: Number(encounter.height) }),
        }}
        labResults={labOrders?.flatMap(order =>
          order.items
            .filter(item => item.result?.numeric_value != null && item.test_name)
            .map(item => ({
              test_name: item.test_name,
              value: item.result!.numeric_value!,
              unit: item.result!.result_unit || '',
            }))
        )}
        autoTrigger={autoTriggerCarePlan}
        onAutoTriggerConsumed={() => setAutoTriggerCarePlan(false)}
      />

      {/* Tabs — grouped: SOAP | Assessment & Dx | Orders | Referrals | History */}
      <Tabs defaultValue="soap" className="space-y-4">
        <TooltipProvider delayDuration={400}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 justify-start">
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="soap" className="text-xs sm:text-sm">📋 SOAP</TabsTrigger>
            </TooltipTrigger>
            <TooltipContent><p>Subjective, Objective, Assessment & Plan summary</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="assessment-dx" className="text-xs sm:text-sm">
                <span className="sm:hidden">A&Dx ({diagnoses?.length || 0})</span>
                <span className="hidden sm:inline">Assessment & Dx ({diagnoses?.length || 0})</span>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent><p>HPI, physical exam, assessment, diagnoses & treatment plan</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="orders" className="text-xs sm:text-sm">
                Orders ({ordersCount})
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent><p>Lab orders, imaging requests, prescriptions & procedures</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="referrals" className="text-xs sm:text-sm">
                <span className="sm:hidden">Ref ({servicesCount})</span>
                <span className="hidden sm:inline">Referrals ({servicesCount})</span>
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent><p>Allied health services & internal/external referrals</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger value="history" className="text-xs sm:text-sm">History</TabsTrigger>
            </TooltipTrigger>
            <TooltipContent><p>Medical history & audit trail</p></TooltipContent>
          </Tooltip>
        </TabsList>
        </TooltipProvider>

        {/* SOAP Summary */}
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

        {/* Assessment & Diagnoses — Clinical Assessment, Dx, Treatment Plan */}
        <TabsContent value="assessment-dx">
          <Accordion type="multiple" defaultValue={['clinical-assessment', 'diagnoses', 'treatment']}>
            <AccordionItem value="clinical-assessment">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <span>Clinical Assessment</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-6">
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
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="diagnoses">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-muted-foreground" />
                  <span>Diagnoses</span>
                  {(diagnoses?.length || 0) > 0 && (
                    <Badge variant="secondary" className="text-xs">{diagnoses?.length}</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <DiagnosesList diagnoses={diagnoses || []} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="treatment" className="border-b-0">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>Treatment Plan</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <TreatmentPlanView treatmentPlan={treatmentPlan} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>

        {/* Orders — Lab, Imaging, Prescriptions, Procedures */}
        <TabsContent value="orders" className="space-y-4">
          {/* AI Investigation Suggestions — advisory, clinician must accept */}
          {diagnosisFormData.length > 0 && (
            <InvestigationSuggestionsPanel
              encounterId={encounterId}
              patientId={encounter.patient}
              chiefComplaint={encounter.chief_complaint || undefined}
              diagnoses={diagnosisFormData.map(d =>
                d.icd10_display || d.free_text_diagnosis
              ).filter(Boolean)}
              symptoms={encounter.chief_complaint
                ?.split(',').map((s: string) => s.trim()).filter(Boolean)}
              existingOrders={labOrders?.flatMap(order =>
                order.items.map(item => item.test_name)
              )}
              patientAge={calculateAge(encounter.patient_date_of_birth)}
              patientSex={encounter.patient_gender === 'F' ? 'F' : encounter.patient_gender === 'M' ? 'M' : undefined}
              isPregnant={false}
              autoTrigger={autoTriggerInvestigations}
              onAutoTriggerConsumed={() => setAutoTriggerInvestigations(false)}
            />
          )}
          <Accordion type="multiple" defaultValue={['lab', 'imaging', 'prescriptions', 'procedures']}>
            <AccordionItem value="lab">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Beaker className="h-4 w-4 text-muted-foreground" />
                  <span>Lab Orders</span>
                  {(labOrders?.length || 0) > 0 && (
                    <Badge variant="secondary" className="text-xs">{labOrders?.length}</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <EncounterLabOrders
                  encounterId={encounterId}
                  patientId={encounter.patient}
                  disabled={encounter.status === 'CLOSED' || encounter.status === 'CANCELLED'}
                  patientDemographics={{
                    patientAge: calculateAge(encounter.patient_date_of_birth),
                    patientSex: encounter.patient_gender === 'F' ? 'female' : 'male',
                  }}
                  diagnoses={diagnosisFormData
                    .map(d => d.icd10_display || d.free_text_diagnosis)
                    .filter(Boolean)}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="imaging">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <ScanLine className="h-4 w-4 text-muted-foreground" />
                  <span>Imaging Orders</span>
                  {(imagingOrders?.length || 0) > 0 && (
                    <Badge variant="secondary" className="text-xs">{imagingOrders?.length}</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <EncounterImagingOrders
                  encounterId={encounterId}
                  patientId={encounter.patient}
                  disabled={encounter.status === 'CLOSED' || encounter.status === 'CANCELLED'}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="prescriptions">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-muted-foreground" />
                  <span>Prescriptions</span>
                  {(prescriptions?.length || 0) > 0 && (
                    <Badge variant="secondary" className="text-xs">{prescriptions?.length}</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <EncounterPrescriptions
                  encounterId={encounterId}
                  patientId={encounter.patient}
                  disabled={encounter.status === 'CLOSED' || encounter.status === 'CANCELLED'}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="procedures" className="border-b-0">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-muted-foreground" />
                  <span>Procedures</span>
                  {procedureOrdersCount > 0 && (
                    <Badge variant="secondary" className="text-xs">{procedureOrdersCount}</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <EncounterProcedureOrders
                  encounterId={encounterId}
                  patientId={encounter.patient}
                  disabled={encounter.status === 'CLOSED' || encounter.status === 'CANCELLED'}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>

        {/* Referrals — Allied Health + External/Internal Referrals */}
        <TabsContent value="referrals">
          <Accordion type="multiple" defaultValue={['allied-health', 'referrals']}>
            <AccordionItem value="allied-health">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <HeartHandshake className="h-4 w-4 text-muted-foreground" />
                  <span>Allied Health</span>
                  {alliedHealthCount > 0 && (
                    <Badge variant="secondary" className="text-xs">{alliedHealthCount}</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <EncounterAlliedHealthContent
                  encounterId={encounterId}
                  patientId={encounter.patient}
                  showActions={false}
                  disabled={encounter.status === 'CLOSED' || encounter.status === 'CANCELLED'}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="referrals" className="border-b-0">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                  <span>Referrals</span>
                  {referralsCount > 0 && (
                    <Badge variant="secondary" className="text-xs">{referralsCount}</Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <EncounterReferralsContent
                  encounterId={encounterId}
                  patientId={encounter.patient}
                  disabled={encounter.status === 'CLOSED' || encounter.status === 'CANCELLED'}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>

        {/* History & Audit */}
        <TabsContent value="history">
          <Accordion type="multiple" defaultValue={['medical-history', 'audit']}>
            <AccordionItem value="medical-history">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-muted-foreground" />
                  <span>Medical History</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <MedicalHistoryView encounter={encounter} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="audit" className="border-b-0">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span>Audit Trail</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <EncounterAuditTrail encounterId={encounterId} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EncounterDetailSkeleton() {
  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full sm:w-40" />
      </div>
      {/* Summary bar skeleton */}
      <div className="p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
      {/* Chief complaint card skeleton */}
      <Card>
        <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
      {/* Vitals skeleton */}
      <Skeleton className="h-32 w-full" />
      {/* Tabs skeleton */}
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
