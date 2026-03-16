'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Clock, CheckCircle, XCircle, AlertTriangle, User, Stethoscope } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useReviewRequests, useAcknowledgeReviewRequest, useCompleteReviewRequest } from '@/lib/hooks/use-inpatient';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { toast } from 'sonner';
import type { ReviewRequest, ReviewRequestStatus, ReviewUrgency, ReviewType } from '@/lib/types/inpatient';

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

const reviewTypeLabels: Record<ReviewType, string> = {
  WARD_ROUND: 'Ward Round',
  URGENT_REVIEW: 'Urgent Review',
  CONSULTANT_REVIEW: 'Consultant Review',
  TRANSFER_REVIEW: 'Transfer Review',
  PRE_DISCHARGE: 'Pre-Discharge',
};

export default function ReviewRequestsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');

  const acknowledgeReview = useAcknowledgeReviewRequest();
  const completeReview = useCompleteReviewRequest();

  const {
    data: reviewsData,
    isLoading,
    error,
  } = useReviewRequests({
    status: statusFilter !== 'all' ? (statusFilter as ReviewRequestStatus) : undefined,
    urgency: urgencyFilter !== 'all' ? (urgencyFilter as ReviewUrgency) : undefined,
    ordering: '-requested_at',
  });

  // Compute stats
  const stats = useMemo(() => {
    const results = reviewsData?.results || [];
    const pending = results.filter((r) => r.status === 'PENDING').length;
    const inProgress = results.filter((r) => r.status === 'IN_PROGRESS').length;
    const statReviews = results.filter((r) => r.urgency === 'STAT' && r.status === 'PENDING').length;
    const overdue = results.filter((r) => r.is_overdue).length;
    return {
      pending,
      inProgress,
      statReviews,
      overdue,
    };
  }, [reviewsData]);

  const handleAcknowledge = async (requestId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await acknowledgeReview.mutateAsync(requestId);
      toast.success('Review request acknowledged');
    } catch (err) {
      toast.error('Failed to acknowledge review request');
    }
  };

  const handleComplete = async (requestId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await completeReview.mutateAsync(requestId);
      toast.success('Review marked as completed');
    } catch (err) {
      toast.error('Failed to complete review');
    }
  };

  const handleRowClick = (review: ReviewRequest) => {
    router.push(`/inpatient/reviews/${review.id}`);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Review Requests"
          helpContent="Manage consultant review requests, urgent reviews, and pre-discharge assessments. Acknowledge and complete reviews in a timely manner."
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Pending"
            value={stats.pending}
            icon={Clock}
            variant={stats.pending > 5 ? 'warning' : 'default'}
          />
          <StatsCard
            title="In Progress"
            value={stats.inProgress}
            icon={Stethoscope}
          />
          <StatsCard
            title="STAT Reviews"
            value={stats.statReviews}
            icon={AlertTriangle}
            variant={stats.statReviews > 0 ? 'destructive' : 'default'}
          />
          <StatsCard
            title="Overdue"
            value={stats.overdue}
            icon={XCircle}
            variant={stats.overdue > 0 ? 'destructive' : 'default'}
          />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Urgencies</SelectItem>
                  <SelectItem value="STAT">STAT</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="ROUTINE">Routine</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Reviews List */}
        {isLoading ? (
          <Card>
            <CardContent className="pt-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">Failed to load review requests.</p>
            </CardContent>
          </Card>
        ) : (
          <ResponsiveTable
            data={reviewsData?.results || []}
            keyExtractor={(review) => review.id}
            onRowClick={handleRowClick}
            columns={[
              {
                key: 'patient',
                header: 'Patient',
                sortable: true,
                sortFn: (a, b) => (a.patient_name || '').localeCompare(b.patient_name || ''),
                cell: (review) => (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{review.patient_name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">{review.admission_number}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Type',
                sortable: true,
                cell: (review) => (
                  <span className="text-sm">
                    {review.review_type_display || reviewTypeLabels[review.review_type] || review.review_type}
                  </span>
                ),
              },
              {
                key: 'urgency',
                header: 'Urgency',
                sortable: true,
                cell: (review) => (
                  <Badge className={urgencyColors[review.urgency]}>
                    {review.urgency_display || review.urgency}
                  </Badge>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                cell: (review) => (
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[review.status]}>
                      {review.status_display || review.status}
                    </Badge>
                    {review.is_overdue && (
                      <Badge variant="destructive">Overdue</Badge>
                    )}
                  </div>
                ),
              },
              {
                key: 'requested',
                header: 'Requested',
                sortable: true,
                sortType: 'date',
                sortFn: (a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime(),
                cell: (review) => (
                  <span className="text-sm text-muted-foreground">
                    {formatDateTime(review.requested_at)}
                  </span>
                ),
                hideOnMobile: true,
              },
              {
                key: 'actions',
                header: '',
                cell: (review) => (
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {review.status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleAcknowledge(review.id, e)}
                        disabled={acknowledgeReview.isPending}
                      >
                        Acknowledge
                      </Button>
                    )}
                    {review.status === 'IN_PROGRESS' && (
                      <Button
                        size="sm"
                        onClick={(e) => handleComplete(review.id, e)}
                        disabled={completeReview.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Complete
                      </Button>
                    )}
                  </div>
                ),
                hideOnMobile: true,
              },
            ]}
            mobileCard={(review) => (
              <Card className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium">{review.patient_name || 'Unknown'}</p>
                    <p className="text-sm text-muted-foreground">{review.admission_number}</p>
                  </div>
                  <Badge className={urgencyColors[review.urgency]}>
                    {review.urgency}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <FileText className="h-4 w-4" />
                  <span>{review.review_type_display || reviewTypeLabels[review.review_type]}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <Badge className={statusColors[review.status]}>
                      {review.status}
                    </Badge>
                    {review.is_overdue && (
                      <Badge variant="destructive">Overdue</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(review.requested_at)}
                  </span>
                </div>
                {(review.status === 'PENDING' || review.status === 'IN_PROGRESS') && (
                  <div className="mt-3 flex gap-2">
                    {review.status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={(e) => handleAcknowledge(review.id, e)}
                        disabled={acknowledgeReview.isPending}
                      >
                        Acknowledge
                      </Button>
                    )}
                    {review.status === 'IN_PROGRESS' && (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={(e) => handleComplete(review.id, e)}
                        disabled={completeReview.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Complete
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            )}
            emptyMessage="No review requests found."
          />
        )}
      </div>
    </PullToRefresh>
  );
}
