'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Eye,
  EyeOff,
  Loader2,
  Sun,
  Moon,
  AlertCircle,
  CheckCircle2,
  Building2,
  Briefcase,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { APP_NAME } from '@/lib/utils/constants';
import { invitationPublicApi } from '@/lib/api/onboarding';
import { staffApi } from '@/lib/api/rbac';
import { useDebouncedCallback } from 'use-debounce';
import type { InvitationPublicInfo } from '@/lib/types/onboarding';

type PageState = 'loading' | 'form' | 'success' | 'error';

export default function InvitationAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const token = params.token as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [invitation, setInvitation] = useState<InvitationPublicInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createdUsername, setCreatedUsername] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    password: '',
    confirm_password: '',
    phone_number: '',
  });
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  // Look up invitation on mount
  useEffect(() => {
    async function loadInvitation() {
      try {
        const info = await invitationPublicApi.lookup(token);
        if (!info.is_usable) {
          setError(info.is_expired ? 'This invitation has expired.' : 'This invitation is no longer valid.');
          setPageState('error');
          return;
        }
        setInvitation(info);
        setPageState('form');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invitation not found');
        setPageState('error');
      }
    }
    if (token) {
      loadInvitation();
    }
  }, [token]);

  // Debounced username check
  const checkUsername = useDebouncedCallback(async (username: string) => {
    if (username.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    try {
      const result = await staffApi.checkUsername(username);
      setUsernameStatus(result.available ? 'available' : 'taken');
    } catch {
      setUsernameStatus('idle');
    }
  }, 500);

  // Auto-suggest username when names change
  const suggestUsername = useCallback(async (firstName: string, lastName: string) => {
    if (firstName.length >= 2 && lastName.length >= 2 && !formData.username) {
      try {
        const result = await staffApi.suggestUsername(firstName, lastName);
        if (result.suggestions.length > 0 && result.suggestions[0]) {
          const suggested = result.suggestions[0];
          setFormData(prev => ({ ...prev, username: suggested }));
          setUsernameStatus('available');
        }
      } catch {
        // Ignore - username suggestion is optional
      }
    }
  }, [formData.username]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
    if (field === 'username' && value.length >= 3) {
      checkUsername(value);
    }
  };

  const handleNameBlur = () => {
    suggestUsername(formData.first_name, formData.last_name);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.first_name.trim()) errors.first_name = 'First name is required';
    if (!formData.last_name.trim()) errors.last_name = 'Last name is required';
    if (!formData.username.trim()) errors.username = 'Username is required';
    if (formData.username.length < 3) errors.username = 'Username must be at least 3 characters';
    if (usernameStatus === 'taken') errors.username = 'This username is already taken';
    if (!formData.password) errors.password = 'Password is required';
    if (formData.password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (formData.password !== formData.confirm_password) errors.confirm_password = 'Passwords do not match';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await invitationPublicApi.accept({
        token,
        ...formData,
      });
      setCreatedUsername(result.username);
      setPageState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 sm:p-8 bg-background">
      {/* Theme toggle */}
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

      <Card className="relative w-full max-w-lg border-brand-burgundy-200 dark:border-muted/30 shadow-lg overflow-hidden">
        {mounted && (
          <VitoraLogo
            variant="icon"
            tone={isDark ? 'white' : 'teal'}
            alt=""
            className="absolute top-1/2 left-1/2 w-[52%] -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none select-none"
            imageClassName="pointer-events-none select-none"
          />
        )}

        {/* Loading */}
        {pageState === 'loading' && (
          <CardContent className="relative z-10 flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading invitation...</p>
          </CardContent>
        )}

        {/* Error */}
        {pageState === 'error' && (
          <CardContent className="relative z-10 flex flex-col items-center justify-center py-16 gap-4">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-medium">{error}</p>
              <p className="text-sm text-muted-foreground">
                Contact your administrator for a new invitation.
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push('/login')}>
              Go to Login
            </Button>
          </CardContent>
        )}

        {/* Success */}
        {pageState === 'success' && (
          <CardContent className="relative z-10 flex flex-col items-center justify-center py-16 gap-4">
            <div className="rounded-full bg-green-500/10 p-3">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold">Account Created!</p>
              <p className="text-sm text-muted-foreground">
                Your username is <span className="font-mono font-medium text-foreground">{createdUsername}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                You can now sign in with the password you just set.
              </p>
            </div>
            <Button onClick={() => router.push('/login')}>
              Sign In
            </Button>
          </CardContent>
        )}

        {/* Form */}
        {pageState === 'form' && invitation && (
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
                <CardTitle className="text-xl font-bold">Set Up Your Account</CardTitle>
                <CardDescription className="mt-2">
                  You&apos;ve been invited to join <span className="font-medium text-foreground">{invitation.organization_name}</span>
                </CardDescription>
              </div>

              {/* Invitation context */}
              <div className="flex flex-wrap justify-center gap-2">
                {invitation.role_name && (
                  <Badge variant="secondary" className="gap-1">
                    <Shield className="h-3 w-3" />
                    {invitation.role_name}
                  </Badge>
                )}
                {invitation.department_name && (
                  <Badge variant="secondary" className="gap-1">
                    <Building2 className="h-3 w-3" />
                    {invitation.department_name}
                  </Badge>
                )}
                {invitation.job_title && (
                  <Badge variant="outline" className="gap-1">
                    <Briefcase className="h-3 w-3" />
                    {invitation.job_title}
                  </Badge>
                )}
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

                {/* Name fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="first_name" className="text-sm font-medium">First Name</label>
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => handleChange('first_name', e.target.value)}
                      onBlur={handleNameBlur}
                      placeholder="Jane"
                      disabled={isSubmitting}
                      className="h-10"
                    />
                    {validationErrors.first_name && (
                      <p className="text-xs text-destructive">{validationErrors.first_name}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="last_name" className="text-sm font-medium">Last Name</label>
                    <Input
                      id="last_name"
                      value={formData.last_name}
                      onChange={(e) => handleChange('last_name', e.target.value)}
                      onBlur={handleNameBlur}
                      placeholder="Wanjiku"
                      disabled={isSubmitting}
                      className="h-10"
                    />
                    {validationErrors.last_name && (
                      <p className="text-xs text-destructive">{validationErrors.last_name}</p>
                    )}
                  </div>
                </div>

                {/* Username */}
                <div className="space-y-1.5">
                  <label htmlFor="username" className="text-sm font-medium">Username</label>
                  <div className="relative">
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => handleChange('username', e.target.value.toLowerCase())}
                      placeholder="jane.wanjiku"
                      disabled={isSubmitting}
                      className="h-10"
                      autoComplete="username"
                    />
                    {usernameStatus === 'checking' && (
                      <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {usernameStatus === 'available' && (
                      <CheckCircle2 className="absolute right-3 top-2.5 h-4 w-4 text-green-600" />
                    )}
                    {usernameStatus === 'taken' && (
                      <AlertCircle className="absolute right-3 top-2.5 h-4 w-4 text-destructive" />
                    )}
                  </div>
                  {usernameStatus === 'taken' && (
                    <p className="text-xs text-destructive">This username is already taken</p>
                  )}
                  {validationErrors.username && usernameStatus !== 'taken' && (
                    <p className="text-xs text-destructive">{validationErrors.username}</p>
                  )}
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label htmlFor="phone_number" className="text-sm font-medium">
                    Phone Number <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <Input
                    id="phone_number"
                    value={formData.phone_number}
                    onChange={(e) => handleChange('phone_number', e.target.value)}
                    placeholder="+254 7XX XXX XXX"
                    disabled={isSubmitting}
                    className="h-10"
                  />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium">Password</label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => handleChange('password', e.target.value)}
                      placeholder="At least 8 characters"
                      disabled={isSubmitting}
                      className="h-10 pr-10"
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-10 w-10 text-muted-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {validationErrors.password && (
                    <p className="text-xs text-destructive">{validationErrors.password}</p>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label htmlFor="confirm_password" className="text-sm font-medium">Confirm Password</label>
                  <Input
                    id="confirm_password"
                    type="password"
                    value={formData.confirm_password}
                    onChange={(e) => handleChange('confirm_password', e.target.value)}
                    placeholder="Re-enter your password"
                    disabled={isSubmitting}
                    className="h-10"
                    autoComplete="new-password"
                  />
                  {validationErrors.confirm_password && (
                    <p className="text-xs text-destructive">{validationErrors.confirm_password}</p>
                  )}
                </div>

                <Button type="submit" className="w-full h-11" disabled={isSubmitting || usernameStatus === 'taken'}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Already have an account?{' '}
                  <a href="/login" className="text-foreground hover:underline">Sign in</a>
                </p>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
