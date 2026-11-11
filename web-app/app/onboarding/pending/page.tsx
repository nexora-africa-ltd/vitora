// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Organization onboarding pending page.
 * Use: displayed to non-admin users while their organization setup is incomplete.
 * Inputs: none.
 */

export default function OnboardingPendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <section className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Organization setup is not complete</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Onboarding has not been completed yet. Contact your organization administrator for more information.
        </p>
      </section>
    </main>
  );
}
