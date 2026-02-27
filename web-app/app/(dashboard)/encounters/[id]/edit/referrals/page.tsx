/**
 * Encounter Edit - Referrals Step
 *
 * Sixth step in the encounter edit workflow.
 * Manages referrals: allied health, specialty clinics, admissions, external facilities.
 *
 * Route: /encounters/[id]/edit/referrals
 */
'use client';

import { useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, ArrowRightLeft, HeartHandshake } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/page-header';
import { EncounterReferralsContent } from '@/components/encounters/encounter-referrals-content';
import { EncounterAlliedHealthContent } from '@/components/encounters/encounter-allied-health-content';
import { AlliedHealthReferralActions } from '@/components/encounters/allied-health-referral-actions';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useEncounterEditStore } from '@/lib/stores/encounter-edit-store';
import { useEncounterReferrals } from '@/lib/hooks/use-referrals';
import {
  useEncounterPhysioOrders,
  useEncounterNutritionConsultations,
  useEncounterCounsellingReferrals,
  useEncounterOTOrders,
  useEncounterSWReferrals,
} from '@/lib/hooks/use-encounter-allied-health';
import { AlertTriangle } from 'lucide-react';

export default function EncounterEditReferralsPage() {
  const params = useParams();
  const router = useRouter();
  const encounterId = Number(params.id);

  const { encounter, isLoading } = useEncounterContext();
  const { getSession, markSectionComplete } = useEncounterEditStore();

  const session = getSession(encounterId);

  // Fetch referral counts
  const { data: referralsList } = useEncounterReferrals(encounterId);
  const { data: ahPhysio } = useEncounterPhysioOrders(encounterId);
  const { data: ahNutrition } = useEncounterNutritionConsultations(encounterId);
  const { data: ahOT } = useEncounterOTOrders(encounterId);
  const { data: ahCounselling } = useEncounterCounsellingReferrals(encounterId);
  const { data: ahSW } = useEncounterSWReferrals(encounterId);

  const referralsCount = referralsList?.length || 0;
  const alliedHealthCount =
    (ahPhysio?.results?.length || 0) +
    (ahNutrition?.results?.length || 0) +
    (ahOT?.results?.length || 0) +
    (ahCounselling?.results?.length || 0) +
    (ahSW?.results?.length || 0);

  // Check if encounter is editable
  const isEditable = encounter?.status !== 'CLOSED' && encounter?.status !== 'CANCELLED';

  // Navigate to previous step
  const handlePrev = useCallback(() => {
    router.push(`/encounters/${encounterId}/edit/orders`);
  }, [encounterId, router]);

  // Navigate to next step
  const handleNext = useCallback(() => {
    markSectionComplete(encounterId, 'referrals');
    router.push(`/encounters/${encounterId}/edit/review`);
  }, [encounterId, markSectionComplete, router]);

  if (isLoading || !session) {
    return null;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader
        title="Referrals"
        helpContent="Create referrals to allied health services, specialty clinics, inpatient admissions, or external facilities."
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

      {/* Allied Health Quick Actions */}
      {isEditable && (
        <AlliedHealthReferralActions
          patientId={session.patientId}
          encounterId={encounterId}
          disabled={!isEditable}
        />
      )}

      {/* General Referrals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Referrals ({referralsCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EncounterReferralsContent
            encounterId={encounterId}
            patientId={session.patientId}
            disabled={!isEditable}
          />
        </CardContent>
      </Card>

      {/* Allied Health Orders (Read-only view) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5" />
            Allied Health Orders ({alliedHealthCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EncounterAlliedHealthContent
            encounterId={encounterId}
            patientId={session.patientId}
            showActions={false}
            disabled={!isEditable}
          />
        </CardContent>
      </Card>

      {/* Navigation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <p className="text-sm text-muted-foreground">
              Step 6 of 7 — {referralsCount + alliedHealthCount} referrals/orders
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrev}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleNext}>
                Next: Review
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
