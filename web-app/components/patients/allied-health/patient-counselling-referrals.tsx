'use client';

import Link from 'next/link';
import { Heart, Calendar, AlertCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import { usePatientCounsellingReferrals } from '@/lib/hooks/use-patient-allied-health';
import type { CounsellingReferralListItem } from '@/lib/types/counselling';

// Status color mapping
const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  APPROVED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  SCHEDULED: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  IN_PROGRESS: 'bg-primary/15 text-primary',
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-muted text-muted-foreground',
};

interface PatientCounsellingReferralsProps {
  patientId: number;
}

export function PatientCounsellingReferrals({ patientId }: PatientCounsellingReferralsProps) {
  const { data, isLoading, error } = usePatientCounsellingReferrals(patientId);
  const referrals = data?.results || [];

  if (isLoading) {
    return <ReferralsSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Counselling Referrals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Error loading referrals"
            description="Failed to load counselling referrals."
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
            <Heart className="h-4 w-4" />
            Counselling Referrals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Heart}
            title="No counselling referrals"
            description="This patient has no counselling referrals."
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
            <Heart className="h-4 w-4" />
            Counselling Referrals
            <Badge variant="secondary" className="ml-2">{referrals.length}</Badge>
          </CardTitle>
          <Link
            href={`/allied-health/counselling/referrals?patient_id=${patientId}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View All <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {referrals.slice(0, 5).map((referral: CounsellingReferralListItem) => (
          <Link
            key={referral.id}
            href={`/allied-health/counselling/referrals/${referral.id}`}
            className="block"
          >
            <div className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">
                    {referral.counselling_type_name || 'Counselling'}
                  </span>
                  <Badge className={ORDER_STATUS_COLORS[referral.status] || ''}>
                    {referral.status.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {referral.referral_number}
                  {referral.assigned_counsellor_name && (
                    <> • Counsellor: {referral.assigned_counsellor_name}</>
                  )}
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
          <Heart className="h-4 w-4" />
          Counselling Referrals
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
