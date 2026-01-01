'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Edit, User, Calendar, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useEncounter, useEncounterDiagnoses, useEncounterTreatmentPlan } from '@/lib/hooks/use-encounters';
import { formatDate } from '@/lib/utils/format';
import { ENCOUNTER_STATUS, ENCOUNTER_TYPES } from '@/lib/utils/constants';
import { VitalsDisplay } from '@/components/encounters/vitals-display';
import { DiagnosesList } from '@/components/encounters/diagnoses-list';
import { TreatmentPlanView } from '@/components/encounters/treatment-plan-view';
import { MedicalHistoryView } from '@/components/encounters/medical-history-view';
import Link from 'next/link';

export default function EncounterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const encounterId = Number(params.id);

  const { data: encounter, isLoading, error } = useEncounter(encounterId);
  const { data: diagnoses } = useEncounterDiagnoses(encounterId);
  const { data: treatmentPlan } = useEncounterTreatmentPlan(encounterId);

  if (isLoading) {
    return <EncounterDetailSkeleton />;
  }

  if (error || !encounter) {
    return (
      <div className="container mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold">Encounter not found</h2>
        <p className="text-muted-foreground mt-2">
          The encounter you're looking for doesn't exist.
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
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">
                {type?.label} Encounter
              </h1>
              <Badge className={status?.color}>{status?.label}</Badge>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <Link
                href={`/patients/${encounter.patient}`}
                className="flex items-center gap-1 hover:text-primary"
              >
                <User className="h-4 w-4" />
                {encounter.patient_name} ({encounter.patient_mrn})
              </Link>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(encounter.encounter_date)}
              </span>
            </div>
          </div>
        </div>

        <Button variant="outline" asChild>
          <Link href={`/encounters/${encounter.id}/edit`}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Link>
        </Button>
      </div>

      {/* Chief Complaint */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Chief Complaint
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>{encounter.chief_complaint}</p>
        </CardContent>
      </Card>

      {/* Vitals */}
      <VitalsDisplay encounter={encounter} />

      {/* Tabs */}
      <Tabs defaultValue="assessment" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assessment">Assessment</TabsTrigger>
          <TabsTrigger value="diagnoses">Diagnoses ({diagnoses?.length || 0})</TabsTrigger>
          <TabsTrigger value="treatment">Treatment Plan</TabsTrigger>
          <TabsTrigger value="history">Medical History</TabsTrigger>
        </TabsList>

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
              {encounter.plan && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">
                    Plan
                  </h4>
                  <p className="text-sm">{encounter.plan}</p>
                </div>
              )}
              {!encounter.history_of_present_illness &&
                !encounter.physical_examination &&
                !encounter.assessment &&
                !encounter.plan && (
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
