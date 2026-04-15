-- ============================================================================
-- Part 1: FACILITY DAILY SUMMARIES
-- Backfills 2026-01-15 to 2026-04-14 for all active facilities.
-- Run in Neon SQL Editor. Idempotent (ON CONFLICT DO UPDATE).
-- ============================================================================

INSERT INTO analytics_facilitydailysummary (
    facility_id, organization_id, date,
    new_patients, total_patients,
    encounters_opd, encounters_ipd, encounters_emergency, encounters_other, encounters_total,
    follow_up_encounters,
    revenue_total, revenue_cash, revenue_mpesa, revenue_insurance,
    invoices_created, outstanding_balance,
    lab_orders_placed, lab_orders_completed, lab_critical_results,
    prescriptions_dispensed, low_stock_alerts,
    triage_assessments, triage_emergency_count, avg_wait_time_minutes,
    current_admissions, new_admissions, discharges, bed_occupancy_rate,
    return_patients, walk_ins, referral_ins, clinic_referrals,
    created_at, updated_at
)
SELECT
    f.id AS facility_id,
    f.organization_id,
    d.date,

    -- New patients: patients whose first encounter at this facility was on this date
    COALESCE((
        SELECT COUNT(DISTINCT e.patient_id) FROM encounters_encounter e
        WHERE e.facility_id = f.id AND e.encounter_date = d.date
          AND NOT EXISTS (
            SELECT 1 FROM encounters_encounter e2
            WHERE e2.patient_id = e.patient_id AND e2.facility_id = f.id AND e2.encounter_date < d.date
          )
    ), 0),

    -- Total patients seen up to this date
    COALESCE((
        SELECT COUNT(DISTINCT e.patient_id) FROM encounters_encounter e
        WHERE e.facility_id = f.id AND e.encounter_date <= d.date
    ), 0),

    -- Encounters by type
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date AND e.encounter_type = 'OPD'), 0),
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date AND e.encounter_type = 'IPD'), 0),
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date AND e.encounter_type = 'EMERGENCY'), 0),
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date AND e.encounter_type NOT IN ('OPD','IPD','EMERGENCY')), 0),
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date), 0),
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date AND e.encounter_type = 'FOLLOW_UP'), 0),

    -- Revenue
    COALESCE((SELECT SUM(pay.amount) FROM billing_payment pay JOIN billing_invoice inv ON pay.invoice_id = inv.id WHERE inv.facility_id = f.id AND pay.payment_date::date = d.date AND pay.status = 'completed'), 0),
    COALESCE((SELECT SUM(pay.amount) FROM billing_payment pay JOIN billing_invoice inv ON pay.invoice_id = inv.id WHERE inv.facility_id = f.id AND pay.payment_date::date = d.date AND pay.status = 'completed' AND pay.method = 'cash'), 0),
    COALESCE((SELECT SUM(pay.amount) FROM billing_payment pay JOIN billing_invoice inv ON pay.invoice_id = inv.id WHERE inv.facility_id = f.id AND pay.payment_date::date = d.date AND pay.status = 'completed' AND pay.method = 'mpesa'), 0),
    COALESCE((SELECT SUM(pay.amount) FROM billing_payment pay JOIN billing_invoice inv ON pay.invoice_id = inv.id WHERE inv.facility_id = f.id AND pay.payment_date::date = d.date AND pay.status = 'completed' AND pay.method = 'insurance'), 0),

    -- Billing
    COALESCE((SELECT COUNT(*) FROM billing_invoice inv WHERE inv.facility_id = f.id AND inv.invoice_date = d.date), 0),
    COALESCE((SELECT SUM(inv.balance_due) FROM billing_invoice inv WHERE inv.facility_id = f.id AND inv.status IN ('pending','partial','overdue')), 0),

    -- Lab
    COALESCE((SELECT COUNT(*) FROM laboratory_laborder lo WHERE lo.facility_id = f.id AND lo.created_at::date = d.date), 0),
    COALESCE((SELECT COUNT(*) FROM laboratory_laborder lo WHERE lo.facility_id = f.id AND lo.status = 'COMPLETED' AND lo.updated_at::date = d.date), 0),
    COALESCE((
        SELECT COUNT(*) FROM laboratory_labresult lr
        JOIN laboratory_laborderitem loi ON lr.order_item_id = loi.id
        JOIN laboratory_laborder lo ON loi.lab_order_id = lo.id
        WHERE lo.facility_id = f.id AND lr.is_critical_result = true AND lr.created_at::date = d.date
    ), 0),

    -- Pharmacy
    COALESCE((SELECT COUNT(*) FROM pharmacy_prescription rx WHERE rx.facility_id = f.id AND rx.created_at::date = d.date AND rx.status = 'DISPENSED'), 0),
    COALESCE((SELECT COUNT(*) FROM pharmacy_stockalert sa WHERE sa.facility_id = f.id AND sa.is_resolved = false AND sa.alert_type = 'LOW_STOCK'), 0),

    -- Triage
    COALESCE((SELECT COUNT(*) FROM triage_triageassessment ta WHERE ta.facility_id = f.id AND ta.created_at::date = d.date), 0),
    COALESCE((SELECT COUNT(*) FROM triage_triageassessment ta WHERE ta.facility_id = f.id AND ta.created_at::date = d.date AND ta.triage_category = 'EMERGENCY'), 0),
    COALESCE((
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ta.seen_by_clinician_time - ta.triage_end_time)) / 60)::numeric, 1)
        FROM triage_triageassessment ta
        WHERE ta.facility_id = f.id AND ta.created_at::date = d.date
          AND ta.seen_by_clinician_time IS NOT NULL AND ta.triage_end_time IS NOT NULL
    ), 0),

    -- Inpatient
    COALESCE((SELECT COUNT(*) FROM inpatient_admission adm WHERE adm.facility_id = f.id AND adm.admission_status = 'ACTIVE'), 0),
    COALESCE((SELECT COUNT(*) FROM inpatient_admission adm WHERE adm.facility_id = f.id AND adm.admission_date::date = d.date), 0),
    COALESCE((SELECT COUNT(*) FROM inpatient_admission adm WHERE adm.facility_id = f.id AND adm.discharge_date::date = d.date AND adm.admission_status = 'DISCHARGED'), 0),
    COALESCE((
        SELECT ROUND(
            (SELECT COUNT(*)::numeric FROM inpatient_bed b JOIN inpatient_ward w ON b.ward_id = w.id WHERE w.facility_id = f.id AND b.status = 'OCCUPIED')
            / NULLIF((SELECT COUNT(*)::numeric FROM inpatient_bed b JOIN inpatient_ward w ON b.ward_id = w.id WHERE w.facility_id = f.id AND b.status != 'MAINTENANCE'), 0)
            * 100, 2)
    ), 0),

    -- Return patients
    COALESCE((
        SELECT COUNT(DISTINCT e1.patient_id) FROM encounters_encounter e1
        WHERE e1.facility_id = f.id AND e1.encounter_date = d.date
          AND EXISTS (SELECT 1 FROM encounters_encounter e2 WHERE e2.patient_id = e1.patient_id AND e2.facility_id = f.id AND e2.encounter_date < d.date)
    ), 0),

    -- Walk-ins / referrals (from patients whose first encounter at this facility is today)
    COALESCE((
        SELECT COUNT(DISTINCT e.patient_id) FROM encounters_encounter e
        JOIN patients_patient p ON e.patient_id = p.id
        WHERE e.facility_id = f.id AND e.encounter_date = d.date AND p.referral_source = 'self'
          AND NOT EXISTS (SELECT 1 FROM encounters_encounter e2 WHERE e2.patient_id = e.patient_id AND e2.facility_id = f.id AND e2.encounter_date < d.date)
    ), 0),
    COALESCE((
        SELECT COUNT(DISTINCT e.patient_id) FROM encounters_encounter e
        JOIN patients_patient p ON e.patient_id = p.id
        WHERE e.facility_id = f.id AND e.encounter_date = d.date AND p.referral_source = 'other_facility'
          AND NOT EXISTS (SELECT 1 FROM encounters_encounter e2 WHERE e2.patient_id = e.patient_id AND e2.facility_id = f.id AND e2.encounter_date < d.date)
    ), 0),
    COALESCE((
        SELECT COUNT(DISTINCT e.patient_id) FROM encounters_encounter e
        JOIN patients_patient p ON e.patient_id = p.id
        WHERE e.facility_id = f.id AND e.encounter_date = d.date AND p.referral_source = 'clinic'
          AND NOT EXISTS (SELECT 1 FROM encounters_encounter e2 WHERE e2.patient_id = e.patient_id AND e2.facility_id = f.id AND e2.encounter_date < d.date)
    ), 0),

    NOW(), NOW()

FROM core_facility f
CROSS JOIN generate_series('2026-01-15'::date, '2026-04-14'::date, '1 day'::interval) AS d(date)
WHERE f.is_active = true

ON CONFLICT (facility_id, date) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    new_patients = EXCLUDED.new_patients,
    total_patients = EXCLUDED.total_patients,
    encounters_opd = EXCLUDED.encounters_opd,
    encounters_ipd = EXCLUDED.encounters_ipd,
    encounters_emergency = EXCLUDED.encounters_emergency,
    encounters_other = EXCLUDED.encounters_other,
    encounters_total = EXCLUDED.encounters_total,
    follow_up_encounters = EXCLUDED.follow_up_encounters,
    revenue_total = EXCLUDED.revenue_total,
    revenue_cash = EXCLUDED.revenue_cash,
    revenue_mpesa = EXCLUDED.revenue_mpesa,
    revenue_insurance = EXCLUDED.revenue_insurance,
    invoices_created = EXCLUDED.invoices_created,
    outstanding_balance = EXCLUDED.outstanding_balance,
    lab_orders_placed = EXCLUDED.lab_orders_placed,
    lab_orders_completed = EXCLUDED.lab_orders_completed,
    lab_critical_results = EXCLUDED.lab_critical_results,
    prescriptions_dispensed = EXCLUDED.prescriptions_dispensed,
    low_stock_alerts = EXCLUDED.low_stock_alerts,
    triage_assessments = EXCLUDED.triage_assessments,
    triage_emergency_count = EXCLUDED.triage_emergency_count,
    avg_wait_time_minutes = EXCLUDED.avg_wait_time_minutes,
    current_admissions = EXCLUDED.current_admissions,
    new_admissions = EXCLUDED.new_admissions,
    discharges = EXCLUDED.discharges,
    bed_occupancy_rate = EXCLUDED.bed_occupancy_rate,
    return_patients = EXCLUDED.return_patients,
    walk_ins = EXCLUDED.walk_ins,
    referral_ins = EXCLUDED.referral_ins,
    clinic_referrals = EXCLUDED.clinic_referrals,
    updated_at = NOW();
