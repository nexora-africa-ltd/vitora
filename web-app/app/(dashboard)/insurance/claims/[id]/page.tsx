'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  CreditCard,
  FileText,
  Send,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  useInsuranceClaim,
  useSubmitClaim,
  useCancelClaim,
} from '@/lib/hooks/use-insurance';
import { useToast } from '@/lib/hooks/use-toast';
import { CLAIM_STATUS_LABELS } from '@/lib/types/insurance';
import type { InsuranceClaimItem } from '@/lib/types/insurance';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  acknowledged: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  under_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  query: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  partially_approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  partially_paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  appealed: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  written_off: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  pending_preauth: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  preauth_approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  preauth_denied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function formatCurrency(amount: string | number): string {
  return `KES ${Number(amount).toLocaleString()}`;
}

export default function InsuranceClaimDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const claimId = Number(params.id);

  const { data: claim, isLoading, refetch } = useInsuranceClaim(claimId);
  const submitClaim = useSubmitClaim();
  const cancelClaim = useCancelClaim();

  const handleSubmit = async () => {
    try {
      await submitClaim.mutateAsync(claimId);
      toast({ title: 'Claim submitted', description: 'The claim has been submitted to the insurer.' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to submit claim.', variant: 'destructive' });
    }
  };

  const handleCancel = async () => {
    try {
      await cancelClaim.mutateAsync({ id: claimId, reason: 'Cancelled by user' });
      toast({ title: 'Claim cancelled' });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to cancel claim.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!claim) {
    return <div className="text-center py-10 text-muted-foreground">Claim not found.</div>;
  }

  const canSubmit = claim.status === 'draft';
  const canCancel = ['draft', 'submitted', 'acknowledged'].includes(claim.status);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Claim ${claim.claim_number}`}
        helpContent="View claim details, line items, and manage claim lifecycle."
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            {canSubmit && (
              <Button onClick={handleSubmit} disabled={submitClaim.isPending} className="gap-2">
                <Send className="h-4 w-4" /> Submit
              </Button>
            )}
            {canCancel && (
              <Button variant="destructive" onClick={handleCancel} disabled={cancelClaim.isPending} className="gap-2">
                <XCircle className="h-4 w-4" /> Cancel
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/insurance/claims')}>
              All Claims
            </Button>
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium">
            {claim.patient_name}
            <span className="text-muted-foreground"> • {claim.member_number}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {claim.provider_name} • {claim.plan_name} • {claim.claim_type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`${STATUS_COLORS[claim.status] || ''} shrink-0 w-fit`}>
            {CLAIM_STATUS_LABELS[claim.status] || claim.status}
          </Badge>
          {claim.is_overdue && <Badge variant="destructive">Overdue</Badge>}
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Claimed</p>
            <p className="text-lg font-semibold">{formatCurrency(claim.total_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Approved</p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(claim.approved_amount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Co-pay</p>
            <p className="text-lg font-semibold">{formatCurrency(claim.copay_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(claim.paid_amount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dates & Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claim Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Service Date</p>
                <p>{new Date(claim.service_date).toLocaleDateString()}</p>
              </div>
            </div>
            {claim.submission_date && (
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Submitted</p>
                  <p>{new Date(claim.submission_date).toLocaleDateString()}</p>
                </div>
              </div>
            )}
            {claim.admission_date && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Admission</p>
                  <p>{new Date(claim.admission_date).toLocaleDateString()}</p>
                </div>
              </div>
            )}
            {claim.external_claim_id && (
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Insurer Ref</p>
                  <p className="font-mono text-xs">{claim.external_claim_id}</p>
                </div>
              </div>
            )}
            {claim.diagnosis_codes.length > 0 && (
              <div className="flex items-start gap-2 col-span-full">
                <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Diagnosis Codes</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {claim.diagnosis_codes.map((code) => (
                      <Badge key={code} variant="secondary" className="text-xs font-mono">{code}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rejection / Query Info */}
      {(claim.rejection_reason || claim.query_details) && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader>
            <CardTitle className="text-base text-yellow-800 dark:text-yellow-400">
              {claim.rejection_reason ? 'Rejection Reason' : 'Insurer Query'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {claim.rejection_reason && <p>{claim.rejection_reason}</p>}
            {claim.query_details && (
              <div className="space-y-2">
                <p><span className="font-medium">Query:</span> {claim.query_details}</p>
                {claim.query_response && (
                  <p><span className="font-medium">Response:</span> {claim.query_response}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <ResponsiveTable<InsuranceClaimItem>
            data={claim.items}
            columns={[
              { key: 'service_description', header: 'Service', sortable: true, cell: (item) => (
                <div>
                  <p className="text-sm">{item.service_description}</p>
                  {item.service_code && <p className="text-xs text-muted-foreground font-mono">{item.service_code}</p>}
                </div>
              )},
              { key: 'quantity', header: 'Qty', sortable: true, sortType: 'number', cell: (item) => item.quantity },
              { key: 'unit_price', header: 'Unit Price', sortable: true, sortType: 'number', hideOnMobile: true, cell: (item) => formatCurrency(item.unit_price) },
              { key: 'claimed_amount', header: 'Claimed', sortable: true, sortType: 'number', cell: (item) => formatCurrency(item.claimed_amount) },
              { key: 'approved_amount', header: 'Approved', sortable: true, sortType: 'number', hideOnMobile: true, cell: (item) => formatCurrency(item.approved_amount) },
              { key: 'status', header: 'Status', cell: (item) => <Badge variant="secondary" className="text-xs">{item.status}</Badge> },
            ]}
            keyExtractor={(item) => item.id}
            emptyMessage="No line items."
          />
        </CardContent>
      </Card>

      {/* Notes */}
      {claim.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{claim.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
