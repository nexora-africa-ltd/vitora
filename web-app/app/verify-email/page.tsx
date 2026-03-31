'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Loader2,
  Sun,
  Moon,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { orgSignupApi } from '@/lib/api/onboarding';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const token = searchParams.get('token') || '';

  const [state, setState] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!token) {
      setError('No verification token provided.');
      setState('error');
      return;
    }

    async function verify() {
      try {
        const result = await orgSignupApi.verifyEmail({ token });
        setOrgName(result.org_name);
        setState('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed');
        setState('error');
      }
    }

    verify();
  }, [token]);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 sm:p-8 bg-background">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-10"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>

      <Card className="relative w-full max-w-md border-brand-burgundy-200 dark:border-muted/30 shadow-lg overflow-hidden">
        {mounted && (
          <VitoraLogo
            variant="icon"
            tone={isDark ? 'white' : 'teal'}
            alt=""
            className="absolute top-1/2 left-1/2 w-[52%] -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none select-none"
            imageClassName="pointer-events-none select-none"
          />
        )}

        {/* Verifying */}
        {state === 'verifying' && (
          <CardContent className="relative z-10 flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Verifying your email...</p>
          </CardContent>
        )}

        {/* Success */}
        {state === 'success' && (
          <CardContent className="relative z-10 flex flex-col items-center justify-center py-16 gap-4">
            <div className="rounded-full bg-green-500/10 p-3">
              <ShieldCheck className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center space-y-2 max-w-xs">
              <p className="text-lg font-semibold">Email Verified!</p>
              {orgName && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{orgName}</span> has been verified.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                A Nexora administrator will review and activate your organization.
                You&apos;ll receive a notification once approved.
              </p>
            </div>
            <Button onClick={() => router.push('/login')}>
              Go to Login
            </Button>
          </CardContent>
        )}

        {/* Error */}
        {state === 'error' && (
          <CardContent className="relative z-10 flex flex-col items-center justify-center py-16 gap-4">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="text-center space-y-2 max-w-xs">
              <p className="font-medium">Verification Failed</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button variant="outline" onClick={() => router.push('/signup')}>
                Sign Up Again
              </Button>
              <Button variant="ghost" onClick={() => router.push('/login')}>
                Go to Login
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
