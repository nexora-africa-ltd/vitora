'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Building2,
  Stethoscope,
  Users,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { onboardingChecklistApi } from '@/lib/api/onboarding';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { AnimatedThemeToggle } from '@/components/ui/animated-theme-toggle';
import type { OnboardingStep } from '@/lib/types/onboarding';

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  facility_modules: Building2,
  first_clinic: Stethoscope,
  invite_staff: Users,
};

const STEP_LINKS: Record<string, string> = {
  facility_modules: '/admin/facilities',
  first_clinic: '/clinics',
  invite_staff: '/admin/staff',
};

export default function OnboardingPage() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [allRequiredDone, setAllRequiredDone] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await onboardingChecklistApi.getStatus();
      setSteps(data.steps);
      setIsComplete(data.complete);
      setAllRequiredDone(data.all_required_done);

      // If already complete, redirect to dashboard
      if (data.complete) {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load onboarding status');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatus();
    }
  }, [isAuthenticated, fetchStatus]);

  const handleComplete = async () => {
    setIsCompleting(true);
    setError(null);
    try {
      await onboardingChecklistApi.markComplete();

      // Update user in localStorage so banner/guards see the new state
      try {
        const stored = JSON.parse(localStorage.getItem('vitora_user') || '{}');
        stored.onboarding_complete = true;
        localStorage.setItem('vitora_user', JSON.stringify(stored));
      } catch {
        // Best-effort — the hard refresh below will re-sync anyway
      }

      // Clear the banner dismissal flag (no longer relevant)
      sessionStorage.removeItem('vitora_onboarding_banner_dismissed');

      // Hard refresh to ensure all cached state (auth context, banners) resets
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSkipToDashboard = () => {
    router.push('/dashboard');
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isComplete) {
    return null; // Redirecting to dashboard
  }

  const completedCount = steps.filter((s) => s.done).length;
  const totalSteps = steps.length;

  return (
    <div className="relative flex min-h-screen flex-col items-center bg-background px-4 py-8 sm:py-12">
      {/* Theme toggle */}
      <AnimatedThemeToggle className="absolute top-4 right-4 z-50" />

      {/* Header */}
      <div className="mb-8 text-center">
        <VitoraLogo tone="dark" alt="Vitora HMIS" className="mx-auto mb-6 w-32 dark:hidden" priority />
        <VitoraLogo tone="light" alt="Vitora HMIS" className="mx-auto mb-6 hidden w-32 dark:block" priority />
        <h1 className="text-2xl font-bold sm:text-3xl">
          Welcome, {user?.first_name || user?.username}!
        </h1>
        <p className="mt-2 text-muted-foreground">
          Complete these steps to get your organization up and running.
        </p>
      </div>

      {/* Progress */}
      <div className="mb-6 w-full max-w-lg">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {completedCount} of {totalSteps} steps complete
          </span>
          <span className="font-medium">
            {totalSteps > 0
              ? Math.round((completedCount / totalSteps) * 100)
              : 0}
            %
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand-teal-500 dark:bg-brand-teal-400 transition-all duration-500"
            style={{
              width: `${totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex w-full max-w-lg items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Steps */}
      <div className="w-full max-w-lg space-y-3">
        {steps.map((step) => {
          const Icon = STEP_ICONS[step.key] || Circle;
          const link = STEP_LINKS[step.key];

          return (
            <Card
              key={step.key}
              className={`transition-all ${
                step.done
                  ? 'border-brand-teal-500/30 bg-brand-teal-50/50 dark:border-brand-teal-400/30 dark:bg-brand-teal-900/20'
                  : 'hover:border-foreground/20'
              }`}
            >
              <CardContent className="flex items-center gap-4 p-4">
                {/* Status icon */}
                <div className="shrink-0">
                  {step.done ? (
                    <CheckCircle2 className="h-6 w-6 text-brand-teal-500 dark:text-brand-teal-300" />
                  ) : (
                    <Icon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-medium ${
                      step.done ? 'text-brand-teal-700 dark:text-brand-teal-300' : ''
                    }`}
                  >
                    {step.label}
                    {step.required && !step.done && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(required)</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
                </div>

                {/* Action */}
                {!step.done && link && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => router.push(link)}
                  >
                    Set up
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-8 flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" size="sm" onClick={handleSkipToDashboard}>
          Skip for now
        </Button>

        <Button
          onClick={handleComplete}
          disabled={!allRequiredDone || isCompleting}
          className="gap-2"
        >
          {isCompleting && <Loader2 className="h-4 w-4 animate-spin" />}
          Complete Setup
        </Button>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-8">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={logout}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
