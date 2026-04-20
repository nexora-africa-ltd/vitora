/**
 * Encounter Edit - Orders Step
 *
 * Fifth step in the encounter edit workflow.
 * Manages Lab, Imaging, and Pharmacy orders via tabs.
 *
 * Route: /encounters/[id]/edit/orders
 */
'use client';

import { useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Beaker, ScanLine, Pill, Syringe } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { EncounterLabOrders } from '@/components/encounters/encounter-lab-orders';
import { EncounterImagingOrders } from '@/components/encounters/encounter-imaging-orders';
import { EncounterPrescriptions } from '@/components/encounters/encounter-prescriptions';
import { EncounterProcedureOrders } from '@/components/encounters/encounter-procedure-orders';
import { InvestigationSuggestionsPanel } from '@/components/encounters/investigation-suggestions-panel';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { useEncounterImagingOrders } from '@/lib/hooks/use-imaging';
import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';
import { useQuery } from '@tanstack/react-query';
import { proceduresApi } from '@/lib/api/procedures';
import { calculateAge } from '@/lib/utils/format';
import { AlertTriangle } from 'lucide-react';

export default function EncounterEditOrdersPage() {
  const params = useParams();
  const router = useRouter();
  const encounterId = Number(params.id);

  const { encounter, isLoading } = useEncounterContext();
  const { getSession, markSectionComplete } = useEncounterEditStore();

  // Fetch order counts for badges
  const { data: labOrders } = useEncounterLabOrders(encounterId);
  const { data: imagingOrders } = useEncounterImagingOrders(encounterId);
  const { data: prescriptions } = useEncounterPrescriptions(encounterId);
  const { data: procOrdersData } = useQuery({
    queryKey: ['procedure-orders', { encounter: encounterId }],
    queryFn: () => proceduresApi.listOrders({ encounter: String(encounterId), page_size: '50' }),
    enabled: !!encounterId,
  });

  const session = getSession(encounterId);

  const labCount = labOrders?.length || 0;
  const imagingCount = imagingOrders?.length || 0;
  const rxCount = prescriptions?.length || 0;
  const procCount = procOrdersData?.results?.length || 0;

  // Check if encounter is editable
  const isEditable = encounter?.status !== 'CLOSED' && encounter?.status !== 'CANCELLED';

  // Navigate to previous step
  const handlePrev = useCallback(() => {
    router.push(`/encounters/${encounterId}/edit/diagnosis`);
  }, [encounterId, router]);

  // Navigate to next step
  const handleNext = useCallback(() => {
    markSectionComplete(encounterId, 'orders');
    router.push(`/encounters/${encounterId}/edit/referrals`);
  }, [encounterId, markSectionComplete, router]);

  if (isLoading || !session) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        title="Orders"
        helpContent="Create lab orders, imaging orders, and prescriptions for this encounter. Each order type has its own tab."
      />

      {/* Non-editable warning */}
      {!isEditable && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription className="text-sm">
            This encounter is {encounter?.status?.toLowerCase()} and cannot be edited.
          </AlertDescription>
        </Alert>
      )}

      {/* AI Investigation Suggestions — only show when diagnoses exist */}
      {session.diagnoses.length > 0 && (
        <InvestigationSuggestionsPanel
          encounterId={encounterId}
          patientId={encounter?.patient}
          chiefComplaint={session.chief_complaint || encounter?.chief_complaint || undefined}
          diagnoses={session.diagnoses
            .map(d => d.icd10_display || d.free_text_diagnosis)
            .filter(Boolean)}
          existingOrders={labOrders?.flatMap(order =>
            (order.items || []).map(item => item.test_name)
          )}
          patientAge={encounter?.patient_date_of_birth
            ? calculateAge(encounter.patient_date_of_birth)
            : undefined}
          patientSex={
            encounter?.patient_gender === 'F' ? 'F' :
            encounter?.patient_gender === 'M' ? 'M' : undefined}
          disabled={!isEditable}
        />
      )}

      {/* Orders Tabs */}
      <Tabs defaultValue="lab" className="space-y-4">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="lab" className="gap-1.5 px-2 sm:px-4">
            <Beaker className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Lab</span>
            {labCount > 0 && (
              <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {labCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="imaging" className="gap-1.5 px-2 sm:px-4">
            <ScanLine className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Imaging</span>
            {imagingCount > 0 && (
              <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {imagingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pharmacy" className="gap-1.5 px-2 sm:px-4">
            <Pill className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Rx</span>
            {rxCount > 0 && (
              <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {rxCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="procedures" className="gap-1.5 px-2 sm:px-4">
            <Syringe className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Proc</span>
            {procCount > 0 && (
              <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {procCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lab">
          <EncounterLabOrders
            encounterId={encounterId}
            patientId={session.patientId}
            disabled={!isEditable}
            patientDemographics={encounter?.patient_date_of_birth ? {
              patientAge: calculateAge(encounter.patient_date_of_birth),
              patientSex: encounter.patient_gender === 'F' ? 'female' : 'male',
            } : undefined}
          />
        </TabsContent>

        <TabsContent value="imaging">
          <EncounterImagingOrders
            encounterId={encounterId}
            patientId={session.patientId}
            patientName={encounter?.patient_name ?? undefined}
            disabled={!isEditable}
          />
        </TabsContent>

        <TabsContent value="pharmacy">
          <EncounterPrescriptions
            encounterId={encounterId}
            patientId={session.patientId}
            disabled={!isEditable}
          />
        </TabsContent>

        <TabsContent value="procedures">
          <EncounterProcedureOrders
            encounterId={encounterId}
            patientId={session.patientId}
            disabled={!isEditable}
          />
        </TabsContent>
      </Tabs>

      {/* Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <p className="text-sm text-muted-foreground">
              Step 5 of 7 — {labCount + imagingCount + rxCount + procCount} orders placed
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrev}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleNext}>
                Next: Referrals
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
