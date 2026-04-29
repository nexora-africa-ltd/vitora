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
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { shaApi } from '@/lib/api/sha';
import type { IlmCallResult } from '@/lib/schemas/sha.schema';

type ActionKey =
  | 'startVisit'
  | 'addIntervention'
  | 'addDiagnosis'
  | 'preview'
  | 'submit'
  | 'close';

interface ClaimILMPanelProps {
  claimId: number;
  /** Called after any action finishes so the parent can refetch the claim. */
  onChange?: () => void;
}

export function ClaimILMPanel({ claimId, onChange }: ClaimILMPanelProps) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">DHA HIE Middleware (ILM) Workflow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
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

        {/* Start Visit */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Start Visit</h3>
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
            Start Visit
          </Button>
        </section>

        {/* Add Intervention / Diagnosis */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Add Intervention</h3>
            <Input
              placeholder="Intervention code"
              value={interventionCode}
              onChange={(e) => setInterventionCode(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                run('addIntervention', () =>
                  shaApi.ilmAddIntervention(claimId, {
                    intervention_code: interventionCode,
                  }),
                )
              }
            >
              Add
            </Button>
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
