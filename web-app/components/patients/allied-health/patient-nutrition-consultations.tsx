'use client';

import Link from 'next/link';
import { Apple, Calendar, AlertCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import { usePatientNutritionConsultations } from '@/lib/hooks/use-patient-allied-health';
import type { NutritionConsultationListItem } from '@/lib/types/nutrition';

// Status color mapping
const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  APPROVED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  SCHEDULED: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  IN_PROGRESS: 'bg-primary/15 text-primary',
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-muted text-muted-foreground',
};

interface PatientNutritionConsultationsProps {
  patientId: number;
}

export function PatientNutritionConsultations({ patientId }: PatientNutritionConsultationsProps) {
  const { data, isLoading, error } = usePatientNutritionConsultations(patientId);
  const consultations = data?.results || [];

  if (isLoading) {
    return <ConsultationsSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Apple className="h-4 w-4" />
            Nutrition Consultations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Error loading consultations"
            description="Failed to load nutrition consultations."
          />
        </CardContent>
      </Card>
    );
  }

  if (!consultations.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Apple className="h-4 w-4" />
            Nutrition Consultations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Apple}
            title="No nutrition consultations"
            description="This patient has no nutrition referrals."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Apple className="h-4 w-4" />
            Nutrition Consultations
            <Badge variant="secondary" className="ml-2">{consultations.length}</Badge>
          </CardTitle>
          <Link
            href={`/allied-health/nutrition/consultations?patient_id=${patientId}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View All <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {consultations.slice(0, 5).map((consultation: NutritionConsultationListItem) => (
          <Link
            key={consultation.id}
            href={`/allied-health/nutrition/consultations/${consultation.id}`}
            className="block"
          >
            <div className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">
                    {consultation.referral_reason.replace(/_/g, ' ')}
                  </span>
                  <Badge className={ORDER_STATUS_COLORS[consultation.status] || ''}>
                    {consultation.status.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {consultation.order_number}
                  {consultation.assigned_dietitian_name && (
                    <> • Dietitian: {consultation.assigned_dietitian_name}</>
                  )}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(consultation.created_at)}</span>
                  <span className="hidden sm:inline">• {formatRelativeTime(consultation.created_at)}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
        {consultations.length > 5 && (
          <p className="text-xs text-muted-foreground text-center">
            +{consultations.length - 5} more consultations
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ConsultationsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Apple className="h-4 w-4" />
          Nutrition Consultations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 rounded-lg border">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
