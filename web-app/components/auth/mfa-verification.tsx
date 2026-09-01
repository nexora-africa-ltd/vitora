'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Shield,
  Key,
  Loader2,
  Smartphone,
  Archive,
  AlertTriangle,
  Fingerprint,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { mfaApi } from '@/lib/api/mfa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpPopover } from '@/components/shared/help-popover';
import { CircularProgress } from '@/components/ui/circular-progress';
import { cn } from '@/lib/utils';
import { mfaToast } from './mfa-toast';

// MFA token validity period (5 minutes)
const MFA_TOKEN_LIFETIME_SECONDS = 5 * 60;

interface MFAVerificationProps {
  mfaToken: string;
  availableMethods?: string[];
  onCancel: () => void;
}

export function MFAVerification({
  mfaToken,
  availableMethods = ['totp', 'backup_code'],
  onCancel,
}: MFAVerificationProps) {
  const [token, setToken] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const hasWebAuthn = availableMethods.includes('webauthn');
  const tabCount = hasWebAuthn ? 3 : 2;
  const defaultTab = hasWebAuthn ? 'passkey' : 'token';
  const [activeTab, setActiveTab] = useState<'token' | 'backup' | 'passkey'>(defaultTab);
  const [isExpired, setIsExpired] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(MFA_TOKEN_LIFETIME_SECONDS);
  const [webAuthnError, setWebAuthnError] = useState<string | null>(null);
  const { verifyMFA, verifyMFAWithWebAuthn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const expiresAtRef = useRef(Date.now() + MFA_TOKEN_LIFETIME_SECONDS * 1000);

  // Resolve where to send the user after a successful MFA verification.
  // Honour ?callbackUrl=... (e.g. set by the proxy after an idle logout) when
  // it's a safe same-origin path; otherwise fall back to '/' (middleware will
  // route to /dashboard or /setup).
  const resolvePostLoginPath = useCallback(() => {
    const callbackUrl = searchParams.get('callbackUrl');
    if (callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
      return callbackUrl;
    }
    return '/';
  }, [searchParams]);

  // Wall-clock countdown — works correctly even when tab is backgrounded.
  // setInterval is throttled to ~1/min in background tabs, so we also
  // listen for visibilitychange to tick immediately when the user returns.
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        setIsExpired(true);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const handleExpiredReturn = useCallback(() => {
    mfaToast.expired();
    onCancel();
  }, [onCancel]);

  const progressValue = (secondsRemaining / MFA_TOKEN_LIFETIME_SECONDS) * 100;
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const countdownText = `${mins}:${secs.toString().padStart(2, '0')}`;

  // Smooth green → amber → red color coding based on percentage remaining
  const timerStroke =
    progressValue > 75
      ? 'stroke-emerald-500'
      : progressValue > 50
        ? 'stroke-lime-500'
        : progressValue > 30
          ? 'stroke-amber-500'
          : progressValue > 15
            ? 'stroke-orange-500'
            : 'stroke-red-500';
  const timerText =
    progressValue > 75
      ? 'text-emerald-600 dark:text-emerald-400'
      : progressValue > 50
        ? 'text-lime-600 dark:text-lime-400'
        : progressValue > 30
          ? 'text-amber-600 dark:text-amber-400'
          : progressValue > 15
            ? 'text-orange-600 dark:text-orange-400'
            : 'text-red-600 dark:text-red-400';

  const handleVerify = async (method: 'token' | 'backup') => {
    setIsLoading(true);

    try {
      const options =
        method === 'token'
          ? { token: token.replace(/\s/g, '') }
          : { backupCode: backupCode.replace(/\s/g, '') };

      const result = await verifyMFA(mfaToken, options);
      mfaToast.success();

      // Small delay to ensure localStorage writes are committed before navigation
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (result.mustChangePassword) {
        router.replace('/change-password');
        return;
      }

      // Use replace to prevent going back to login page. Preserve callbackUrl
      // when the user was bounced here from a protected route (e.g. idle logout).
      router.replace(resolvePostLoginPath());
    } catch (err) {
      mfaToast.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length === 6) {
      handleVerify('token');
    }
  };

  const handleBackupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (backupCode.trim()) {
      handleVerify('backup');
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'token' | 'backup' | 'passkey');
    setWebAuthnError(null);
    if (value === 'backup') {
      mfaToast.backupCodeHint();
    }
  };

  const handleWebAuthnVerify = async () => {
    setIsLoading(true);
    setWebAuthnError(null);
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser');
      // Get challenge options from backend
      const optionsJSON = await mfaApi.webauthnAuthenticateBegin(mfaToken);
      const options = JSON.parse(optionsJSON);
      // Trigger browser passkey/biometric prompt
      const credential = await startAuthentication({ optionsJSON: options });

      // Complete authentication via the auth context so AuthGuard sees us as
      // authenticated (the backend additionally sets httpOnly cookies for web
      // clients so subsequent API calls do not 401).
      const result = await verifyMFAWithWebAuthn(mfaToken, credential);

      mfaToast.success();
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (result.mustChangePassword) {
        router.replace('/change-password');
        return;
      }

      router.replace(resolvePostLoginPath());
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setWebAuthnError('Authentication was cancelled or timed out.');
      } else {
        setWebAuthnError(err instanceof Error ? err.message : 'Passkey verification failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Expired state — prompt user to log in again
  if (isExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-destructive/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-destructive/5 blur-3xl" />
        </div>
        <Card className="relative w-full max-w-sm border-border/50 shadow-xl backdrop-blur-sm sm:max-w-md">
          <div className="absolute left-0 right-0 top-0 h-1 rounded-t-lg bg-gradient-to-r from-destructive/60 via-destructive to-destructive/60" />
          <CardHeader className="pb-4 pt-6 text-center">
            <div className="mx-auto mb-4">
              <CircularProgress
                value={0}
                size={72}
                strokeWidth={5}
                indicatorClassName="stroke-destructive"
                trackClassName="stroke-destructive/20"
              >
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </CircularProgress>
            </div>
            <CardTitle className="text-xl font-semibold sm:text-2xl">
              Verification Expired
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              The verification code has expired. Please sign in again to generate a new code.
            </p>
          </CardHeader>
          <CardContent className="pb-6">
            <Button onClick={handleExpiredReturn} className="h-11 w-full sm:h-12" size="lg">
              ← Return to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4 sm:p-6">
      {/* Decorative elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-sm border-border/50 shadow-xl shadow-primary/5 backdrop-blur-sm sm:max-w-md">
        {/* Security indicator strip */}
        <div className="absolute left-0 right-0 top-0 h-1 rounded-t-lg bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

        <CardHeader className="pb-4 pt-6 text-center">
          <div className="relative mx-auto mb-4">
            {/* Circular countdown timer */}
            <CircularProgress
              value={progressValue}
              size={72}
              strokeWidth={5}
              indicatorClassName={timerStroke}
              trackClassName="stroke-muted"
            >
              <div className={cn('font-mono text-xs font-bold tabular-nums', timerText)}>
                {countdownText}
              </div>
            </CircularProgress>
          </div>
          <div className="flex items-center justify-center gap-2">
            <CardTitle className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-xl font-semibold sm:text-2xl">
              Verification Required
            </CardTitle>
            <HelpPopover content="Enter the code from your authenticator app or use a backup code to complete login securely." />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Complete two-factor authentication</p>
        </CardHeader>

        <CardContent className="space-y-5 pb-6">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList
              className={cn(
                'grid h-11 w-full bg-muted/50 p-1',
                hasWebAuthn ? 'grid-cols-3' : 'grid-cols-2'
              )}
            >
              {hasWebAuthn && (
                <TabsTrigger
                  value="passkey"
                  className={cn(
                    'gap-1.5 text-xs transition-all data-[state=active]:shadow-sm sm:text-sm',
                    'data-[state=active]:bg-background data-[state=active]:text-foreground'
                  )}
                >
                  <Fingerprint className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="sm:hidden">Passkey</span>
                  <span className="hidden sm:inline">Passkey</span>
                </TabsTrigger>
              )}
              <TabsTrigger
                value="token"
                className={cn(
                  'gap-1.5 text-xs transition-all data-[state=active]:shadow-sm sm:text-sm',
                  'data-[state=active]:bg-background data-[state=active]:text-foreground'
                )}
              >
                <Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="sm:hidden">App</span>
                <span className="hidden sm:inline">Authenticator</span>
              </TabsTrigger>
              <TabsTrigger
                value="backup"
                className={cn(
                  'gap-1.5 text-xs transition-all data-[state=active]:shadow-sm sm:text-sm',
                  'data-[state=active]:bg-background data-[state=active]:text-foreground'
                )}
              >
                <Archive className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="sm:hidden">Backup</span>
                <span className="hidden sm:inline">Backup Code</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="token" className="mt-4">
              <form onSubmit={handleTokenSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="token" className="flex items-center gap-1.5 text-sm font-medium">
                    6-digit code
                    <HelpPopover
                      content="Open your authenticator app (Google Authenticator, Authy, etc.) and enter the current 6-digit code."
                      size="sm"
                    />
                  </label>
                  <Input
                    id="token"
                    type="text"
                    inputMode="numeric"
                    placeholder="• • • • • •"
                    value={token}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setToken(value);
                    }}
                    className={cn(
                      'h-14 text-center font-mono text-xl tracking-[0.4em] sm:text-2xl',
                      'border-2 focus:border-primary focus:ring-2 focus:ring-primary/20',
                      'transition-all duration-200',
                      token.length === 6 && 'border-green-500/50 bg-green-500/5'
                    )}
                    disabled={isLoading}
                    autoFocus
                    autoComplete="one-time-code"
                  />
                </div>

                <Button
                  type="submit"
                  className={cn(
                    'h-11 w-full text-sm font-medium sm:h-12 sm:text-base',
                    'bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary',
                    'shadow-lg shadow-primary/25 hover:shadow-primary/40',
                    'transition-all duration-200'
                  )}
                  disabled={token.length !== 6 || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Verify & Continue
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            {hasWebAuthn && (
              <TabsContent value="passkey" className="mt-4">
                <div className="space-y-4">
                  <div className="space-y-2 text-center">
                    <Fingerprint className="mx-auto h-12 w-12 text-primary/70" />
                    <p className="text-sm text-muted-foreground">
                      Use Windows Hello, Touch ID, Face ID, or a security key to verify.
                    </p>
                  </div>

                  {webAuthnError && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {webAuthnError}
                    </div>
                  )}

                  <Button
                    onClick={handleWebAuthnVerify}
                    className={cn(
                      'h-11 w-full text-sm font-medium sm:h-12 sm:text-base',
                      'bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary',
                      'shadow-lg shadow-primary/25 hover:shadow-primary/40',
                      'transition-all duration-200'
                    )}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Waiting for device...
                      </>
                    ) : (
                      <>
                        <Fingerprint className="mr-2 h-4 w-4" />
                        Use Passkey
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>
            )}

            <TabsContent value="backup" className="mt-4">
              <form onSubmit={handleBackupSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="backupCode"
                    className="flex items-center gap-1.5 text-sm font-medium"
                  >
                    Backup code
                    <HelpPopover
                      content="Enter one of the backup codes you saved when setting up MFA. Each code can only be used once."
                      size="sm"
                    />
                  </label>
                  <Input
                    id="backupCode"
                    type="text"
                    placeholder="XXXX-XXXX"
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                    className={cn(
                      'h-14 text-center font-mono text-lg tracking-widest sm:text-xl',
                      'border-2 focus:border-primary focus:ring-2 focus:ring-primary/20',
                      'transition-all duration-200',
                      backupCode.length >= 8 && 'border-green-500/50 bg-green-500/5'
                    )}
                    disabled={isLoading}
                  />
                </div>

                <Button
                  type="submit"
                  className={cn(
                    'h-11 w-full text-sm font-medium sm:h-12 sm:text-base',
                    'bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary',
                    'shadow-lg shadow-primary/25 hover:shadow-primary/40',
                    'transition-all duration-200'
                  )}
                  disabled={!backupCode.trim() || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-4 w-4" />
                      <span className="sm:hidden">Verify</span>
                      <span className="hidden sm:inline">Verify Backup Code</span>
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Divider */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
          </div>

          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isLoading}
              className="text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              ← Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
