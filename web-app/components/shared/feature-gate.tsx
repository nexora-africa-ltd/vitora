/**
 * FeatureGate — Declarative plan-feature gating component.
 *
 * Renders children only when the organization's plan includes the
 * specified feature. Optionally shows a fallback (e.g., upgrade prompt).
 *
 * Usage:
 * ```tsx
 * <FeatureGate feature="ai_assistant" fallback={<UpgradeBanner feature="AI Assistant" />}>
 *   <TibaBotPanel />
 * </FeatureGate>
 * ```
 */
'use client';

import type { ReactNode } from 'react';
import { useSubscription, type SubscriptionTier } from '@/lib/hooks/use-subscription';

interface FeatureGateProps {
  /** Plan feature key to check (e.g. 'ai_assistant', 'laboratory') */
  feature?: string;
  /** Minimum tier required (alternative to feature check) */
  minTier?: SubscriptionTier;
  /** Content to show when the feature is available */
  children: ReactNode;
  /** Content to show when the feature is NOT available */
  fallback?: ReactNode;
}

export function FeatureGate({ feature, minTier, children, fallback = null }: FeatureGateProps) {
  const { hasFeature, isAtLeast } = useSubscription();

  const allowed =
    (feature ? hasFeature(feature) : true) &&
    (minTier ? isAtLeast(minTier) : true);

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
