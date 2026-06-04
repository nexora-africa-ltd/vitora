'use client';

import { useState, useEffect, useCallback } from 'react';
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
  MapPin,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { HelpPopover } from '@/components/shared/help-popover';
import { PasswordStrengthIndicator } from '@/components/shared/password-strength-indicator';
import { APP_NAME, API_BASE_URL } from '@/lib/utils/constants';
import { orgSignupApi } from '@/lib/api/onboarding';

// ─── Constants ───────────────────────────────────────────────────────────────

const FACILITY_LEVELS = [
  { value: '1', label: 'Level 1 – Community Unit' },
  { value: '2', label: 'Level 2 – Dispensary' },
  { value: '3', label: 'Level 3 – Health Centre' },
  { value: '4', label: 'Level 4 – Sub-County Hospital' },
  { value: '5', label: 'Level 5 – County Referral Hospital' },
  { value: '6', label: 'Level 6 – National Referral Hospital' },
];

const OWNERSHIP_TYPES = [
  { value: 'GOK', label: 'Government of Kenya' },
  { value: 'FBO', label: 'Faith-Based Organization' },
  { value: 'NGO', label: 'Non-Governmental Organization' },
  { value: 'PRIVATE', label: 'Private Practice' },
];

const OPERATING_MODES: { value: string; label: string; description: string }[] = [
  {
    value: 'FULL_HMIS',
    label: 'Full HMIS (hospital / clinic)',
    description: 'Complete clinical workflow: OPD, inpatient, pharmacy, lab, imaging, billing.',
  },
  {
    value: 'STANDALONE_LAB',
    label: 'Standalone Lab',
    description: 'Laboratory only — walk-ins, external orders, results. No clinical workflow.',
  },
  {
    value: 'STANDALONE_PHARMACY',
    label: 'Standalone Pharmacy',
    description: 'Retail / walk-in pharmacy. External prescription intake, OTC sales, billing.',
  },
  {
    value: 'STANDALONE_IMAGING',
    label: 'Standalone Imaging / Radiology Centre',
    description: 'Diagnostic imaging only — walk-ins, external referrals, reporting.',
  },
  {
    value: 'STANDALONE_DIAGNOSTIC',
    label: 'Standalone Diagnostic Centre (Lab + Imaging)',
    description: 'Combined lab and imaging diagnostics, no clinical inpatient workflow.',
  },
];

interface LocationOption {
  id: number;
  name: string;
}

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
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Location data
  const [counties, setCounties] = useState<LocationOption[]>([]);
  const [subCounties, setSubCounties] = useState<LocationOption[]>([]);
  const [loadingSubCounties, setLoadingSubCounties] = useState(false);

  const [formData, setFormData] = useState({
    org_name: '',
    admin_email: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_password: '',
    confirm_password: '',
    facility_name: '',
    facility_mfl_code: '',
    facility_county: '',
    facility_sub_county: '',
    facility_level: '3',
    facility_ownership: 'PRIVATE',
    facility_operating_mode: 'FULL_HMIS',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  // Load counties on mount
  useEffect(() => {
    async function loadCounties() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/locations/counties/`, {
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          setCounties(Array.isArray(data) ? data : data.results || []);
        }
      } catch {
        // Counties remain empty
      }
    }
    loadCounties();
  }, []);

  // Load sub-counties when county changes
  const loadSubCounties = useCallback(async (countyId: string) => {
    if (!countyId) {
      setSubCounties([]);
      return;
    }
    setLoadingSubCounties(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/locations/sub-counties/?county=${countyId}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        setSubCounties(Array.isArray(data) ? data : data.results || []);
      }
    } catch {
      setSubCounties([]);
    } finally {
      setLoadingSubCounties(false);
    }
  }, []);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleCountyChange = (value: string) => {
    handleChange('facility_county', value);
    handleChange('facility_sub_county', '');
    setSubCounties([]);
    loadSubCounties(value);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    // Organization
    if (!formData.org_name.trim()) errors.org_name = 'Organization name is required';
    // Facility
    if (!formData.facility_name.trim()) errors.facility_name = 'Facility name is required';
    if (!formData.facility_mfl_code.trim()) errors.facility_mfl_code = 'MFL code is required';
    if (!formData.facility_county) errors.facility_county = 'County is required';
    if (!formData.facility_sub_county) errors.facility_sub_county = 'Sub-county is required';
    // Admin
    if (!formData.admin_first_name.trim()) errors.admin_first_name = 'First name is required';
    if (!formData.admin_last_name.trim()) errors.admin_last_name = 'Last name is required';
    if (!formData.admin_email.trim()) errors.admin_email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email)) errors.admin_email = 'Invalid email';
    if (!formData.admin_password) {
      errors.admin_password = 'Password is required';
    } else {
      const pwd = formData.admin_password;
      if (pwd.length < 8) errors.admin_password = 'At least 8 characters';
      else if (!/[A-Z]/.test(pwd)) errors.admin_password = 'Must include an uppercase letter';
      else if (!/[a-z]/.test(pwd)) errors.admin_password = 'Must include a lowercase letter';
      else if (!/\d/.test(pwd)) errors.admin_password = 'Must include a number';
      else if (!/[^A-Za-z0-9]/.test(pwd)) errors.admin_password = 'Must include a special character';
      else if (/^\d+$/.test(pwd)) errors.admin_password = 'Password cannot be entirely numeric';
    }
    if (formData.admin_password !== formData.confirm_password) errors.confirm_password = 'Passwords do not match';
    if (!agreedToTerms) errors.agree_to_terms = 'You must agree to the Terms of Service and Privacy Policy';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await orgSignupApi.signup({
        ...formData,
        facility_county: Number(formData.facility_county),
        facility_sub_county: Number(formData.facility_sub_county),
        facility_operating_mode:
          formData.facility_operating_mode as
            | 'FULL_HMIS'
            | 'STANDALONE_LAB'
            | 'STANDALONE_PHARMACY'
            | 'STANDALONE_IMAGING'
            | 'STANDALONE_DIAGNOSTIC',
      });
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
                  Set up your organization, primary facility, and admin account.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="relative z-10">
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* ── Organization Section ──────────────────────────────── */}
                <fieldset className="space-y-3">
                  <legend className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Building2 className="h-4 w-4 text-primary" />
                    Organization
                    <HelpPopover content="The organization is the parent entity that manages one or more healthcare facilities. Think of it as the company or trust that operates your hospital(s)." />
                  </legend>

                  <div className="space-y-1.5">
                    <label htmlFor="org_name" className="text-sm font-medium">
                      Organization Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="org_name"
                      value={formData.org_name}
                      onChange={(e) => handleChange('org_name', e.target.value)}
                      placeholder="e.g., Afya Healthcare Ltd"
                      disabled={isSubmitting}
                      className={`h-10 ${validationErrors.org_name ? 'border-destructive' : ''}`}
                    />
                    {validationErrors.org_name && (
                      <p className="text-xs text-destructive">{validationErrors.org_name}</p>
                    )}
                  </div>
                </fieldset>

                {/* ── Facility Section ──────────────────────────────────── */}
                <fieldset className="space-y-3">
                  <legend className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <MapPin className="h-4 w-4 text-primary" />
                    Primary Facility
                    <HelpPopover content="A facility is a physical healthcare location (hospital, clinic, dispensary). Every organization needs at least one. The MFL code is assigned by Kenya's Master Health Facility List — find yours at kmhfl.health.go.ke." />
                  </legend>

                  {/* Facility name + MFL code */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="facility_name" className="text-sm font-medium">
                        Facility Name <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="facility_name"
                        value={formData.facility_name}
                        onChange={(e) => handleChange('facility_name', e.target.value)}
                        placeholder="e.g., Afya Main Hospital"
                        disabled={isSubmitting}
                        className={`h-10 ${validationErrors.facility_name ? 'border-destructive' : ''}`}
                      />
                      {validationErrors.facility_name && (
                        <p className="text-xs text-destructive">{validationErrors.facility_name}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="facility_mfl_code" className="flex items-center gap-1 text-sm font-medium">
                        MFL Code <span className="text-destructive">*</span>
                        <HelpPopover content="The 5-digit Master Facility List code assigned by the Ministry of Health. Find it at kmhfl.health.go.ke." />
                      </label>
                      <Input
                        id="facility_mfl_code"
                        value={formData.facility_mfl_code}
                        onChange={(e) => handleChange('facility_mfl_code', e.target.value)}
                        placeholder="e.g., 13080"
                        disabled={isSubmitting}
                        className={`h-10 ${validationErrors.facility_mfl_code ? 'border-destructive' : ''}`}
                      />
                      {validationErrors.facility_mfl_code && (
                        <p className="text-xs text-destructive">{validationErrors.facility_mfl_code}</p>
                      )}
                    </div>
                  </div>

                  {/* County + Sub-County */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="facility_county" className="text-sm font-medium">
                        County <span className="text-destructive">*</span>
                      </label>
                      <Select
                        value={formData.facility_county}
                        onValueChange={handleCountyChange}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="facility_county" className={`h-10 ${validationErrors.facility_county ? 'border-destructive' : ''}`}>
                          <SelectValue placeholder="Select county" />
                        </SelectTrigger>
                        <SelectContent>
                          {counties.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {validationErrors.facility_county && (
                        <p className="text-xs text-destructive">{validationErrors.facility_county}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="facility_sub_county" className="text-sm font-medium">
                        Sub-County <span className="text-destructive">*</span>
                      </label>
                      <Select
                        value={formData.facility_sub_county}
                        onValueChange={(v) => handleChange('facility_sub_county', v)}
                        disabled={isSubmitting || !formData.facility_county || loadingSubCounties}
                      >
                        <SelectTrigger id="facility_sub_county" className={`h-10 ${validationErrors.facility_sub_county ? 'border-destructive' : ''}`}>
                          <SelectValue placeholder={loadingSubCounties ? 'Loading...' : 'Select sub-county'} />
                        </SelectTrigger>
                        <SelectContent>
                          {subCounties.map((sc) => (
                            <SelectItem key={sc.id} value={String(sc.id)}>
                              {sc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {validationErrors.facility_sub_county && (
                        <p className="text-xs text-destructive">{validationErrors.facility_sub_county}</p>
                      )}
                    </div>
                  </div>

                  {/* Level + Ownership */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="facility_level" className="flex items-center gap-1 text-sm font-medium">
                        KEPH Level
                        <HelpPopover content="Kenya Essential Package for Health level. Ranges from Level 1 (community units) to Level 6 (national referral hospitals)." />
                      </label>
                      <Select
                        value={formData.facility_level}
                        onValueChange={(v) => handleChange('facility_level', v)}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="facility_level" className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FACILITY_LEVELS.map((l) => (
                            <SelectItem key={l.value} value={l.value}>
                              {l.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="facility_ownership" className="text-sm font-medium">
                        Ownership
                      </label>
                      <Select
                        value={formData.facility_ownership}
                        onValueChange={(v) => handleChange('facility_ownership', v)}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="facility_ownership" className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OWNERSHIP_TYPES.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Operating mode */}
                  <div className="space-y-1.5">
                    <label htmlFor="facility_operating_mode" className="flex items-center gap-1 text-sm font-medium">
                      What does this facility do?
                      <HelpPopover content="Standalone modes disable clinical workflow (inpatient, ER, triage) and enable only the chosen module + billing + inventory. You can change this later from facility settings." />
                    </label>
                    <Select
                      value={formData.facility_operating_mode}
                      onValueChange={(v) => handleChange('facility_operating_mode', v)}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="facility_operating_mode" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATING_MODES.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {OPERATING_MODES.find((m) => m.value === formData.facility_operating_mode)?.description}
                    </p>
                  </div>
                </fieldset>

                {/* ── Admin Account Section ─────────────────────────────── */}
                <fieldset className="space-y-3">
                  <legend className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Mail className="h-4 w-4 text-primary" />
                    Admin Account
                    <HelpPopover content="This is the first administrator account for your organization. You can invite more staff members after your organization is activated." />
                  </legend>

                  {/* Name */}
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
                      Email <span className="text-destructive">*</span>
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
                        placeholder="Min 8 chars, upper + lower + number + special"
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
                    {formData.admin_password && (
                      <PasswordStrengthIndicator password={formData.admin_password} />
                    )}
                  </div>
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
                </fieldset>

                {/* ── Terms & Privacy ──────────────────────────────── */}
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="agree_to_terms"
                      checked={agreedToTerms}
                      onCheckedChange={(checked) => {
                        setAgreedToTerms(checked === true);
                        if (validationErrors.agree_to_terms) {
                          setValidationErrors(prev => ({ ...prev, agree_to_terms: '' }));
                        }
                      }}
                      disabled={isSubmitting}
                      className={`mt-0.5 ${validationErrors.agree_to_terms ? 'border-destructive' : ''}`}
                    />
                    <label htmlFor="agree_to_terms" className="text-sm leading-snug text-muted-foreground cursor-pointer">
                      I agree to the{' '}
                      <a
                        href="https://vitora.nexora.africa/legal/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:text-primary/80"
                      >
                        Terms of Service
                      </a>{' '}
                      and{' '}
                      <a
                        href="https://vitora.nexora.africa/legal/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:text-primary/80"
                      >
                        Privacy Policy
                      </a>
                    </label>
                  </div>
                  {validationErrors.agree_to_terms && (
                    <p className="text-xs text-destructive">{validationErrors.agree_to_terms}</p>
                  )}
                </div>

                <Button type="submit" className="w-full h-11" disabled={isSubmitting || !agreedToTerms}>
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
