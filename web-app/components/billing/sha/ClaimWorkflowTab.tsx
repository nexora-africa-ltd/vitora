/**
 * ClaimWorkflowTab — Orchestrates the proactive DHA HIE workflow.
 *
 * Renders the pre-visit checks, consent + preauth (when applicable), the ILM
 * workflow panel, and discharge — but only the panels relevant to this
 * claim's flow and current state. Captures the consent OTP/biometric GUID
 * once and threads it down so downstream steps don't re-prompt the user.
 */
'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConsentPanel, type ConsentCredential } from './ConsentPanel';
import { PreauthPanel } from './PreauthPanel';
import { ClaimILMPanel } from './ClaimILMPanel';
import { DischargePanel } from './DischargePanel';
import { PreVisitChecksPanel } from './PreVisitChecksPanel';
import type { Claim } from '@/lib/types/sha';
import type { ClaimFlowInfo } from '@/lib/hooks/use-claim-flow';

interface ClaimWorkflowTabProps {
  claim: Claim;
  flow: ClaimFlowInfo;
  onChange: () => void;
}

const TERMINAL_STATUSES = new Set(['paid', 'partial', 'cancelled', 'written_off']);

export function ClaimWorkflowTab({ claim, flow, onChange }: ClaimWorkflowTabProps) {
  const [consentTokenId, setConsentTokenId] = useState<number | undefined>();
  const [consentTokenStr, setConsentTokenStr] = useState('');
  const [consentCredential, setConsentCredential] = useState<ConsentCredential>({});

  const isTerminal = TERMINAL_STATUSES.has(claim.status);
  const isDraft = claim.status === 'draft';
  const visitStarted = !!claim.dha_visit_started_at;

  const showConsent =
    flow.requiresConsent && !!claim.sha_member && !visitStarted && !isTerminal;
  const showPreauth = flow.requiresPreauth && !!claim.sha_member && !isTerminal;
  const showIlm = !isTerminal;
  const showDischarge =
    flow.supportsInpatientDischarge &&
    !!claim.admission_date &&
    !claim.discharge_date &&
    !isTerminal;

  const missing = claim.missing_document_types ?? [];

  if (isTerminal) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This claim is in a terminal state ({claim.status.replace('_', ' ')}). No further
          workflow actions are available.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Step 0 — Pre-visit checks (already proactive) */}
      <PreVisitChecksPanel
        patientPk={typeof claim.patient === 'number' ? claim.patient : undefined}
        shaMemberId={typeof claim.sha_member === 'number' ? claim.sha_member : undefined}
        shaMemberNumber={claim.sha_member_number ?? undefined}
        defaultDhaPatientId={claim.dha_external_id ?? undefined}
        defaultFacilityCode={claim.facility_code ?? undefined}
      />

      {/* Missing documents (advisory) */}
      {missing.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-800 dark:text-amber-300">
              Required documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              SHA requires the following documents before this claim can be submitted.
            </p>
            {missing.map((entry, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="font-medium">
                  {entry.intervention_name || entry.intervention_code}
                </span>
                <div className="flex flex-wrap gap-1">
                  {entry.missing.map((docType, j) => (
                    <Badge
                      key={j}
                      variant="outline"
                      className="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800"
                    >
                      {docType.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Consent + Preauth (side by side when both apply) */}
      {(showConsent || showPreauth) && (
        <div
          className={`grid gap-4 ${showConsent && showPreauth ? 'lg:grid-cols-2' : ''}`}
        >
          {showConsent && (
            <ConsentPanel
              shaMemberId={claim.sha_member!}
              flow={flow.flow}
              onConsentObtained={(id, token, credential) => {
                setConsentTokenId(id);
                setConsentTokenStr(token);
                setConsentCredential(credential);
              }}
            />
          )}
          {showPreauth && (
            <PreauthPanel
              claimId={claim.id}
              consentTokenId={consentTokenId}
              diagnosisCodes={
                claim.primary_diagnosis_code ? [claim.primary_diagnosis_code] : []
              }
              isElective={flow.isElectivePreauth}
              shaMemberId={
                typeof claim.sha_member === 'number' ? claim.sha_member : undefined
              }
              onPreauthComplete={onChange}
            />
          )}
        </div>
      )}

      {/* Proactive ILM workflow (non-terminal states) */}
      {showIlm && (
        <ClaimILMPanel
          claim={claim}
          flow={flow}
          consentToken={consentTokenStr}
          consentCredential={consentCredential}
          onChange={onChange}
        />
      )}

      {/* Discharge (inpatient flows only) */}
      {showDischarge && (
        <DischargePanel
          claimId={claim.id}
          flow={flow}
          consentToken={consentTokenStr}
          patientExternalId={claim.dha_external_id ?? ''}
          invoiceNumber={claim.invoice_number ?? ''}
          onChange={onChange}
        />
      )}

      {/* Quiet state — nothing to do */}
      {!showConsent && !showPreauth && !showDischarge && !isDraft && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Awaiting insurer response. Use the actions above to amend interventions or
            re-submit if needed.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
