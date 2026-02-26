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

// Priority color mapping
const PRIORITY_COLORS: Record<string, string> = {
  ROUTINE: 'bg-muted text-muted-foreground',
  URGENT: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  STAT: 'bg-destructive/15 text-destructive',
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
          <CardTitle className="text-base flex items-center gap-2">
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
          <CardTitle className="text-base flex items-center gap-2">
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
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Social Work Referrals
            <Badge variant="secondary" className="ml-2">{referrals.length}</Badge>
          </CardTitle>
          <Link
            href={`/allied-health/social-work/referrals?patient_id=${patientId}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
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
            <div className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">
                    {referral.referral_reason.replace(/_/g, ' ')}
                  </span>
                  <Badge className={ORDER_STATUS_COLORS[referral.status] || ''}>
                    {referral.status.replace('_', ' ')}
                  </Badge>
                  {referral.priority && referral.priority !== 'ROUTINE' && (
                    <Badge className={PRIORITY_COLORS[referral.priority] || ''}>
                      {referral.priority}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {referral.referral_number}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(referral.created_at)}</span>
                  <span className="hidden sm:inline">• {formatRelativeTime(referral.created_at)}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
        {referrals.length > 5 && (
          <p className="text-xs text-muted-foreground text-center">
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
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Social Work Referrals
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
