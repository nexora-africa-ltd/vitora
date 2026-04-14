# Maternity Episode Linkage

## Implemented Slice

The current backend and web admission flow now support an explicit maternity episode bridge across ANC, labour, delivery, inpatient admission, postpartum transfer, discharge, and early PNC follow-up.

### New Link Fields

- `Admission.mch_registration` anchors a maternity admission to the pregnancy-level MCH registration.
- `Delivery.partograph` links a delivery to the labour record that culminated in birth.
- `Delivery.admission` links a delivery to the maternity admission when labour or operative care occurred in IPD.
- `PNCVisit.admission` links early postnatal review back to the postpartum admission.
- `PNCVisit.discharge` links early postnatal review back to the inpatient discharge event.

### Enforced Rules

- Admissions to a `MATERNITY` ward must provide `mch_registration` through the admission API.
- The `mch_registration.mother` must match the admission patient.
- A labour partograph admission must belong to the same MCH registration and patient.
- A delivery partograph must belong to the same MCH registration.
- A delivery admission must match the same mother and, when present, the same partograph admission.
- If a delivery is created with a linked partograph and no explicit admission, the API derives `delivery.admission` from `partograph.admission`.
- Maternity discharges now require a documented follow-up date for postpartum continuity.
- PNC visits can explicitly reference the inpatient admission and discharge, and the API derives `admission` from `discharge` when needed.
- Transfer requests must use the admission's current source ward and bed, which keeps maternity episode transfers aligned with the active postpartum location.

### Web Flow

- The inpatient admission page now surfaces `mch_registration` whenever a maternity ward is selected.
- The discharge and transfer pages now show maternity episode context and link back to the MCH registration detail view.

## Why This Matters

This creates a usable pregnancy-centered thread:

1. `MCHRegistration`
2. `ANCVisit`
3. `LabourPartograph`
4. `Admission` to maternity ward
5. `Delivery`

That thread did not previously exist in a durable way because maternity admissions were generic IPD records and deliveries were not directly attached to labour or admission context.

## Next Extension

The next logical step is postpartum operations beyond the first continuity bridge:

- decide whether immediate postpartum ward monitoring remains purely inpatient documentation or seeds an explicit postpartum review model
- add a first-class scheduled PNC handoff action from maternity discharge instead of relying only on documentation plus later PNC linkage
- extend maternity-aware continuity into postpartum ward-round templates, nursing kardex, and discharge summaries
