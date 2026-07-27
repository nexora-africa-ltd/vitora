/**
 * Tests for preauth intervention mapping utilities.
 */

import { mapClaimInterventionToOption } from '@/lib/sha/preauth-interventions';

describe('mapClaimInterventionToOption', () => {
  it('maps snake_case claim intervention fields to InterventionOption', () => {
    const result = mapClaimInterventionToOption({
      intervention_code: 'SHA-19-197',
      intervention_name: 'Bilateral nephrostomy tube insertion',
      benefit_code: 'SHA-19',
      status: 'active',
      payment_mechanism: 'FEE_FOR_SERVICE',
      access_point: 'IP',
      needs_preauth: true,
      needs_manual_preauth_approval: false,
      is_surgical_preauth: false,
      is_renal_preauth: true,
      is_oncology_preauth: false,
      is_imaging_preauth: false,
      is_optical_preauth: false,
      tariff_amount: '15000.00',
      required_document_types: ['MEDICAL_REPORT', 'LAB_RESULTS'],
    });

    expect(result).toEqual({
      code: 'SHA-19-197',
      name: 'Bilateral nephrostomy tube insertion',
      benefitCode: 'SHA-19',
      price: 15000,
      paymentMechanism: 'FEE_FOR_SERVICE',
      accessPoint: 'IP',
      schemes: undefined,
      needsPreauth: true,
      needsManualPreauthApproval: false,
      isSurgicalPreauth: false,
      isRenalPreauth: true,
      isOncologyPreauth: false,
      isImagingPreauth: false,
      isOpticalPreauth: false,
      requiredPreauthDocumentTypes: ['MEDICAL_REPORT', 'LAB_RESULTS'],
    });
  });

  it('falls back to code when intervention_name is missing', () => {
    const result = mapClaimInterventionToOption({
      intervention_code: 'SHA-19-197',
      status: 'active',
    });

    expect(result.name).toBe('SHA-19-197');
  });

  it('returns undefined booleans when flags are absent', () => {
    const result = mapClaimInterventionToOption({
      intervention_code: 'SHA-19-197',
      intervention_name: 'Test',
      status: 'active',
    });

    expect(result.needsPreauth).toBeUndefined();
    expect(result.isSurgicalPreauth).toBeUndefined();
  });

  it('parses string boolean values', () => {
    const result = mapClaimInterventionToOption({
      intervention_code: 'SHA-19-197',
      intervention_name: 'Test',
      status: 'active',
      needs_preauth: 'true',
      is_surgical_preauth: 'false',
    });

    expect(result.needsPreauth).toBe(true);
    expect(result.isSurgicalPreauth).toBe(false);
  });
});
