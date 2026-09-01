'use client';

import Link from 'next/link';
import { Users, Calendar, AlertCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import { usePatientSWReferrals } from '@/lib/hooks/use-patient-allied-health';
import type { SWReferralListItem } from '@/lib/types/social-work';

// Status color mapping
const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  APPROVED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  SCHEDULED: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  IN_PROGRESS: 'bg-primary/15 text-primary',
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-muted text-muted-foreground',
  CASE_OPENED: 'bg-primary/15 text-primary',
};

// Urgency color mapping
const URGENCY_COLORS: Record<string, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  HIGH: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  CRITICAL: 'bg-destructive/15 text-destructive',
};

interface PatientSWReferralsProps {
  patientId: number;
}

export function PatientSWReferrals({ patientId }: PatientSWReferralsProps) {
  const { data, isLoading, error } = usePatientSWReferrals(patientId);
  const referrals = data?.results || [];

  if (isLoading) {
    return <ReferralsSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Social Work Referrals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Error loading referrals"
            description="Failed to load social work referrals."
          />
        </CardContent>
      </Card>
    );
  }

  if (!referrals.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Social Work Referrals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Users}
            title="No social work referrals"
            description="This patient has no social work referrals."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Social Work Referrals
            <Badge variant="secondary" className="ml-2">
              {referrals.length}
            </Badge>
          </CardTitle>
          <Link
            href={`/allied-health/social-work/referrals?patient_id=${patientId}`}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View All <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {referrals.slice(0, 5).map((referral: SWReferralListItem) => (
          <Link
            key={referral.id}
            href={`/allied-health/social-work/referrals/${referral.id}`}
            className="block"
          >
            <div className="flex items-start justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {referral.reason_display || referral.reason.replace(/_/g, ' ')}
                  </span>
                  <Badge className={ORDER_STATUS_COLORS[referral.status] || ''}>
                    {referral.status.replace('_', ' ')}
                  </Badge>
                  {referral.urgency && referral.urgency !== 'LOW' && (
                    <Badge className={URGENCY_COLORS[referral.urgency] || ''}>
                      {referral.urgency_display || referral.urgency}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{referral.referral_number}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(referral.created_at)}</span>
                  <span className="hidden sm:inline">
                    • {formatRelativeTime(referral.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
        {referrals.length > 5 && (
          <p className="text-center text-xs text-muted-foreground">
            +{referrals.length - 5} more referrals
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReferralsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Social Work Referrals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-3">
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
