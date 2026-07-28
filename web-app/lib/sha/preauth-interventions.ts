/**
 * Preauth intervention mapping utilities.
 *
 * Converts SHA claim interventions (from the backend SHAClaimDetailSerializer)
 * into the InterventionOption shape used by the preauth form.
 */

export interface InterventionOption {
  code: string;
  name: string;
  category?: string;
  price?: number;
  paymentMechanism?: string;
  accessPoint?: string;
  access_point?: string;
  fund?: string;
  interventionFund?: string;
  intervention_fund?: string;
  supportedScheme?: string;
  supported_scheme?: string;
  schemes?: string[];
  benefitCode?: string;
  needsPreauth?: boolean;
  isSurgicalPreauth?: boolean;
  isRenalPreauth?: boolean;
  isOncologyPreauth?: boolean;
  isImagingPreauth?: boolean;
  isOpticalPreauth?: boolean;
  is_surgical_preauth?: boolean;
  is_renal_preauth?: boolean;
  is_oncology_preauth?: boolean;
  is_imaging_preauth?: boolean;
  is_optical_preauth?: boolean;
  requiresSurgicalPreauth?: boolean;
  requiresRenalPreauth?: boolean;
  requiresOncologyPreauth?: boolean;
  requiresRadiologyPreauth?: boolean;
  requiresOpticalPreauth?: boolean;
  requires_surgical_preauth?: boolean;
  requires_renal_preauth?: boolean;
  requires_oncology_preauth?: boolean;
  requires_radiology_preauth?: boolean;
  requires_optical_preauth?: boolean;
  needsDoctorAuthorization?: boolean;
  needs_doctor_authorization?: boolean;
  needsManualPreauthApproval?: boolean;
  needs_manual_preauth_approval?: boolean;
  requiredPreauthDocumentTypes?: string[];
  required_preauth_document_types?: string[];
  required_document_types?: string[];
  applicable_document_types?: string[];
  applicableDocumentTypes?: string[];
}

export function mapClaimInterventionToOption(
  intervention: Record<string, unknown>,
): InterventionOption {
  const getString = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = intervention[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  };
  const getBoolean = (...keys: string[]): boolean | undefined => {
    for (const key of keys) {
      const value = intervention[key];
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
      }
      if (typeof value === 'number') return value !== 0;
    }
    return undefined;
  };
  const getStringArray = (...keys: string[]): string[] | undefined => {
    for (const key of keys) {
      const value = intervention[key];
      if (Array.isArray(value)) {
        return value.map((entry) => String(entry).trim()).filter(Boolean);
      }
    }
    return undefined;
  };

  const code = getString('intervention_code', 'code') || '';
  const name = getString('intervention_name', 'name') || code;

  const rawPrice =
    intervention.tariff_amount ??
    intervention.tariffAmount ??
    intervention.level2_tariff ??
    intervention.level2Tariff ??
    intervention.level3_tariff ??
    intervention.level3Tariff ??
    intervention.level4_tariff ??
    intervention.level4Tariff ??
    intervention.level5_tariff ??
    intervention.level5Tariff ??
    intervention.level6_tariff ??
    intervention.level6Tariff;
  let price: number | undefined;
  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice)) {
    price = rawPrice;
  } else if (typeof rawPrice === 'string') {
    const parsed = Number(rawPrice);
    if (Number.isFinite(parsed)) price = parsed;
  }

  return {
    code,
    name,
    benefitCode: getString('benefit_code', 'benefitCode'),
    price,
    paymentMechanism: getString('payment_mechanism', 'paymentMechanism'),
    accessPoint: getString('access_point', 'accessPoint'),
    fund: getString('fund'),
    interventionFund: getString('intervention_fund', 'interventionFund'),
    supportedScheme: getString('supported_scheme', 'supportedScheme'),
    schemes: getStringArray('schemes'),
    needsPreauth: getBoolean('needs_preauth', 'needsPreauth'),
    needsManualPreauthApproval: getBoolean(
      'needs_manual_preauth_approval',
      'needsManualPreauthApproval',
    ),
    isSurgicalPreauth: getBoolean('is_surgical_preauth', 'isSurgicalPreauth'),
    isRenalPreauth: getBoolean('is_renal_preauth', 'isRenalPreauth'),
    isOncologyPreauth: getBoolean('is_oncology_preauth', 'isOncologyPreauth'),
    isImagingPreauth: getBoolean('is_imaging_preauth', 'isImagingPreauth'),
    isOpticalPreauth: getBoolean('is_optical_preauth', 'isOpticalPreauth'),
    requiredPreauthDocumentTypes: getStringArray(
      'required_preauth_document_types',
      'requiredPreauthDocumentTypes',
      'required_document_types',
      'requiredDocumentTypes',
    ),
  };
}
