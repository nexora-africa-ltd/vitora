/**
 * ClaimOverviewTab — Financial summary, patient/encounter context, status
 * timeline and adjudication notes.
 */
'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import { ClaimStatusTimeline } from './ClaimStatusTimeline';
import type { Claim } from '@/lib/types/sha';

interface ClaimOverviewTabProps {
  claim: Claim;
}

const RADIAL = 'bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]';

interface StatProps {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'destructive' | 'warning';
}

function StatCard({ label, value, tone = 'default' }: StatProps) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'destructive'
        ? 'text-destructive'
        : tone === 'warning'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-foreground';

  return (
    <Card className="relative overflow-hidden">
      <div className={`pointer-events-none absolute inset-0 ${RADIAL}`} aria-hidden="true" />
      <CardContent className="relative p-3 sm:p-4 text-center">
        <p className="text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-lg sm:text-xl font-semibold mt-1 ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export function ClaimOverviewTab({ claim }: ClaimOverviewTabProps) {
  const total = parseFloat(claim.claimed_amount ?? claim.total_amount ?? '0');
  const approved = parseFloat(claim.approved_amount ?? '0');
  const paid = parseFloat(claim.paid_amount ?? '0');
  const copay = parseFloat(claim.patient_copay ?? claim.copay_amount ?? '0');

  const diagnosisCodes: string[] = Array.isArray(claim.secondary_diagnosis_codes)
    ? (claim.secondary_diagnosis_codes as string[])
    : [];
  const allDiagnoses = [
    claim.primary_diagnosis_code,
    ...diagnosisCodes,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Claimed" value={formatCurrency(total)} />
        <StatCard label="Approved" value={formatCurrency(approved)} tone="success" />
        <StatCard label="Co-pay" value={formatCurrency(copay)} tone="warning" />
        <StatCard label="Paid" value={formatCurrency(paid)} tone="success" />
      </div>

      {/* Status pipeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Status pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ClaimStatusTimeline claim={claim} />
        </CardContent>
      </Card>

      {/* Adjudication / Rejection details */}
      {claim.rejection_reason && (
        <Card className="border-amber-200 dark:border-amber-800/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4" />
              Rejection details
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>{claim.rejection_reason}</p>
            {claim.rejection_codes && claim.rejection_codes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {claim.rejection_codes.map((code, i) => (
                  <Badge key={i} variant="outline" className="font-mono text-xs">
                    {code}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Adjudication notes */}
      {claim.adjudication_notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Adjudication notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
            {claim.adjudication_notes}
          </CardContent>
        </Card>
      )}

      {/* Diagnosis + clinical context */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Clinical context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {claim.primary_diagnosis_description && (
              <div>
                <p className="text-xs text-muted-foreground">Primary diagnosis</p>
                <p className="font-medium">{claim.primary_diagnosis_description}</p>
              </div>
            )}
            {allDiagnoses.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Diagnosis codes</p>
                <div className="flex flex-wrap gap-1">
                  {allDiagnoses.map((code) => (
                    <Badge key={code} variant="secondary" className="font-mono text-xs">
                      {code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {claim.claim_type && (
              <div>
                <p className="text-xs text-muted-foreground">Claim type</p>
                <p className="font-medium capitalize">{claim.claim_type}</p>
              </div>
            )}
            {claim.service_date && (
              <div>
                <p className="text-xs text-muted-foreground">Service date</p>
                <p>{new Date(claim.service_date).toLocaleDateString()}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">References</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {claim.invoice_id || claim.invoice ? (
              <div>
                <p className="text-xs text-muted-foreground">Invoice</p>
                <Link
                  href={`/transactions/invoices/${claim.invoice_id ?? claim.invoice}`}
                  className="text-primary hover:underline font-medium"
                >
                  {claim.invoice_number || `#${claim.invoice_id ?? claim.invoice}`}
                </Link>
              </div>
            ) : null}
            {claim.preauth_number && (
              <div>
                <p className="text-xs text-muted-foreground">Preauthorization</p>
                <p className="font-mono text-xs">{claim.preauth_number}</p>
              </div>
            )}
            {claim.dha_external_id && (
              <div>
                <p className="text-xs text-muted-foreground">DHA external ID</p>
                <p className="font-mono text-xs break-all">{claim.dha_external_id}</p>
              </div>
            )}
            {claim.fhir_bundle_id && (
              <div>
                <p className="text-xs text-muted-foreground">FHIR bundle</p>
                <p className="font-mono text-xs break-all">{claim.fhir_bundle_id}</p>
              </div>
            )}
            {claim.submitted_by_username && (
              <div>
                <p className="text-xs text-muted-foreground">Submitted by</p>
                <p>{claim.submitted_by_username}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
