/**
 * ClaimWorkflowTab — Orchestrates the proactive DHA HIE workflow.
 *
 * Renders the pre-visit checks, consent + preauth (when applicable), the ILM
 * workflow panel, and discharge — but only the panels relevant to this
 * claim's flow and current state. Captures the consent OTP/biometric GUID
 * once and threads it down so downstream steps don't re-prompt the user.
 */
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConsentPanel, type ConsentCredential } from './ConsentPanel';
import { PreauthPanel } from './PreauthPanel';
import { ClaimILMPanel } from './ClaimILMPanel';
import { DischargePanel } from './DischargePanel';
import { PreVisitChecksPanel } from './PreVisitChecksPanel';
import { InterventionSuggestionsPanel } from './InterventionSuggestionsPanel';
import { AutoAttachDocumentsButton } from './AutoAttachDocumentsButton';
import { shaApi } from '@/lib/api/sha';
import { toCrId } from '@/lib/sha/ilm-parsers';
import type { Claim } from '@/lib/types/sha';
import type { ClaimFlowInfo } from '@/lib/hooks/use-claim-flow';
import { useQuery } from '@tanstack/react-query';

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
  // Intervention code selected during consent — reused by ClaimILMPanel for start_visit
  const [consentInterventionCode, setConsentInterventionCode] = useState<string>('');
  const [previewAuthorizationCode, setPreviewAuthorizationCode] = useState('');
  const [previewMemberNumber, setPreviewMemberNumber] = useState('');
  const [previewDhaInvoiceNumber, setPreviewDhaInvoiceNumber] = useState('');

  // Derive patient CR ID for DHA API calls (intervention lookup, etc.)
  const patientCrId = claim.dha_external_id || toCrId(claim.sha_member_number ?? '') || '';

  // Intervention codes already attached to the claim — passed to ConsentPanel so
  // it can pre-select the service and include them in the OTP/biometric request.
  const interventionCodes = useMemo(
    () => (claim.claim_interventions ?? []).filter((i) => i.status === 'active').map((i) => i.intervention_code),
    [claim.claim_interventions],
  );

  const activeInterventions = useMemo(
    () => (claim.claim_interventions ?? []).filter((i) => i.status === 'active'),
    [claim.claim_interventions],
  );

  const facilityLevel = useMemo(() => {
    const raw = claim.facility_level;
    if (!raw) return undefined;
    const parsed = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [claim.facility_level]);

  const isTerminal = TERMINAL_STATUSES.has(claim.status);
  const isDraft = claim.status === 'draft';
  const visitStarted = !!claim.dha_visit_started_at;

  // Auto-fetch consent token if consent was obtained (at check-in / earlier)
  // but the local state doesn't have the token string yet
  const fetchedConsentRef = useRef(false);
  useEffect(() => {
    if (fetchedConsentRef.current || consentTokenStr || !claim.consent_obtained) return;
    if (!claim.sha_member || visitStarted) return;
    fetchedConsentRef.current = true;

    const memberId = typeof claim.sha_member === 'number' ? claim.sha_member : undefined;
    if (!memberId) return;

    shaApi.getLatestConsent(memberId).then((data) => {
      if (data?.consent_token) {
        setConsentTokenStr(data.consent_token);
        setConsentTokenId(data.id);
      }
    }).catch(() => { /* Non-fatal */ });
  }, [claim.consent_obtained, claim.sha_member, consentTokenStr, visitStarted]);

  // Hide consent panel if a valid (non-expired) token exists.
  // The backend's consent_obtained already checks expiry — if it returns false
  // the token has expired and we must re-obtain consent, even if dha_visit_started_at is set.
  const consentObtained = !!consentTokenStr || !!claim.consent_obtained;

  const showConsent =
    flow.requiresConsent && !!claim.sha_member && !consentObtained && !visitStarted && !isTerminal;
  const showPreauth = flow.requiresPreauth && !!claim.sha_member && !isTerminal;
  const showIlm = !isTerminal;
  const showDischarge =
    flow.supportsInpatientDischarge &&
    !!claim.admission_date &&
    !claim.discharge_date &&
    !isTerminal;

  const missing = claim.missing_document_types ?? [];

  const { data: submitValidation } = useQuery({
    queryKey: ['sha-claim-validate-summary', claim.id, claim.updated_at],
    queryFn: () => shaApi.validateClaimSubmission(claim.id),
    enabled: !isTerminal,
    staleTime: 0,
  });

  const coreAttachmentErrors =
    submitValidation?.errors?.filter((error) => /Missing required attachment:/i.test(error)) ?? [];
  const tariffMappingErrors =
    submitValidation?.errors?.filter((error) => /missing SHA tariff code/i.test(error)) ?? [];
  const showRequiredDocumentsCard = missing.length > 0 || coreAttachmentErrors.length > 0;

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
    <div id="claim-workflow-section" className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* Step 0 — Pre-visit checks (already proactive) */}
      <PreVisitChecksPanel
        patientPk={typeof claim.patient === 'number' ? claim.patient : undefined}
        shaMemberId={typeof claim.sha_member === 'number' ? claim.sha_member : undefined}
        shaMemberNumber={claim.sha_member_number ?? undefined}
        defaultDhaPatientId={claim.dha_external_id ?? undefined}
        encounterClinician={claim.encounter_clinician}
      />

      {/* Missing documents (advisory) */}
      {showRequiredDocumentsCard && (
        <Card className="border-amber-200 dark:border-amber-800/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-amber-800 dark:text-amber-300">
                Required documents
              </CardTitle>
              <AutoAttachDocumentsButton claimId={claim.id} onAttached={onChange} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {coreAttachmentErrors.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50/70 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <p className="font-medium">Core attachments still missing</p>
                <p className="text-amber-800/90 dark:text-amber-300/90">
                  {coreAttachmentErrors.join(' · ').replaceAll('Missing required attachment: ', '')}
                </p>
              </div>
            )}

            {missing.length > 0 ? (
              <>
                <p className="text-muted-foreground">
                  SHA requires the following intervention-specific documents before submission.
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
              </>
            ) : (
              <p className="text-muted-foreground">
                Use auto-attach to generate local core attachments (clinical notes + invoice) for submit readiness.
              </p>
            )}

            {tariffMappingErrors.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50/70 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <p className="font-medium">Tariff mapping required</p>
                <p className="text-amber-800/90 dark:text-amber-300/90">{tariffMappingErrors.join(' · ')}</p>
              </div>
            )}
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
              patientCrId={patientCrId || undefined}
              flow={flow.flow}
              interventionCodes={interventionCodes}
              onConsentObtained={(id, token, credential, interventionCode) => {
                setConsentTokenId(id);
                setConsentTokenStr(token);
                setConsentCredential(credential);
                if (interventionCode) setConsentInterventionCode(interventionCode);
                onChange();
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

      {/* Auto-suggested interventions from clinical data */}
      {isDraft && (
        <InterventionSuggestionsPanel
          claimId={claim.id}
          dhaPatientId={claim.dha_external_id ?? undefined}
          shaMemberId={typeof claim.sha_member === 'number' ? claim.sha_member : undefined}
          onAttached={onChange}
        />
      )}

      {/* Proactive ILM workflow (non-terminal states) */}
      {showIlm && (
        <ClaimILMPanel
          claim={claim}
          flow={flow}
          consentToken={consentTokenStr}
          consentCredential={consentCredential}
          consentInterventionCode={consentInterventionCode}
          onPreviewContext={(ctx) => {
            if (ctx.authorizationCode) setPreviewAuthorizationCode(ctx.authorizationCode);
            if (ctx.memberNumber) setPreviewMemberNumber(ctx.memberNumber);
            if (ctx.dhaInvoiceNumber) setPreviewDhaInvoiceNumber(ctx.dhaInvoiceNumber);
          }}
          onChange={onChange}
        />
      )}

      {/* Discharge (inpatient flows only) */}
      {showDischarge && (
        <DischargePanel
          claimId={claim.id}
          flow={flow}
          claimPatientId={typeof claim.patient === 'number' ? claim.patient : undefined}
          claimEncounterId={typeof claim.encounter === 'number' ? claim.encounter : undefined}
          shaMemberId={typeof claim.sha_member === 'number' ? claim.sha_member : undefined}
          consentToken={consentTokenStr || previewAuthorizationCode}
          patientExternalId={previewMemberNumber || claim.dha_external_id || ''}
          invoiceNumber={claim.dha_invoice_number || previewDhaInvoiceNumber || claim.invoice_number || ''}
          invoiceId={typeof claim.invoice === 'number' ? claim.invoice : null}
          facilityLevel={facilityLevel}
          activeInterventions={activeInterventions}
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
