/**
 * ClaimAdjudicationTab — Payer-side adjudication view + line items.
 */
'use client';

import React from 'react';
import { PayerClaimPreview } from './PayerClaimPreview';
import type { Claim } from '@/lib/types/sha';
import { getEffectiveClaimStatus } from '@/lib/sha/payer-preview';

interface ClaimAdjudicationTabProps {
  claim: Claim;
  isActive?: boolean;
  onNavigateToTab?: (tab: 'overview' | 'workflow' | 'interventions' | 'adjudication') => void;
  onAttentionChange?: (attention: boolean) => void;
}

export function ClaimAdjudicationTab({
  claim,
  isActive = false,
  onNavigateToTab,
  onAttentionChange,
}: ClaimAdjudicationTabProps) {
  const effectiveStatus = getEffectiveClaimStatus(claim);
  return (
    <div className="space-y-4 sm:space-y-6">
      <PayerClaimPreview
        claimId={claim.id}
        claimStatus={effectiveStatus}
        isActive={isActive}
        onNavigateToTab={onNavigateToTab}
        onAttentionChange={onAttentionChange}
      />
    </div>
  );
}
