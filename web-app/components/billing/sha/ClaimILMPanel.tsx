/**
 * ClaimILMPanel — DHA HIE Middleware (ILM) per-action workflow for an SHA Claim.
 *
 * Surfaces the new `/api/sha/claims/{id}/ilm/...` endpoints introduced in
 * Phase 1b: start visit, manage interventions, manage diagnoses & lines,
 * preview, submit, and close. Designed to be embedded inside the SHA Claim
 * detail page next to the existing ConsentPanel / PreauthPanel.
 */
'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { shaApi } from '@/lib/api/sha';
import type { IlmCallResult } from '@/lib/schemas/sha.schema';
import type { ClaimFlowInfo } from '@/lib/hooks/use-claim-flow';
import { validateInterventionCombination, getBenefitCode, INTERVENTION_COMBINATION_RULES } from '@/lib/sha/combination-rules';

type ActionKey =
  | 'startVisit'
  | 'addIntervention'
  | 'addVirtualClaimLine'
  | 'addDiagnosis'
  | 'preview'
  | 'submit'
  | 'close';

interface ClaimILMPanelProps {
  claimId: number;
  /**
   * Routed DHA HIE flow info. When omitted, behaves as the legacy SHIF panel
   * (all sections visible, standard add-intervention endpoint).
   */
  flow?: ClaimFlowInfo;
  /** Active intervention codes already on this claim (for combination validation). */
  existingInterventions?: string[];
  /** Called after any action finishes so the parent can refetch the claim. */
  onChange?: () => void;
}

export function ClaimILMPanel({ claimId, flow, existingInterventions = [], onChange }: ClaimILMPanelProps) {
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IlmCallResult | null>(null);

  // form state
  const [otp, setOtp] = useState('');
  const [patientExternalId, setPatientExternalId] = useState('');
  const [interventionCodes, setInterventionCodes] = useState('');
  const [interventionCode, setInterventionCode] = useState('');
  const [icdCode, setIcdCode] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [cancelReason, setCancelReason] = useState('OTHER_REASONS');
  const [cancelText, setCancelText] = useState('');

  async function run<T extends ActionKey>(action: T, fn: () => Promise<IlmCallResult>) {
    setBusy(action);
    setError(null);
    try {
      const r = await fn();
      setResult(r);
      onChange?.();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  // Flow-driven UI rules (default to SHIF when caller omits the prop).
  const useVirtualLine = flow?.addLineEndpoint === 'add_virtual_claim_line';
  const showStartVisit = flow ? flow.requiresConsent : true;
  const startVisitTitle = flow?.flow === 'eccif' ? 'Open Emergency Claim' : 'Start Visit';
  const addInterventionTitle = useVirtualLine
    ? 'Add Virtual Claim Line (PHC)'
    : 'Add Intervention';
  const panelTitle = flow
    ? `DHA HIE Workflow \u2014 ${flow.badgeLabel}`
    : 'DHA HIE Middleware (ILM) Workflow';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{panelTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {flow && (
          <p className="text-xs text-muted-foreground">{flow.description}</p>
        )}
        {flow?.isPerDiem && (
          <Alert>
            <AlertTitle>Per Diem Billing</AlertTitle>
            <AlertDescription>
              This intervention uses per-day tariff billing. Line items are automatically
              computed from accrued admission days at discharge. Manual line items are not
              required. Use &ldquo;Transfer Ward&rdquo; on the Interventions panel to switch
              between wards (e.g., General Ward → ICU).
            </AlertDescription>
          </Alert>
        )}
        {flow?.isPerDiem && (
          <Alert>
            <AlertTitle>Per Diem Billing</AlertTitle>
            <AlertDescription>
              This intervention uses per-day tariff billing. Line items are automatically
              computed from accrued admission days at discharge. Manual line items are not
              required. Use &ldquo;Transfer Ward&rdquo; on the Interventions panel to switch
              between wards (e.g., General Ward → ICU).
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>ILM call failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            <AlertTitle>Last response (HTTP {result.status_code})</AlertTitle>
            <AlertDescription>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(result.payload ?? {}, null, 2)}
              </pre>
            </AlertDescription>
          </Alert>
        )}

        {/* Start Visit (skipped for ECCIF \u2014 emergency, no consent) */}
        {showStartVisit ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{startVisitTitle}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <Label htmlFor="ilm-otp">OTP</Label>
                <Input id="ilm-otp" value={otp} onChange={(e) => setOtp(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ilm-patient">DHA patient_id</Label>
                <Input
                  id="ilm-patient"
                  value={patientExternalId}
                  onChange={(e) => setPatientExternalId(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ilm-codes">Intervention codes (csv)</Label>
                <Input
                  id="ilm-codes"
                  value={interventionCodes}
                  onChange={(e) => setInterventionCodes(e.target.value)}
                />
              </div>
            </div>
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                run('startVisit', () =>
                  shaApi.ilmStartVisit(claimId, {
                    otp,
                    patient_id: patientExternalId,
                    intervention_codes: interventionCodes
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                    service_type: 'OUTPATIENT',
                  }),
                )
              }
            >
              {busy === 'startVisit' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {startVisitTitle}
            </Button>
          </section>
        ) : (
          <Alert>
            <AlertTitle>Emergency claim \u2014 consent skipped</AlertTitle>
            <AlertDescription>
              ECCIF flow allows claims to be opened without an initial consent token.
              Use the Open Emergency Claim action elsewhere in the workflow.
            </AlertDescription>
          </Alert>
        )}

        {/* Add Intervention / Diagnosis */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{addInterventionTitle}</h3>
            <Input
              placeholder="Intervention code"
              value={interventionCode}
              onChange={(e) => setInterventionCode(e.target.value)}
            />
            {/* Combination rule validation */}
            {interventionCode && existingInterventions.length > 0 && (() => {
              const validation = validateInterventionCombination(existingInterventions, interventionCode);
              if (!validation.valid) {
                return (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-2 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-300">{validation.reason}</span>
                  </div>
                );
              }
              return null;
            })()}
            {/* Show allowed combinations when a primary exists */}
            {existingInterventions.length > 0 && !interventionCode && (() => {
              const primaryBenefit = getBenefitCode(existingInterventions[0]!);
              const rules = INTERVENTION_COMBINATION_RULES[primaryBenefit];
              if (rules && rules.allowedCombinations !== 'ALONE') {
                return (
                  <p className="text-xs text-muted-foreground">
                    Can combine with: {rules.allowedCombinations.join(', ')}
                  </p>
                );
              }
              if (rules && rules.allowedCombinations === 'ALONE') {
                return (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {rules.name} must be reported alone — no additional interventions allowed.
                  </p>
                );
              }
              return null;
            })()}
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null || !interventionCode}
              onClick={() => {
                if (useVirtualLine) {
                  return run('addVirtualClaimLine', () =>
                    shaApi.ilmAddVirtualClaimLine(claimId, {
                      intervention_code: interventionCode,
                    }),
                  );
                }
                return run('addIntervention', () =>
                  shaApi.ilmAddIntervention(claimId, {
                    intervention_code: interventionCode,
                  }),
                );
              }}
            >
              {(busy === 'addIntervention' || busy === 'addVirtualClaimLine') && (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              )}
              Add
            </Button>
            {useVirtualLine && (
              <p className="text-xs text-muted-foreground">
                PHC interventions are submitted as virtual claim lines. Pre-authorization is not required.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Add Diagnosis</h3>
            <Input
              placeholder="ICD code"
              value={icdCode}
              onChange={(e) => setIcdCode(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null || !interventionCode}
              onClick={() =>
                run('addDiagnosis', () =>
                  shaApi.ilmAddDiagnosis(claimId, {
                    icd_code: icdCode,
                    intervention_code: interventionCode,
                  }),
                )
              }
            >
              Add
            </Button>
          </div>
        </section>

        {/* Preview / Submit / Close */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Lifecycle</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => run('preview', () => shaApi.ilmPreview(claimId))}
            >
              {busy === 'preview' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Preview
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="ilm-invoice">Invoice number</Label>
              <Input
                id="ilm-invoice"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
            {flow?.supportsInpatientDischarge ? (
              <p className="text-xs text-muted-foreground max-w-xs">
                Inpatient claims are submitted via the Discharge panel below.
              </p>
            ) : (
              <Button
                disabled={busy !== null || !invoiceNumber}
                onClick={() =>
                  run('submit', () =>
                    shaApi.ilmSubmit(claimId, { invoice_number: invoiceNumber }),
                  )
                }
              >
                {busy === 'submit' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Submit
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="ilm-cancel-type">Cancel reason</Label>
              <select
                id="ilm-cancel-type"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              >
                {[
                  'WRONG_PATIENT',
                  'NO_SERVICE_GIVEN',
                  'WRONG_BENEFIT',
                  'EXPIRED_VISIT',
                  'EXHAUSTED_BENEFIT',
                  'TIME_BARRED',
                  'OTHER_REASONS',
                ].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-[2]">
              <Label htmlFor="ilm-cancel-text">Notes</Label>
              <Input
                id="ilm-cancel-text"
                value={cancelText}
                onChange={(e) => setCancelText(e.target.value)}
              />
            </div>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={() =>
                run('close', () =>
                  shaApi.ilmClose(claimId, {
                    cancel_reason_type: cancelReason as any,
                    cancel_reason_text: cancelText,
                  }),
                )
              }
            >
              {busy === 'close' && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Close
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

export default ClaimILMPanel;
