/**
 * ClaimWorkflowTab — Orchestrates the proactive DHA HIE workflow.
 *
 * Renders the pre-visit checks, consent (when applicable), the ILM
 * workflow panel, and discharge — but only the panels relevant to this
 * claim's flow and current state. Captures the consent OTP/biometric GUID
 * once and threads it down so downstream steps don't re-prompt the user.
 */
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckCircle2, CircleDashed, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConsentPanel, type ConsentCredential } from './ConsentPanel';
import { ClaimILMPanel } from './ClaimILMPanel';
import { DischargePanel } from './DischargePanel';
import { DhaAttachmentSyncPanel } from './DhaAttachmentSyncPanel';
import { PreVisitChecksPanel } from './PreVisitChecksPanel';
import { InterventionSuggestionsPanel } from './InterventionSuggestionsPanel';
import { AutoAttachDocumentsButton } from './AutoAttachDocumentsButton';
import { shaApi } from '@/lib/api/sha';
import {
  filterValidationErrorsByActiveInterventions,
  filterClaimMissingDocumentTypesByActiveInterventions,
  parseMissingCoreAttachmentErrors,
  parseMissingInterventionDocumentErrors,
  toActiveInterventionCodeSet,
} from '@/lib/sha/missing-docs';
import { extractPreviewActiveInterventions } from '@/lib/sha/preview-interventions';
import { toCrId } from '@/lib/sha/ilm-parsers';
import type { Claim } from '@/lib/types/sha';
import type { ClaimFlowInfo } from '@/lib/hooks/use-claim-flow';
import { useQuery } from '@tanstack/react-query';

interface ClaimWorkflowTabProps {
  claim: Claim;
  flow: ClaimFlowInfo;
  isActive?: boolean;
  onChange: () => void;
}

const TERMINAL_STATUSES = new Set(['paid', 'partial', 'cancelled', 'written_off']);
const INPATIENT_PREFIXES = ['SHA-01', 'SHA-03', 'SHA-07', 'SHA-13', 'SHA-19', 'SHA-20'];

interface WorkflowStepCardProps {
  step: number;
  title: string;
  description: string;
  complete?: boolean;
  children: React.ReactNode;
}

function WorkflowStepCard({
  step,
  title,
  description,
  complete = false,
  children,
}: WorkflowStepCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{step}. {title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
          <Badge variant="outline" className={complete ? 'border-emerald-300 text-emerald-700' : ''}>
            {complete ? (
              <>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Ready
              </>
            ) : (
              <>
                <CircleDashed className="mr-1 h-3.5 w-3.5" />
                Pending
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ClaimWorkflowTab({ claim, flow, isActive = true, onChange }: ClaimWorkflowTabProps) {
  const [consentTokenStr, setConsentTokenStr] = useState('');
  const [consentCredential, setConsentCredential] = useState<ConsentCredential>({});
  // Intervention code selected during consent — reused by ClaimILMPanel for start_visit
  const [consentInterventionCode, setConsentInterventionCode] = useState<string>('');
  const [previewMemberNumber, setPreviewMemberNumber] = useState('');
  const [previewDhaInvoiceNumber, setPreviewDhaInvoiceNumber] = useState('');
  const [forceConsentRefresh, setForceConsentRefresh] = useState(false);
  const [consentLookupChecked, setConsentLookupChecked] = useState(false);

  // Derive patient CR ID for DHA API calls (intervention lookup, etc.)
  const patientCrId = claim.dha_external_id || toCrId(claim.sha_member_number ?? '') || '';
  const isTerminal = TERMINAL_STATUSES.has(claim.status);
  const isDraft = claim.status === 'draft';
  const visitStarted = !!claim.dha_visit_started_at;

  const localActiveInterventions = useMemo(
    () => (claim.claim_interventions ?? []).filter((i) => i.status === 'active'),
    [claim.claim_interventions],
  );

  const {
    data: workflowPreviewResult,
    isFetching: workflowPreviewFetching,
    dataUpdatedAt: workflowPreviewUpdatedAt,
  } = useQuery({
    queryKey: ['sha-claim-workflow-preview-interventions', claim.id, claim.updated_at],
    queryFn: () => shaApi.ilmPreview(claim.id),
    enabled: !isTerminal && !!claim.dha_visit_started_at,
    staleTime: 0,
    refetchInterval: !isTerminal && !!claim.dha_visit_started_at ? 60_000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const previewInterventionsState = useMemo(
    () => extractPreviewActiveInterventions(workflowPreviewResult?.payload),
    [workflowPreviewResult?.payload],
  );

  const activeInterventions = useMemo(
    () => (
      previewInterventionsState.available
        ? previewInterventionsState.interventions
        : visitStarted && workflowPreviewFetching
          ? []
        : localActiveInterventions
    ),
    [localActiveInterventions, previewInterventionsState, visitStarted, workflowPreviewFetching],
  );
  const interventionSourceLabel =
    previewInterventionsState.available
      ? 'DHA preview'
      : visitStarted && workflowPreviewFetching
        ? 'Syncing DHA preview...'
        : 'Local fallback';
  const workflowLastSyncText =
    previewInterventionsState.available && workflowPreviewUpdatedAt > 0
      ? new Date(workflowPreviewUpdatedAt).toLocaleTimeString()
      : 'Not yet synced';

  const hasPerDiemInpatientIntervention = useMemo(
    () => activeInterventions.some((i) => {
      if (!i.is_per_diem) return false;
      if (i.access_point === 'IP') return true;
      const prefix = i.intervention_code.split('-').slice(0, 2).join('-');
      return INPATIENT_PREFIXES.includes(prefix);
    }),
    [activeInterventions],
  );

  const facilityLevel = useMemo(() => {
    const raw = claim.facility_level;
    if (!raw) return undefined;
    const parsed = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [claim.facility_level]);

  // Auto-fetch consent token if consent was obtained (at check-in / earlier)
  // but the local state doesn't have the token string yet
  const fetchedConsentRef = useRef(false);
  useEffect(() => {
    fetchedConsentRef.current = false;
    setConsentLookupChecked(false);
  }, [claim.id]);

  useEffect(() => {
    if (fetchedConsentRef.current || consentTokenStr) {
      setConsentLookupChecked(true);
      return;
    }

    if (!claim.sha_member || visitStarted || !flow.requiresConsent) {
      setConsentLookupChecked(true);
      return;
    }

    fetchedConsentRef.current = true;

    const memberId = typeof claim.sha_member === 'number' ? claim.sha_member : undefined;
    if (!memberId) {
      setConsentLookupChecked(true);
      return;
    }

    shaApi.getLatestConsent(memberId, {
      encounterId: typeof claim.encounter === 'number' ? claim.encounter : undefined,
      claimPk: claim.id,
    }).then((data) => {
      if (data?.consent_token) {
        setConsentTokenStr(data.consent_token);
      }
    }).catch(() => {
      // Non-fatal — no existing valid token found.
    }).finally(() => {
      setConsentLookupChecked(true);
    });
  }, [claim.id, claim.sha_member, claim.encounter, consentTokenStr, visitStarted, flow.requiresConsent]);

  // Hide consent panel if a valid (non-expired) token exists.
  // consent_obtained is derived from live token state; false means missing or expired.
  const consentObtained = !!consentTokenStr;
  const needsConsentRefresh = forceConsentRefresh || !consentObtained;

  const showConsent =
    flow.requiresConsent
    && !!claim.sha_member
    && needsConsentRefresh
    && (consentLookupChecked || forceConsentRefresh)
    && (!visitStarted || forceConsentRefresh)
    && !isTerminal;
  const showIlm = !isTerminal;
  const showDischarge =
    flow.supportsInpatientDischarge &&
    (!!claim.admission_date || hasPerDiemInpatientIntervention) &&
    !claim.discharge_date &&
    !isTerminal;

  const activeInterventionCodeSet = useMemo(
    () => toActiveInterventionCodeSet(activeInterventions),
    [activeInterventions],
  );
  const missingFromClaim = useMemo(
    () => filterClaimMissingDocumentTypesByActiveInterventions(claim.missing_document_types ?? [], {
      activeInterventionCodes: activeInterventionCodeSet,
    }),
    [activeInterventionCodeSet, claim.missing_document_types],
  );

  const { data: submitValidation } = useQuery({
    queryKey: ['sha-claim-validate-summary', claim.id, claim.updated_at],
    queryFn: () => shaApi.validateClaimSubmission(claim.id),
    enabled: !isTerminal,
    staleTime: 0,
    refetchInterval: !isTerminal ? 60_000 : false,
    refetchIntervalInBackground: false,
  });

  const filteredValidationErrors = useMemo(
    () => filterValidationErrorsByActiveInterventions(submitValidation?.errors ?? [], {
      activeInterventionCodes: activeInterventionCodeSet,
    }),
    [activeInterventionCodeSet, submitValidation?.errors],
  );
  const coreAttachmentErrors = useMemo(
    () => parseMissingCoreAttachmentErrors(filteredValidationErrors).map((entry) => entry.rawError),
    [filteredValidationErrors],
  );
  const tariffMappingErrors =
    filteredValidationErrors.filter((error) => /missing SHA tariff code/i.test(error));
  const missing = useMemo(() => {
    const merged = new Map<string, { intervention_code: string; intervention_name: string; missing: string[] }>();

    for (const entry of missingFromClaim) {
      const interventionCode = entry.intervention_code?.trim().toUpperCase();
      if (!interventionCode) continue;
      const key = interventionCode;
      const docs = new Set(entry.missing ?? []);
      merged.set(key, {
        intervention_code: interventionCode,
        intervention_name: entry.intervention_name || interventionCode,
        missing: Array.from(docs),
      });
    }

    for (const parsed of parseMissingInterventionDocumentErrors(filteredValidationErrors)) {
      const interventionCode = parsed.interventionCode;
      const docType = parsed.documentCode;
      const existing = merged.get(interventionCode);
      if (!existing) {
        merged.set(interventionCode, {
          intervention_code: interventionCode,
          intervention_name: interventionCode,
          missing: [docType],
        });
        continue;
      }
      if (!existing.missing.includes(docType)) {
        existing.missing.push(docType);
      }
    }

    return Array.from(merged.values());
  }, [filteredValidationErrors, missingFromClaim]);
  const showRequiredDocumentsCard = missing.length > 0 || coreAttachmentErrors.length > 0;
  const attachmentsReady = !showRequiredDocumentsCard && tariffMappingErrors.length === 0;
  const consentReady = !showConsent;
  const hasInterventions = activeInterventions.length > 0;
  const prepareReady = !isDraft || hasInterventions;

  const readinessBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!prepareReady) blockers.push('Add at least one intervention to continue');
    if (coreAttachmentErrors.length > 0) blockers.push('Core attachments are still missing');
    if (missing.length > 0) blockers.push('Intervention-specific required documents are missing');
    if (tariffMappingErrors.length > 0) blockers.push('Some claim items are missing SHA tariff mapping');
    if (showConsent) blockers.push('Consent/authorization is required before submission');
    if (!showIlm) blockers.push('Claim is no longer in an editable workflow state');
    return blockers;
  }, [
    prepareReady,
    coreAttachmentErrors.length,
    missing.length,
    tariffMappingErrors.length,
    showConsent,
    showIlm,
  ]);

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
      <Card className={readinessBlockers.length > 0 ? 'border-amber-200 dark:border-amber-800/60' : ''}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Workflow path</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground">
              Follow this path in order: Prepare, Attachments, Consent/Authorization, then Submit.
            </p>
            <Badge
              variant="outline"
              className={previewInterventionsState.available ? 'border-emerald-300 text-emerald-700' : ''}
            >
              Interventions: {interventionSourceLabel}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">Last synced from DHA: {workflowLastSyncText}</p>
          {readinessBlockers.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Claim is ready for the final submission actions.</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1">
                  {readinessBlockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <WorkflowStepCard
        step={1}
        title="Prepare"
        description="Run pre-visit checks and ensure claim interventions are in place."
        complete={prepareReady}
      >
        <div className="space-y-4">
          <PreVisitChecksPanel
            patientPk={typeof claim.patient === 'number' ? claim.patient : undefined}
            shaMemberId={typeof claim.sha_member === 'number' ? claim.sha_member : undefined}
            shaMemberNumber={claim.sha_member_number ?? undefined}
            defaultDhaPatientId={claim.dha_external_id ?? undefined}
            encounterClinician={claim.encounter_clinician}
          />
          {isDraft && (
            <InterventionSuggestionsPanel
              claimId={claim.id}
              dhaPatientId={claim.dha_external_id ?? undefined}
              shaMemberId={typeof claim.sha_member === 'number' ? claim.sha_member : undefined}
              onAttached={onChange}
            />
          )}
        </div>
      </WorkflowStepCard>

      <WorkflowStepCard
        step={2}
        title="Attachments"
        description="Resolve required documents and sync claim files before submission."
        complete={attachmentsReady}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Auto-attach can generate core documents (clinical notes, medical report, invoice).
            </p>
            <AutoAttachDocumentsButton claimId={claim.id} onAttached={onChange} />
          </div>

          {coreAttachmentErrors.length > 0 && (
            <Alert>
              <AlertDescription>
                <span className="font-medium">Core attachments missing:</span>{' '}
                {coreAttachmentErrors.join(' · ').replaceAll('Missing required attachment: ', '')}
              </AlertDescription>
            </Alert>
          )}

          {missing.length > 0 && (
            <div className="space-y-2 rounded border p-3">
              <p className="text-sm font-medium">Intervention-specific required documents</p>
              {missing.map((entry, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{entry.intervention_name || entry.intervention_code}</span>
                  <div className="flex flex-wrap gap-1">
                    {entry.missing.map((docType, j) => (
                      <Badge key={j} variant="outline">{docType.replace(/_/g, ' ')}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tariffMappingErrors.length > 0 && (
            <Alert>
              <AlertDescription>
                <span className="font-medium">Tariff mapping required:</span> {tariffMappingErrors.join(' · ')}
              </AlertDescription>
            </Alert>
          )}

          {showDischarge && (
            <DhaAttachmentSyncPanel
              claimId={claim.id}
              claimUpdatedAt={claim.updated_at}
              onSynced={onChange}
            />
          )}
        </div>
      </WorkflowStepCard>

      <WorkflowStepCard
        step={3}
        title="Consent / Authorization"
        description="Capture or confirm active consent before visit-level submission actions."
        complete={consentReady}
      >
        {showConsent ? (
          <ConsentPanel
            shaMemberId={claim.sha_member!}
            patientCrId={patientCrId || undefined}
            encounterId={typeof claim.encounter === 'number' ? claim.encounter : undefined}
            claimPk={claim.id}
            flow={flow.flow}
            interventionCodes={consentInterventionCode ? [consentInterventionCode] : undefined}
            onConsentObtained={(_id, token, credential, interventionCode) => {
              setConsentTokenStr(token);
              setConsentCredential(credential);
              setForceConsentRefresh(false);
              if (interventionCode) setConsentInterventionCode(interventionCode);
              onChange();
            }}
          />
        ) : (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              {flow.requiresConsent
                ? 'Consent is available for this claim. Continue to submission.'
                : 'This flow does not require consent. Continue to submission.'}
            </AlertDescription>
          </Alert>
        )}
      </WorkflowStepCard>

      <WorkflowStepCard
        step={4}
        title="Submit"
        description="Execute ILM visit/preview/submit actions. For inpatient claims, complete discharge submission here."
        complete={attachmentsReady && consentReady}
      >
        <div className="space-y-4">
          {showIlm ? (
            <ClaimILMPanel
              claim={claim}
              flow={flow}
              isActive={isActive}
              consentToken={consentTokenStr}
              consentCredential={consentCredential}
              consentInterventionCode={consentInterventionCode}
              onPreviewContext={(ctx) => {
                if (ctx.memberNumber) setPreviewMemberNumber(ctx.memberNumber);
                if (ctx.dhaInvoiceNumber) setPreviewDhaInvoiceNumber(ctx.dhaInvoiceNumber);
              }}
              onConsentExpired={() => {
                setConsentTokenStr('');
                setConsentCredential({});
                setForceConsentRefresh(true);
              }}
              onChange={onChange}
            />
          ) : (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Workflow actions are not available for this claim state.
              </AlertDescription>
            </Alert>
          )}

          {showDischarge && (
            <DischargePanel
              claimId={claim.id}
              flow={flow}
              claimPatientId={typeof claim.patient === 'number' ? claim.patient : undefined}
              claimEncounterId={typeof claim.encounter === 'number' ? claim.encounter : undefined}
              shaMemberId={typeof claim.sha_member === 'number' ? claim.sha_member : undefined}
              consentToken={consentTokenStr}
              patientExternalId={previewMemberNumber || claim.dha_external_id || ''}
              invoiceNumber={claim.dha_invoice_number || previewDhaInvoiceNumber || claim.invoice_number || ''}
              invoiceId={typeof claim.invoice === 'number' ? claim.invoice : null}
              facilityLevel={facilityLevel}
              activeInterventions={activeInterventions}
              onChange={onChange}
            />
          )}
        </div>
      </WorkflowStepCard>
    </div>
  );
}
