'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  Hospital,
  UserCog,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { APP_NAME, API_BASE_URL } from '@/lib/utils/constants';
import { setupApi } from '@/lib/api/onboarding';

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
    description: 'Laboratory only - walk-ins, external orders, results. No clinical workflow.',
  },
  {
    value: 'STANDALONE_PHARMACY',
    label: 'Standalone Pharmacy',
    description: 'Retail/walk-in pharmacy. External prescription intake, OTC sales, billing.',
  },
  {
    value: 'STANDALONE_IMAGING',
    label: 'Standalone Imaging / Radiology Centre',
    description: 'Diagnostic imaging only - walk-ins, external referrals, reporting.',
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

interface CountryOption {
  code: string;
  name: string;
}

type Step = 'org' | 'facility' | 'admin';

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'org', label: 'Organization', icon: Building2 },
  { key: 'facility', label: 'Facility', icon: Hospital },
  { key: 'admin', label: 'Admin Account', icon: UserCog },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function SetupWizardPage() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Gate: check if setup is needed
  const [checking, setChecking] = useState(true);
  const [setupAllowed, setSetupAllowed] = useState(false);

  // Steps
  const [step, setStep] = useState<Step>('org');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ org_name: string; username: string } | null>(null);

  // Location data
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [counties, setCounties] = useState<LocationOption[]>([]);
  const [subCounties, setSubCounties] = useState<LocationOption[]>([]);
  const [loadingSubCounties, setLoadingSubCounties] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    // Org
    org_name: '',
    org_contact_email: '',
    org_contact_phone: '',
    // Facility
    facility_name: '',
    facility_country: 'KE',
    facility_mfl_code: '',
    facility_registry_code: '',
    facility_region_state: '',
    facility_district: '',
    facility_locality: '',
    facility_level: '',
    facility_ownership: 'PRIVATE',
    facility_county: '',
    facility_sub_county: '',
    facility_operating_mode: 'FULL_HMIS',
    // Admin
    admin_username: '',
    admin_email: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_password: '',
    confirm_password: '',
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const isKenyaSelected = formData.facility_country === 'KE';
  const isStandaloneMode = formData.facility_operating_mode !== 'FULL_HMIS';

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  // Check if setup is required
  useEffect(() => {
    async function check() {
      try {
        const result = await setupApi.check();
        if (!result.setup_required) {
          // Setup already done — go to dashboard if authenticated, login otherwise
          router.replace('/dashboard');
          return;
        }
        setSetupAllowed(true);
      } catch {
        // If check fails, redirect to dashboard (let proxy handle auth)
        router.replace('/dashboard');
      } finally {
        setChecking(false);
      }
    }
    check();
  }, [router]);

  useEffect(() => {
    if (!setupAllowed) return;
    async function loadCountries() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/locations/countries/`, {
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          setCountries(Array.isArray(data) ? data : data.results || []);
        }
      } catch {
        setCountries([]);
      }
    }
    loadCountries();
  }, [setupAllowed]);

  // Load counties (public endpoint not available, use raw fetch)
  useEffect(() => {
    if (!setupAllowed || !isKenyaSelected) {
      setCounties([]);
      return;
    }
    async function loadCounties() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/locations/counties/?country=KE`, {
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          setCounties(Array.isArray(data) ? data : data.results || []);
        }
      } catch {
        // Counties will remain empty — user will see empty dropdown
      }
    }
    loadCounties();
  }, [setupAllowed, isKenyaSelected]);

  // Load sub-counties when county changes
  const loadSubCounties = useCallback(async (countyId: string) => {
    if (!countyId) {
      setSubCounties([]);
      return;
    }
    setLoadingSubCounties(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/locations/sub-counties/?county=${countyId}`, {
        headers: { 'Content-Type': 'application/json' },
      });
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
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleCountyChange = (value: string) => {
    handleChange('facility_county', value);
    handleChange('facility_sub_county', '');
    setSubCounties([]);
    loadSubCounties(value);
  };

  const handleCountryChange = (value: string) => {
    handleChange('facility_country', value);
    handleChange('facility_county', '');
    handleChange('facility_sub_county', '');
    setSubCounties([]);
  };

  const buildStandaloneMflCode = () => {
    const modeToken = formData.facility_operating_mode.replace('STANDALONE_', '').slice(0, 3);
    const randomToken = Math.random().toString(36).slice(2, 9).toUpperCase();
    return `ST-${modeToken}-${randomToken}`;
  };

  // ─── Validation per step ──────────────────────────────────────────────────

  const validateOrg = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.org_name.trim()) errors.org_name = 'Organization name is required';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateFacility = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.facility_name.trim()) errors.facility_name = 'Facility name is required';
    if (isKenyaSelected) {
      if (!formData.facility_county) errors.facility_county = 'County is required';
      if (!formData.facility_sub_county) errors.facility_sub_county = 'Sub-county is required';
    } else {
      if (!formData.facility_registry_code.trim()) {
        errors.facility_registry_code = 'Facility registry code is required';
      }
      if (!formData.facility_region_state.trim()) {
        errors.facility_region_state = 'State/region is required';
      }
      if (!formData.facility_locality.trim()) {
        errors.facility_locality = 'City/locality is required';
      }
    }
    if (isKenyaSelected && !isStandaloneMode) {
      if (!formData.facility_mfl_code.trim()) errors.facility_mfl_code = 'MFL code is required';
      if (!formData.facility_level) errors.facility_level = 'Facility level is required';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateAdmin = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.admin_username.trim()) errors.admin_username = 'Username is required';
    if (!formData.admin_first_name.trim()) errors.admin_first_name = 'First name is required';
    if (!formData.admin_last_name.trim()) errors.admin_last_name = 'Last name is required';
    if (!formData.admin_email.trim()) errors.admin_email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email))
      errors.admin_email = 'Invalid email';
    if (!formData.admin_password) errors.admin_password = 'Password is required';
    else if (formData.admin_password.length < 8) errors.admin_password = 'At least 8 characters';
    if (formData.admin_password !== formData.confirm_password)
      errors.confirm_password = 'Passwords do not match';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    setError(null);
    if (step === 'org' && validateOrg()) setStep('facility');
    else if (step === 'facility' && validateFacility()) setStep('admin');
  };

  const handleBack = () => {
    setError(null);
    setValidationErrors({});
    if (step === 'facility') setStep('org');
    else if (step === 'admin') setStep('facility');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateAdmin()) return;

    setIsSubmitting(true);
    try {
      const facilityMflCode = isStandaloneMode
        ? formData.facility_mfl_code.trim() || buildStandaloneMflCode()
        : formData.facility_mfl_code.trim();

      const payload = {
        org_name: formData.org_name,
        org_contact_email: formData.org_contact_email || undefined,
        org_contact_phone: formData.org_contact_phone || undefined,
        facility_name: formData.facility_name,
        facility_mfl_code: facilityMflCode,
        facility_registry_code: formData.facility_registry_code || undefined,
        facility_region_state: formData.facility_region_state || undefined,
        facility_district: formData.facility_district || undefined,
        facility_locality: formData.facility_locality || undefined,
        facility_level: (isKenyaSelected
          ? formData.facility_level
          : undefined) as '1' | '2' | '3' | '4' | '5' | '6' | undefined,
        facility_ownership: (formData.facility_ownership || undefined) as
          | 'GOK'
          | 'FBO'
          | 'NGO'
          | 'PRIVATE'
          | undefined,
        facility_operating_mode: formData.facility_operating_mode as
          | 'FULL_HMIS'
          | 'STANDALONE_LAB'
          | 'STANDALONE_PHARMACY'
          | 'STANDALONE_IMAGING'
          | 'STANDALONE_DIAGNOSTIC',
        facility_county: isKenyaSelected ? Number(formData.facility_county) : undefined,
        facility_sub_county: isKenyaSelected ? Number(formData.facility_sub_county) : undefined,
        admin_username: formData.admin_username,
        admin_email: formData.admin_email,
        admin_first_name: formData.admin_first_name,
        admin_last_name: formData.admin_last_name,
        admin_password: formData.admin_password,
        confirm_password: formData.confirm_password,
      };
      const result = await setupApi.initialize(payload);
      setSuccess({ org_name: result.org_name, username: result.username });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────

  const fieldError = (field: string) =>
    validationErrors[field] ? (
      <p className="text-xs text-destructive">{validationErrors[field]}</p>
    ) : null;

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  // ─── Loading / gate ────────────────────────────────────────────────────────

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!setupAllowed) return null;

  // ─── Success ───────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background p-4 sm:p-8">
        <Card className="relative w-full max-w-md overflow-hidden border-brand-burgundy-200 shadow-lg dark:border-muted/30">
          {mounted && (
            <VitoraLogo
              variant="icon"
              tone={isDark ? 'white' : 'teal'}
              alt=""
              className="pointer-events-none absolute left-1/2 top-1/2 w-[52%] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.03]"
              imageClassName="pointer-events-none select-none"
            />
          )}
          <CardContent className="relative z-10 flex flex-col items-center justify-center gap-4 py-16">
            <div className="rounded-full bg-green-500/10 p-3">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="max-w-xs space-y-2 text-center">
              <p className="text-lg font-semibold">Setup Complete!</p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{success.org_name}</span> has been
                created successfully.
              </p>
              <p className="text-sm text-muted-foreground">
                Sign in with username{' '}
                <span className="font-mono font-medium text-foreground">{success.username}</span>{' '}
                and the password you just created.
              </p>
            </div>
            <Button onClick={() => router.push('/login')} className="w-full max-w-xs">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Wizard form ───────────────────────────────────────────────────────────

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 sm:p-8">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 z-10"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>

      <Card className="relative w-full max-w-lg overflow-hidden border-brand-burgundy-200 shadow-lg dark:border-muted/30">
        {mounted && (
          <VitoraLogo
            variant="icon"
            tone={isDark ? 'white' : 'teal'}
            alt=""
            className="pointer-events-none absolute left-1/2 top-1/2 w-[52%] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.03]"
            imageClassName="pointer-events-none select-none"
          />
        )}

        <CardHeader className="relative z-10 space-y-4 text-center">
          <div className="mx-auto">
            <VitoraLogo tone={isDark ? 'light' : 'dark'} alt={APP_NAME} className="w-36" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold">System Setup</CardTitle>
            <CardDescription className="mt-2">
              Set up your organization, facility, and administrator account.
            </CardDescription>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = s.key === step;
              const isCompleted = i < stepIndex;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  {i > 0 && (
                    <div
                      className={`h-px w-6 sm:w-10 ${
                        isCompleted ? 'bg-primary' : 'bg-muted-foreground/20'
                      }`}
                    />
                  )}
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : isCompleted
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="relative z-10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step === 'admin') handleSubmit(e);
              else handleNext();
            }}
            className="space-y-4"
          >
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ─── Step 1: Organization ──────────────────────────────────── */}
            {step === 'org' && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="org_name" className="text-sm font-medium">
                    Organization Name <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="org_name"
                      value={formData.org_name}
                      onChange={(e) => handleChange('org_name', e.target.value)}
                      placeholder="e.g., Kenyatta National Hospital"
                      className={`h-10 pl-9 ${validationErrors.org_name ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {fieldError('org_name')}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="org_contact_email" className="text-sm font-medium">
                    Contact Email
                  </label>
                  <Input
                    id="org_contact_email"
                    type="email"
                    value={formData.org_contact_email}
                    onChange={(e) => handleChange('org_contact_email', e.target.value)}
                    placeholder="info@hospital.co.ke"
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="org_contact_phone" className="text-sm font-medium">
                    Contact Phone
                  </label>
                  <Input
                    id="org_contact_phone"
                    value={formData.org_contact_phone}
                    onChange={(e) => handleChange('org_contact_phone', e.target.value)}
                    placeholder="+254 7XX XXX XXX"
                    className="h-10"
                  />
                </div>
              </>
            )}

            {/* ─── Step 2: Facility ──────────────────────────────────────── */}
            {step === 'facility' && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="facility_name" className="text-sm font-medium">
                    Facility Name <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Hospital className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="facility_name"
                      value={formData.facility_name}
                      onChange={(e) => handleChange('facility_name', e.target.value)}
                      placeholder="e.g., Main Hospital"
                      className={`h-10 pl-9 ${validationErrors.facility_name ? 'border-destructive' : ''}`}
                    />
                  </div>
                  {fieldError('facility_name')}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Operating Mode</label>
                  <Select
                    value={formData.facility_operating_mode}
                    onValueChange={(v) => handleChange('facility_operating_mode', v)}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATING_MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {
                      OPERATING_MODES.find((mode) => mode.value === formData.facility_operating_mode)
                        ?.description
                    }
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Country <span className="text-destructive">*</span>
                    </label>
                    <SearchableSelect
                      value={formData.facility_country}
                      onValueChange={handleCountryChange}
                      options={countries.map((country) => ({
                        value: country.code,
                        label: country.name,
                        sublabel: country.code,
                      }))}
                      placeholder="Select country"
                      searchPlaceholder="Search countries..."
                      emptyMessage="No countries found."
                      className={`h-10 ${validationErrors.facility_country ? 'border-destructive' : ''}`}
                    />
                    {fieldError('facility_country')}
                  </div>
                </div>

                {isKenyaSelected ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        County <span className="text-destructive">*</span>
                      </label>
                      <Select value={formData.facility_county} onValueChange={handleCountyChange}>
                        <SelectTrigger
                          className={`h-10 ${validationErrors.facility_county ? 'border-destructive' : ''}`}
                        >
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
                      {fieldError('facility_county')}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Sub-County <span className="text-destructive">*</span>
                      </label>
                      <Select
                        value={formData.facility_sub_county}
                        onValueChange={(v) => handleChange('facility_sub_county', v)}
                        disabled={!formData.facility_county || loadingSubCounties}
                      >
                        <SelectTrigger
                          className={`h-10 ${validationErrors.facility_sub_county ? 'border-destructive' : ''}`}
                        >
                          <SelectValue
                            placeholder={loadingSubCounties ? 'Loading...' : 'Select sub-county'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {subCounties.map((sc) => (
                            <SelectItem key={sc.id} value={String(sc.id)}>
                              {sc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldError('facility_sub_county')}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="facility_registry_code" className="text-sm font-medium">
                        Facility Registry Code <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="facility_registry_code"
                        value={formData.facility_registry_code}
                        onChange={(e) => handleChange('facility_registry_code', e.target.value)}
                        placeholder="e.g., UG-HF-001"
                        className={`h-10 ${validationErrors.facility_registry_code ? 'border-destructive' : ''}`}
                      />
                      {fieldError('facility_registry_code')}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="facility_region_state" className="text-sm font-medium">
                          State/Region <span className="text-destructive">*</span>
                        </label>
                        <Input
                          id="facility_region_state"
                          value={formData.facility_region_state}
                          onChange={(e) => handleChange('facility_region_state', e.target.value)}
                          placeholder="e.g., Central Region"
                          className={`h-10 ${validationErrors.facility_region_state ? 'border-destructive' : ''}`}
                        />
                        {fieldError('facility_region_state')}
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="facility_district" className="text-sm font-medium">
                          District
                        </label>
                        <Input
                          id="facility_district"
                          value={formData.facility_district}
                          onChange={(e) => handleChange('facility_district', e.target.value)}
                          placeholder="e.g., Wakiso"
                          className="h-10"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="facility_locality" className="text-sm font-medium">
                        City/Locality <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="facility_locality"
                        value={formData.facility_locality}
                        onChange={(e) => handleChange('facility_locality', e.target.value)}
                        placeholder="e.g., Kampala"
                        className={`h-10 ${validationErrors.facility_locality ? 'border-destructive' : ''}`}
                      />
                      {fieldError('facility_locality')}
                    </div>
                  </>
                )}

                {isKenyaSelected && !isStandaloneMode && (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="facility_mfl_code" className="text-sm font-medium">
                        MFL Code <span className="text-destructive">*</span>
                      </label>
                      <Input
                        id="facility_mfl_code"
                        value={formData.facility_mfl_code}
                        onChange={(e) => handleChange('facility_mfl_code', e.target.value)}
                        placeholder="e.g., 12345"
                        className={`h-10 ${validationErrors.facility_mfl_code ? 'border-destructive' : ''}`}
                      />
                      {fieldError('facility_mfl_code')}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                          KEPH Level <span className="text-destructive">*</span>
                        </label>
                        <Select
                          value={formData.facility_level}
                          onValueChange={(v) => handleChange('facility_level', v)}
                        >
                          <SelectTrigger
                            className={`h-10 ${validationErrors.facility_level ? 'border-destructive' : ''}`}
                          >
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                          <SelectContent>
                            {FACILITY_LEVELS.map((l) => (
                              <SelectItem key={l.value} value={l.value}>
                                {l.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldError('facility_level')}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Ownership</label>
                        <Select
                          value={formData.facility_ownership}
                          onValueChange={(v) => handleChange('facility_ownership', v)}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select type" />
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
                  </>
                )}
              </>
            )}

            {/* ─── Step 3: Admin Account ─────────────────────────────────── */}
            {step === 'admin' && (
              <>
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
                    {fieldError('admin_first_name')}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="admin_last_name" className="text-sm font-medium">
                      Last Name <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="admin_last_name"
                      value={formData.admin_last_name}
                      onChange={(e) => handleChange('admin_last_name', e.target.value)}
                      placeholder="Doe"
                      disabled={isSubmitting}
                      className={`h-10 ${validationErrors.admin_last_name ? 'border-destructive' : ''}`}
                    />
                    {fieldError('admin_last_name')}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="admin_username" className="text-sm font-medium">
                    Username <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="admin_username"
                    value={formData.admin_username}
                    onChange={(e) => handleChange('admin_username', e.target.value)}
                    placeholder="admin"
                    disabled={isSubmitting}
                    className={`h-10 ${validationErrors.admin_username ? 'border-destructive' : ''}`}
                    autoComplete="username"
                  />
                  {fieldError('admin_username')}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="admin_email" className="text-sm font-medium">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="admin_email"
                    type="email"
                    value={formData.admin_email}
                    onChange={(e) => handleChange('admin_email', e.target.value)}
                    placeholder="admin@hospital.co.ke"
                    disabled={isSubmitting}
                    className={`h-10 ${validationErrors.admin_email ? 'border-destructive' : ''}`}
                    autoComplete="email"
                  />
                  {fieldError('admin_email')}
                </div>

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
                  {fieldError('admin_password')}
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
                  {fieldError('confirm_password')}
                </div>
              </>
            )}

            {/* ─── Navigation buttons ────────────────────────────────────── */}
            <div className="flex gap-3 pt-2">
              {step !== 'org' && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={handleBack}
                  disabled={isSubmitting}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
              )}
              {step !== 'admin' ? (
                <Button type="submit" className="h-11 flex-1">
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" className="h-11 flex-1" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    'Complete Setup'
                  )}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
