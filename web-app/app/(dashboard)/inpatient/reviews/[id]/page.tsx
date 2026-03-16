'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User,
  Clock,
  CheckCircle,
  AlertTriangle,
  Stethoscope,
  FileText,
  BedDouble,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useReviewRequest,
  useAcknowledgeReviewRequest,
  useCompleteReviewRequest,
} from '@/lib/hooks/use-inpatient';
import { getApiErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils/format';
import type { ReviewRequestStatus, ReviewUrgency } from '@/lib/types/inpatient';

const statusColors: Record<ReviewRequestStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const urgencyColors: Record<ReviewUrgency, string> = {
  ROUTINE: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  URGENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  STAT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function ReviewRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reviewId = Number(params.id);

  const { data: review, isLoading, error } = useReviewRequest(reviewId);
  const acknowledgeReview = useAcknowledgeReviewRequest();
  const completeReview = useCompleteReviewRequest();

  const handleAcknowledge = async () => {
    try {
      await acknowledgeReview.mutateAsync(reviewId);
      toast.success('Review request acknowledged');
    } catch (err) {
      toast.error('Failed to acknowledge', { description: getApiErrorMessage(err) });
    }
  };

  const handleComplete = async () => {
    try {
      await completeReview.mutateAsync(reviewId);
      toast.success('Review marked as completed');
    } catch (err) {
      toast.error('Failed to complete review', { description: getApiErrorMessage(err) });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader title="Review Request" />
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load review request.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title={`Review #${review.id}`}
        helpContent="View review request details, acknowledge pending reviews, and mark them as complete."
        actions={
          <div className="flex gap-2">
            {review.status === 'PENDING' && (
              <Button
                variant="outline"
                onClick={handleAcknowledge}
                disabled={acknowledgeReview.isPending}
              >
                <Clock className="h-4 w-4 mr-2" />
                {acknowledgeReview.isPending ? 'Acknowledging...' : 'Acknowledge'}
              </Button>
            )}
            {review.status === 'IN_PROGRESS' && (
              <Button onClick={handleComplete} disabled={completeReview.isPending}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {completeReview.isPending ? 'Completing...' : 'Complete'}
              </Button>
            )}
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {review.patient_name || 'Unknown Patient'}
            <span className="text-muted-foreground"> • {review.admission_number}</span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Requested {formatDateTime(review.requested_at)}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Badge className={urgencyColors[review.urgency]}>
            {review.urgency_display || review.urgency}
          </Badge>
          <Badge className={statusColors[review.status]}>
            {review.status_display || review.status}
          </Badge>
          {review.is_overdue && <Badge variant="destructive">Overdue</Badge>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Review Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Review Details</CardTitle>
              <HelpPopover content="Details about this review request including type, urgency, and specialty." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Type</p>
                <p className="font-medium">{review.review_type_display || review.review_type}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Urgency</p>
                <Badge className={urgencyColors[review.urgency]}>
                  {review.urgency_display || review.urgency}
                </Badge>
              </div>
              {review.consultant_specialty && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Specialty</p>
                  <p className="font-medium">{review.consultant_specialty}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-1">Reason</p>
              <p className="text-sm">{review.reason}</p>
            </div>

            {review.clinical_context && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Clinical Context</p>
                <p className="text-sm whitespace-pre-wrap">{review.clinical_context}</p>
              </div>
            )}

            {review.cancellation_reason && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Cancellation Reason</p>
                <p className="text-sm text-destructive">{review.cancellation_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Patient & Location */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient & Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{review.patient_name || 'Unknown'}</p>
                <p className="text-sm text-muted-foreground">{review.admission_number}</p>
              </div>
            </div>

            {(review.ward_name || review.bed_number) && (
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <BedDouble className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  {review.ward_name && <p className="font-medium">{review.ward_name}</p>}
                  {review.bed_number && (
                    <p className="text-sm text-muted-foreground">Bed {review.bed_number}</p>
                  )}
                </div>
              </div>
            )}

            <Button variant="outline" asChild className="w-full mt-2">
              <Link href={`/admissions/${review.admission}`}>
                <FileText className="h-4 w-4 mr-2" />
                View Admission
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Requested */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-1.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                  <FileText className="h-3.5 w-3.5 text-yellow-700 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Requested</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(review.requested_at)} by {review.requested_by_username || 'Unknown'}
                  </p>
                </div>
              </div>

              {/* Acknowledged */}
              {review.acknowledged_at && (
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <Clock className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Acknowledged</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(review.acknowledged_at)} by {review.acknowledged_by_username || 'Unknown'}
                    </p>
                  </div>
                </div>
              )}

              {/* Completed */}
              {review.completed_at && (
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 rounded-full bg-green-100 dark:bg-green-900/30">
                    <CheckCircle className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Completed</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(review.completed_at)}
                    </p>
                  </div>
                </div>
              )}

              {/* Pending indicator */}
              {review.status === 'PENDING' && !review.acknowledged_at && (
                <div className="flex items-start gap-3 opacity-50">
                  <div className="mt-0.5 p-1.5 rounded-full bg-muted">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Waiting for acknowledgement...</p>
                </div>
              )}

              {review.status === 'IN_PROGRESS' && !review.completed_at && (
                <div className="flex items-start gap-3 opacity-50">
                  <div className="mt-0.5 p-1.5 rounded-full bg-muted">
                    <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Review in progress...</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
