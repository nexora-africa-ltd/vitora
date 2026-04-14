import { getClinicVisitDestination } from '@/lib/utils/clinic-visit-routing';

describe('getClinicVisitDestination', () => {
  it('routes ANC clinic visits back into the ANC tab with linked ids', () => {
    expect(
      getClinicVisitDestination({
        id: 15,
        encounter: 77,
        source_module: 'MCH_ANC',
        mch_registration_id: 9,
        source_record_id: 9,
      })
    ).toBe('/mch/9?tab=anc&clinic_visit_id=15&encounter_id=77');
  });

  it('routes PNC clinic visits back into the PNC tab', () => {
    expect(
      getClinicVisitDestination({
        id: 22,
        encounter: 81,
        source_module: 'MCH_PNC',
        mch_registration_id: 10,
        source_record_id: 10,
      })
    ).toBe('/mch/10?tab=pnc&clinic_visit_id=22&encounter_id=81');
  });

  it('prefers mch_registration_id when source_record_id is an ANC visit id', () => {
    expect(
      getClinicVisitDestination({
        id: 33,
        encounter: 99,
        source_module: 'MCH_ANC',
        mch_registration_id: 7,
        source_record_id: 401,
      })
    ).toBe('/mch/7?tab=anc&clinic_visit_id=33&encounter_id=99');
  });

  it('falls back to the encounter route for non-MCH visits', () => {
    expect(
      getClinicVisitDestination({
        id: 1,
        encounter: 55,
        source_module: 'DIRECT',
        mch_registration_id: null,
        source_record_id: null,
      })
    ).toBe('/encounters/55');
  });
});
