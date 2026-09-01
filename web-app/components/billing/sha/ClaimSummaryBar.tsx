/**
 * ClaimSummaryBar — Sticky, scan-at-a-glance header for the claim detail page.
 *
 * Always-visible context: patient identity, encounter, flow, status, and the
 * DHA time-bar countdown so the user can act without scrolling back up.
 */
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClaimStatusBadge } from './ClaimComponents';
import { ClaimFlowBadge } from './ClaimFlowBadge';
import { TimeBarBadge } from './TimeBarBadge';
import type { Claim } from '@/lib/types/sha';
import { getEffectiveClaimStatus } from '@/lib/sha/payer-preview';

interface ClaimSummaryBarProps {
  claim: Claim;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-my-1 h-6 px-2"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

export function ClaimSummaryBar({ claim }: ClaimSummaryBarProps) {
  const shaRef = claim.sha_reference ?? claim.sha_claim_reference;
  const effectiveStatus = getEffectiveClaimStatus(claim);

  return (
    <div className="sticky top-0 z-20 -mx-3 border-b bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Identity */}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-sm font-medium">
            {claim.patient_id || claim.patient ? (
              <Link
                href={`/patients/${claim.patient_id ?? claim.patient}`}
                className="hover:underline"
              >
                {claim.patient_name || 'Unknown patient'}
              </Link>
            ) : (
              claim.patient_name || 'Unknown patient'
            )}
            {claim.patient_mrn && (
              <span className="ml-1 font-mono text-muted-foreground">• {claim.patient_mrn}</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {claim.encounter_id || claim.encounter ? (
              <Link
                href={`/encounters/${claim.encounter_id ?? claim.encounter}`}
                className="hover:underline"
              >
                Encounter #{claim.encounter_id ?? claim.encounter}
              </Link>
            ) : null}
            {claim.invoice_id || claim.invoice ? (
              <>
                <span aria-hidden="true">•</span>
                <Link
                  href={`/transactions/invoices/${claim.invoice_id ?? claim.invoice}`}
                  className="hover:underline"
                >
                  Invoice {claim.invoice_number || `#${claim.invoice_id ?? claim.invoice}`}
                </Link>
              </>
            ) : null}
            {shaRef && (
              <>
                <span aria-hidden="true">•</span>
                <span className="inline-flex items-center gap-0.5 font-mono">
                  SHA Ref: {shaRef}
                  <CopyButton text={shaRef} />
                </span>
              </>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {claim.claim_flow && <ClaimFlowBadge claim={claim} className="text-xs" />}
          <ClaimStatusBadge status={effectiveStatus} />
          <TimeBarBadge claim={claim} compact />
          {claim.is_emergency_claim && (
            <Badge
              variant="outline"
              className="border-red-400 text-xs text-red-700 dark:text-red-300"
            >
              Emergency
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
