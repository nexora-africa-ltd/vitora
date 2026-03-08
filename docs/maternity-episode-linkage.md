# Maternity Episode Linkage

## Implemented Slice

The current backend now supports a first explicit maternity episode bridge across ANC, labour, delivery, and inpatient admission.

### New Link Fields

- `Admission.mch_registration` anchors a maternity admission to the pregnancy-level MCH registration.
- `Delivery.partograph` links a delivery to the labour record that culminated in birth.
- `Delivery.admission` links a delivery to the maternity admission when labour or operative care occurred in IPD.

### Enforced Rules

- Admissions to a `MATERNITY` ward must provide `mch_registration` through the admission API.
- The `mch_registration.mother` must match the admission patient.
- A labour partograph admission must belong to the same MCH registration and patient.
- A delivery partograph must belong to the same MCH registration.
- A delivery admission must match the same mother and, when present, the same partograph admission.
- If a delivery is created with a linked partograph and no explicit admission, the API derives `delivery.admission` from `partograph.admission`.

## Why This Matters

This creates a usable pregnancy-centered thread:

1. `MCHRegistration`
2. `ANCVisit`
3. `LabourPartograph`
4. `Admission` to maternity ward
5. `Delivery`

That thread did not previously exist in a durable way because maternity admissions were generic IPD records and deliveries were not directly attached to labour or admission context.

## Next Extension

The next logical step is postpartum continuity:

- decide whether immediate postpartum ward monitoring remains purely inpatient documentation or seeds an explicit postpartum review model
- link discharge planning and follow-up scheduling back to PNC
- decide whether `PNCVisit` needs an optional admission or discharge reference for early postpartum reviews