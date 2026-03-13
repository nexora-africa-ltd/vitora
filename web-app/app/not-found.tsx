"use client"

import { useState } from "react";
import { ArrowLeft, Loader2, SearchX } from "lucide-react";
import { VitoraLogo } from '@/components/ui/vitora-logo';

export default function NotFound() {
  const [loading, setLoading] = useState(false);

  const handleHomeClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    setLoading(true);
    setTimeout(() => {
      window.location.href = "/";
    }, 300);
    e.preventDefault();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-background px-8 py-10 text-center shadow-lg">
        <VitoraLogo tone="dark" alt="Vitora HMIS" className="mx-auto w-44 dark:hidden" priority />
        <VitoraLogo tone="light" alt="Vitora HMIS" className="mx-auto hidden w-44 dark:block" priority />
        <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-teal-50 text-brand-teal-700 dark:bg-brand-teal-950/30 dark:text-brand-teal-300">
          <SearchX className="h-8 w-8" />
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The page you requested is not available in this Vitora HMIS workspace.
        </p>
        <div className="mt-8">
          <a
            href="/"
            onClick={handleHomeClick}
            className="inline-flex min-w-[160px] items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground shadow transition hover:bg-primary/90"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
            ) : (
              <>
                <ArrowLeft className="h-4 w-4" />
                Take me home
              </>
            )}
          </a>
        </div>
      </div>
    </div>
  );
}
