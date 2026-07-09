'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Eye,
  EyeOff,
  Loader2,
  Sun,
  Moon,
  AlertCircle,
  ShieldAlert,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { APP_NAME } from '@/lib/utils/constants';
import { changePasswordApi } from '@/lib/api/onboarding';
import { useAuth } from '@/lib/auth/context';
import { useDebouncedCallback } from 'use-debounce';
import { AxiosError } from 'axios';

interface PasswordValidationState {
  status: 'idle' | 'checking' | 'valid' | 'invalid';
  errors: string[];
}

function getBackendErrorMessage(err: unknown): { message: string; fieldErrors?: Record<string, string[]> } {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    if (!data || typeof data !== 'object') {
      return { message: err.message || 'Failed to change password' };
    }
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        fieldErrors[key] = value.map((v) => (typeof v === 'string' ? v : String(v)));
      } else if (typeof value === 'string') {
        fieldErrors[key] = [value];
      }
    }
    const messages: string[] = [];
    if (fieldErrors.new_password) messages.push(...fieldErrors.new_password);
    if (fieldErrors.confirm_password) messages.push(...fieldErrors.confirm_password);
    if (fieldErrors.current_password) messages.push(...fieldErrors.current_password);
    if (fieldErrors.non_field_errors) messages.push(...fieldErrors.non_field_errors);
    if (data.detail && typeof data.detail === 'string') messages.push(data.detail);
    const message = messages.length > 0 ? messages.join(' ') : err.message || 'Failed to change password';
    return { message, fieldErrors };
  }

  // Plain Error with { response } attached (from fetch-based API)
  const plain = err as Error & { response?: { status: number; data: Record<string, unknown> } };
  if (plain.response?.data) {
    const data = plain.response.data;
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        fieldErrors[key] = value.map((v) => (typeof v === 'string' ? v : String(v)));
      } else if (typeof value === 'string') {
        fieldErrors[key] = [value];
      }
    }
    const messages: string[] = [];
    if (fieldErrors.new_password) messages.push(...fieldErrors.new_password);
    if (fieldErrors.confirm_password) messages.push(...fieldErrors.confirm_password);
    if (fieldErrors.current_password) messages.push(...fieldErrors.current_password);
    if (fieldErrors.non_field_errors) messages.push(...fieldErrors.non_field_errors);
    if (data.detail && typeof data.detail === 'string') messages.push(data.detail);
    const message = messages.length > 0 ? messages.join(' ') : plain.message || 'Failed to change password';
    return { message, fieldErrors };
  }

  return { message: plain?.message || 'Failed to change password' };
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { clearMustChangePassword, resetToken } = useAuth();
  const [mounted, setMounted] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [validation, setValidation] = useState<PasswordValidationState>({
    status: 'idle',
    errors: [],
  });
  const validationRequestIdRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  const validatePassword = useDebouncedCallback(async (password: string) => {
    if (password.length < 8) {
      setValidation({
        status: 'invalid',
        errors: ['Password must be at least 8 characters'],
      });
      return;
    }

    const requestId = ++validationRequestIdRef.current;
    setValidation((prev) => ({ ...prev, status: 'checking' }));
    try {
      const result = await changePasswordApi.validate(password);
      if (requestId !== validationRequestIdRef.current) return;
      if (result.valid) {
        setValidation({ status: 'valid', errors: [] });
      } else {
        setValidation({ status: 'invalid', errors: result.errors || ['Password is not valid'] });
      }
    } catch (err) {
      if (requestId !== validationRequestIdRef.current) return;
      if (err instanceof AxiosError && err.response?.status === 400) {
        const data = err.response.data;
        const errors =
          data && typeof data === 'object' && Array.isArray(data.errors)
            ? data.errors
            : ['Password is not valid'];
        setValidation({ status: 'invalid', errors });
        return;
      }
      // For genuine network/server errors, fall back to basic client-side checks
      // and let the submit endpoint catch any Django-specific issues.
      setValidation({ status: 'idle', errors: [] });
    }
  }, 400);

  const handlePasswordChange = useCallback(
    (value: string) => {
      setNewPassword(value);
      setSubmitError(null);
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.new_password;
        return next;
      });

      if (value.length === 0) {
        setValidation({ status: 'idle', errors: [] });
        return;
      }

      validatePassword(value);
    },
    [validatePassword]
  );

  const passwordsMatch = useMemo(() => {
    if (!confirmPassword) return true; // Don't nag before user has typed
    return newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  const isFormValid = useMemo(() => {
    if (newPassword.length < 8) return false;
    if (validation.status !== 'valid') return false;
    if (!passwordsMatch) return false;
    if (!confirmPassword) return false;
    return true;
  }, [newPassword, validation, passwordsMatch, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    if (newPassword.length < 8) {
      setValidation({ status: 'invalid', errors: ['Password must be at least 8 characters'] });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSubmitError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      await changePasswordApi.change({
        new_password: newPassword,
        confirm_password: confirmPassword,
        reset_token: resetToken || undefined,
      });
      // Password changed successfully — proceed to dashboard
      clearMustChangePassword();
      if (resetToken) {
        localStorage.removeItem('vitora_reset_token');
      }
      router.push('/');
    } catch (err) {
      const { message, fieldErrors: backendFieldErrors } = getBackendErrorMessage(err);
      setSubmitError(message);
      if (backendFieldErrors) {
        setFieldErrors(backendFieldErrors);
        // Also surface password validation errors inline
        if (backendFieldErrors.new_password) {
          setValidation({ status: 'invalid', errors: backendFieldErrors.new_password });
        }
      }
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

        <CardHeader className="relative z-10 text-center space-y-4">
          <div className="mx-auto">
            <VitoraLogo tone={isDark ? 'light' : 'dark'} alt={APP_NAME} className="w-36" />
          </div>
          <div className="mx-auto rounded-full bg-amber-500/10 p-3 w-fit">
            <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold">Password Change Required</CardTitle>
            <CardDescription className="mt-2">
              You must set a new password before continuing. This is a one-time security requirement.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="relative z-10">
          <form onSubmit={handleSubmit} className="space-y-4">
            {submitError && (
              <div className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="new_password" className="text-sm font-medium">
                New Password
              </label>
              <div className="relative">
                <Input
                  id="new_password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  placeholder="At least 8 characters"
                  disabled={isSubmitting}
                  className={`h-11 pr-10 ${
                    validation.status === 'invalid' || fieldErrors.new_password
                      ? 'border-destructive focus-visible:ring-destructive'
                      : validation.status === 'valid'
                        ? 'border-green-500 focus-visible:ring-green-500'
                        : ''
                  }`}
                  autoComplete="new-password"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-11 w-11 text-muted-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>

              {validation.status === 'checking' && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking password strength…
                </p>
              )}

              {validation.status === 'valid' && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
                  <Check className="h-3 w-3" />
                  Password meets security requirements
                </p>
              )}

              {(validation.status === 'invalid' || fieldErrors.new_password) && (
                <div className="space-y-1">
                  {validation.errors.map((err, idx) => (
                    <p
                      key={idx}
                      className="text-xs text-destructive flex items-start gap-1.5"
                    >
                      <X className="h-3 w-3 mt-0.5 shrink-0" />
                      {err}
                    </p>
                  ))}
                  {fieldErrors.new_password
                    ?.filter((err) => !validation.errors.includes(err))
                    .map((err, idx) => (
                      <p
                        key={`be-${idx}`}
                        className="text-xs text-destructive flex items-start gap-1.5"
                      >
                        <X className="h-3 w-3 mt-0.5 shrink-0" />
                        {err}
                      </p>
                    ))}
                </div>
              )}

              {validation.status === 'idle' && !fieldErrors.new_password && (
                <p className="text-xs text-muted-foreground">
                  Use at least 8 characters. Avoid common words and sequences.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm_password" className="text-sm font-medium">
                Confirm Password
              </label>
              <div className="relative">
                <Input
                  id="confirm_password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.confirm_password;
                      return next;
                    });
                  }}
                  placeholder="Re-enter your password"
                  disabled={isSubmitting}
                  className={`h-11 pr-10 ${
                    !passwordsMatch ? 'border-destructive focus-visible:ring-destructive' : ''
                  }`}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-11 w-11 text-muted-foreground"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {!passwordsMatch && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <X className="h-3 w-3 mt-0.5 shrink-0" />
                  Passwords do not match
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11"
              disabled={isSubmitting || !isFormValid}
              title={
                !isFormValid && !isSubmitting
                  ? 'Fix password issues before continuing'
                  : undefined
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                'Set New Password & Continue'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
