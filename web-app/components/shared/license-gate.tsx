'use client';

/**
 * LicenseGate — wraps content that requires a specific subscription feature.
 *
 * In web mode (cloud): features are server-gated via permissions, so this
 * component renders children unconditionally (double-gate UX is confusing).
 *
 * In desktop mode (offline hub): checks the local license token to determine
 * if the feature is available and shows an upgrade prompt if not.
 *
 * Usage:
 *   <LicenseGate feature="sha_claims">
 *     <SHAClaimsPage />
 *   </LicenseGate>
 *
 *   <LicenseGate feature="laboratory" fallback={<UpgradeCard />}>
 *     <LabDashboard />
 *   </LicenseGate>
 */

import React from 'react';
import { useLicense } from '@/lib/context/license-context';
import { FEATURE_LABELS } from '@/lib/types/subscription';
import { Lock, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface LicenseGateProps {
  /** Feature key to check (e.g., "sha_claims", "laboratory", "inpatient"). */
  feature: string;
  /** Optional custom fallback when feature is not available. */
  fallback?: React.ReactNode;
  /** Content to render when feature is licensed. */
  children: React.ReactNode;
}

export function LicenseGate({ feature, fallback, children }: LicenseGateProps) {
  const { hasFeature, isLoading, tier, isDegraded } = useLicense();

  // While loading, render children (avoid flash of locked state)
  if (isLoading) {
    return <>{children}</>;
  }

  // Feature is available
  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  // Custom fallback
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default upgrade prompt
  const featureLabel = FEATURE_LABELS[feature] || feature;

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <Card className="max-w-md w-full text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg">Feature Not Available</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{featureLabel}</span> is not included in
            your current plan.
          </p>
          {tier && (
            <div className="flex justify-center">
              <Badge variant="secondary">Current plan: {tier}</Badge>
            </div>
          )}
          {isDegraded && (
            <p className="text-xs text-destructive">
              Your subscription is inactive. Contact Nexora to reactivate.
            </p>
          )}
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href="mailto:support@nexora.africa?subject=Plan%20Upgrade%20Request">
              <ArrowUpRight className="h-4 w-4" />
              Request Upgrade
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
