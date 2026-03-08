import { getClinicVisitDestination } from '@/lib/utils/clinic-visit-routing';

describe('getClinicVisitDestination', () => {
  it('routes ANC clinic visits back into the ANC tab with linked ids', () => {
    expect(
      getClinicVisitDestination({
        id: 15,
        encounter: 77,
        source_module: 'MCH_ANC',
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
        source_record_id: 10,
      })
    ).toBe('/mch/10?tab=pnc&clinic_visit_id=22&encounter_id=81');
  });

  it('falls back to the encounter route for non-MCH visits', () => {
    expect(
      getClinicVisitDestination({
        id: 1,
        encounter: 55,
        source_module: 'DIRECT',
        source_record_id: null,
      })
    ).toBe('/encounters/55');
  });
});