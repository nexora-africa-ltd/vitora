/**
 * Structured renderers for parsed DHA HIE (ILM) responses.
 *
 * Replaces raw JSON `<pre>` dumps with user-friendly cards. Each renderer
 * accepts a `Parsed*` shape from `lib/sha/ilm-parsers.ts` and falls back to
 * a clean "No result" message when null.
 */
'use client';

import React from 'react';
import {
  CheckCircle2,
  ShieldCheck,
  ShieldOff,
  Building2,
  Stethoscope,
  Calendar,
  Hash,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  ParsedEligibility,
  ParsedFacility,
  ParsedProfessional,
  ParsedUtilizationEntry,
} from '@/lib/sha/ilm-parsers';

function formatDate(value: string): string {
  if (!value) return '';
  try {
    return format(parseISO(value), 'd MMM yyyy');
  } catch {
    return value;
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function Value({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-sm font-medium', className)}>{children}</p>;
}

function EmptyResult({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
      <AlertCircle className="h-4 w-4" />
      {message}
    </div>
  );
}

// ============================================================================
// Eligibility
// ============================================================================

export function EligibilityResultCard({ result }: { result: ParsedEligibility | null }) {
  if (!result) return <EmptyResult message="No eligibility data returned by DHA." />;

  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-3',
        result.isActive
          ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20'
          : 'border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {result.isActive ? (
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <ShieldOff className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
        )}
        <span className="text-sm font-semibold">
          {result.fullName || 'Member'}
        </span>
        {result.memberCrNumber && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {result.memberCrNumber}
          </Badge>
        )}
        {result.whitelistedForOTP && (
          <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            OTP whitelisted
          </Badge>
        )}
        <Badge
          variant={result.isActive ? 'default' : 'outline'}
          className={cn(
            'ml-auto',
            result.isActive
              ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
              : 'border-amber-400 text-amber-700 dark:text-amber-300'
          )}
        >
          {result.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {result.identificationNumber && (
          <div>
            <Label>ID number</Label>
            <Value className="font-mono">{result.identificationNumber}</Value>
          </div>
        )}
        {result.identificationType && (
          <div>
            <Label>ID type</Label>
            <Value>{result.identificationType}</Value>
          </div>
        )}
        {result.gender && (
          <div>
            <Label>Gender</Label>
            <Value>{result.gender}</Value>
          </div>
        )}
        {typeof result.age === 'number' && (
          <div>
            <Label>Age</Label>
            <Value>{result.age}</Value>
          </div>
        )}
      </div>

      {result.schemes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {result.schemes.length} scheme{result.schemes.length !== 1 ? 's' : ''}
          </p>
          {result.schemes.map((s, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded border bg-background px-2.5 py-1.5 text-xs"
            >
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px]',
                  s.coverageStatus === 'ACTIVE'
                    ? 'border-emerald-400 text-emerald-700 dark:text-emerald-300'
                    : 'border-amber-400 text-amber-700 dark:text-amber-300'
                )}
              >
                {s.coverageStatus || 'UNKNOWN'}
              </Badge>
              <span className="font-medium truncate">{s.schemeName || 'Unknown scheme'}</span>
              {s.memberType && (
                <span className="text-muted-foreground capitalize">· {s.memberType.toLowerCase()}</span>
              )}
              <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatDate(s.coverageStart) || '?'} → {formatDate(s.coverageEnd) || '?'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Facility
// ============================================================================

export function FacilityResultCard({ result }: { result: ParsedFacility | null }) {
  if (!result) return <EmptyResult message="No facility found." />;

  const isContracted = result.shaContractStatus === 'ACTIVE' || result.shaContractStatus === 'CONTRACTED';

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-background">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="h-5 w-5 text-primary shrink-0" />
        <span className="text-sm font-semibold">{result.officialName || 'Unknown facility'}</span>
        {result.kephLevel && (
          <Badge variant="outline" className="text-[10px]">
            KEPH {result.kephLevel}
          </Badge>
        )}
        {result.shaContractStatus && (
          <Badge
            variant="outline"
            className={cn(
              'ml-auto text-[10px]',
              isContracted
                ? 'border-emerald-400 text-emerald-700 dark:text-emerald-300'
                : 'border-amber-400 text-amber-700 dark:text-amber-300'
            )}
          >
            {isContracted ? 'SHA Contracted' : result.shaContractStatus}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {result.fidCode && (
          <div>
            <Label>MFL / FID</Label>
            <Value className="font-mono">{result.fidCode}</Value>
          </div>
        )}
        {result.frCode && (
          <div>
            <Label>FR code</Label>
            <Value className="font-mono">{result.frCode}</Value>
          </div>
        )}
        {result.facilityType && (
          <div>
            <Label>Type</Label>
            <Value>{result.facilityType}</Value>
          </div>
        )}
        {(result.county || result.subCounty) && (
          <div>
            <Label>Location</Label>
            <Value>
              {[result.subCounty, result.county].filter(Boolean).join(', ')}
            </Value>
          </div>
        )}
      </div>

      {result.shaContractedServices.length > 0 && (
        <div>
          <Label>Contracted services ({result.shaContractedServices.length})</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {result.shaContractedServices.slice(0, 12).map((svc, i) => (
              <Badge key={i} variant="outline" className="text-[10px] font-normal">
                {svc}
              </Badge>
            ))}
            {result.shaContractedServices.length > 12 && (
              <Badge variant="outline" className="text-[10px]">
                +{result.shaContractedServices.length - 12} more
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Professional / Practitioner
// ============================================================================

export function ProfessionalResultCard({ result }: { result: ParsedProfessional | null }) {
  if (!result) return <EmptyResult message="No practitioner found." />;

  const isActive = result.licenseStatus === 'ACTIVE' || result.licenseStatus === 'VALID' || result.licenseStatus === 'LICENSED';

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-background">
      <div className="flex flex-wrap items-center gap-2">
        <Stethoscope className="h-5 w-5 text-primary shrink-0" />
        <span className="text-sm font-semibold">{result.fullName || 'Unknown practitioner'}</span>
        {result.regulator && (
          <Badge variant="outline" className="text-[10px]">
            {result.regulator}
          </Badge>
        )}
        {result.licenseStatus && (
          <Badge
            variant="outline"
            className={cn(
              'ml-auto text-[10px]',
              isActive
                ? 'border-emerald-400 text-emerald-700 dark:text-emerald-300'
                : 'border-amber-400 text-amber-700 dark:text-amber-300'
            )}
          >
            {result.licenseStatus}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {result.registrationNumber && (
          <div>
            <Label>Reg. number</Label>
            <Value className="font-mono">{result.registrationNumber}</Value>
          </div>
        )}
        {result.cadre && (
          <div>
            <Label>Cadre</Label>
            <Value>{result.cadre}</Value>
          </div>
        )}
        {result.specialty && (
          <div>
            <Label>Specialty</Label>
            <Value>{result.specialty}</Value>
          </div>
        )}
        {result.licenseExpiry && (
          <div>
            <Label>Licence expires</Label>
            <Value>{formatDate(result.licenseExpiry)}</Value>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Utilisation
// ============================================================================

export function UtilizationResultCard({ entries }: { entries: ParsedUtilizationEntry[] }) {
  if (!entries.length) return <EmptyResult message="No utilisation history for this intervention." />;

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-background">
      <div className="flex items-center gap-2">
        <Hash className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">
          {entries.length} utilisation record{entries.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-1.5">
        {entries.map((e, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-1 rounded border bg-muted/20 p-2 text-xs sm:grid-cols-4 sm:gap-2"
          >
            <div className="sm:col-span-2">
              <p className="font-medium truncate">{e.interventionName || e.interventionCode || 'Unknown'}</p>
              {e.interventionCode && e.interventionName && (
                <p className="font-mono text-[10px] text-muted-foreground">{e.interventionCode}</p>
              )}
              {e.facilityName && (
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  {e.facilityName}
                </p>
              )}
            </div>
            <div>
              <Label>Visits</Label>
              <Value>
                {e.visitCount}
                {typeof e.totalQuota === 'number' ? ` / ${e.totalQuota}` : ''}
              </Value>
            </div>
            <div>
              <Label>Last visit</Label>
              <Value>{formatDate(e.lastVisit) || '—'}</Value>
            </div>
            {typeof e.amountUsed === 'number' && (
              <div className="sm:col-span-2">
                <Label>Amount used</Label>
                <Value>
                  KES {e.amountUsed.toLocaleString()}
                  {typeof e.amountRemaining === 'number'
                    ? ` (KES ${e.amountRemaining.toLocaleString()} remaining)`
                    : ''}
                </Value>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Patient (Client Registry)
// ============================================================================

/** Patient lookup returns the same shape as eligibility (sans schemes). */
export function PatientLookupResultCard({ result }: { result: ParsedEligibility | null }) {
  if (!result) return <EmptyResult message="No patient found in the DHA Client Registry." />;

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-background">
      <div className="flex flex-wrap items-center gap-2">
        <UserCheck className="h-5 w-5 text-primary shrink-0" />
        <span className="text-sm font-semibold">{result.fullName || 'Verified patient'}</span>
        {result.memberCrNumber && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {result.memberCrNumber}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {result.identificationNumber && (
          <div>
            <Label>ID number</Label>
            <Value className="font-mono">{result.identificationNumber}</Value>
          </div>
        )}
        {result.identificationType && (
          <div>
            <Label>ID type</Label>
            <Value>{result.identificationType}</Value>
          </div>
        )}
        {result.gender && (
          <div>
            <Label>Gender</Label>
            <Value>{result.gender}</Value>
          </div>
        )}
        {typeof result.age === 'number' && (
          <div>
            <Label>Age</Label>
            <Value>{result.age}</Value>
          </div>
        )}
      </div>
    </div>
  );
}
