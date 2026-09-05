'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Eye, EyeOff, Loader2, AlertCircle, WifiOff, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/button';
import { AnimatedThemeToggle } from '@/components/ui/animated-theme-toggle';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MFAVerification } from '@/components/auth/mfa-verification';
import { APP_NAME } from '@/lib/utils/constants';
import { KenyaCoatOfArms } from '@/components/ui/kenya-coat-of-arms';
import { DhaLogo } from '@/components/ui/dha-logo';
import { setupApi } from '@/lib/api/onboarding';
import { standaloneLisApi } from '@/lib/api/standalone-lis';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import {
  isDesktop,
  isFirstRun,
  storeCredentials,
  getCredentials,
  clearCredentials,
  getAppConfig,
} from '@/lib/desktop';
import { licensingApi } from '@/lib/api/licensing';
import Link from 'next/link';

const LEGACY_DESKTOP_API_URL_RE = /^https?:\/\/api\.vitora\.digital\/?$/i;

function normalizeApiUrl(url?: string | null): string {
  return (url || '').trim().replace(/\/+$/, '');
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    username?: string;
    password?: string;
  }>({});
  const [mounted, setMounted] = useState(false);
  const [mfaState, setMfaState] = useState<{
    required: boolean;
    token?: string;
    setupRequired?: boolean;
    availableMethods?: string[];
  } | null>(null);
  const [logoutReason, setLogoutReason] = useState<'idle' | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isDesktopMode, setIsDesktopMode] = useState(false);
  const { login, verifyMFA } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();

  // Prevent hydration mismatch for theme-dependent images
  useEffect(() => {
    setMounted(true);
    setIsOffline(!navigator.onLine);
    setIsDesktopMode(isDesktop());
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Desktop gates: run setup before activation before login.
  useEffect(() => {
    let cancelled = false;

    async function runDesktopGates() {
      if (!isDesktop()) return;

      const config = await getAppConfig();
      if (cancelled) return;

      const normalizedApiUrl = normalizeApiUrl(config?.api_url);
      if (
        !config?.setup_completed ||
        !normalizedApiUrl ||
        LEGACY_DESKTOP_API_URL_RE.test(normalizedApiUrl)
      ) {
        router.replace('/desktop-setup');
        return;
      }

      const firstRun = await isFirstRun();
      if (cancelled) return;

      if (firstRun) {
        router.replace('/desktop-setup');
        return;
      }

      // LAN client workstations don't need their own license — the hub
      // holds the license. Only standalone/lan_hub need local activation.
      if (config?.deployment_mode !== 'lan_client') {
        const token = await licensingApi.getStoredTokenAsync();
        if (!cancelled && !token) {
          router.replace('/activate');
        }
      }
    }

    runDesktopGates().catch(() => {
      if (!cancelled) {
        router.replace('/desktop-setup');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Load saved credentials on desktop (Remember Me)
  useEffect(() => {
    if (!isDesktop()) return;
    getCredentials().then((creds) => {
      if (creds) {
        setUsername(creds.username);
        setPassword(creds.password);
        setRememberMe(true);
      }
    });
  }, []);

  // Check for logout reason (e.g., idle timeout)
  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'idle') {
      setLogoutReason('idle');
      // Clean up URL without full page reload
      const url = new URL(window.location.href);
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  // Security: Strip credentials from URL if someone navigates with them in query params
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('username') || url.searchParams.has('password')) {
      url.searchParams.delete('username');
      url.searchParams.delete('password');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  // Desktop installations are provisioned through desktop setup, not self-service signup.
  const showSignupLink = !isDesktopMode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationErrors({});

    // Client-side validation
    const errors: { username?: string; password?: string } = {};
    if (!username.trim()) {
      errors.username = 'Username or email is required';
    }
    if (!password) {
      errors.password = 'Password is required';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(username, password);

      if (!result.success) {
        setError(result.error || 'Login failed. Please try again.');
        return;
      }

      // Save or clear credentials based on Remember Me (desktop only)
      if (isDesktop()) {
        if (rememberMe) {
          storeCredentials(username, password);
        } else {
          clearCredentials();
        }
      }

      if (result.mfaRequired) {
        setMfaState({
          required: true,
          token: result.mfaToken,
          setupRequired: result.mfaSetupRequired,
          availableMethods: result.availableMethods,
        });
        return;
      }

      if (result.mustChangePassword) {
        router.push('/change-password');
        return;
      }

      // MFA setup required and grace period already expired — force setup
      // The MFAEnforcementOverlay in the dashboard layout will block all access
      if (result.mfaGraceExpired) {
        router.push('/dashboard');
        return;
      }

      // Check if setup wizard needs to run before entering the app.
      // Always check in desktop mode (the hub may have an empty DB and
      // need first-run setup). On web, gate on the build-time flag.
      if (isDesktop() || process.env.NEXT_PUBLIC_SETUP_WIZARD_ENABLED === 'true') {
        try {
          const setupStatus = await setupApi.check();
          if (setupStatus.setup_required) {
            router.push('/setup');
            return;
          }
        } catch {
          // If check fails, proceed to dashboard
        }
      }

      // Check if org onboarding is incomplete for admin users
      try {
        const storedUser = JSON.parse(localStorage.getItem('vitora_user') || '{}');
        const deploymentProfile = storedUser?.facility?.deployment_profile;

        if (deploymentProfile === 'lis_standalone') {
          try {
            const lisStatus = await standaloneLisApi.getOnboardingStatus();
            if (!lisStatus.complete) {
              router.push('/onboarding/lis-standalone');
              return;
            }
          } catch {
            // If status check fails, proceed to dashboard
          }
        }

        if (storedUser.onboarding_complete === false) {
          const adminRoles = ['ADMIN', 'ORG-ADMIN', 'OWNER'];
          if (adminRoles.includes(storedUser.role || '')) {
            router.push('/onboarding');
            return;
          }
        }
      } catch {
        // If parse fails, proceed to dashboard
      }

      // Redirect to the page the user was on before logout, or dashboard
      const callbackUrl = searchParams.get('callbackUrl');
      if (callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
        router.push(callbackUrl);
      } else {
        router.push('/');
      }
    } catch (err) {
      if (!navigator.onLine || (err instanceof TypeError && err.message === 'Failed to fetch')) {
        setError('You are offline. Connect to the internet to sign in.');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Show MFA verification if required
  if (mfaState?.required && mfaState.token) {
    return (
      <MFAVerification
        mfaToken={mfaState.token}
        availableMethods={mfaState.availableMethods}
        onCancel={() => setMfaState(null)}
      />
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Full-bleed background: branding gradient fading into background color */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 bg-gradient-to-br from-brand-teal-900 via-brand-teal-800 to-brand-teal-600 lg:[mask-image:linear-gradient(to_right,black_35%,transparent_65%)]" />

      {/* Theme toggle */}
      <AnimatedThemeToggle className="absolute right-4 top-4 z-50" />

      <div className="relative flex min-h-screen">
        {/* Left side - Branding */}
        <div className="relative hidden flex-col p-12 lg:flex lg:w-1/2">
          <div className="w-64">
            <VitoraLogo tone="white" alt={APP_NAME} className="w-full" priority />
          </div>

          <div className="mt-8 space-y-6">
            <h1 className="text-4xl font-bold leading-tight text-white">
              Healthcare Management
              <br />
              <span className="text-brand-gold-400">Made Simple</span>
            </h1>
            <p className="max-w-md text-lg text-white/80">
              Offline-first Hospital Management Information System designed for Kenya&apos;s
              healthcare infrastructure.
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-white/60">
              <div className="flex items-center gap-2">
                <KenyaCoatOfArms size={14} className="opacity-80" />
                KHIS/DHIS2 Ready
              </div>
              <div className="flex items-center gap-2">
                <DhaLogo size="xs" className="opacity-80" />
                DHA Compliant
              </div>
              <div className="flex items-center gap-2">
                <WifiOff className="h-3.5 w-3.5 opacity-80" />
                Offline-First
              </div>
            </div>
          </div>

          <p className="mt-auto text-sm text-white/40">
            © {new Date().getFullYear()} Vitora HMIS. Powered by{' '}
            <a
              href="https://nexora.africa"
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-secondary/60"
            >
              Nexora
            </a>
            . Kenya Data Protection Act 2019 Compliant.
          </p>
        </div>

        {/* Right side - Login form */}
        <div className="relative flex w-full items-center justify-center p-4 sm:p-8 lg:w-1/2">
          <Card className="relative z-10 w-full max-w-md overflow-hidden border-brand-teal-200 shadow-none transition-shadow duration-300 hover:shadow-2xl dark:border-muted/30 lg:border-2 lg:shadow-lg">
            {/* Background logo watermark - centered in card */}
            {mounted && (
              <VitoraLogo
                variant="icon"
                tone={isDark ? 'white' : 'teal'}
                alt=""
                className="pointer-events-none absolute left-1/2 top-1/2 w-[52%] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.05]"
                imageClassName="pointer-events-none select-none"
              />
            )}
            <CardHeader className="relative z-10 space-y-4 text-center">
              {/* Mobile logo */}
              <div className="mx-auto lg:hidden">
                <VitoraLogo
                  tone={isDark ? 'light' : 'dark'}
                  alt={APP_NAME}
                  className="w-36"
                  priority
                />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
                <CardDescription className="mt-2">
                  Sign in to access the hospital management system
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Offline banner */}
                {isOffline && (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
                    <WifiOff className="h-4 w-4 flex-shrink-0" />
                    <span>You are offline. An internet connection is required to sign in.</span>
                  </div>
                )}

                {/* Idle timeout notification */}
                {logoutReason === 'idle' && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                    <Clock className="h-4 w-4 flex-shrink-0" />
                    <span>You were logged out due to inactivity. Please sign in again.</span>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="username" className="text-sm font-medium">
                    Username or Email
                  </label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (validationErrors.username) {
                        setValidationErrors((prev) => ({ ...prev, username: undefined }));
                      }
                    }}
                    placeholder="Enter your username or email"
                    autoComplete="username"
                    disabled={isLoading}
                    className="h-11"
                  />
                  {validationErrors.username && (
                    <p className="text-sm text-destructive">{validationErrors.username}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (validationErrors.password) {
                          setValidationErrors((prev) => ({ ...prev, password: undefined }));
                        }
                      }}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      disabled={isLoading}
                      className="h-11 pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-11 w-11 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="sr-only">
                        {showPassword ? 'Hide password' : 'Show password'}
                      </span>
                    </Button>
                  </div>
                  {validationErrors.password && (
                    <p className="text-sm text-destructive">{validationErrors.password}</p>
                  )}
                </div>

                {/* Remember Me — desktop app only */}
                {isDesktopMode && (
                  <div className="flex items-center gap-2">
                    <input
                      id="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <label
                      htmlFor="remember-me"
                      className="cursor-pointer select-none text-sm text-muted-foreground"
                    >
                      Remember me
                    </label>
                  </div>
                )}

                <Button type="submit" className="h-11 w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>

                <div className="space-y-2 pt-1 text-center">
                  <Link
                    href="/forgot-password"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Forgot your password?
                  </Link>
                  {showSignupLink && (
                    <p className="text-sm text-muted-foreground">
                      Don&apos;t have an account?{' '}
                      <Link
                        href="/signup"
                        className="font-medium text-primary transition-colors hover:text-primary/80 dark:text-brand-teal-400 dark:hover:text-brand-teal-300"
                      >
                        Sign up
                      </Link>
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    <Link
                      href="/verify"
                      className="font-medium text-primary underline transition-colors hover:text-primary/80 dark:text-brand-teal-400 dark:hover:text-brand-teal-300"
                    >
                      Verify a document
                    </Link>
                  </p>
                </div>
              </form>

              {/* Development helper */}
              {process.env.NEXT_PUBLIC_ENV === 'development' && (
                <div className="mt-6 rounded-lg border border-dashed bg-muted/50 p-3">
                  <p className="text-center text-xs text-muted-foreground">
                    Development Mode • API:{' '}
                    {process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9088'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
