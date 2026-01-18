/**
 * SHA Claim Components
 * Claim submission, status badges, and tracking
 *
 * @see docs/sha-frontend-integration-guide.md - Flow 4
 */
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  FileText,
  AlertCircle,
  Send,
  DollarSign,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { formatCurrency } from '@/lib/utils/format';
import type { Claim, ClaimStatus } from '@/lib/types/sha';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface ClaimStatusBadgeProps {
  status: ClaimStatus;
  className?: string;
}

interface ClaimSubmissionButtonProps {
  invoiceId: number;
  encounterId: number;
  onSuccess?: (claim: Claim) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  className?: string;
}

interface ClaimStatusCardProps {
  claim: Claim;
  onRefresh?: () => void;
  showActions?: boolean;
  className?: string;
}

interface ClaimTrackingProps {
  claimId: number;
  pollInterval?: number;
  onStatusChange?: (claim: Claim) => void;
  className?: string;
}

// ============================================================================
// Claim Status Badge Component
// ============================================================================

export function ClaimStatusBadge({ status, className }: ClaimStatusBadgeProps) {
  const config: Record<ClaimStatus, {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: React.ReactNode;
    className: string;
  }> = {
    draft: {
      label: 'Draft',
      variant: 'outline',
      icon: <FileText className="h-3 w-3" />,
      className: 'border-gray-400 text-gray-600',
    },
    pending: {
      label: 'Pending',
      variant: 'secondary',
      icon: <Clock className="h-3 w-3" />,
      className: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    },
    submitted: {
      label: 'Submitted',
      variant: 'default',
      icon: <Send className="h-3 w-3" />,
      className: 'bg-blue-100 text-blue-700 border-blue-300',
    },
    processing: {
      label: 'Processing',
      variant: 'default',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      className: 'bg-blue-100 text-blue-700 border-blue-300',
    },
    approved: {
      label: 'Approved',
      variant: 'default',
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: 'bg-green-100 text-green-700 border-green-300',
    },
    rejected: {
      label: 'Rejected',
      variant: 'destructive',
      icon: <XCircle className="h-3 w-3" />,
      className: 'bg-red-100 text-red-700 border-red-300',
    },
    paid: {
      label: 'Paid',
      variant: 'default',
      icon: <DollarSign className="h-3 w-3" />,
      className: 'bg-green-600 text-white',
    },
    partial_approved: {
      label: 'Partial',
      variant: 'secondary',
      icon: <AlertCircle className="h-3 w-3" />,
      className: 'bg-orange-100 text-orange-700 border-orange-300',
    },
  };

  const { label, icon, className: statusClassName } = config[status];

  return (
    <Badge
      variant="outline"
      className={cn('flex items-center gap-1', statusClassName, className)}
    >
      {icon}
      {label}
    </Badge>
  );
}

// ============================================================================
// Copy Reference Button
// ============================================================================

function CopyReferenceButton({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [reference]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-6 px-2"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

// ============================================================================
// Claim Submission Button Component
// ============================================================================

export function ClaimSubmissionButton({
  invoiceId,
  encounterId,
  onSuccess,
  onError,
  disabled = false,
  className,
}: ClaimSubmissionButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Step 1: Create claim
      const createResponse = await shaApi.createClaim({
        invoice_id: invoiceId,
        encounter_id: encounterId,
      });

      // Step 2: Submit to SHA
      const submitResponse = await shaApi.submitClaim(createResponse.id);

      if (!submitResponse.success) {
        throw new Error(submitResponse.message || 'Claim submission failed');
      }

      // Step 3: Get updated claim
      const updatedClaim = await shaApi.getClaim(createResponse.id);
      setClaim(updatedClaim);
      onSuccess?.(updatedClaim);
      setShowConfirm(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsSubmitting(false);
    }
  }, [invoiceId, encounterId, onSuccess, onError]);

  if (claim) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center gap-2">
          <ClaimStatusBadge status={claim.status} />
          {claim.sha_reference && (
            <span className="text-sm text-muted-foreground font-mono">
              {claim.sha_reference}
            </span>
          )}
        </div>
        {claim.sha_reference && (
          <p className="text-xs text-muted-foreground">
            Submitted on {claim.submitted_at && format(parseISO(claim.submitted_at), 'MMM d, yyyy h:mm a')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogTrigger asChild>
          <Button disabled={disabled || isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Submit to SHA
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Claim to SHA</DialogTitle>
            <DialogDescription>
              This will create a FHIR R4 bundle and submit the claim to SHA for processing.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Confirm Submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Claim Status Card Component
// ============================================================================

export function ClaimStatusCard({
  claim,
  onRefresh,
  showActions = true,
  className,
}: ClaimStatusCardProps) {
  const [isResubmitting, setIsResubmitting] = useState(false);

  const handleResubmit = useCallback(async () => {
    setIsResubmitting(true);
    try {
      await shaApi.resubmitClaim(claim.id);
      onRefresh?.();
    } catch (error) {
      console.error('Resubmit failed:', error);
    } finally {
      setIsResubmitting(false);
    }
  }, [claim.id, onRefresh]);

  const getProgressValue = () => {
    const statusProgress: Record<ClaimStatus, number> = {
      draft: 10,
      pending: 25,
      submitted: 50,
      processing: 75,
      approved: 100,
      rejected: 100,
      paid: 100,
      partial_approved: 100,
    };
    return statusProgress[claim.status];
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              SHA Claim
              {claim.claim_number && (
                <span className="text-sm font-mono text-muted-foreground">
                  #{claim.claim_number}
                </span>
              )}
            </CardTitle>
            {claim.sha_reference && (
              <CardDescription className="flex items-center gap-1">
                <span className="font-mono">{claim.sha_reference}</span>
                <CopyReferenceButton reference={claim.sha_reference} />
              </CardDescription>
            )}
          </div>
          <ClaimStatusBadge status={claim.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        {['pending', 'submitted', 'processing'].includes(claim.status) && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Submission Progress</span>
              <span>{getProgressValue()}%</span>
            </div>
            <Progress value={getProgressValue()} className="h-2" />
          </div>
        )}

        {/* Amounts */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Total</p>
            <p className="font-semibold">
              {formatCurrency(parseFloat(claim.total_amount))}
            </p>
          </div>
          {claim.approved_amount && (
            <div>
              <p className="text-muted-foreground">Approved</p>
              <p className="font-semibold text-green-600">
                {formatCurrency(parseFloat(claim.approved_amount))}
              </p>
            </div>
          )}
          {claim.rejected_amount && (
            <div>
              <p className="text-muted-foreground">Rejected</p>
              <p className="font-semibold text-red-600">
                {formatCurrency(parseFloat(claim.rejected_amount))}
              </p>
            </div>
          )}
          {claim.copay_amount && (
            <div>
              <p className="text-muted-foreground">Copay</p>
              <p className="font-semibold text-orange-600">
                {formatCurrency(parseFloat(claim.copay_amount))}
              </p>
            </div>
          )}
        </div>

        {/* Rejection Reason */}
        {claim.status === 'rejected' && claim.rejection_reason && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Rejection Reason</AlertTitle>
            <AlertDescription>{claim.rejection_reason}</AlertDescription>
          </Alert>
        )}

        {/* Timestamps */}
        <div className="text-xs text-muted-foreground space-y-1">
          {claim.submitted_at && (
            <p>Submitted: {format(parseISO(claim.submitted_at), 'MMM d, yyyy h:mm a')}</p>
          )}
          {claim.processed_at && (
            <p>Processed: {format(parseISO(claim.processed_at), 'MMM d, yyyy h:mm a')}</p>
          )}
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-2 pt-2">
            {claim.status === 'rejected' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResubmit}
                disabled={isResubmitting}
              >
                {isResubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Resubmit
              </Button>
            )}
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Status
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Claim Tracking Component (with polling)
// ============================================================================

export function ClaimTracking({
  claimId,
  pollInterval = 5000,
  onStatusChange,
  className,
}: ClaimTrackingProps) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout>();
  const previousStatusRef = useRef<ClaimStatus>();

  const fetchClaim = useCallback(async () => {
    try {
      const data = await shaApi.getClaim(claimId);
      setClaim(data);
      setError(null);

      // Notify on status change
      if (previousStatusRef.current && previousStatusRef.current !== data.status) {
        onStatusChange?.(data);
      }
      previousStatusRef.current = data.status;

      // Stop polling if claim is in final state
      if (['approved', 'rejected', 'paid', 'partial_approved'].includes(data.status)) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch claim');
    } finally {
      setIsLoading(false);
    }
  }, [claimId, onStatusChange]);

  useEffect(() => {
    fetchClaim();

    // Start polling
    pollRef.current = setInterval(fetchClaim, pollInterval);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [fetchClaim, pollInterval]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!claim) {
    return null;
  }

  return (
    <ClaimStatusCard
      claim={claim}
      onRefresh={fetchClaim}
      className={className}
    />
  );
}

// ============================================================================
// Claims List Item Component
// ============================================================================

interface ClaimListItemProps {
  claim: Claim;
  onClick?: () => void;
}

export function ClaimListItem({ claim, onClick }: ClaimListItemProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{claim.claim_number || `#${claim.id}`}</span>
          <ClaimStatusBadge status={claim.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {claim.patient_name} • {claim.patient_mrn}
        </p>
        {claim.sha_reference && (
          <p className="text-xs text-muted-foreground font-mono">
            Ref: {claim.sha_reference}
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="font-semibold">
          {formatCurrency(parseFloat(claim.total_amount))}
        </p>
        <p className="text-xs text-muted-foreground">
          {claim.submitted_at
            ? format(parseISO(claim.submitted_at), 'MMM d, yyyy')
            : format(parseISO(claim.created_at), 'MMM d, yyyy')
          }
        </p>
      </div>
    </div>
  );
}

export default ClaimStatusBadge;
