/**
 * DHA HIE Pre-authorization Panel
 * Handles submission and status tracking of pre-authorization requests
 *
 * Flow:
 * 1. User fills in procedure details
 * 2. Submits pre-auth request (requires valid consent token)
 * 3. Status auto-refreshes until DHA responds (APPROVED/DENIED)
 */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileCheck,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';
import { shaApi } from '@/lib/api/sha';
import { useSubmitPreauth, usePreauthStatus } from '@/lib/hooks/use-sha';
import { useBenefitInterventions } from '@/lib/hooks/use-benefit-interventions';
import { useFacility } from '@/lib/context/facility-context';
import type { PreauthDecision } from '@/lib/types/sha';
import {
  getAllowedCombinations,
  getBenefitCode,
  isAlonePackage,
  validateInterventionCombination,
} from '@/lib/sha/combination-rules';
import { format, parseISO } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface PreauthPanelProps {
  /** Claim ID to pre-authorize */
  claimId: number;
  /** Consent token ID (must be valid/validated) */
  consentTokenId?: number;
  /** Existing pre-auth ID (if already submitted) */
  preauthId?: number;
  /** Primary diagnosis code from encounter */
  diagnosisCodes?: string[];
  /** Whether this is an elective preauth (requires patient OTP authorize) */
  isElective?: boolean;
  /** SHA member ID (needed for biometric authorize in elective flow) */
  shaMemberId?: number;
  /** Patient DHA CR number for live benefits/interventions lookup */
  patientCrId?: string;
  /** Active intervention codes on this claim (for combination-rule filtering) */
  activeInterventionCodes?: string[];
  /** Preferred intervention code from surrounding workflow (consent/ILM context). */
  preferredProcedureCode?: string;
  /** Emits whenever procedure code selection changes. */
  onProcedureCodeChange?: (code: string) => void;
  /** Callback on successful preauth */
  onPreauthComplete?: (preauthId: number, decision: PreauthDecision) => void;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDecisionBadge(decision: PreauthDecision) {
  switch (decision) {
    case 'APPROVED':
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3 animate-pulse" />
          Pending DHA Review
        </Badge>
      );
    case 'DENIED':
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Denied
        </Badge>
      );
    case 'EXPIRED':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <Clock className="mr-1 h-3 w-3" />
          Expired
        </Badge>
      );
  }
}

// ============================================================================
// Component
// ============================================================================

export function PreauthPanel({
  claimId,
  consentTokenId,
  preauthId: initialPreauthId,
  diagnosisCodes = [],
  isElective = false,
  shaMemberId,
  patientCrId,
  activeInterventionCodes = [],
  preferredProcedureCode,
  onProcedureCodeChange,
  onPreauthComplete,
  className,
}: PreauthPanelProps) {
  const [preauthId, setPreauthId] = useState<number | undefined>(initialPreauthId);
  const [procedureCode, setProcedureCode] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manualOverrideOpen, setManualOverrideOpen] = useState(false);

  // Elective preauth authorization state
  const [electiveAuthGuid, setElectiveAuthGuid] = useState('');
  const [electiveAuthorized, setElectiveAuthorized] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const { facilityDetail } = useFacility();
  const submitPreauth = useSubmitPreauth();
  const {
    data: preauthStatus,
    isFetching: preauthStatusRefreshing,
    refetch: refetchPreauthStatus,
  } = usePreauthStatus(preauthId);

  const {
    benefitPackageOptions,
    benefitPackagesLoading,
    selectedBenefitPkgCode,
    setSelectedBenefitPkgCode,
    interventionOptions,
    interventionsLoading,
  } = useBenefitInterventions({
    patientCrId: patientCrId || '',
    enabled: !!patientCrId,
  });

  const primaryBenefitCode = useMemo(
    () => (activeInterventionCodes.length > 0 ? getBenefitCode(activeInterventionCodes[0]!) : null),
    [activeInterventionCodes],
  );

  const allowedBenefitCodes = useMemo(() => {
    if (!primaryBenefitCode) return null;
    if (isAlonePackage(primaryBenefitCode)) {
      return new Set([primaryBenefitCode]);
    }
    return new Set([primaryBenefitCode, ...getAllowedCombinations(primaryBenefitCode)]);
  }, [primaryBenefitCode]);

  const filteredBenefitPackageOptions = useMemo(() => {
    if (!allowedBenefitCodes) return benefitPackageOptions;
    return benefitPackageOptions.filter((pkg) => allowedBenefitCodes.has(pkg.code));
  }, [benefitPackageOptions, allowedBenefitCodes]);

  const filteredPreauthInterventions = useMemo(() => {
    return interventionOptions.filter((opt) => {
      if (!opt.code) return false;
      if (!opt.needsPreauth) return false;
      if (activeInterventionCodes.includes(opt.code)) return true;
      const combo = validateInterventionCombination(activeInterventionCodes, opt.code);
      return combo.valid;
    });
  }, [interventionOptions, activeInterventionCodes]);

  const interventionSelectOptions = useMemo(
    () =>
      filteredPreauthInterventions.map((opt) => ({
        value: opt.code,
        label: `${opt.code} - ${opt.name || 'Unnamed intervention'}`,
      })),
    [filteredPreauthInterventions],
  );

  useEffect(() => {
    if (selectedBenefitPkgCode) return;
    const preferred =
      (primaryBenefitCode && filteredBenefitPackageOptions.find((pkg) => pkg.code === primaryBenefitCode))
      || filteredBenefitPackageOptions[0];
    if (preferred) setSelectedBenefitPkgCode(preferred.code);
  }, [selectedBenefitPkgCode, primaryBenefitCode, filteredBenefitPackageOptions, setSelectedBenefitPkgCode]);

  useEffect(() => {
    const selected = filteredPreauthInterventions.find((opt) => opt.code === procedureCode);
    if (!selected) return;
    if (!estimatedCost && typeof selected.price === 'number' && Number.isFinite(selected.price)) {
      setEstimatedCost(String(selected.price));
    }
  }, [procedureCode, filteredPreauthInterventions, estimatedCost]);

  useEffect(() => {
    if (!preferredProcedureCode) return;
    if (procedureCode === preferredProcedureCode) return;
    setProcedureCode(preferredProcedureCode);
  }, [preferredProcedureCode, procedureCode]);

  useEffect(() => {
    onProcedureCodeChange?.(procedureCode);
  }, [procedureCode, onProcedureCodeChange]);

  // Notify parent when decision arrives
  useEffect(() => {
    if (preauthStatus && preauthStatus.decision !== 'PENDING' && preauthId) {
      onPreauthComplete?.(preauthId, preauthStatus.decision);
    }
  }, [preauthStatus?.decision, preauthId, onPreauthComplete, preauthStatus]);

  const handleSubmit = () => {
    if (!consentTokenId) {
      setError('A valid consent token is required before submitting pre-authorization.');
      return;
    }
    if (!procedureCode.trim()) {
      setError('Procedure code is required.');
      return;
    }
    if (isElective && !electiveAuthorized) {
      setError('Elective pre-authorizations require patient authorization (OTP or biometric) before submission.');
      return;
    }

    setError(null);
    submitPreauth.mutate(
      {
        claim_id: claimId,
        consent_token_id: consentTokenId,
        procedure_code: procedureCode.trim(),
        diagnosis_codes: diagnosisCodes,
        estimated_cost: estimatedCost || '0',
        scheduled_date: scheduledDate,
        clinical_notes: clinicalNotes,
      },
      {
        onSuccess: (response) => {
          setPreauthId(response.id);
        },
        onError: (err: Error) => {
          setError(err.message || 'Failed to submit pre-authorization');
        },
      }
    );
  };

  // If we already have a preauth, show status
  if (preauthId && preauthStatus) {
    return (
      <Card className={cn('relative', className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck className="h-4 w-4 text-primary" />
              Pre-authorization
            </CardTitle>
            {getDecisionBadge(preauthStatus.decision)}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Reference</span>
              <p className="font-mono text-xs">{preauthStatus.preauth_reference || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Procedure</span>
              <p>{preauthStatus.procedure_code}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Estimated Cost</span>
              <p>KES {Number(preauthStatus.estimated_cost).toLocaleString()}</p>
            </div>
            {preauthStatus.approved_amount && (
              <div>
                <span className="text-muted-foreground">Approved Amount</span>
                <p className="font-medium text-green-700 dark:text-green-400">
                  KES {Number(preauthStatus.approved_amount).toLocaleString()}
                </p>
              </div>
            )}
            {preauthStatus.valid_until && (
              <div>
                <span className="text-muted-foreground">Valid Until</span>
                <p>{format(parseISO(preauthStatus.valid_until), 'dd MMM yyyy')}</p>
              </div>
            )}
            {preauthStatus.submitted_at && (
              <div>
                <span className="text-muted-foreground">Submitted</span>
                <p>{format(parseISO(preauthStatus.submitted_at), 'dd MMM yyyy, HH:mm')}</p>
              </div>
            )}
          </div>

          {preauthStatus.decision === 'DENIED' && preauthStatus.denial_reason && (
            <div className="rounded-md bg-destructive/10 p-3">
              <p className="text-sm font-medium text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Denial Reason
              </p>
              <p className="text-sm text-destructive/80 mt-1">{preauthStatus.denial_reason}</p>
            </div>
          )}

          {preauthStatus.decision === 'PENDING' && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Auto-refreshing status every 15 seconds...
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => void refetchPreauthStatus()}
                disabled={preauthStatusRefreshing}
              >
                {preauthStatusRefreshing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Refresh now
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Show submission form
  return (
    <Card className={cn('relative', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck className="h-4 w-4 text-primary" />
          Pre-authorization Request
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!consentTokenId && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/10 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Obtain patient consent first before submitting pre-authorization.
            </p>
          </div>
        )}

        {!!patientCrId && (
          <div className="rounded-md bg-slate-50 dark:bg-slate-900/30 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Pre-auth shortlist is built from DHA eligible benefits and filtered to combination-compliant interventions that require pre-authorization.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="preauth-benefit-package">Benefit Package</Label>
                <Select
                  value={selectedBenefitPkgCode}
                  onValueChange={setSelectedBenefitPkgCode}
                  disabled={benefitPackagesLoading || filteredBenefitPackageOptions.length === 0}
                >
                  <SelectTrigger id="preauth-benefit-package">
                    <SelectValue
                      placeholder={benefitPackagesLoading ? 'Loading packages...' : 'Select benefit package'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredBenefitPackageOptions.map((pkg) => (
                      <SelectItem key={pkg.code} value={pkg.code}>
                        {pkg.code} · {pkg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="procedure-code">Intervention Requiring Pre-auth *</Label>
                <SearchableSelect
                  options={interventionSelectOptions}
                  value={procedureCode}
                  onValueChange={(value) => {
                    setProcedureCode(value);
                    const match = filteredPreauthInterventions.find((item) => item.code === value);
                    if (match && typeof match.price === 'number' && Number.isFinite(match.price)) {
                      setEstimatedCost(String(match.price));
                    }
                  }}
                  placeholder={interventionsLoading ? 'Loading interventions...' : 'Select intervention'}
                  searchPlaceholder="Search intervention code or name..."
                  emptyMessage="No pre-auth interventions found"
                  disabled={interventionsLoading || filteredPreauthInterventions.length === 0}
                />
              </div>
            </div>
            {!benefitPackagesLoading && filteredBenefitPackageOptions.length === 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No eligible benefit package currently matches this claim&apos;s combination rules.
              </p>
            )}
            {!interventionsLoading && !!selectedBenefitPkgCode && filteredPreauthInterventions.length === 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No pre-auth-required interventions found under the selected package for this claim context.
              </p>
            )}
            <div className="pt-1">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 text-xs"
                onClick={() => setManualOverrideOpen((prev) => !prev)}
              >
                {manualOverrideOpen ? 'Hide manual override' : 'Manual override'}
              </Button>
            </div>
          </div>
        )}

        {!patientCrId && (
          <div className="pt-1">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={() => setManualOverrideOpen((prev) => !prev)}
            >
              {manualOverrideOpen ? 'Hide manual override' : 'Manual override'}
            </Button>
          </div>
        )}

        {manualOverrideOpen && (
          <div className="rounded-md border border-dashed p-3">
            <p className="text-xs text-muted-foreground mb-3">
              Override the selected procedure when DHA shortlist is unavailable or clinical judgement requires a custom code.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="procedure-code-manual">Procedure Code *</Label>
                <Input
                  id="procedure-code-manual"
                  value={procedureCode}
                  onChange={(e) => setProcedureCode(e.target.value)}
                  placeholder="Auto-filled from shortlist or enter manually"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimated-cost">Estimated Cost (KES)</Label>
                <Input
                  id="estimated-cost"
                  type="number"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scheduled-date">Scheduled Date</Label>
                <Input
                  id="scheduled-date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {!manualOverrideOpen && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="estimated-cost">Estimated Cost (KES)</Label>
              <Input
                id="estimated-cost"
                type="number"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduled-date">Scheduled Date</Label>
              <Input
                id="scheduled-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="clinical-notes">Clinical Notes</Label>
          <Textarea
            id="clinical-notes"
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            placeholder="Reason for procedure, clinical justification..."
            rows={3}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Elective preauth: require patient authorize step first */}
        {isElective && !electiveAuthorized && (
          <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-2">
            <p className="text-sm text-amber-800 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Elective pre-authorizations require patient authorization before submission.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="elective-auth-guid" className="text-xs">Auth GUID (from biometric consent)</Label>
                <Input
                  id="elective-auth-guid"
                  value={electiveAuthGuid}
                  onChange={(e) => setElectiveAuthGuid(e.target.value)}
                  placeholder="Paste auth_guid or initiate biometric"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={authBusy || !electiveAuthGuid}
                  onClick={async () => {
                    setAuthBusy(true);
                    setError(null);
                    try {
                      const result = await shaApi.getBiometricAuthStatus(electiveAuthGuid);
                      if (result.status === 'AUTHORIZED') {
                        setElectiveAuthorized(true);
                      } else {
                        setError(`Authorization status: ${result.status}. Patient must complete biometric.`);
                      }
                    } catch (e: any) {
                      setError(e?.message ?? 'Failed to verify authorization');
                    } finally {
                      setAuthBusy(false);
                    }
                  }}
                >
                  {authBusy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Verify
                </Button>
                {shaMemberId && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={authBusy}
                    onClick={async () => {
                      setAuthBusy(true);
                      setError(null);
                      try {
                        const result = await shaApi.authorizeBiometric({
                          sha_member_id: shaMemberId,
                          workstation_id: facilityDetail?.workstation_id || 'web-app',
                          agent_national_id: facilityDetail?.biometrics_agent_national_id || '',
                        });
                        setElectiveAuthGuid(result.auth_guid);
                      } catch (e: any) {
                        setError(e?.message ?? 'Failed to initiate biometric');
                      } finally {
                        setAuthBusy(false);
                      }
                    }}
                  >
                    {authBusy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Initiate Biometric
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {isElective && electiveAuthorized && (
          <div className="rounded-md bg-green-50 dark:bg-green-900/10 p-2">
            <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Patient authorized for elective pre-authorization.
            </p>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={submitPreauth.isPending || !consentTokenId || (isElective && !electiveAuthorized)}
          size="sm"
        >
          {submitPreauth.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileCheck className="mr-2 h-4 w-4" />
          )}
          Submit Pre-authorization
        </Button>
      </CardContent>
    </Card>
  );
}
