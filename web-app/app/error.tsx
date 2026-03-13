'use client';

import { AlertTriangle } from 'lucide-react';
import { VitoraLogo } from '@/components/ui/vitora-logo';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background px-8 py-10 text-center shadow-lg">
        <VitoraLogo tone="crimson" alt="Vitora HMIS" className="mx-auto w-40" priority />
        <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vitora HMIS hit an unexpected error while loading this page.
        </p>
        <p className="mt-4 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {error.message}
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
