/**
 * useSubscription Hook
 *
 * Provides subscription-tier and plan-feature awareness to components.
 * Data is sourced from the authenticated user's session (populated from
 * the org's subscription plan on login / /api/staff/me/).
 *
 * Usage:
 * ```tsx
 * const { hasFeature, tier, aiAvailable } = useSubscription();
 *
 * if (hasFeature('ai_assistant')) { /* show TibaBot panel *\/ }
 * if (hasFeature('laboratory'))   { /* show lab module *\/ }
 * ```
 */
import { useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth/context';

export type SubscriptionTier = 'FREE' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';

const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  FREE: 0,
  BASIC: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

export interface SubscriptionInfo {
  /** Current subscription tier (FREE, BASIC, PROFESSIONAL, ENTERPRISE) */
  tier: SubscriptionTier;
  /** Plan feature flags from the backend (null = not yet loaded) */
  planFeatures: Record<string, boolean> | null;
  /** Whether AI token quota is available */
  aiAvailable: boolean;

  /** Check if a specific plan feature is enabled */
  hasFeature: (feature: string) => boolean;
  /** Check if the tier meets a minimum level */
  isAtLeast: (minTier: SubscriptionTier) => boolean;
  /** Whether the user is on any paid plan */
  isPaid: boolean;
}

export function useSubscription(): SubscriptionInfo {
  const { user, isAuthenticated } = useAuth();

  const tier = useMemo<SubscriptionTier>(() => {
    if (!isAuthenticated || !user) return 'FREE';
    const t = user.subscription_tier as SubscriptionTier | null | undefined;
    return t && t in TIER_HIERARCHY ? t : 'FREE';
  }, [user, isAuthenticated]);

  const planFeatures = useMemo<Record<string, boolean> | null>(() => {
    if (!isAuthenticated || !user) return null;
    // null means "not yet loaded" — treat as permissive to avoid flash of missing items
    return user.plan_features ?? null;
  }, [user, isAuthenticated]);

  const aiAvailable = useMemo(() => {
    if (!isAuthenticated || !user) return false;
    // Superusers always have access
    if (user.is_superuser) return true;
    return user.ai_tokens_available ?? false;
  }, [user, isAuthenticated]);

  const hasFeature = useCallback((feature: string): boolean => {
    if (!isAuthenticated || !user) return false;
    // Superusers bypass feature checks
    if (user.is_superuser) return true;
    // If plan_features hasn't been loaded yet, be permissive (avoid flash)
    if (planFeatures === null) return true;
    return planFeatures[feature] === true;
  }, [user, isAuthenticated, planFeatures]);

  const isAtLeast = useCallback((minTier: SubscriptionTier): boolean => {
    return TIER_HIERARCHY[tier] >= TIER_HIERARCHY[minTier];
  }, [tier]);

  const isPaid = useMemo(() => tier !== 'FREE', [tier]);

  return { tier, planFeatures, aiAvailable, hasFeature, isAtLeast, isPaid };
}
