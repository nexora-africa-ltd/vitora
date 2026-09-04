// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
// LIS standalone onboarding wizard page for WS2 closeout.
// Use: navigate to /onboarding/lis-standalone after login in lis_standalone mode.
// Inputs: reads authenticated facility context and calls LIS onboarding status/seed APIs.
'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { standaloneLisApi } from '@/lib/api/standalone-lis';
import { facilitiesApi } from '@/lib/api/facilities';
import { invitationsApi } from '@/lib/api/onboarding';
import { useAuth } from '@/lib/auth/context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import type { LISOnboardingSeedResult, LISOnboardingStatus } from '@/lib/types/standalone-lis';
import type { FacilityDetail } from '@/lib/types/facility';

const STEP_ROUTES: Record<string, string> = {
  lab_identity: '/admin/facilities',
  test_catalog: '/laboratory/tests',
  specimen_workflow: '/laboratory/settings',
  instrument_channels: '/laboratory/analyzers',
  pricing_basics: '/laboratory/tests',
  team_access: '/admin/staff',
};

export default function LISStandaloneOnboardingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<LISOnboardingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<LISOnboardingSeedResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importType, setImportType] = useState<
    'test-catalog' | 'specimen-workflow' | 'analyzer-channel' | 'reference-ranges'
  >('test-catalog');
  const [error, setError] = useState<string | null>(null);
  const [facilityDetail, setFacilityDetail] = useState<FacilityDetail | null>(null);
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

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
      }

      if (data.complete) {
        router.push('/laboratory');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load LIS onboarding status.');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

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

  const handleSaveIdentity = async () => {
    if (!facilityDetail) return;
    setIsSavingIdentity(true);
    setError(null);
    try {
      const updated = await facilitiesApi.update(facilityDetail.id, {
        dha_license_number: facilityDetail.dha_license_number,
        dha_license_issue_date: facilityDetail.dha_license_issue_date,
        dha_license_expiry: facilityDetail.dha_license_expiry,
      });
      setFacilityDetail(updated);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save lab identity and licensing details.');
    } finally {
      setIsSavingIdentity(false);
    }
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
        setImportResult(
          `Imported test catalog: ${result.created} created, ${result.updated} updated, ${result.error_count} row errors.`
        );
      } else if (importType === 'specimen-workflow') {
        const result = await standaloneLisApi.importSpecimenWorkflow(file);
        setImportResult(
          `Imported workflow settings: ${result.updated} fields updated, ${result.error_count} row errors.`
        );
      } else if (importType === 'analyzer-channel') {
        const result = await standaloneLisApi.importAnalyzerChannel(file);
        setImportResult(
          `Imported analyzer channels: ${result.created_instruments} instruments, ${result.created_channels} channels created, ${result.updated_channels} channels updated, ${result.error_count} row errors.`
        );
      } else {
        const result = await standaloneLisApi.importReferenceRanges(file);
        setImportResult(
          `Imported reference ranges: ${result.updated} rows updated, ${result.error_count} row errors.`
        );
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import test catalog CSV.');
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const handleSeed = async (archetype: 'small' | 'medium' | 'reference') => {
    setIsSeeding(true);
    setError(null);
    setSeedResult(null);
    try {
      const result = await standaloneLisApi.seedOnboardingDefaults(archetype);
      setSeedResult(result);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not seed LIS defaults.');
    } finally {
      setIsSeeding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="LIS Standalone Onboarding"
        helpContent="Complete required setup steps before using standalone LIS operational workflows."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Final WS2 Completion Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>- Guided setup for identity, catalog, workflow, analyzer channels, pricing, and team access</p>
          <p>- CSV templates/imports for all operational onboarding datasets</p>
          <p>- Operational-ready target: complete required setup using defaults/sample CSVs in under 30 minutes</p>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Setup Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Required steps complete: {requiredProgress.done}/{requiredProgress.total}
          </p>

          {seedResult && (
            <Card className="border-emerald-300 bg-emerald-50/60">
              <CardContent className="p-3 text-sm text-emerald-800">
                Seeded <strong>{seedResult.archetype}</strong> defaults: {seedResult.created_tests} tests,{' '}
                {seedResult.created_instruments} instruments, {seedResult.created_channels} channels.
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {(status?.steps ?? []).map((step) => (
              <div
                key={step.key}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    className={`h-4 w-4 ${step.done ? 'text-emerald-600' : 'text-muted-foreground'}`}
                  />
                  <span className="text-sm">{step.label}</span>
                  {step.required ? <Badge variant="secondary">Required</Badge> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(STEP_ROUTES[step.key] || '/laboratory')}
                  >
                    Open
                  </Button>
                  <Badge variant={step.done ? 'default' : 'outline'}>
                    {step.done ? 'Done' : 'Pending'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium">Step 1: Facility/Lab identity and licensing</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="text"
                value={facilityDetail?.dha_license_number ?? ''}
                onChange={(event) =>
                  setFacilityDetail((prev) =>
                    prev ? { ...prev, dha_license_number: event.target.value } : prev
                  )
                }
                placeholder="License number"
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={(facilityDetail?.dha_license_issue_date ?? '').slice(0, 10)}
                onChange={(event) =>
                  setFacilityDetail((prev) =>
                    prev ? { ...prev, dha_license_issue_date: event.target.value } : prev
                  )
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={(facilityDetail?.dha_license_expiry ?? '').slice(0, 10)}
                onChange={(event) =>
                  setFacilityDetail((prev) =>
                    prev ? { ...prev, dha_license_expiry: event.target.value } : prev
                  )
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button variant="outline" onClick={handleSaveIdentity} disabled={isSavingIdentity}>
                {isSavingIdentity ? 'Saving...' : 'Save Identity'}
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium">Quick start defaults</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Seed sample data for a lab archetype to complete setup faster.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" disabled={isSeeding} onClick={() => handleSeed('small')}>
                Seed Small Lab
              </Button>
              <Button variant="outline" disabled={isSeeding} onClick={() => handleSeed('medium')}>
                Seed Medium Lab
              </Button>
              <Button variant="outline" disabled={isSeeding} onClick={() => handleSeed('reference')}>
                Seed Reference Lab
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium">CSV templates and import</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Download onboarding templates and import test catalog data from CSV.
            </p>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button variant="outline" onClick={() => handleDownloadTemplate('test-catalog')}>
                Template: Test Catalog
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDownloadTemplate('specimen-workflow')}
              >
                Template: Workflow
              </Button>
              <Button variant="outline" onClick={() => handleDownloadTemplate('analyzer-channel')}>
                Template: Analyzer
              </Button>
              <Button variant="outline" onClick={() => handleDownloadTemplate('reference-ranges')}>
                Template: Reference Ranges
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={importType}
                onChange={(event) =>
                  setImportType(
                    event.target.value as
                      | 'test-catalog'
                      | 'specimen-workflow'
                      | 'analyzer-channel'
                      | 'reference-ranges'
                  )
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="test-catalog">Import: Test Catalog</option>
                <option value="specimen-workflow">Import: Workflow Settings</option>
                <option value="analyzer-channel">Import: Analyzer Channels</option>
                <option value="reference-ranges">Import: Reference Ranges</option>
              </select>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportTestCatalog}
                disabled={isImporting}
                className="text-sm"
              />
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>
            {importResult ? <p className="mt-2 text-xs text-muted-foreground">{importResult}</p> : null}
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium">Step 6: Team invitations and permissions</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Invite at least one teammate for operational handoff and role assignment.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="staff@facility.example"
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
              <Button onClick={handleInvite} disabled={isInviting || !inviteEmail.trim()}>
                {isInviting ? 'Sending...' : 'Send Invitation'}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={fetchStatus} disabled={isSeeding}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
