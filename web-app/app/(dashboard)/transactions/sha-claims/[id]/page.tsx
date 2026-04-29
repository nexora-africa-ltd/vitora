/**
 * SHA Claim Detail Page
 * Shows detailed information about a specific claim
 */
'use client';

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  Download,
  Send,
  Copy,
  Check,
  FileText,
  User,
  Calendar,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils/format';
import { useClaim, useSubmitClaim, useResubmitClaim } from '@/lib/hooks/use-sha';
import { ClaimStatusBadge } from '@/components/billing/sha/ClaimComponents';
import { ConsentPanel } from '@/components/billing/sha/ConsentPanel';
import { PreauthPanel } from '@/components/billing/sha/PreauthPanel';
import { ClaimILMPanel } from '@/components/billing/sha/ClaimILMPanel';
import { PreVisitChecksPanel } from '@/components/billing/sha/PreVisitChecksPanel';
import { CLAIM_FLOW_LABELS } from '@/lib/types/sha';
import { format, parseISO } from 'date-fns';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 px-2">
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function ClaimDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ClaimDetailPage() {
  const router = useRouter();
  const params = useParams();
  const claimId = Number(params.id);

  const { data: claim, isLoading, refetch, isRefetching } = useClaim(claimId);
  const submitMutation = useSubmitClaim();
  const resubmitMutation = useResubmitClaim();
  const [consentTokenId, setConsentTokenId] = useState<number | undefined>();

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync(claimId);
      refetch();
    } catch (error) {
      console.error('Submit failed:', error);
    }
  };

  const handleResubmit = async () => {
    try {
      await resubmitMutation.mutateAsync(claimId);
      refetch();
    } catch (error) {
      console.error('Resubmit failed:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/transactions/sha-claims">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Claims
          </Link>
        </Button>
        <ClaimDetailSkeleton />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/transactions/sha-claims">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Claims
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Claim Not Found</AlertTitle>
          <AlertDescription>
            The requested claim could not be found or you don't have permission to view it.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const canSubmit = claim.status === 'draft';
  const canResubmit = claim.status === 'rejected';
  const isProcessing = submitMutation.isPending || resubmitMutation.isPending;

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/transactions/sha-claims">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Claims
        </Link>
      </Button>

      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              Claim {claim.claim_number || `#${claim.id}`}
            </h1>
            <ClaimStatusBadge status={claim.status} />
          </div>
          {claim.sha_reference && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="font-mono text-sm">SHA Ref: {claim.sha_reference}</span>
              <CopyButton text={claim.sha_reference} />
            </div>
          )}
          {claim.claim_flow && (
            <Badge variant="outline" className="w-fit text-xs">
              {CLAIM_FLOW_LABELS[claim.claim_flow] || claim.claim_flow.toUpperCase()}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>

          {canSubmit && (
            <Button onClick={handleSubmit} disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Submit to SHA
            </Button>
          )}

          {canResubmit && (
            <Button onClick={handleResubmit} disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Resubmit
            </Button>
          )}
        </div>
      </div>

      {claim.status === 'rejected' && claim.rejection_reason && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Claim Rejected</AlertTitle>
          <AlertDescription>
            <p>{claim.rejection_reason}</p>
            {claim.rejection_codes && claim.rejection_codes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {claim.rejection_codes.map((code, i) => (
                  <Badge key={i} variant="outline" className="bg-red-50">
                    {code}
                  </Badge>
                ))}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Claim Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Claim Number</span>
                <span className="font-medium font-mono">{claim.claim_number || `#${claim.id}`}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice</span>
                <Link
                  href={`/transactions/invoices/${claim.invoice_id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {claim.invoice_number || `#${claim.invoice_id}`}
                </Link>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <ClaimStatusBadge status={claim.status} />
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">SHA Reference</span>
                <span className="font-medium font-mono">{claim.sha_reference || '—'}</span>
              </div>
              {claim.fhir_bundle_id && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">FHIR Bundle ID</span>
                    <span className="font-medium font-mono text-xs">{claim.fhir_bundle_id}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Patient Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{claim.patient_name || '—'}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">MRN</span>
                <Link href={`/patients/${claim.patient_id}`} className="font-medium font-mono text-primary hover:underline">
                  {claim.patient_mrn || '—'}
                </Link>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Encounter</span>
                <Link href={`/encounters/${claim.encounter_id}`} className="font-medium text-primary hover:underline">
                  #{claim.encounter_id}
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-lg">KES</span>
              Amounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Claimed</span>
                <span className="font-bold text-lg">{formatCurrency(parseFloat(claim.total_amount ?? '0'))}</span>
              </div>
              {claim.approved_amount && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approved</span>
                    <span className="font-bold text-lg text-green-600">
                      {formatCurrency(parseFloat(claim.approved_amount))}
                    </span>
                  </div>
                </>
              )}
              {claim.rejected_amount && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rejected</span>
                    <span className="font-bold text-lg text-red-600">
                      {formatCurrency(parseFloat(claim.rejected_amount))}
                    </span>
                  </div>
                </>
              )}
              {claim.copay_amount && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Patient Copay</span>
                    <span className="font-bold text-lg text-orange-600">
                      {formatCurrency(parseFloat(claim.copay_amount))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {format(parseISO(claim.created_at), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
              {claim.submitted_at && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Submitted</span>
                    <span className="font-medium">
                      {format(parseISO(claim.submitted_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                </>
              )}
              {claim.processed_at && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processed</span>
                    <span className="font-medium">
                      {format(parseISO(claim.processed_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                </>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span className="font-medium">
                  {format(parseISO(claim.updated_at), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DHA HIE Consent & Pre-authorization (SHIF flow only) */}
      {claim.claim_flow === 'shif' && claim.sha_member && (
        <div className="grid gap-6 md:grid-cols-2">
          <ConsentPanel
            shaMemberId={claim.sha_member}
            onConsentObtained={(id) => setConsentTokenId(id)}
          />
          <PreauthPanel
            claimId={claim.id}
            consentTokenId={consentTokenId}
            diagnosisCodes={claim.primary_diagnosis_code ? [claim.primary_diagnosis_code] : []}
            onPreauthComplete={() => refetch()}
          />
        </div>
      )}

      {/* DHA HIE Middleware (ILM) per-action workflow (SHIF flow only) */}
      {claim.claim_flow === 'shif' && (
        <>
          <PreVisitChecksPanel
            patientPk={typeof claim.patient === 'number' ? claim.patient : undefined}
            shaMemberId={typeof claim.sha_member === 'number' ? claim.sha_member : undefined}
          />
          <ClaimILMPanel claimId={claim.id} onChange={() => refetch()} />
        </>
      )}
    </div>
  );
}
