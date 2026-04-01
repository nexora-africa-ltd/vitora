'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import {
  Eye,
  EyeOff,
  Loader2,
  Sun,
  Moon,
  AlertCircle,
  Mail,
  Building2,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { APP_NAME } from '@/lib/utils/constants';
import { orgSignupApi } from '@/lib/api/onboarding';

type PageState = 'form' | 'success';

export default function SignupPage() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pageState, setPageState] = useState<PageState>('form');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [submittedUsername, setSubmittedUsername] = useState('');

  const [formData, setFormData] = useState({
    org_name: '',
    admin_email: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_password: '',
    confirm_password: '',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.org_name.trim()) errors.org_name = 'Organization name is required';
    if (!formData.admin_first_name.trim()) errors.admin_first_name = 'First name is required';
    if (!formData.admin_last_name.trim()) errors.admin_last_name = 'Last name is required';
    if (!formData.admin_email.trim()) errors.admin_email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email)) errors.admin_email = 'Invalid email';
    if (!formData.admin_password) errors.admin_password = 'Password is required';
    else if (formData.admin_password.length < 8) errors.admin_password = 'At least 8 characters';
    if (formData.admin_password !== formData.confirm_password) errors.confirm_password = 'Passwords do not match';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await orgSignupApi.signup(formData);
      setSubmittedEmail(formData.admin_email);
      setSubmittedUsername(result.username);
      setPageState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
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

        {pageState === 'success' ? (
          <CardContent className="relative z-10 flex flex-col items-center justify-center py-16 gap-4">
            <div className="rounded-full bg-blue-500/10 p-3">
              <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-center space-y-2 max-w-xs">
              <p className="text-lg font-semibold">Check Your Email</p>
              <p className="text-sm text-muted-foreground">
                We&apos;ve sent a verification link to <span className="font-medium text-foreground">{submittedEmail}</span>.
              </p>
              {submittedUsername && (
                <p className="text-sm text-muted-foreground">
                  Your username is <span className="font-mono font-medium text-foreground">{submittedUsername}</span>
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                After verifying your email, a Nexora administrator will review and activate your organization.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button onClick={() => router.push('/login')}>
                Go to Login
              </Button>
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
                <CardTitle className="text-xl font-bold">Register Your Organization</CardTitle>
                <CardDescription className="mt-2">
                  Create an organization account and set up your admin profile.
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

                {/* Organization name */}
                <div className="space-y-1.5">
                  <label htmlFor="org_name" className="text-sm font-medium">
                    Organization Name <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="org_name"
                      value={formData.org_name}
                      onChange={(e) => handleChange('org_name', e.target.value)}
                      placeholder="e.g., Kenyatta National Hospital"
                      disabled={isSubmitting}
                      className={`h-10 pl-9 ${validationErrors.org_name ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {validationErrors.org_name && (
                    <p className="text-xs text-destructive">{validationErrors.org_name}</p>
                  )}
                </div>

                {/* Admin name */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="admin_first_name" className="text-sm font-medium">
                      First Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="admin_first_name"
                      value={formData.admin_first_name}
                      onChange={(e) => handleChange('admin_first_name', e.target.value)}
                      placeholder="Jane"
                      disabled={isSubmitting}
                      className={`h-10 ${validationErrors.admin_first_name ? 'border-destructive' : ''}`}
                    />
                    {validationErrors.admin_first_name && (
                      <p className="text-xs text-destructive">{validationErrors.admin_first_name}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="admin_last_name" className="text-sm font-medium">
                      Last Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="admin_last_name"
                      value={formData.admin_last_name}
                      onChange={(e) => handleChange('admin_last_name', e.target.value)}
                      placeholder="Wanjiku"
                      disabled={isSubmitting}
                      className={`h-10 ${validationErrors.admin_last_name ? 'border-destructive' : ''}`}
                    />
                    {validationErrors.admin_last_name && (
                      <p className="text-xs text-destructive">{validationErrors.admin_last_name}</p>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label htmlFor="admin_email" className="text-sm font-medium">
                    Admin Email <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="admin_email"
                      type="email"
                      value={formData.admin_email}
                      onChange={(e) => handleChange('admin_email', e.target.value)}
                      placeholder="admin@hospital.co.ke"
                      disabled={isSubmitting}
                      className={`h-10 pl-9 ${validationErrors.admin_email ? 'border-destructive' : ''}`}
                      autoComplete="email"
                    />
                  </div>
                  {validationErrors.admin_email && (
                    <p className="text-xs text-destructive">{validationErrors.admin_email}</p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label htmlFor="admin_password" className="text-sm font-medium">
                    Password <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      id="admin_password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.admin_password}
                      onChange={(e) => handleChange('admin_password', e.target.value)}
                      placeholder="At least 8 characters"
                      disabled={isSubmitting}
                      className={`h-10 pr-10 ${validationErrors.admin_password ? 'border-destructive' : ''}`}
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
                  {validationErrors.admin_password && (
                    <p className="text-xs text-destructive">{validationErrors.admin_password}</p>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label htmlFor="confirm_password" className="text-sm font-medium">
                    Confirm Password <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="confirm_password"
                    type="password"
                    value={formData.confirm_password}
                    onChange={(e) => handleChange('confirm_password', e.target.value)}
                    placeholder="Re-enter your password"
                    disabled={isSubmitting}
                    className={`h-10 ${validationErrors.confirm_password ? 'border-destructive' : ''}`}
                    autoComplete="new-password"
                  />
                  {validationErrors.confirm_password && (
                    <p className="text-xs text-destructive">{validationErrors.confirm_password}</p>
                  )}
                </div>

                <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating organization...
                    </>
                  ) : (
                    'Create Organization'
                  )}
                </Button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Already have an account? Sign in
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
