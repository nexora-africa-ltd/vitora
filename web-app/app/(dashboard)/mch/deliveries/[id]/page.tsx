'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  Baby,
  AlertTriangle,
  Clock,
  Heart,
  Stethoscope,
  Scale,
  Droplets,
  User,
  Building2,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { useDelivery } from '@/lib/hooks/use-mch';
import type {
  DeliveryOutcome,
  DeliveryType,
  DeliveryStatus,
  PlaceOfDelivery,
} from '@/lib/types/mch';

// =============================================================================
// CONSTANTS
// =============================================================================

const OUTCOME_COLORS: Record<DeliveryOutcome, string> = {
  LIVE_BIRTH: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  STILLBIRTH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  NEONATAL_DEATH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  MATERNAL_DEATH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const OUTCOME_LABELS: Record<DeliveryOutcome, string> = {
  LIVE_BIRTH: 'Live Birth',
  STILLBIRTH: 'Stillbirth',
  NEONATAL_DEATH: 'Neonatal Death',
  MATERNAL_DEATH: 'Maternal Death',
};

const TYPE_LABELS: Record<DeliveryType, string> = {
  SVD: 'SVD (Spontaneous Vaginal)',
  ASSISTED_VAGINAL: 'Assisted Vaginal',
  ELECTIVE_CS: 'Elective C-Section',
  EMERGENCY_CS: 'Emergency C-Section',
  VACUUM: 'Vacuum Extraction',
  FORCEPS: 'Forceps Delivery',
};

const STATUS_COLORS: Record<DeliveryStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  REFERRED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const PLACE_LABELS: Record<PlaceOfDelivery, string> = {
  FACILITY: 'Health Facility',
  HOME: 'Home',
  EN_ROUTE: 'En Route to Facility',
};

const GENDER_LABELS: Record<string, string> = {
  M: 'Male',
  F: 'Female',
  O: 'Other',
};

// =============================================================================
// HELPERS
// =============================================================================

function ApgarBadge({ score, label }: { score: number | null; label: string }) {
  if (score === null) return null;
  const color =
    score >= 7
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      : score >= 4
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  return (
    <div className="text-center">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-lg font-bold ${color}`}>
        {score}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function InfoRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`flex justify-between text-sm ${className ?? ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value ?? '—'}</span>
    </div>
  );
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function DeliveryDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { refresh, isRefreshing } = usePageRefresh();
  const deliveryId = parseInt(id, 10);

  const { data: delivery, isLoading, error } = useDelivery(
    Number.isFinite(deliveryId) ? deliveryId : undefined,
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="space-y-4">
        <PageHeader title="Delivery Not Found" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {error ? 'Failed to load delivery record.' : 'Delivery not found.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasApgar = delivery.apgar_score_1min !== null || delivery.apgar_score_5min !== null || delivery.apgar_score_10min !== null;
  const hasComplications = delivery.maternal_complications || delivery.neonatal_complications;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={`Delivery — ${delivery.registration_mch_number}`}
          helpContent="Delivery record details including birth information, APGAR scores, complications, and linked records."
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href={`/mch/${delivery.registration}?tab=delivery`}>
                <ExternalLink className="h-4 w-4 mr-1.5" />
                MCH Record
              </Link>
            </Button>
          }
        />

        {/* Summary bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-medium">
              {formatDate(delivery.delivery_date)}
              {delivery.delivery_time && (
                <span className="text-muted-foreground"> at {delivery.delivery_time.slice(0, 5)}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {TYPE_LABELS[delivery.delivery_type]} • {PLACE_LABELS[delivery.place_of_delivery]}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${OUTCOME_COLORS[delivery.delivery_outcome]} shrink-0 w-fit`}>
              {OUTCOME_LABELS[delivery.delivery_outcome]}
            </Badge>
            <Badge className={`${STATUS_COLORS[delivery.status]} shrink-0 w-fit`}>
              {delivery.status}
            </Badge>
          </div>
        </div>

        {/* Alerts */}
        {delivery.alerts.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-3 flex flex-wrap gap-2">
              {delivery.alerts.map((alert) => (
                <Badge key={alert} variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {alert}
                </Badge>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Baby Information */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Baby className="h-4 w-4" />
                Baby Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <InfoRow label="Gender" value={GENDER_LABELS[delivery.baby_gender] ?? '—'} />
              <InfoRow
                label="Birth Weight"
                value={
                  delivery.birth_weight ? (
                    <span>
                      {delivery.birth_weight} kg
                      {delivery.is_low_birth_weight && (
                        <Badge variant="destructive" className="ml-2 text-xs">Low</Badge>
                      )}
                      {delivery.is_macrosomia && (
                        <Badge variant="outline" className="ml-2 text-xs border-orange-400 text-orange-700">Macrosomia</Badge>
                      )}
                    </span>
                  ) : null
                }
              />
              <InfoRow label="Resuscitation" value={delivery.resuscitation_done ? 'Yes' : 'No'} />
              <InfoRow label="Placenta Complete" value={delivery.placenta_complete ? 'Yes' : 'No'} />
              {delivery.baby_patient && (
                <>
                  <Separator className="my-2" />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Baby Patient Record</span>
                    <Link
                      href={`/patients/${delivery.baby_patient}`}
                      className="text-primary hover:underline font-medium flex items-center gap-1"
                    >
                      {delivery.baby_patient_mrn}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* APGAR Scores */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Heart className="h-4 w-4" />
                APGAR Scores
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasApgar ? (
                <div className="flex justify-center gap-6 py-4">
                  <ApgarBadge score={delivery.apgar_score_1min} label="1 min" />
                  <ApgarBadge score={delivery.apgar_score_5min} label="5 min" />
                  <ApgarBadge score={delivery.apgar_score_10min} label="10 min" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No APGAR scores recorded
                </p>
              )}
            </CardContent>
          </Card>

          {/* Delivery Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Delivery Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <InfoRow label="Delivery Type" value={TYPE_LABELS[delivery.delivery_type]} />
              <InfoRow label="Place" value={PLACE_LABELS[delivery.place_of_delivery]} />
              <InfoRow label="Outcome" value={OUTCOME_LABELS[delivery.delivery_outcome]} />
              <InfoRow
                label="Blood Loss"
                value={delivery.blood_loss_ml ? `${delivery.blood_loss_ml} mL` : null}
              />
              <InfoRow
                label="Delivered By"
                value={delivery.delivered_by_name}
              />
              <InfoRow
                label="Recorded"
                value={formatDateTime(delivery.created_at)}
              />
            </CardContent>
          </Card>

          {/* Complications & Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Complications & Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {delivery.maternal_complications ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Maternal Complications</p>
                  <p className="text-sm">{delivery.maternal_complications}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Maternal Complications</p>
                  <p className="text-sm text-muted-foreground">None recorded</p>
                </div>
              )}
              {delivery.neonatal_complications ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Neonatal Complications</p>
                  <p className="text-sm">{delivery.neonatal_complications}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Neonatal Complications</p>
                  <p className="text-sm text-muted-foreground">None recorded</p>
                </div>
              )}
              {delivery.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm">{delivery.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Linked Records */}
        {(delivery.partograph || delivery.admission) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Linked Records</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {delivery.admission && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admissions/${delivery.admission}`}>
                    <Building2 className="h-4 w-4 mr-1.5" />
                    Admission
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link href={`/mch/${delivery.registration}?tab=partograph`}>
                  <Clock className="h-4 w-4 mr-1.5" />
                  Partograph
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </PullToRefresh>
  );
}
