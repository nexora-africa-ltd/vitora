/**
 * ClaimAdjudicationTab — Payer-side adjudication view + line items.
 */
'use client';

import React from 'react';
import { PayerClaimPreview } from './PayerClaimPreview';
import type { Claim } from '@/lib/types/sha';

interface ClaimAdjudicationTabProps {
  claim: Claim;
}

export function ClaimAdjudicationTab({ claim }: ClaimAdjudicationTabProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <PayerClaimPreview claimId={claim.id} claimStatus={claim.status} />
    </div>
  );
}
