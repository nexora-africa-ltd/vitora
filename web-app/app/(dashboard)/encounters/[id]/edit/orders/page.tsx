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
import { ArrowLeft, ArrowRight, Beaker, ScanLine, Pill } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { EncounterLabOrdersContent } from '@/components/encounters/encounter-lab-orders';
import { EncounterImagingOrdersContent } from '@/components/encounters/encounter-imaging-orders';
import { EncounterPrescriptionsContent } from '@/components/encounters/encounter-prescriptions';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { useEncounterImagingOrders } from '@/lib/hooks/use-imaging';
import { useEncounterPrescriptions } from '@/lib/hooks/use-pharmacy';
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

  const session = getSession(encounterId);

  const labCount = labOrders?.length || 0;
  const imagingCount = imagingOrders?.length || 0;
  const rxCount = prescriptions?.length || 0;

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

      {/* Orders Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="lab" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="lab" className="gap-2">
                <Beaker className="h-4 w-4" />
                <span className="hidden sm:inline">Lab</span>
                {labCount > 0 && (
                  <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {labCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="imaging" className="gap-2">
                <ScanLine className="h-4 w-4" />
                <span className="hidden sm:inline">Imaging</span>
                {imagingCount > 0 && (
                  <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {imagingCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="pharmacy" className="gap-2">
                <Pill className="h-4 w-4" />
                <span className="hidden sm:inline">Rx</span>
                {rxCount > 0 && (
                  <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {rxCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lab">
              <EncounterLabOrdersContent
                encounterId={encounterId}
                patientId={session.patientId}
                disabled={!isEditable}
              />
            </TabsContent>

            <TabsContent value="imaging">
              <EncounterImagingOrdersContent
                encounterId={encounterId}
                patientId={session.patientId}
                patientName={encounter?.patient_name ?? undefined}
                disabled={!isEditable}
              />
            </TabsContent>

            <TabsContent value="pharmacy">
              <EncounterPrescriptionsContent
                encounterId={encounterId}
                patientId={session.patientId}
                disabled={!isEditable}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <p className="text-sm text-muted-foreground">
              Step 5 of 7 — {labCount + imagingCount + rxCount} orders placed
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
