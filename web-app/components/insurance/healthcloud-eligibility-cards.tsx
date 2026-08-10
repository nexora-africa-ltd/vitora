'use client';

import React from 'react';

import { Badge } from '@/components/ui/badge';
import type { VerifyViaHealthcloudResult } from '@/lib/types/insurance';

export type HealthcloudEligibilityContact = {
  id: number;
  contactValue: string;
};

export type HealthcloudEligibilityBenefit = {
  benefitName?: string;
  benefitCode?: string;
  benefitType?: string;
  benefitLimit?: number;
  visitLimit?: number;
  availableBalance?: number;
  copayType?: string | null;
  copayValue?: number | null;
  copayAppliesTo?: string[];
};

export type HealthcloudEligibilityView = {
  raw: Record<string, unknown>;
  member: Record<string, unknown> | null;
  cover: Record<string, unknown> | null;
  contacts: HealthcloudEligibilityContact[];
  benefits: HealthcloudEligibilityBenefit[];
  vipStatus: {
    vip: boolean | null;
    vvip: boolean | null;
  };
  coverCopay: {
    value: number | null;
    appliesTo: string[];
  };
};

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
};

export function buildHealthcloudEligibilityViewFromRaw(
  rawResponse: Record<string, unknown> | null
): HealthcloudEligibilityView | null {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return null;
  }

  const raw = rawResponse;
  const member = raw.member && typeof raw.member === 'object'
    ? (raw.member as Record<string, unknown>)
    : null;
  const cover = raw.cover && typeof raw.cover === 'object'
    ? (raw.cover as Record<string, unknown>)
    : null;

  const contactsSource = member?.contacts;
  const contacts = Array.isArray(contactsSource)
    ? contactsSource
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .map((row) => ({
          id: Number(row.id ?? 0),
          contactValue: String(row.contactValue ?? ''),
        }))
        .filter((row) => row.id > 0)
    : [];

  const benefitsSource = raw.benefits;
  const benefits = Array.isArray(benefitsSource)
    ? benefitsSource
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .map((row) => ({
          benefitName: typeof row.benefitName === 'string' ? row.benefitName : undefined,
          benefitCode: typeof row.benefitCode === 'string' ? row.benefitCode : undefined,
          benefitType: typeof row.benefitType === 'string' ? row.benefitType : undefined,
          benefitLimit: parseNumber(row.benefitLimit),
          visitLimit: parseNumber(row.visitLimit),
          availableBalance: parseNumber(row.availableBalance),
          copayType:
            typeof row.copayType === 'string' || row.copayType === null
              ? (row.copayType as string | null)
              : undefined,
          copayValue:
            row.copayValue === null
              ? null
              : parseNumber(row.copayValue ?? row.copay_value ?? row.copayAmount ?? row.copay_amount),
          copayAppliesTo: parseStringArray(
            row.copayAppliesTo ?? row.copay_applies_to ?? row.appliesTo ?? row.applies_to
          ),
        }))
    : [];

  const readBooleanFromAny = (keys: string[]): boolean | null => {
    const sources: Array<Record<string, unknown> | null> = [member, cover, raw];
    for (const source of sources) {
      if (!source) continue;
      for (const key of keys) {
        if (!(key in source)) continue;
        const value = source[key];
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value === 1;
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
          if (['false', 'no', 'n', '0'].includes(normalized)) return false;
        }
      }
    }
    return null;
  };

  const coverCopayValue = parseNumber(
    cover?.copayValue ??
    cover?.copay_value ??
    raw.copayValue ??
    raw.copay_value
  );
  const coverCopayAppliesTo = parseStringArray(
    cover?.copayAppliesTo ??
    cover?.copay_applies_to ??
    raw.copayAppliesTo ??
    raw.copay_applies_to
  );

  return {
    raw,
    member,
    cover,
    contacts,
    benefits,
    vipStatus: {
      vip: readBooleanFromAny(['vip', 'isVip', 'is_vip', 'isVIP']),
      vvip: readBooleanFromAny(['vvip', 'isVvip', 'is_vvip', 'isVVIP']),
    },
    coverCopay: {
      value: coverCopayValue ?? null,
      appliesTo: coverCopayAppliesTo,
    },
  };
}

export function buildHealthcloudEligibilityView(
  eligibility: VerifyViaHealthcloudResult | null
): HealthcloudEligibilityView | null {
  if (!eligibility?.raw_response || typeof eligibility.raw_response !== 'object') {
    return null;
  }
  return buildHealthcloudEligibilityViewFromRaw(eligibility.raw_response as Record<string, unknown>);
}

export function HealthcloudEligibilityCards({
  eligibility,
  patientName,
  showRaw = true,
}: {
  eligibility: VerifyViaHealthcloudResult;
  patientName?: string;
  showRaw?: boolean;
}) {
  const view = buildHealthcloudEligibilityView(eligibility);
  if (!view) return null;

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Eligibility</p>
          <p className="font-medium">{eligibility.eligible ? 'Eligible' : 'Not eligible'}</p>
          <p className="text-muted-foreground">{eligibility.message}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Member</p>
          <p className="font-medium">{String(view.member?.names ?? patientName ?? 'N/A')}</p>
          <p className="text-muted-foreground">{eligibility.member_number}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Cover</p>
          <p className="font-medium">
            {String((view.cover?.schemeName ?? eligibility.plan_name) || 'N/A')}
          </p>
          <p className="text-muted-foreground">
            Status: {String((view.cover?.status ?? eligibility.status) || 'N/A')}
          </p>
          {(view.vipStatus.vip !== null || view.vipStatus.vvip !== null) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {view.vipStatus.vip !== null && (
                <Badge variant={view.vipStatus.vip ? 'default' : 'outline'}>
                  VIP: {view.vipStatus.vip ? 'Yes' : 'No'}
                </Badge>
              )}
              {view.vipStatus.vvip !== null && (
                <Badge variant={view.vipStatus.vvip ? 'default' : 'outline'}>
                  VVIP: {view.vipStatus.vvip ? 'Yes' : 'No'}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Contacts ({view.contacts.length})</p>
        {view.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts returned.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {view.contacts.map((contact) => (
              <Badge key={contact.id} variant="secondary" className="font-mono">
                {contact.id}: {contact.contactValue}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Benefits ({view.benefits.length})</p>
        {view.benefits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No benefits returned.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-1">Code</th>
                  <th className="pb-1">Name</th>
                  <th className="pb-1">Type</th>
                  <th className="pb-1">Visit Limit</th>
                  <th className="pb-1">Available</th>
                  <th className="pb-1">Copay</th>
                  <th className="pb-1">Copay Applies To</th>
                </tr>
              </thead>
              <tbody>
                {view.benefits.map((benefit, idx) => (
                  <tr key={`${benefit.benefitCode || 'benefit-row'}-${idx}`}>
                    <td className="py-1 font-mono">{benefit.benefitCode || 'N/A'}</td>
                    <td className="py-1">{benefit.benefitName || 'N/A'}</td>
                    <td className="py-1">{benefit.benefitType || 'N/A'}</td>
                    <td className="py-1">
                      {typeof benefit.visitLimit === 'number'
                        ? benefit.visitLimit.toLocaleString()
                        : 'N/A'}
                    </td>
                    <td className="py-1">
                      {typeof benefit.availableBalance === 'number'
                        ? benefit.availableBalance.toLocaleString()
                        : 'N/A'}
                    </td>
                    <td className="py-1">
                      {typeof benefit.copayValue === 'number'
                        ? `${benefit.copayType ? `${benefit.copayType}: ` : ''}${benefit.copayValue.toLocaleString()}`
                        : benefit.copayType || 'N/A'}
                    </td>
                    <td className="py-1">
                      {benefit.copayAppliesTo && benefit.copayAppliesTo.length > 0
                        ? benefit.copayAppliesTo.join(', ')
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(typeof view.coverCopay.value === 'number' || view.coverCopay.appliesTo.length > 0) && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Cover-Level Copay</p>
          <p className="text-sm">
            Value: {typeof view.coverCopay.value === 'number' ? view.coverCopay.value.toLocaleString() : 'N/A'}
          </p>
          <p className="text-xs text-muted-foreground">
            Applies to: {view.coverCopay.appliesTo.length > 0 ? view.coverCopay.appliesTo.join(', ') : 'Not specified'}
          </p>
        </div>
      )}

      {showRaw && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Raw eligibility response
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px]">
            {JSON.stringify(eligibility.raw_response, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
