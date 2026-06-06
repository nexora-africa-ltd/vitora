/**
 * Pre-authorization Detail Page
 * Shows full preauth record with doctor consent tracking and cancel action.
 */
'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  FileCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  Loader2,
  AlertTriangle,
  User,
  Link as LinkIcon,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { shaApi } from '@/lib/api/sha';
import { useToast } from '@/lib/hooks/use-toast';
import { DoctorConsentCard } from '@/components/billing/sha/DoctorConsentCard';
import type { SHAPreauth } from '@/lib/schemas/sha.schema';
import Link from 'next/link';

// ============================================================================
// Component
// ============================================================================

export default function PreauthDetailPage() {
  const params = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const preauthId = Number(params.id);
  const [isCancelling, setIsCancelling] = useState(false);

  const { data: preauth, isLoading, error } = useQuery({
    queryKey: ['preauth-detail', preauthId],
    queryFn: () => shaApi.getPreauthDetail(preauthId),
    enabled: !isNaN(preauthId) && preauthId > 0,
  });

  const canCancel = preauth && ['draft', 'submitted'].includes(preauth.status.toLowerCase());

  const handleCancel = async () => {
    if (!preauth) return;
    setIsCancelling(true);
    try {
      await shaApi.ilmPreauthCancel({
        consent_token: preauth.consent_token,
        intervention_code: preauth.intervention_code,
      });
      toast({
        title: 'Pre-authorization Cancelled',
        description: `Preauth for ${preauth.intervention_code} has been cancelled.`,
      });
      queryClient.invalidateQueries({ queryKey: ['preauth-detail', preauthId] });
      queryClient.invalidateQueries({ queryKey: ['preauths-list'] });
    } catch (err) {
      toast({
        title: 'Cancellation Failed',
        description: err instanceof Error ? err.message : 'Failed to cancel pre-authorization',
        variant: 'destructive',
      });
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Pre-authorization" />
        <Card>
          <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading pre-authorization details...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !preauth) {
    return (
      <div className="space-y-4">
        <PageHeader title="Pre-authorization" />
        <Card>
          <CardContent className="py-8 flex items-center justify-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error instanceof Error ? error.message : 'Pre-authorization not found.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Preauth: ${preauth.intervention_code}`}
        helpContent="View pre-authorization request details and track approval status."
        actions={
          canCancel ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isCancelling}>
                  {isCancelling ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Ban className="mr-1 h-4 w-4" />
                  )}
                  Cancel Preauth
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Pre-authorization?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will cancel the pre-authorization request for intervention{' '}
                    <span className="font-mono font-medium">{preauth.intervention_code}</span>.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Active</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, Cancel
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : undefined
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            Intervention: {preauth.intervention_code}
            {preauth.dha_external_id && (
              <span className="text-muted-foreground"> • DHA ID: {preauth.dha_external_id}</span>
            )}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Created {preauth.created_at ? format(parseISO(preauth.created_at), 'dd MMM yyyy, HH:mm') : '—'}
          </p>
        </div>
        {getStatusBadge(preauth.status)}
      </div>

      {/* Navigation Links */}
      <div className="flex flex-wrap gap-3 text-sm">
        {preauth.patient && (
          <Link
            href={`/patients/${preauth.patient}`}
            className="flex items-center gap-1.5 text-primary hover:underline"
          >
            <User className="h-3.5 w-3.5" />
            View Patient
          </Link>
        )}
        {Boolean((preauth as Record<string, unknown>).claim) && (
          <Link
            href={`/transactions/claims/${String((preauth as Record<string, unknown>).claim)}`}
            className="flex items-center gap-1.5 text-primary hover:underline"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            View Claim
          </Link>
        )}
      </div>

      {/* Main Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Request Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Status</span>
              <div className="mt-0.5">{getStatusBadge(preauth.status)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Intervention Code</span>
              <p className="font-mono mt-0.5">{preauth.intervention_code}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Consent Token</span>
              <p className="font-mono text-xs mt-0.5 break-all">{preauth.consent_token}</p>
            </div>
            {preauth.dha_external_id && (
              <div>
                <span className="text-muted-foreground">DHA External ID</span>
                <p className="font-mono text-xs mt-0.5">{preauth.dha_external_id}</p>
              </div>
            )}
            {preauth.correlation_id && (
              <div>
                <span className="text-muted-foreground">Correlation ID</span>
                <p className="font-mono text-xs mt-0.5">{preauth.correlation_id}</p>
              </div>
            )}
            {preauth.submitted_at && (
              <div>
                <span className="text-muted-foreground">Submitted At</span>
                <p className="mt-0.5">{format(parseISO(preauth.submitted_at), 'dd MMM yyyy, HH:mm')}</p>
              </div>
            )}
            {preauth.decided_at && (
              <div>
                <span className="text-muted-foreground">Decision At</span>
                <p className="mt-0.5">{format(parseISO(preauth.decided_at), 'dd MMM yyyy, HH:mm')}</p>
              </div>
            )}
            {preauth.cancelled_at && (
              <div>
                <span className="text-muted-foreground">Cancelled At</span>
                <p className="mt-0.5">{format(parseISO(preauth.cancelled_at), 'dd MMM yyyy, HH:mm')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Doctor Consent Card — shown when state is REQUESTED or has been resolved */}
      {preauth.doctor_consent_state && (
        <DoctorConsentCard preauth={preauth} />
      )}

      {/* Diagnoses */}
      {Array.isArray(preauth.diagnoses) && preauth.diagnoses.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Diagnoses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(preauth.diagnoses as unknown[]).map((code, i) => (
                <Badge key={i} variant="outline" className="font-mono">
                  {String(code)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'approved':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 w-fit">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      );
    case 'denied':
      return (
        <Badge variant="destructive" className="w-fit">
          <XCircle className="mr-1 h-3 w-3" />
          Denied
        </Badge>
      );
    case 'submitted':
      return (
        <Badge variant="secondary" className="w-fit">
          <Clock className="mr-1 h-3 w-3" />
          Submitted
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className="text-muted-foreground w-fit">
          <Ban className="mr-1 h-3 w-3" />
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="w-fit">
          <FileCheck className="mr-1 h-3 w-3" />
          Draft
        </Badge>
      );
  }
}
