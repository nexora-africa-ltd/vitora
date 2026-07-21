'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';

interface ClaimPreviewPanelProps {
  payload: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [];
}

function asString(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function formatMoney(value: unknown): string {
  if (value === null || value === undefined || value === '') return '0';
  return String(value);
}

function compactTopLevelMeta(data: Record<string, unknown>): Array<[string, string]> {
  const reserved = new Set([
    'invoices',
    'interventions',
    'claim_diagnoses',
    'claim_attachments',
    'claim_doctors',
  ]);

  return Object.entries(data)
    .filter(([key, value]) => !reserved.has(key) && !Array.isArray(value) && typeof value !== 'object')
    .slice(0, 16)
    .map(([key, value]) => [key, asString(value)]);
}

export function ClaimPreviewPanel({ payload }: ClaimPreviewPanelProps) {
  const data = asRecord(payload);
  const invoices = asArray(data.invoices);
  const interventions = asArray(data.interventions);
  const diagnoses = asArray(data.claim_diagnoses);
  const attachments = asArray(data.claim_attachments);
  const doctors = asArray(data.claim_doctors);
  const topMeta = compactTopLevelMeta(data);

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Preview Result</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            Workflow: {String(data.workflow_state || '-')}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Auth: {String(data.claim_auth_status || '-')}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Service: {String(data.service_type || '-')}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Currency: {String(data.currency || 'KES')}
          </Badge>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
        <div><p className="text-muted-foreground">Claim ID</p><p className="font-medium font-mono">{asString(data.id)}</p></div>
        <div><p className="text-muted-foreground">Claim Ref</p><p className="font-medium font-mono">{asString(data.claim_id || data.reference_number)}</p></div>
        <div><p className="text-muted-foreground">Patient</p><p className="font-medium">{asString(data.patient_name)}</p></div>
        <div><p className="text-muted-foreground">Patient Number</p><p className="font-medium">{asString(data.patient_number)}</p></div>
        <div><p className="text-muted-foreground">Member Name</p><p className="font-medium">{asString(data.member_name)}</p></div>
        <div><p className="text-muted-foreground">Member Number</p><p className="font-medium">{asString(data.member_number)}</p></div>
        <div><p className="text-muted-foreground">Provider</p><p className="font-medium">{asString(data.provider_name)}</p></div>
        <div><p className="text-muted-foreground">Payer</p><p className="font-medium">{asString(data.payer_name)}</p></div>
        <div><p className="text-muted-foreground">Visit Number</p><p className="font-medium">{asString(data.visit_number)}</p></div>
        <div><p className="text-muted-foreground">Visit Start</p><p className="font-medium">{asString(data.visit_start)}</p></div>
        <div><p className="text-muted-foreground">Visit End</p><p className="font-medium">{asString(data.visit_end)}</p></div>
        <div><p className="text-muted-foreground">Authorization Code</p><p className="font-medium font-mono">{asString(data.authorization_code)}</p></div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-xs">
        <div><p className="text-muted-foreground">Total Claim</p><p className="font-medium">KES {formatMoney(data.total_claim_amount)}</p></div>
        <div><p className="text-muted-foreground">Net Claim</p><p className="font-medium">KES {formatMoney(data.total_claim_net_amount)}</p></div>
        <div><p className="text-muted-foreground">Claim Copay</p><p className="font-medium">KES {formatMoney(data.total_claim_copay)}</p></div>
        <div><p className="text-muted-foreground">Claim Discount</p><p className="font-medium">KES {formatMoney(data.total_claim_discount)}</p></div>
        <div><p className="text-muted-foreground">Claim Splits</p><p className="font-medium">KES {formatMoney(data.total_claim_splits)}</p></div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded border bg-muted/20 p-2 text-xs space-y-1">
          <p className="font-medium">Invoices ({invoices.length})</p>
          {invoices.length === 0 ? (
            <p className="text-muted-foreground">No invoices in preview payload.</p>
          ) : (
            invoices.map((invoice, idx) => {
              const lines = asArray(invoice.lines);
              const flags = asArray(invoice.invoice_flags);
              const invoiceDoctors = asArray(invoice.doctors);
              return (
                <div key={`invoice-${idx}`} className="rounded border bg-background p-2 space-y-1">
                  <p className="font-medium">{String(invoice.invoice_number || `Invoice ${idx + 1}`)}</p>
                  <p className="text-muted-foreground">
                    {asString(invoice.dispatch_status)}, {asString(invoice.workflow_state)}
                  </p>
                  <p>
                    {lines.length} line(s) · KES {formatMoney(invoice.total_inv_net_amount || invoice.total_inv_amount)}
                  </p>
                  <p className="text-muted-foreground">
                    Date: {asString(invoice.invoice_date)} · Service: {asString(invoice.service_type)}
                  </p>
                  <p className="text-muted-foreground">
                    Copay: KES {formatMoney(invoice.total_inv_copay)} · Discount: KES {formatMoney(invoice.total_inv_discount)}
                  </p>
                  {invoiceDoctors.length > 0 && (
                    <p className="text-muted-foreground">
                      Doctors: {invoiceDoctors.map((d) => asString(d.slade_code)).join(', ')}
                    </p>
                  )}
                  {flags.length > 0 && (
                    <div className="rounded border border-amber-300/40 bg-amber-50/40 p-1.5 space-y-1">
                      <p className="font-medium">Invoice Flags ({flags.length})</p>
                      {flags.slice(0, 3).map((flag, flagIdx) => (
                        <p key={`flag-${idx}-${flagIdx}`} className="truncate">
                          {asString(flag.code)} - {asString(flag.message || flag.description)}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="rounded border p-1.5 space-y-1">
                    <p className="font-medium">Lines ({lines.length})</p>
                    {lines.length === 0 ? (
                      <p className="text-muted-foreground">No invoice lines returned.</p>
                    ) : (
                      lines.slice(0, 8).map((line, lineIdx) => (
                        <p key={`line-${idx}-${lineIdx}`} className="truncate">
                          {asString(line.item_code || line.intervention_code)} · {asString(line.item_name)}
                          {' · qty '}
                          {asString(line.quantity, '1')}
                          {' · KES '}
                          {formatMoney(line.line_net_amount || line.line_total_amount || line.unit_price)}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="rounded border bg-muted/20 p-2 text-xs space-y-1">
          <p className="font-medium">Interventions ({interventions.length})</p>
          {interventions.length === 0 ? (
            <p className="text-muted-foreground">No interventions in preview payload.</p>
          ) : (
            interventions.map((intervention, idx) => (
              <div key={`intervention-${idx}`} className="rounded border bg-background p-2 space-y-1">
                <p className="font-medium">{asString(intervention.intervention_code)} · {asString(intervention.intervention_name)}</p>
                <p className="text-muted-foreground">{asString(intervention.intervention_payment_mechanism)} · {asString(intervention.workflow_state)}</p>
                <p>Tariff: KES {formatMoney(intervention.keph_level_tarrif || intervention.intervention_overall_tariff)}</p>
                <p>Accrued: KES {formatMoney(intervention.accrued_per_diem_amount)} ({asString(intervention.accrued_per_diem_days, '0')} day(s))</p>
                <p>Preauth: {intervention.needs_preauth || intervention.preauth_exist ? 'Yes' : 'No'}</p>
                <p className="text-muted-foreground">
                  Bill range: {asString(intervention.bill_from)} {'->'} {asString(intervention.bill_to)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-5 text-xs">
        <div className="rounded border p-2"><p className="text-muted-foreground">Diagnoses</p><p className="font-medium">{diagnoses.length}</p></div>
        <div className="rounded border p-2"><p className="text-muted-foreground">Attachments</p><p className="font-medium">{attachments.length}</p></div>
        <div className="rounded border p-2"><p className="text-muted-foreground">Doctors</p><p className="font-medium">{doctors.length}</p></div>
        <div className="rounded border p-2"><p className="text-muted-foreground">Number of Invoices</p><p className="font-medium">{asString(data.number_of_invoices, String(invoices.length))}</p></div>
        <div className="rounded border p-2"><p className="text-muted-foreground">Diagnoses Count</p><p className="font-medium">{asString(data.diagnoses_count, String(diagnoses.length))}</p></div>
      </div>

      {diagnoses.length > 0 && (
        <div className="rounded border p-2 text-xs space-y-1">
          <p className="font-medium mb-1">Claim Diagnoses</p>
          {diagnoses.map((diag, idx) => (
            <p key={`diag-${idx}`} className="truncate">
              {asString(diag.diagnosis_code || diag.icd_code)} · {asString(diag.diagnosis_name || diag.diagnosis)}
              {' · intervention '}
              {asString(diag.intervention_code)}
              {' · recorded '}
              {asString(diag.recorded_on || diag.original_visit_date)}
            </p>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="rounded border p-2 text-xs space-y-1">
          <p className="font-medium mb-1">Claim Attachments</p>
          {attachments.map((attachment, idx) => (
            <p key={`attachment-${idx}`} className="truncate">
              {asString(attachment.attachment_type)} · {asString(attachment.title || attachment.description)}
              {' · intervention '}
              {asString(attachment.intervention_code)}
              {' · retries '}
              {asString(attachment.retry_count, '0')}
            </p>
          ))}
        </div>
      )}

      {doctors.length > 0 && (
        <div className="rounded border p-2 text-xs">
          <p className="font-medium mb-1">Claim Doctors</p>
          {doctors.map((doctor, idx) => (
            <p key={`doctor-${idx}`}>
              {asString(doctor.doctor_name)} · {asString(doctor.slade_code)} · {asString(doctor.doctor_request_status)}
            </p>
          ))}
        </div>
      )}

      {topMeta.length > 0 && (
        <div className="rounded border p-2 text-xs space-y-2">
          <p className="font-medium">Additional Payload Fields</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {topMeta.map(([key, value]) => (
              <div key={`meta-${key}`}>
                <p className="text-muted-foreground break-all">{key}</p>
                <p className="font-medium break-all">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="rounded border p-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Raw preview payload</summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default ClaimPreviewPanel;
