// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
// LIS standalone onboarding wizard page for WS2 closeout.
// Use: navigate to /onboarding/lis-standalone after login in lis_standalone mode.
// Inputs: reads authenticated facility context and calls LIS onboarding status/seed APIs.
'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Sparkles,
} from 'lucide-react';

import { standaloneLisApi } from '@/lib/api/standalone-lis';
import { facilitiesApi } from '@/lib/api/facilities';
import { invitationsApi } from '@/lib/api/onboarding';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PageHeader } from '@/components/shared/page-header';
import type {
  LISOnboardingImportError,
  LISOnboardingSeedResult,
  LISOnboardingStatus,
} from '@/lib/types/standalone-lis';
import type { FacilityDetail } from '@/lib/types/facility';

type LabArchetype = 'small' | 'medium' | 'reference';

const ARCHETYPES: Record<LabArchetype, { title: string; description: string; detail: string }> = {
  small: {
    title: 'Basic routine laboratory',
    description: 'For a small lab running common daily tests.',
    detail: 'Includes CBC, blood sugar, and urinalysis with starter cash prices.',
  },
  medium: {
    title: 'General diagnostic laboratory',
    description: 'For a broader routine diagnostic service.',
    detail: 'Adds liver, renal, and malaria testing with starter workflow data.',
  },
  reference: {
    title: 'Reference laboratory',
    description: 'For a referral or higher-volume laboratory.',
    detail: 'Creates the extended starter catalog and analyzer channel configuration.',
  },
};

export default function LISStandaloneOnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const [status, setStatus] = useState<LISOnboardingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<LISOnboardingSeedResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    summary: string;
    errors: LISOnboardingImportError[];
  } | null>(null);
  const [importType, setImportType] = useState<
    'test-catalog' | 'specimen-workflow' | 'analyzer-channel' | 'reference-ranges'
  >('test-catalog');
  const [error, setError] = useState<string | null>(null);
  const [facilityDetail, setFacilityDetail] = useState<FacilityDetail | null>(null);
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [laboratoryName, setLaboratoryName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseIssuer, setLicenseIssuer] = useState('');
  const [licenseIssueDate, setLicenseIssueDate] = useState('');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState('');
  const [isFacilitySheetOpen, setIsFacilitySheetOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState<LabArchetype | null>(null);
  const [activeStepKey, setActiveStepKey] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await standaloneLisApi.getOnboardingStatus();
      setStatus(data);

      const myFacilities = await facilitiesApi.myFacilities();
      const primaryFacility = myFacilities.at(0);
      if (primaryFacility) {
        const detail = await facilitiesApi.get(primaryFacility.id);
        setFacilityDetail(detail);
        setLaboratoryName(detail.name || user?.facility?.name || '');
        setLicenseNumber(detail.laboratory_license_number ?? '');
        setLicenseIssuer(detail.laboratory_license_issuer ?? '');
        setLicenseIssueDate((detail.laboratory_license_issue_date ?? '').slice(0, 10));
        setLicenseExpiryDate((detail.laboratory_license_expiry ?? '').slice(0, 10));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load LIS onboarding status.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.facility?.name]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    fetchStatus();
  }, [fetchStatus, isAuthenticated, router]);

  const requiredProgress = useMemo(() => {
    const steps = status?.steps ?? [];
    const required = steps.filter((step) => step.required);
    const done = required.filter((step) => step.done);
    return { done: done.length, total: required.length };
  }, [status]);

  const steps = useMemo(() => status?.steps ?? [], [status]);
  const requiredSteps = useMemo(() => steps.filter((step) => step.required), [steps]);
  const nextStep = requiredSteps.find((step) => !step.done) ?? steps.find((step) => !step.done);

  useEffect(() => {
    if (!steps.length) {
      setActiveStepKey(null);
      return;
    }

    if (activeStepKey && steps.some((step) => step.key === activeStepKey)) {
      return;
    }

    setActiveStepKey(nextStep?.key ?? steps[0]?.key ?? null);
  }, [steps, nextStep, activeStepKey]);

  const handleSaveIdentity = async () => {
    setIsSavingIdentity(true);
    setError(null);
    try {
      const updated = await standaloneLisApi.updateOnboardingFacilityDetails({
        name: laboratoryName,
        laboratory_license_number: licenseNumber,
        laboratory_license_issuer: licenseIssuer,
        laboratory_license_issue_date: licenseIssueDate || null,
        laboratory_license_expiry: licenseExpiryDate || null,
      });
      setFacilityDetail(updated);
      setLaboratoryName(updated.name ?? '');
      setLicenseNumber(updated.laboratory_license_number ?? '');
      setLicenseIssuer(updated.laboratory_license_issuer ?? '');
      setLicenseIssueDate((updated.laboratory_license_issue_date ?? '').slice(0, 10));
      setLicenseExpiryDate((updated.laboratory_license_expiry ?? '').slice(0, 10));
      setIsFacilitySheetOpen(false);
      await fetchStatus();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save lab identity and licensing details.'
      );
    } finally {
      setIsSavingIdentity(false);
    }
  };

  const handleOpenFacilitySheet = () => {
    setLaboratoryName(
      (currentName) => currentName || facilityDetail?.name || user?.facility?.name || ''
    );
    setIsFacilitySheetOpen(true);
  };

  const handleInvite = async () => {
    if (!facilityDetail || !inviteEmail.trim() || !facilityDetail.organization) return;
    setIsInviting(true);
    setError(null);
    try {
      await invitationsApi.create({
        email: inviteEmail.trim(),
        organization: facilityDetail.organization,
        facility: facilityDetail.id,
      });
      setInviteEmail('');
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send invitation.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleDownloadTemplate = async (
    templateName: 'test-catalog' | 'specimen-workflow' | 'analyzer-channel' | 'reference-ranges'
  ) => {
    try {
      const csv = await standaloneLisApi.downloadTemplate(templateName);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${templateName}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download template.');
    }
  };

  const handleImportTestCatalog = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportResult(null);
    setError(null);
    try {
      if (importType === 'test-catalog') {
        const result = await standaloneLisApi.importTestCatalog(file);
        setImportResult({
          summary: `Imported test catalog: ${result.created} created, ${result.updated} updated, ${result.error_count} row errors.`,
          errors: result.errors,
        });
      } else if (importType === 'specimen-workflow') {
        const result = await standaloneLisApi.importSpecimenWorkflow(file);
        setImportResult({
          summary: `Imported workflow settings: ${result.updated} fields updated, ${result.error_count} row errors.`,
          errors: result.errors,
        });
      } else if (importType === 'analyzer-channel') {
        const result = await standaloneLisApi.importAnalyzerChannel(file);
        setImportResult({
          summary: `Imported analyzer channels: ${result.created_instruments} instruments, ${result.created_channels} channels created, ${result.updated_channels} channels updated, ${result.error_count} row errors.`,
          errors: result.errors,
        });
      } else {
        const result = await standaloneLisApi.importReferenceRanges(file);
        setImportResult({
          summary: `Imported reference ranges: ${result.updated} rows updated, ${result.error_count} row errors.`,
          errors: result.errors,
        });
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import test catalog CSV.');
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const handleSeed = async (archetype: LabArchetype) => {
    setIsSeeding(true);
    setError(null);
    setSeedResult(null);
    try {
      const result = await standaloneLisApi.seedOnboardingDefaults(archetype);
      setSeedResult(result);
      setSelectedArchetype(null);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not seed LIS defaults.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setIsCompleting(true);
    setError(null);
    try {
      const result = await standaloneLisApi.completeOnboarding();
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete LIS onboarding.');
    } finally {
      setIsCompleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentStep =
    steps.find((step) => step.key === activeStepKey) ?? nextStep ?? steps.find((step) => !step.done);
  const currentRequiredIndex = currentStep
    ? requiredSteps.findIndex((step) => step.key === currentStep.key)
    : -1;
  const hasPreviousRequiredStep = currentRequiredIndex > 0;
  const hasNextRequiredStep =
    currentRequiredIndex >= 0 && currentRequiredIndex < requiredSteps.length - 1;
  const totalMinutes = steps
    .filter((step) => step.required && !step.done)
    .reduce((total, step) => total + step.estimated_minutes, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
      <PageHeader
        title="Set up your laboratory"
        helpContent="Complete the required foundations once. You can add more tests, instruments, and team members later."
      />
      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="relative overflow-hidden border-primary/20">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_48%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_42%)]"
          aria-hidden="true"
        />
        <CardContent className="relative space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                {requiredProgress.done === requiredProgress.total
                  ? 'Your laboratory is ready'
                  : `Step ${requiredProgress.done + 1} of ${requiredProgress.total}`}
              </p>
              <p className="text-sm text-muted-foreground">
                {requiredProgress.done}/{requiredProgress.total} required foundations complete
              </p>
            </div>
            {totalMinutes ? (
              <Badge variant="secondary" className="w-fit gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                About {totalMinutes} min left
              </Badge>
            ) : (
              <Badge className="w-fit">Ready to launch</Badge>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${requiredProgress.total ? (requiredProgress.done / requiredProgress.total) * 100 : 100}%`,
              }}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {steps
              .filter((step) => step.required)
              .map((step, index) => (
                <div key={step.key} className="flex items-center gap-2 text-xs">
                  <CheckCircle2
                    className={`h-4 w-4 shrink-0 ${step.done ? 'text-emerald-600' : index === requiredProgress.done ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <span className={step.done ? 'text-foreground' : 'text-muted-foreground'}>
                    {step.label}
                  </span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {seedResult ? (
        <Card className="border-emerald-300 bg-emerald-50/60">
          <CardContent className="p-4 text-sm text-emerald-900">
            Starter data added for the{' '}
            <strong>{ARCHETYPES[seedResult.archetype].title.toLowerCase()}</strong>:{' '}
            {seedResult.created_tests} tests, {seedResult.created_instruments} instruments, and{' '}
            {seedResult.created_channels} channels. Review the prices and workflow before going
            live.
          </CardContent>
        </Card>
      ) : null}

      {requiredProgress.done === requiredProgress.total ? (
        <Card>
          <CardHeader>
            <CardTitle>Review and launch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Required configuration is complete. Optional analyzer integration and team invitations
              can be finished later without blocking manual laboratory work.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {steps.map((step) => (
                <div
                  key={step.key}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <span>{step.label}</span>
                  <Badge variant={step.done ? 'default' : 'outline'}>
                    {step.done ? 'Configured' : 'Optional'}
                  </Badge>
                </div>
              ))}
            </div>
            {!status?.complete ? (
              <div className="space-y-3 rounded-md border bg-muted/40 p-3">
                <p className="text-sm text-muted-foreground">
                  Required steps are complete. Finish onboarding to unlock the full standalone
                  laboratory workspace.
                </p>
                <Button onClick={handleCompleteOnboarding} disabled={isCompleting}>
                  {isCompleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Finishing onboarding...
                    </>
                  ) : (
                    'Finish onboarding'
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-900/30 dark:text-emerald-50 p-3">
                <p className="text-sm text-emerald-900">
                  Onboarding complete{status.completed_at ? ` on ${new Date(status.completed_at).toLocaleString()}` : ''}.
                </p>
                <Button onClick={() => router.push('/laboratory')}>Open laboratory workspace</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : currentStep ? (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{currentStep.label}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{currentStep.description}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {currentStep.estimated_minutes} min
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {currentStep.missing_items.length ? (
              <div className="rounded-md bg-muted/60 p-3 text-sm">
                <p className="font-medium">To finish this step</p>
                <p className="mt-1 text-muted-foreground">
                  {currentStep.missing_items.join(', ')}.
                </p>
              </div>
            ) : null}
            {currentStep.key === 'lab_identity' ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={handleOpenFacilitySheet}>Edit laboratory details</Button>
                </div>
              </div>
            ) : null}
            {currentStep.key === 'test_catalog' ? (
              <div className="space-y-4">
                <div>
                  <p className="font-medium">Choose a setup path</p>
                  <p className="text-sm text-muted-foreground">
                    Use a safe starter catalog, bring in an existing spreadsheet, or configure tests
                    manually.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {(Object.keys(ARCHETYPES) as LabArchetype[]).map((archetype) => (
                    <button
                      key={archetype}
                      type="button"
                      onClick={() => setSelectedArchetype(archetype)}
                      className={`rounded-lg border p-4 text-left transition-colors ${selectedArchetype === archetype ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                    >
                      <Sparkles className="mb-3 h-4 w-4 text-primary" />
                      <p className="font-medium">{ARCHETYPES[archetype].title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {ARCHETYPES[archetype].description}
                      </p>
                    </button>
                  ))}
                </div>
                {selectedArchetype ? (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    <p>{ARCHETYPES[selectedArchetype].detail}</p>
                    <div className="mt-3 flex gap-2">
                      <Button onClick={() => handleSeed(selectedArchetype)} disabled={isSeeding}>
                        {isSeeding ? 'Adding defaults...' : 'Add these defaults'}
                      </Button>
                      <Button variant="ghost" onClick={() => setSelectedArchetype(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                  <Button variant="outline" onClick={() => handleDownloadTemplate('test-catalog')}>
                    Download catalog template
                  </Button>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onClick={() => setImportType('test-catalog')}
                    onChange={handleImportTestCatalog}
                    disabled={isImporting}
                    className="text-sm"
                  />
                  <Button variant="ghost" onClick={() => router.push('/laboratory/tests')}>
                    Configure manually
                  </Button>
                </div>
              </div>
            ) : null}
            {currentStep.key === 'specimen_workflow' ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Start with the laboratory workflow settings, or import the workflow you already
                  use.
                </p>
                {currentStep.done ? (
                  <div className="rounded-md border border-emerald-300 bg-emerald-50/60 p-3 text-sm text-emerald-900">
                    Workflow settings are already configured for this facility.
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => router.push(currentStep.next_action.route)}>
                    {currentStep.done ? 'Review workflow settings' : 'Configure workflow'}
                  </Button>
                  {!currentStep.done ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => handleDownloadTemplate('specimen-workflow')}
                      >
                        Download workflow template
                      </Button>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onClick={() => setImportType('specimen-workflow')}
                        onChange={handleImportTestCatalog}
                        disabled={isImporting}
                        className="text-sm"
                      />
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
            {currentStep.key === 'pricing_basics' ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Review cash prices for your active tests. You can add payer-specific rules later.
                </p>
                <Button onClick={() => router.push(currentStep.next_action.route)}>
                  Set test prices
                </Button>
              </div>
            ) : null}
            {currentStep.key === 'instrument_channels' ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Analyzer connection is optional. Select manual entry if you do not have an
                  analyzer yet.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => router.push(currentStep.next_action.route)}>
                    Connect an analyzer
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadTemplate('analyzer-channel')}
                  >
                    Download analyzer template
                  </Button>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onClick={() => setImportType('analyzer-channel')}
                    onChange={handleImportTestCatalog}
                    disabled={isImporting}
                    className="text-sm"
                  />
                  <Button variant="ghost" onClick={fetchStatus}>
                    Use manual entry
                  </Button>
                </div>
              </div>
            ) : null}
            {currentStep.key === 'team_access' ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Invite a colleague now, or continue and complete handover later.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="staff@facility.example"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <Button onClick={handleInvite} disabled={isInviting || !inviteEmail.trim()}>
                    {isInviting ? 'Sending...' : 'Send invitation'}
                  </Button>
                </div>
              </div>
            ) : null}
            {importResult ? (
              <div className="space-y-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                <p>{importResult.summary}</p>
                {importResult.errors.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-destructive">
                    {importResult.errors.slice(0, 5).map((rowError) => (
                      <li key={`${rowError.row}-${rowError.error}`}>
                        Row {rowError.row}: {rowError.error}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {importResult.errors.length > 5 ? (
                  <p>Showing the first 5 row errors. Correct the CSV and import it again.</p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => router.push('/laboratory')}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Save and finish later
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!hasPreviousRequiredStep) return;
                    setActiveStepKey(requiredSteps[currentRequiredIndex - 1]?.key ?? null);
                  }}
                  disabled={!hasPreviousRequiredStep}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous step
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!hasNextRequiredStep) return;
                    setActiveStepKey(requiredSteps[currentRequiredIndex + 1]?.key ?? null);
                  }}
                  disabled={!hasNextRequiredStep}
                >
                  Next step
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Sheet open={isFacilitySheetOpen} onOpenChange={setIsFacilitySheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Laboratory details</SheetTitle>
            <SheetDescription>
              Update the standalone laboratory name and regulator-issued licence details used on
              reports.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="standalone-laboratory-name">Laboratory name</Label>
              <input
                id="standalone-laboratory-name"
                type="text"
                value={laboratoryName}
                onChange={(event) => setLaboratoryName(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="laboratory-license-issuer">Licence issuer</Label>
              <input
                id="laboratory-license-issuer"
                type="text"
                value={licenseIssuer}
                onChange={(event) => setLicenseIssuer(event.target.value)}
                placeholder="e.g. KMLTTB"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="laboratory-license-number">Laboratory licence number</Label>
              <input
                id="laboratory-license-number"
                type="text"
                value={licenseNumber}
                onChange={(event) => setLicenseNumber(event.target.value)}
                placeholder="Enter licence number"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="laboratory-license-issue-date">Licence issue date</Label>
                <input
                  id="laboratory-license-issue-date"
                  type="date"
                  value={licenseIssueDate}
                  onChange={(event) => setLicenseIssueDate(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="laboratory-license-expiry-date">Licence expiry date</Label>
                <input
                  id="laboratory-license-expiry-date"
                  type="date"
                  value={licenseExpiryDate}
                  onChange={(event) => setLicenseExpiryDate(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsFacilitySheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveIdentity} disabled={isSavingIdentity}>
              {isSavingIdentity ? 'Saving...' : 'Save details'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
