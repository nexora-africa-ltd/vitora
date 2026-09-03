// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
// LIS standalone onboarding wizard page for WS2 closeout.
// Use: navigate to /onboarding/lis-standalone after login in lis_standalone mode.
// Inputs: reads authenticated facility context and calls LIS onboarding status/seed APIs.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { standaloneLisApi } from '@/lib/api/standalone-lis';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import type { LISOnboardingSeedResult, LISOnboardingStatus } from '@/lib/types/standalone-lis';

const STEP_ROUTES: Record<string, string> = {
  lab_identity: '/core/facilities/current',
  test_catalog: '/laboratory/tests',
  specimen_workflow: '/laboratory/settings/workflow',
  instrument_channels: '/laboratory/analyzers/channels',
  pricing_basics: '/laboratory/tests',
  team_access: '/settings/staff',
};

export default function LISStandaloneOnboardingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<LISOnboardingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<LISOnboardingSeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await standaloneLisApi.getOnboardingStatus();
      setStatus(data);
      if (data.complete) {
        router.push('/laboratory');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load LIS onboarding status.');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    fetchStatus();
  }, [fetchStatus, isAuthenticated, router]);

  const requiredProgress = useMemo(() => {
    const steps = status?.steps ?? [];
    const required = steps.filter((step) => step.required);
    const done = required.filter((step) => step.done);
    return { done: done.length, total: required.length };
  }, [status]);

  const handleComplete = async () => {
    setIsCompleting(true);
    setError(null);
    try {
      const result = await standaloneLisApi.completeOnboarding();
      setStatus(result);
      router.push('/laboratory');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete LIS onboarding.');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSeed = async (archetype: 'small' | 'medium' | 'reference') => {
    setIsSeeding(true);
    setError(null);
    setSeedResult(null);
    try {
      const result = await standaloneLisApi.seedOnboardingDefaults(archetype);
      setSeedResult(result);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not seed LIS defaults.');
    } finally {
      setIsSeeding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="LIS Standalone Onboarding"
        helpContent="Complete required setup steps before using standalone LIS operational workflows."
      />

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Setup Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Required steps complete: {requiredProgress.done}/{requiredProgress.total}
          </p>

          {seedResult && (
            <Card className="border-emerald-300 bg-emerald-50/60">
              <CardContent className="p-3 text-sm text-emerald-800">
                Seeded <strong>{seedResult.archetype}</strong> defaults: {seedResult.created_tests} tests,{' '}
                {seedResult.created_instruments} instruments, {seedResult.created_channels} channels.
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {(status?.steps ?? []).map((step) => (
              <div
                key={step.key}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    className={`h-4 w-4 ${step.done ? 'text-emerald-600' : 'text-muted-foreground'}`}
                  />
                  <span className="text-sm">{step.label}</span>
                  {step.required ? <Badge variant="secondary">Required</Badge> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(STEP_ROUTES[step.key] || '/laboratory')}
                  >
                    Open
                  </Button>
                  <Badge variant={step.done ? 'default' : 'outline'}>
                    {step.done ? 'Done' : 'Pending'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium">Quick start defaults</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Seed sample data for a lab archetype to complete setup faster.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" disabled={isSeeding} onClick={() => handleSeed('small')}>
                Seed Small Lab
              </Button>
              <Button variant="outline" disabled={isSeeding} onClick={() => handleSeed('medium')}>
                Seed Medium Lab
              </Button>
              <Button variant="outline" disabled={isSeeding} onClick={() => handleSeed('reference')}>
                Seed Reference Lab
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={fetchStatus} disabled={isCompleting || isSeeding}>
              Refresh
            </Button>
            <Button
              onClick={handleComplete}
              disabled={isCompleting || isSeeding || status?.complete === true}
            >
              {isCompleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing...
                </>
              ) : (
                'Mark LIS Onboarding Complete'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
