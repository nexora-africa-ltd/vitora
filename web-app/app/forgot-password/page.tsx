'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Loader2, Sun, Moon, AlertCircle, Mail, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { APP_NAME } from '@/lib/utils/constants';
import { passwordResetApi } from '@/lib/api/onboarding';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await passwordResetApi.request({ email });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

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

        {submitted ? (
          <CardContent className="relative z-10 flex flex-col items-center justify-center py-16 gap-4">
            <div className="rounded-full bg-blue-500/10 p-3">
              <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold">Check Your Email</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                If an account with <span className="font-medium text-foreground">{email}</span> exists,
                we&apos;ve sent a password reset link.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button variant="outline" onClick={() => { setSubmitted(false); setEmail(''); }}>
                Try a different email
              </Button>
              <Link href="/login" className="w-full">
                <Button variant="ghost" className="w-full gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Login
                </Button>
              </Link>
            </div>
          </CardContent>
        ) : (
          <>
            <CardHeader className="relative z-10 text-center space-y-4">
              <div className="mx-auto">
                <VitoraLogo
                  tone={isDark ? 'light' : 'dark'}
                  alt={APP_NAME}
                  className="w-36"
                />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Reset Password</CardTitle>
                <CardDescription className="mt-2">
                  Enter your email address and we&apos;ll send you a link to reset your password.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="relative z-10">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">Email Address</label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={isSubmitting}
                    className="h-11"
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to Login
                  </Link>
                </div>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
