'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Building2,
  Stethoscope,
  Users,
  ArrowRight,
  ArrowLeft,
  LogOut,
  Settings2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { onboardingChecklistApi } from '@/lib/api/onboarding';
import { facilitiesApi } from '@/lib/api/facilities';
import { clinicsApi } from '@/lib/api/clinics';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { VitoraLogo } from '@/components/ui/vitora-logo';
import { AnimatedThemeToggle } from '@/components/ui/animated-theme-toggle';
import { useCounties, useSubCounties, useWards } from '@/lib/hooks/use-locations';
import type { FacilityLevel, FacilityOwnership, FacilityDetail } from '@/lib/types/facility';

// =============================================================================
// Constants
// =============================================================================

const KEPH_LEVELS: { value: FacilityLevel; label: string }[] = [
  { value: '1', label: 'Level 1 — Community' },
  { value: '2', label: 'Level 2 — Dispensary / Clinic' },
  { value: '3', label: 'Level 3 — Health Centre' },
  { value: '4', label: 'Level 4 — Sub-County Hospital' },
  { value: '5', label: 'Level 5 — County Referral Hospital' },
  { value: '6', label: 'Level 6 — National Referral Hospital' },
];

const OWNERSHIP_OPTIONS: { value: FacilityOwnership; label: string }[] = [
  { value: 'GOK', label: 'Government of Kenya' },
  { value: 'FBO', label: 'Faith-Based Organization' },
  { value: 'NGO', label: 'Non-Governmental Organization' },
  { value: 'PRIVATE', label: 'Private' },
];

const MODULE_GROUPS = [
  {
    title: 'Clinical',
    modules: [
      { key: 'has_outpatient', label: 'Outpatient (OPD)' },
      { key: 'has_inpatient', label: 'Inpatient (IPD)' },
      { key: 'has_emergency', label: 'Emergency' },
      { key: 'has_triage', label: 'Triage' },
      { key: 'has_theatre', label: 'Theatre / Surgery' },
    ],
  },
  {
    title: 'Diagnostics & Pharmacy',
    modules: [
      { key: 'has_laboratory', label: 'Laboratory' },
      { key: 'has_radiology', label: 'Radiology / Imaging' },
      { key: 'has_pharmacy', label: 'Pharmacy' },
    ],
  },
  {
    title: 'Specialized',
    modules: [
      { key: 'has_mch', label: 'MCH / Maternity' },
      { key: 'has_dental', label: 'Dental' },
      { key: 'has_physiotherapy', label: 'Physiotherapy' },
      { key: 'has_nutrition', label: 'Nutrition' },
      { key: 'has_mental_health', label: 'Mental Health' },
    ],
  },
  {
    title: 'Support',
    modules: [
      { key: 'has_billing', label: 'Billing & Invoicing' },
      { key: 'has_inventory', label: 'Inventory / Stores' },
      { key: 'has_scheduling', label: 'Staff Scheduling' },
    ],
  },
];

type WizardStep = 'facility' | 'modules' | 'clinic' | 'invite';

const WIZARD_STEPS: { key: WizardStep; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'facility', label: 'Facility', icon: Building2 },
  { key: 'modules', label: 'Modules', icon: Settings2 },
  { key: 'clinic', label: 'Clinic', icon: Stethoscope },
  { key: 'invite', label: 'Team', icon: Users },
];

// =============================================================================
// Main Page
// =============================================================================

export default function OnboardingPage() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('facility');
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track which steps are done
  const [stepsStatus, setStepsStatus] = useState<Record<string, boolean>>({
    facility: false,
    modules: false,
    clinic: false,
    invite: false,
  });

  // Facility form state
  const [facilityName, setFacilityName] = useState('');
  const [mflCode, setMflCode] = useState('');
  const [level, setLevel] = useState<FacilityLevel | ''>('');
  const [ownership, setOwnership] = useState<FacilityOwnership | ''>('');
  const [countyId, setCountyId] = useState<number | undefined>();
  const [subCountyId, setSubCountyId] = useState<number | undefined>();
  const [wardId, setWardId] = useState<number | undefined>();
  const [shaContracted, setShaContracted] = useState(true);
  const [shaFacilityCode, setShaFacilityCode] = useState('');
  const [isSavingFacility, setIsSavingFacility] = useState(false);
  const [createdFacility, setCreatedFacility] = useState<FacilityDetail | null>(null);

  // Module state
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>({
    has_outpatient: true,
    has_triage: true,
    has_billing: true,
  });
  const [isSavingModules, setIsSavingModules] = useState(false);

  // Clinic state
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ created: { code: string; name: string }[]; total: number } | null>(null);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [isInviting, setIsInviting] = useState(false);

  // Completion state
  const [isCompleting, setIsCompleting] = useState(false);

  // Locations
  const { data: counties } = useCounties();
  const { data: subCounties } = useSubCounties(countyId);
  const { data: wards } = useWards(subCountyId);

  // Check existing onboarding status
  const fetchStatus = useCallback(async () => {
    try {
      const data = await onboardingChecklistApi.getStatus();
      if (data.complete) {
        setIsComplete(true);
        router.push('/dashboard');
        return;
      }
      // Map backend steps to wizard steps
      const stepMap: Record<string, WizardStep> = {
        facility_modules: 'modules',
        first_clinic: 'clinic',
        invite_staff: 'invite',
      };
      const newStatus: Record<string, boolean> = {
        facility: false,
        modules: false,
        clinic: false,
        invite: false,
      };
      for (const step of data.steps) {
        const wizardKey = stepMap[step.key];
        if (wizardKey && step.done) {
          newStatus[wizardKey] = true;
        }
      }

      // Check if org already has a facility — if so, mark facility done
      try {
        const facilities = await facilitiesApi.myFacilities();
        if (facilities.length > 0) {
          newStatus.facility = true;
          setCreatedFacility(facilities[0] as FacilityDetail);
        }
      } catch {
        // Ignore — start from facility step
      }

      setStepsStatus(newStatus);

      // Jump to first incomplete step
      if (newStatus.facility && !newStatus.modules) setCurrentStep('modules');
      else if (newStatus.facility && newStatus.modules && !newStatus.clinic) setCurrentStep('clinic');
      else if (newStatus.facility && newStatus.modules && newStatus.clinic) setCurrentStep('invite');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load onboarding status');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatus();
    }
  }, [isAuthenticated, fetchStatus]);

  // Step navigation
  const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === currentStep);
  const canGoBack = stepIndex > 0;
  const canGoForward = stepIndex < WIZARD_STEPS.length - 1;

  const goBack = () => {
    const prev = WIZARD_STEPS[stepIndex - 1];
    if (canGoBack && prev) setCurrentStep(prev.key);
  };
  const goForward = () => {
    const next = WIZARD_STEPS[stepIndex + 1];
    if (canGoForward && next) setCurrentStep(next.key);
  };

  // ==========================================================================
  // Facility creation
  // ==========================================================================

  const facilityValid = facilityName.trim() && mflCode.trim() && level && ownership && countyId && subCountyId;

  const handleCreateFacility = async () => {
    if (!facilityValid) return;
    setIsSavingFacility(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: facilityName.trim(),
        mfl_code: mflCode.trim(),
        level,
        ownership,
        county: countyId,
        sub_county: subCountyId,
        ...(wardId ? { ward: wardId } : {}),
        sha_contracted: shaContracted,
        ...(shaFacilityCode ? { sha_facility_code: shaFacilityCode } : {}),
        is_active: true,
      };
      const facility = await facilitiesApi.create(payload as any);
      setCreatedFacility(facility);
      setStepsStatus((prev) => ({ ...prev, facility: true }));
      goForward();
    } catch (err: any) {
      const detail = err?.response?.data;
      if (detail && typeof detail === 'object') {
        const messages = Object.entries(detail)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('; ');
        setError(messages);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create facility');
      }
    } finally {
      setIsSavingFacility(false);
    }
  };

  // ==========================================================================
  // Module configuration
  // ==========================================================================

  const handleToggleModule = (key: string) => {
    setEnabledModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveModules = async () => {
    if (!createdFacility) return;
    setIsSavingModules(true);
    setError(null);
    try {
      await facilitiesApi.update(createdFacility.id, enabledModules as any);
      setStepsStatus((prev) => ({ ...prev, modules: true }));
      goForward();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save module configuration');
    } finally {
      setIsSavingModules(false);
    }
  };

  // ==========================================================================
  // Clinic seeding
  // ==========================================================================

  const handleSeedClinics = async () => {
    setIsSeeding(true);
    setError(null);
    try {
      const result = await clinicsApi.seedDefaults();
      setSeedResult(result);
      setStepsStatus((prev) => ({ ...prev, clinic: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create default clinics');
    } finally {
      setIsSeeding(false);
    }
  };

  // ==========================================================================
  // Staff invitation
  // ==========================================================================

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !createdFacility?.organization) return;
    setIsInviting(true);
    setError(null);
    try {
      const { invitationsApi } = await import('@/lib/api/onboarding');
      await invitationsApi.create({
        email: inviteEmail.trim(),
        organization: createdFacility.organization,
        facility: createdFacility.id,
      });
      setInvitedEmails((prev) => [...prev, inviteEmail.trim()]);
      setInviteEmail('');
      setStepsStatus((prev) => ({ ...prev, invite: true }));
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.email;
      setError(typeof detail === 'string' ? detail : err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  // ==========================================================================
  // Complete onboarding
  // ==========================================================================

  const handleComplete = async () => {
    setIsCompleting(true);
    setError(null);
    try {
      await onboardingChecklistApi.markComplete();
      try {
        const stored = JSON.parse(localStorage.getItem('vitora_user') || '{}');
        stored.onboarding_complete = true;
        localStorage.setItem('vitora_user', JSON.stringify(stored));
      } catch { /* best-effort */ }
      sessionStorage.removeItem('vitora_onboarding_banner_dismissed');
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
    } finally {
      setIsCompleting(false);
    }
  };

  // ==========================================================================
  // Render guards
  // ==========================================================================

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isComplete) return null;

  const allDone = stepsStatus.facility && stepsStatus.modules && stepsStatus.clinic;

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="relative flex min-h-screen flex-col items-center bg-background px-4 py-6 sm:py-10">
      <AnimatedThemeToggle className="absolute top-4 right-4 z-50" />

      {/* Header */}
      <div className="mb-6 text-center">
        <VitoraLogo tone="dark" alt="Vitora HMIS" className="mx-auto mb-4 w-28 dark:hidden" priority />
        <VitoraLogo tone="light" alt="Vitora HMIS" className="mx-auto mb-4 hidden w-28 dark:block" priority />
        <h1 className="text-xl font-bold sm:text-2xl">
          Set up your organization
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Let&apos;s get {user?.first_name ? `${user.first_name}'s` : 'your'} facility ready.
        </p>
      </div>

      {/* Step indicators */}
      <div className="mb-6 flex w-full max-w-lg items-center justify-center gap-1 sm:gap-2">
        {WIZARD_STEPS.map((step) => {
          const Icon = step.icon;
          const isActive = step.key === currentStep;
          const isDone = stepsStatus[step.key];
          return (
            <button
              key={step.key}
              onClick={() => setCurrentStep(step.key)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:px-4 sm:py-2 sm:text-sm ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : isDone
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex w-full max-w-lg items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-destructive/70 hover:text-destructive">×</button>
        </div>
      )}

      {/* Step content */}
      <div className="w-full max-w-lg">
        {/* Step 1: Facility */}
        {currentStep === 'facility' && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Building2 className="h-5 w-5 text-primary" />
                Create your facility
              </div>
              <p className="text-sm text-muted-foreground">
                Enter your facility&apos;s details as registered with the Kenya Master Health Facility List (KMHFL).
              </p>

              {stepsStatus.facility && createdFacility ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span className="font-medium">{createdFacility.name}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    MFL: {createdFacility.mfl_code} &bull; Level {createdFacility.level}
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={goForward}>
                    Continue to modules <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="ob-facility-name">Facility name *</Label>
                      <Input
                        id="ob-facility-name"
                        value={facilityName}
                        onChange={(e) => setFacilityName(e.target.value)}
                        placeholder="e.g. Kenyatta National Hospital"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ob-mfl-code">MFL code *</Label>
                      <Input
                        id="ob-mfl-code"
                        value={mflCode}
                        onChange={(e) => setMflCode(e.target.value)}
                        placeholder="e.g. 13080"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ob-level">KEPH level *</Label>
                      <select
                        id="ob-level"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={level}
                        onChange={(e) => setLevel(e.target.value as FacilityLevel)}
                      >
                        <option value="">Select level</option>
                        {KEPH_LEVELS.map((l) => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="ob-ownership">Ownership *</Label>
                      <select
                        id="ob-ownership"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={ownership}
                        onChange={(e) => setOwnership(e.target.value as FacilityOwnership)}
                      >
                        <option value="">Select ownership</option>
                        {OWNERSHIP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="ob-county">County *</Label>
                      <select
                        id="ob-county"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={countyId ?? ''}
                        onChange={(e) => {
                          const v = e.target.value ? Number(e.target.value) : undefined;
                          setCountyId(v);
                          setSubCountyId(undefined);
                          setWardId(undefined);
                        }}
                      >
                        <option value="">Select county</option>
                        {(counties || []).map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="ob-subcounty">Sub-county *</Label>
                      <select
                        id="ob-subcounty"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={subCountyId ?? ''}
                        onChange={(e) => {
                          const v = e.target.value ? Number(e.target.value) : undefined;
                          setSubCountyId(v);
                          setWardId(undefined);
                        }}
                        disabled={!countyId}
                      >
                        <option value="">Select sub-county</option>
                        {(subCounties || []).map((sc: any) => (
                          <option key={sc.id} value={sc.id}>{sc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="ob-ward">Ward</Label>
                      <select
                        id="ob-ward"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={wardId ?? ''}
                        onChange={(e) => setWardId(e.target.value ? Number(e.target.value) : undefined)}
                        disabled={!subCountyId}
                      >
                        <option value="">Select ward (optional)</option>
                        {(wards || []).map((w: any) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3 sm:col-span-2">
                      <Switch
                        checked={shaContracted}
                        onCheckedChange={setShaContracted}
                        id="ob-sha"
                      />
                      <Label htmlFor="ob-sha" className="cursor-pointer">SHA contracted facility</Label>
                    </div>
                    {shaContracted && (
                      <div className="sm:col-span-2">
                        <Label htmlFor="ob-sha-code">SHA facility code (FR code)</Label>
                        <Input
                          id="ob-sha-code"
                          value={shaFacilityCode}
                          onChange={(e) => setShaFacilityCode(e.target.value)}
                          placeholder="e.g. DHABP05113"
                        />
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full"
                    disabled={!facilityValid || isSavingFacility}
                    onClick={handleCreateFacility}
                  >
                    {isSavingFacility && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Facility
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Modules */}
        {currentStep === 'modules' && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Settings2 className="h-5 w-5 text-primary" />
                Enable modules
              </div>
              <p className="text-sm text-muted-foreground">
                Choose which modules to activate for{' '}
                <span className="font-medium">{createdFacility?.name || 'your facility'}</span>.
                You can change these later in Settings.
              </p>

              <div className="space-y-4">
                {MODULE_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.title}
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {group.modules.map((mod) => (
                        <label
                          key={mod.key}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 transition-colors hover:bg-muted/50"
                        >
                          <Switch
                            checked={!!enabledModules[mod.key]}
                            onCheckedChange={() => handleToggleModule(mod.key)}
                          />
                          <span className="text-sm">{mod.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <Button
                className="w-full"
                disabled={isSavingModules}
                onClick={handleSaveModules}
              >
                {isSavingModules && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Clinics */}
        {currentStep === 'clinic' && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Stethoscope className="h-5 w-5 text-primary" />
                Create clinics
              </div>
              <p className="text-sm text-muted-foreground">
                Clinics are service points within your facility (e.g. General OPD, MCH, Dental).
                Seed standard Kenya healthcare clinics or create them manually later.
              </p>

              {seedResult ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span className="font-medium">{seedResult.created.length} clinics created</span>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                    {seedResult.created.slice(0, 5).map((c) => (
                      <li key={c.code}>&bull; {c.name}</li>
                    ))}
                    {seedResult.created.length > 5 && (
                      <li>&hellip;and {seedResult.created.length - 5} more</li>
                    )}
                  </ul>
                  <Button variant="outline" size="sm" className="mt-3" onClick={goForward}>
                    Continue <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="flex-1"
                    disabled={isSeeding}
                    onClick={handleSeedClinics}
                  >
                    {isSeeding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Seed standard clinics
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setStepsStatus((prev) => ({ ...prev, clinic: true }));
                      goForward();
                    }}
                  >
                    Skip &mdash; I&apos;ll add later
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Invite staff */}
        {currentStep === 'invite' && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Users className="h-5 w-5 text-primary" />
                Invite your team
              </div>
              <p className="text-sm text-muted-foreground">
                Send email invitations to staff members. They&apos;ll receive a link to create their account and join your organization.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@hospital.co.ke"
                  type="email"
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                />
                <Button
                  disabled={!inviteEmail.trim() || isInviting}
                  onClick={handleInvite}
                  size="sm"
                  className="shrink-0"
                >
                  {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Invite'}
                </Button>
              </div>

              {invitedEmails.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Invitations sent ({invitedEmails.length})
                  </p>
                  <ul className="space-y-0.5 text-sm">
                    {invitedEmails.map((email) => (
                      <li key={email} className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        {email}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Navigation footer */}
      <div className="mt-6 flex w-full max-w-lg items-center justify-between">
        <Button variant="ghost" size="sm" onClick={goBack} disabled={!canGoBack}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          Back
        </Button>

        <div className="flex gap-2">
          {currentStep === 'invite' ? (
            <Button
              onClick={handleComplete}
              disabled={isCompleting || !allDone}
            >
              {isCompleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Finish Setup
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={goForward} disabled={!canGoForward}>
              {stepsStatus[currentStep] ? 'Next' : 'Skip'}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-6">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={logout}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
