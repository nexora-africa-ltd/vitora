import type { ClinicVisit } from '@/lib/types/clinic';

function toPositiveNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function getClinicVisitDestination(
  visit: Pick<
    ClinicVisit,
    'id' | 'encounter' | 'source_module' | 'source_record_id' | 'mch_registration_id'
  >
): string | null {
  const encounterId = toPositiveNumber(visit.encounter);
  const registrationId = toPositiveNumber(visit.mch_registration_id)
    ?? toPositiveNumber(visit.source_record_id);

  if (visit.source_module === 'MCH_ANC' && registrationId) {
    const params = new URLSearchParams({
      tab: 'anc',
      clinic_visit_id: String(visit.id),
    });
    if (encounterId) {
      params.set('encounter_id', String(encounterId));
    }
    return `/mch/${registrationId}?${params.toString()}`;
  }

  if (visit.source_module === 'MCH_PNC' && registrationId) {
    const params = new URLSearchParams({
      tab: 'pnc',
      clinic_visit_id: String(visit.id),
    });
    if (encounterId) {
      params.set('encounter_id', String(encounterId));
    }
    return `/mch/${registrationId}?${params.toString()}`;
  }

  if (encounterId) {
    return `/encounters/${encounterId}`;
  }

  return null;
}