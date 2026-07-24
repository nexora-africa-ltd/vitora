/**
 * useBenefitInterventions — shared hook for DHA ILM cascading select.
 *
 * Two-level lazy fetch:
 *   1. ilmBenefits(is_unique_benefit=true) → list of benefit packages
 *   2. When user picks a package → ilmSubBenefits → ilmBenefitInterventions per sub-benefit
 *
 * Used by both SHAConsentStep (check-in) and ClaimILMPanel (claims workflow)
 * so intervention selection UX is consistent and fetching logic isn't duplicated.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { shaApi } from '@/lib/api/sha';
import { toCrId } from '@/lib/sha/ilm-parsers';

// ============================================================================
// Types
// ============================================================================

export interface InterventionOption {
  code: string;
  name: string;
  category?: string;
  price?: number;
  paymentMechanism?: string;
  accessPoint?: string;
  schemes?: string[];
  benefitCode?: string;
  needsPreauth?: boolean;
  needsManualPreauthApproval?: boolean;
  isSurgicalPreauth?: boolean;
  isRenalPreauth?: boolean;
  isOncologyPreauth?: boolean;
  isImagingPreauth?: boolean;
  isOpticalPreauth?: boolean;
}

export interface BenefitPackageOption {
  code: string;
  name: string;
}

// ============================================================================
// Helpers (shared with sha-consent-step.tsx / ClaimILMPanel.tsx)
// ============================================================================

function getField(item: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = item[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

function extractItems<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.results)) {
      const results = obj.results as unknown[];
      if (
        results.length === 1 &&
        typeof results[0] === 'object' &&
        results[0] !== null &&
        Array.isArray((results[0] as Record<string, unknown>).results)
      ) {
        return (results[0] as Record<string, unknown>).results as T[];
      }
      return results as T[];
    }
    if (Array.isArray(obj.benefits)) return obj.benefits as T[];
    if (Array.isArray(obj.interventions)) return obj.interventions as T[];
    if (Object.keys(obj).length > 0 && !obj.error) return [obj as T];
  }
  return [];
}

function getBooleanField(item: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const v = item[key];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const normalized = v.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    if (typeof v === 'number') return v !== 0;
  }
  return undefined;
}

// ============================================================================
// Hook
// ============================================================================

interface UseBenefitInterventionsOptions {
  /** Patient's DHA CR ID (e.g. CR12345). Without this nothing fetches. */
  patientCrId: string;
  /** Whether to start fetching immediately. Defaults to true. */
  enabled?: boolean;
  /** Stale time for benefit packages cache. Default 5min. */
  staleTime?: number;
}

interface UseBenefitInterventionsReturn {
  /** List of available benefit packages (already fetched). */
  benefitPackageOptions: BenefitPackageOption[];
  /** True while benefit packages are loading. */
  benefitPackagesLoading: boolean;
  /** The currently selected benefit package code (empty string = none). */
  selectedBenefitPkgCode: string;
  /** Call to change the selected benefit package. */
  setSelectedBenefitPkgCode: (code: string) => void;
  /** List of interventions for the selected benefit package. */
  interventionOptions: InterventionOption[];
  /** True while interventions for the selected package are loading. */
  interventionsLoading: boolean;
  /** The currently selected intervention (null = none). */
  selectedIntervention: InterventionOption | null;
  /** Call to change the selected intervention by code. */
  setSelectedInterventionCode: (code: string) => void;
  /** Reset all selections back to empty. */
  reset: () => void;
}

export function useBenefitInterventions({
  patientCrId,
  enabled = true,
  staleTime = 5 * 60 * 1000,
}: UseBenefitInterventionsOptions): UseBenefitInterventionsReturn {
  const normalizedCrId = useMemo(() => toCrId(patientCrId) || patientCrId, [patientCrId]);

  // ---- State ----
  const [selectedBenefitPkgCode, setSelectedBenefitPkgCode] = useState('');
  const [selectedInterventionCode, setSelectedInterventionCode] = useState('');
  const [interventionOptionsRaw, setInterventionOptionsRaw] = useState<
    Record<string, unknown>[]
  >([]);
  const [interventionsLoading, setInterventionsLoading] = useState(false);

  // ---- Step 1: Fetch benefit packages ----
  const {
    data: benefitPackagesData,
    isLoading: benefitPackagesLoading,
  } = useQuery({
    queryKey: ['sha-benefit-packages-cascade', normalizedCrId],
    queryFn: () =>
      shaApi.ilmBenefits({
        patient_id: normalizedCrId,
        is_unique_benefit: true,
      }),
    enabled: !!normalizedCrId && enabled,
    staleTime,
    gcTime: 30 * 60 * 1000,
    meta: { skipGlobalErrorHandler: true },
    retry: 1,
  });

  const benefitPackageOptions = useMemo<BenefitPackageOption[]>(() => {
    const items = extractItems<Record<string, unknown>>(benefitPackagesData?.data);
    return items
      .filter((pkg) => {
        const code = getField(
          pkg,
          'parentBenefitCode',
          'parent_benefit_code',
          'code',
        );
        return !!code;
      })
      .map((pkg) => ({
        code: getField(pkg, 'parentBenefitCode', 'parent_benefit_code', 'code'),
        name:
          getField(pkg, 'parentBenefit', 'parent_benefit', 'name') || 'Unknown',
      }));
  }, [benefitPackagesData]);

  // ---- Intervention options derived from raw DHA items ----
  const interventionOptions = useMemo<InterventionOption[]>(() => {
    return interventionOptionsRaw
      .filter((i) => {
        const code = getField(i, 'code', 'interventionCode', 'intervention_code');
        const name = getField(i, 'name', 'interventionName', 'intervention_name');
        return !!code || !!name;
      })
      .map((i) => ({
        code: getField(i, 'code', 'interventionCode', 'intervention_code'),
        name: getField(i, 'name', 'interventionName', 'intervention_name') || '',
        category: getField(i, 'paymentMechanism', 'payment_mechanism') || undefined,
        price: typeof (i as Record<string, unknown>).overallTariff === 'number'
          ? (i as Record<string, unknown>).overallTariff as number
          : typeof (i as Record<string, unknown>).overall_tariff === 'number'
            ? (i as Record<string, unknown>).overall_tariff as number
            : undefined,
        paymentMechanism:
          getField(i, 'paymentMechanism', 'payment_mechanism') || undefined,
        accessPoint:
          getField(i, 'accessPoint', 'access_point') || undefined,
        schemes: undefined,
        benefitCode:
          getField(i, 'benefitCode', 'benefit_code') || undefined,
        needsPreauth: getBooleanField(i, 'needsPreauth', 'needs_preauth', 'requires_preauthorization'),
        needsManualPreauthApproval: getBooleanField(
          i,
          'needsManualPreauthApproval',
          'needs_manual_preauth_approval',
        ),
        isSurgicalPreauth: getBooleanField(i, 'isSurgicalPreauth', 'is_surgical_preauth'),
        isRenalPreauth: getBooleanField(i, 'isRenalPreauth', 'is_renal_preauth'),
        isOncologyPreauth: getBooleanField(i, 'isOncologyPreauth', 'is_oncology_preauth'),
        isImagingPreauth: getBooleanField(i, 'isImagingPreauth', 'is_imaging_preauth'),
        isOpticalPreauth: getBooleanField(i, 'isOpticalPreauth', 'is_optical_preauth'),
      }));
  }, [interventionOptionsRaw]);

  const selectedIntervention = useMemo<InterventionOption | null>(() => {
    if (!selectedInterventionCode) return null;
    return (
      interventionOptions.find(
        (opt) => opt.code === selectedInterventionCode,
      ) ?? null
    );
  }, [selectedInterventionCode, interventionOptions]);

  // ---- Step 2: When package changes, fetch interventions ----
  useEffect(() => {
    if (!selectedBenefitPkgCode || !normalizedCrId) {
      setInterventionOptionsRaw([]);
      setSelectedInterventionCode('');
      return;
    }

    let cancelled = false;
    setInterventionsLoading(true);

    (async () => {
      const allInterventions: Record<string, unknown>[] = [];

      try {
        const subResponse = await shaApi.ilmSubBenefits({
          patient_id: normalizedCrId,
          parent_benefit_code: selectedBenefitPkgCode,
        });
        const subItems = extractItems<Record<string, unknown>>(subResponse?.data);

        for (const sub of subItems) {
          if (cancelled) return;
          const subKey = getField(
            sub,
            'code',
            'subBenefitCode',
            'sub_benefit_code',
          );
          if (!subKey) continue;

          try {
            const intResponse = await shaApi.ilmBenefitInterventions({
              patient_id: normalizedCrId,
              sub_benefit_code: subKey,
            });
            const interventions = extractItems<Record<string, unknown>>(
              intResponse?.data,
            );
            if (interventions.length > 0) {
              allInterventions.push(...interventions);
            }
          } catch {
            // Individual sub-benefit fetch failure is non-fatal
          }
        }
      } catch {
        // Benefit package fetch failure is non-fatal
      }

      if (!cancelled) {
        setInterventionOptionsRaw(allInterventions);
        setInterventionsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedBenefitPkgCode, normalizedCrId]);

  // ---- Public helpers ----
  const reset = useCallback(() => {
    setSelectedBenefitPkgCode('');
    setSelectedInterventionCode('');
    setInterventionOptionsRaw([]);
  }, []);

  return {
    benefitPackageOptions,
    benefitPackagesLoading,
    selectedBenefitPkgCode,
    setSelectedBenefitPkgCode,
    interventionOptions,
    interventionsLoading,
    selectedIntervention,
    setSelectedInterventionCode,
    reset,
  };
}
