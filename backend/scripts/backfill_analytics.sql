-- ============================================================================
-- Backfill Analytics: Raw SQL equivalent of `manage.py backfill_analytics`
-- Run in Neon SQL Editor against neondb
--
-- Backfills 90 days (2026-01-15 to 2026-04-14) for all active facilities.
-- All INSERTs use ON CONFLICT ... DO UPDATE (idempotent / safe to re-run).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FACILITY DAILY SUMMARIES
-- ============================================================================
-- One row per facility per day with encounter, patient, revenue, lab,
-- pharmacy, triage, and inpatient metrics.

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

    -- New patients registered on this date at this facility
    COALESCE((
        SELECT COUNT(*) FROM patients_patient p
        WHERE p.registered_at_facility_id = f.id
          AND p.created_at::date = d.date
    ), 0) AS new_patients,

    -- Cumulative patient count up to this date
    COALESCE((
        SELECT COUNT(*) FROM patients_patient p
        WHERE p.registered_at_facility_id = f.id
          AND p.created_at::date <= d.date
    ), 0) AS total_patients,

    -- Encounters by type
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date AND e.encounter_type = 'OPD'), 0),
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date AND e.encounter_type = 'IPD'), 0),
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date AND e.encounter_type = 'EMERGENCY'), 0),
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date AND e.encounter_type NOT IN ('OPD','IPD','EMERGENCY')), 0),
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date), 0),
    COALESCE((SELECT COUNT(*) FROM encounters_encounter e WHERE e.facility_id = f.id AND e.encounter_date = d.date AND e.encounter_type = 'FOLLOW_UP'), 0),

    -- Revenue from completed payments
    COALESCE((SELECT SUM(pay.amount) FROM billing_payment pay JOIN billing_invoice inv ON pay.invoice_id = inv.id WHERE inv.facility_id = f.id AND pay.payment_date::date = d.date AND pay.status = 'completed'), 0),
    COALESCE((SELECT SUM(pay.amount) FROM billing_payment pay JOIN billing_invoice inv ON pay.invoice_id = inv.id WHERE inv.facility_id = f.id AND pay.payment_date::date = d.date AND pay.status = 'completed' AND pay.method = 'cash'), 0),
    COALESCE((SELECT SUM(pay.amount) FROM billing_payment pay JOIN billing_invoice inv ON pay.invoice_id = inv.id WHERE inv.facility_id = f.id AND pay.payment_date::date = d.date AND pay.status = 'completed' AND pay.method = 'mpesa'), 0),
    COALESCE((SELECT SUM(pay.amount) FROM billing_payment pay JOIN billing_invoice inv ON pay.invoice_id = inv.id WHERE inv.facility_id = f.id AND pay.payment_date::date = d.date AND pay.status = 'completed' AND pay.method = 'insurance'), 0),

    -- Invoices created
    COALESCE((SELECT COUNT(*) FROM billing_invoice inv WHERE inv.facility_id = f.id AND inv.invoice_date = d.date), 0),

    -- Outstanding balance (running: all open invoices as of this date)
    COALESCE((SELECT SUM(inv.balance_due) FROM billing_invoice inv WHERE inv.facility_id = f.id AND inv.status IN ('pending','partial','overdue')), 0),

    -- Lab
    COALESCE((SELECT COUNT(*) FROM laboratory_laborder lo WHERE lo.facility_id = f.id AND lo.created_at::date = d.date), 0),
    COALESCE((SELECT COUNT(*) FROM laboratory_laborder lo WHERE lo.facility_id = f.id AND lo.status = 'COMPLETED' AND lo.updated_at::date = d.date), 0),
    COALESCE((SELECT COUNT(*) FROM laboratory_labresult lr WHERE lr.facility_id = f.id AND lr.is_abnormal = true AND lr.created_at::date = d.date), 0),

    -- Pharmacy
    COALESCE((SELECT COUNT(*) FROM pharmacy_prescription rx WHERE rx.facility_id = f.id AND rx.created_at::date = d.date AND rx.status = 'DISPENSED'), 0),
    COALESCE((SELECT COUNT(*) FROM pharmacy_stockalert sa WHERE sa.facility_id = f.id AND sa.resolved = false AND sa.alert_type = 'LOW_STOCK'), 0),

    -- Triage
    COALESCE((SELECT COUNT(*) FROM triage_triageassessment ta WHERE ta.facility_id = f.id AND ta.created_at::date = d.date), 0),
    COALESCE((SELECT COUNT(*) FROM triage_triageassessment ta WHERE ta.facility_id = f.id AND ta.created_at::date = d.date AND ta.category = 'EMERGENCY'), 0),
    COALESCE((
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ta.started_at - ta.created_at)) / 60)::numeric, 1)
        FROM triage_triageassessment ta
        WHERE ta.facility_id = f.id AND ta.created_at::date = d.date
          AND ta.status = 'COMPLETED' AND ta.started_at IS NOT NULL
    ), 0),

    -- Inpatient
    COALESCE((SELECT COUNT(*) FROM inpatient_admission adm WHERE adm.facility_id = f.id AND adm.admission_status = 'ACTIVE'), 0),
    COALESCE((SELECT COUNT(*) FROM inpatient_admission adm WHERE adm.facility_id = f.id AND adm.admission_date::date = d.date), 0),
    COALESCE((SELECT COUNT(*) FROM inpatient_admission adm WHERE adm.facility_id = f.id AND adm.discharge_date::date = d.date AND adm.admission_status = 'DISCHARGED'), 0),
    COALESCE((
        SELECT ROUND(
            (SELECT COUNT(*)::numeric FROM inpatient_bed b JOIN inpatient_ward w ON b.ward_id = w.id WHERE w.facility_id = f.id AND b.status = 'OCCUPIED')
            / NULLIF((SELECT COUNT(*)::numeric FROM inpatient_bed b JOIN inpatient_ward w ON b.ward_id = w.id WHERE w.facility_id = f.id AND b.status != 'MAINTENANCE'), 0)
            * 100, 2
        )
    ), 0),

    -- Return patients (seen today who had a prior encounter)
    COALESCE((
        SELECT COUNT(DISTINCT e1.patient_id)
        FROM encounters_encounter e1
        WHERE e1.facility_id = f.id AND e1.encounter_date = d.date
          AND EXISTS (
            SELECT 1 FROM encounters_encounter e2
            WHERE e2.patient_id = e1.patient_id AND e2.facility_id = f.id
              AND e2.encounter_date < d.date
          )
    ), 0),

    -- Walk-ins
    COALESCE((SELECT COUNT(*) FROM patients_patient p WHERE p.registered_at_facility_id = f.id AND p.created_at::date = d.date AND p.referral_source = 'self'), 0),
    -- Referral-ins
    COALESCE((SELECT COUNT(*) FROM patients_patient p WHERE p.registered_at_facility_id = f.id AND p.created_at::date = d.date AND p.referral_source = 'other_facility'), 0),
    -- Clinic referrals
    COALESCE((SELECT COUNT(*) FROM patients_patient p WHERE p.registered_at_facility_id = f.id AND p.created_at::date = d.date AND p.referral_source = 'clinic'), 0),

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


-- ============================================================================
-- 2. DEPARTMENT MONTHLY SUMMARIES (Encounter-based departments)
-- ============================================================================
-- OPD, IPD, EMERGENCY, MCH, THEATRE aggregated per month per facility.

-- Helper: map encounter types to departments
-- OPD: OPD, SCHEDULED_OPD, FOLLOW_UP, CONSULTANT_REVIEW, CHRONIC_STABLE, SPECIALIST_CLINIC, DIALYSIS, ONCOLOGY
-- IPD: IPD, WARD_ROUND, DISCHARGE_REVIEW
-- EMERGENCY: EMERGENCY
-- MCH: ANC, PAEDIATRIC
-- THEATRE: PROCEDURE, DAY_CASE

INSERT INTO analytics_departmentmonthlysummary (
    facility_id, organization_id, year, month, department,
    visit_count, unique_patients, revenue, top_diagnoses, avg_length_of_stay_days,
    created_at, updated_at
)
SELECT
    f.id,
    f.organization_id,
    EXTRACT(YEAR FROM m.month_start)::int,
    EXTRACT(MONTH FROM m.month_start)::int,
    dept.code,

    -- Visit count
    (SELECT COUNT(*) FROM encounters_encounter e
     WHERE e.facility_id = f.id
       AND e.encounter_date >= m.month_start
       AND e.encounter_date <= (m.month_start + interval '1 month' - interval '1 day')::date
       AND e.encounter_type = ANY(dept.enc_types)),

    -- Unique patients
    (SELECT COUNT(DISTINCT e.patient_id) FROM encounters_encounter e
     WHERE e.facility_id = f.id
       AND e.encounter_date >= m.month_start
       AND e.encounter_date <= (m.month_start + interval '1 month' - interval '1 day')::date
       AND e.encounter_type = ANY(dept.enc_types)),

    -- Revenue from invoices linked to matching encounters
    COALESCE((
        SELECT SUM(inv.total_amount)
        FROM billing_invoice inv
        JOIN encounters_encounter e ON inv.encounter_id = e.id
        WHERE e.facility_id = f.id AND inv.facility_id = f.id
          AND e.encounter_date >= m.month_start
          AND e.encounter_date <= (m.month_start + interval '1 month' - interval '1 day')::date
          AND e.encounter_type = ANY(dept.enc_types)
          AND inv.status IN ('paid','partial')
    ), 0),

    -- Top diagnoses (JSON array)
    COALESCE((
        SELECT json_agg(row_to_json(top_dx))
        FROM (
            SELECT ic.code, ic.description AS name, COUNT(*) AS count
            FROM encounters_diagnosis dx
            JOIN encounters_encounter e ON dx.encounter_id = e.id
            JOIN encounters_icd10code ic ON dx.icd10_code_id = ic.id
            WHERE e.facility_id = f.id
              AND e.encounter_date >= m.month_start
              AND e.encounter_date <= (m.month_start + interval '1 month' - interval '1 day')::date
              AND e.encounter_type = ANY(dept.enc_types)
            GROUP BY ic.code, ic.description
            ORDER BY count DESC
            LIMIT 10
        ) top_dx
    ), '[]'::json),

    -- Average LOS (IPD only)
    CASE WHEN dept.code = 'IPD' THEN (
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (adm.discharge_date - adm.admission_date)) / 86400)::numeric, 1)
        FROM inpatient_admission adm
        WHERE adm.facility_id = f.id
          AND adm.admission_date::date >= m.month_start
          AND adm.admission_date::date <= (m.month_start + interval '1 month' - interval '1 day')::date
          AND adm.discharge_date IS NOT NULL
    ) ELSE NULL END,

    NOW(), NOW()

FROM core_facility f
CROSS JOIN generate_series('2026-01-01'::date, '2026-04-01'::date, '1 month'::interval) AS m(month_start)
CROSS JOIN (VALUES
    ('OPD',       ARRAY['OPD','SCHEDULED_OPD','FOLLOW_UP','CONSULTANT_REVIEW','CHRONIC_STABLE','SPECIALIST_CLINIC','DIALYSIS','ONCOLOGY']),
    ('IPD',       ARRAY['IPD','WARD_ROUND','DISCHARGE_REVIEW']),
    ('EMERGENCY', ARRAY['EMERGENCY']),
    ('MCH',       ARRAY['ANC','PAEDIATRIC']),
    ('THEATRE',   ARRAY['PROCEDURE','DAY_CASE'])
) AS dept(code, enc_types)
WHERE f.is_active = true
  -- Only insert if there are actual encounters
  AND (SELECT COUNT(*) FROM encounters_encounter e
       WHERE e.facility_id = f.id
         AND e.encounter_date >= m.month_start
         AND e.encounter_date <= (m.month_start + interval '1 month' - interval '1 day')::date
         AND e.encounter_type = ANY(dept.enc_types)) > 0

ON CONFLICT (facility_id, year, month, department) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    visit_count = EXCLUDED.visit_count,
    unique_patients = EXCLUDED.unique_patients,
    revenue = EXCLUDED.revenue,
    top_diagnoses = EXCLUDED.top_diagnoses,
    avg_length_of_stay_days = EXCLUDED.avg_length_of_stay_days,
    updated_at = NOW();


-- ============================================================================
-- 2b. DEPARTMENT MONTHLY SUMMARIES (Service departments: PHARMACY, LABORATORY)
-- ============================================================================

-- Pharmacy
INSERT INTO analytics_departmentmonthlysummary (
    facility_id, organization_id, year, month, department,
    visit_count, unique_patients, revenue, top_diagnoses, avg_length_of_stay_days,
    created_at, updated_at
)
SELECT
    f.id, f.organization_id,
    EXTRACT(YEAR FROM m.month_start)::int,
    EXTRACT(MONTH FROM m.month_start)::int,
    'PHARMACY',
    (SELECT COUNT(*) FROM pharmacy_prescription rx WHERE rx.facility_id = f.id AND rx.prescribed_at::date >= m.month_start AND rx.prescribed_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date),
    (SELECT COUNT(DISTINCT rx.patient_id) FROM pharmacy_prescription rx WHERE rx.facility_id = f.id AND rx.prescribed_at::date >= m.month_start AND rx.prescribed_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date),
    COALESCE((SELECT SUM(ii.total_price) FROM billing_invoiceitem ii JOIN billing_invoice inv ON ii.invoice_id = inv.id WHERE inv.facility_id = f.id AND inv.status IN ('paid','partial') AND inv.created_at::date >= m.month_start AND inv.created_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date AND ii.item_type = 'pharmacy'), 0),
    '[]'::json,
    NULL,
    NOW(), NOW()
FROM core_facility f
CROSS JOIN generate_series('2026-01-01'::date, '2026-04-01'::date, '1 month'::interval) AS m(month_start)
WHERE f.is_active = true
  AND (SELECT COUNT(*) FROM pharmacy_prescription rx WHERE rx.facility_id = f.id AND rx.prescribed_at::date >= m.month_start AND rx.prescribed_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date) > 0
ON CONFLICT (facility_id, year, month, department) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    visit_count = EXCLUDED.visit_count,
    unique_patients = EXCLUDED.unique_patients,
    revenue = EXCLUDED.revenue,
    updated_at = NOW();

-- Laboratory
INSERT INTO analytics_departmentmonthlysummary (
    facility_id, organization_id, year, month, department,
    visit_count, unique_patients, revenue, top_diagnoses, avg_length_of_stay_days,
    created_at, updated_at
)
SELECT
    f.id, f.organization_id,
    EXTRACT(YEAR FROM m.month_start)::int,
    EXTRACT(MONTH FROM m.month_start)::int,
    'LABORATORY',
    (SELECT COUNT(*) FROM laboratory_laborder lo WHERE lo.facility_id = f.id AND lo.ordered_at::date >= m.month_start AND lo.ordered_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date),
    (SELECT COUNT(DISTINCT lo.patient_id) FROM laboratory_laborder lo WHERE lo.facility_id = f.id AND lo.ordered_at::date >= m.month_start AND lo.ordered_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date),
    COALESCE((SELECT SUM(ii.total_price) FROM billing_invoiceitem ii JOIN billing_invoice inv ON ii.invoice_id = inv.id WHERE inv.facility_id = f.id AND inv.status IN ('paid','partial') AND inv.created_at::date >= m.month_start AND inv.created_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date AND ii.item_type = 'lab'), 0),
    '[]'::json,
    NULL,
    NOW(), NOW()
FROM core_facility f
CROSS JOIN generate_series('2026-01-01'::date, '2026-04-01'::date, '1 month'::interval) AS m(month_start)
WHERE f.is_active = true
  AND (SELECT COUNT(*) FROM laboratory_laborder lo WHERE lo.facility_id = f.id AND lo.ordered_at::date >= m.month_start AND lo.ordered_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date) > 0
ON CONFLICT (facility_id, year, month, department) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    visit_count = EXCLUDED.visit_count,
    unique_patients = EXCLUDED.unique_patients,
    revenue = EXCLUDED.revenue,
    updated_at = NOW();


-- ============================================================================
-- 3. DIAGNOSIS TRENDS (Monthly, top 50 per facility per month)
-- ============================================================================

INSERT INTO analytics_diagnosistrend (
    facility_id, organization_id,
    icd10_code, icd10_name, granularity, period_start, period_end,
    case_count, age_band_breakdown, gender_breakdown,
    created_at, updated_at
)
SELECT
    f.id, f.organization_id,
    dx_agg.code, dx_agg.description, 'MONTHLY',
    m.month_start,
    (m.month_start + interval '1 month' - interval '1 day')::date,
    dx_agg.case_count,
    -- Age band breakdown (simplified — full per-patient iteration not possible in pure SQL,
    -- so we compute from patient DOB)
    COALESCE((
        SELECT json_object_agg(band, cnt) FROM (
            SELECT
                CASE
                    WHEN EXTRACT(YEAR FROM AGE(m.month_start, pat.date_of_birth)) BETWEEN 0 AND 4 THEN '0-4'
                    WHEN EXTRACT(YEAR FROM AGE(m.month_start, pat.date_of_birth)) BETWEEN 5 AND 14 THEN '5-14'
                    WHEN EXTRACT(YEAR FROM AGE(m.month_start, pat.date_of_birth)) BETWEEN 15 AND 24 THEN '15-24'
                    WHEN EXTRACT(YEAR FROM AGE(m.month_start, pat.date_of_birth)) BETWEEN 25 AND 34 THEN '25-34'
                    WHEN EXTRACT(YEAR FROM AGE(m.month_start, pat.date_of_birth)) BETWEEN 35 AND 49 THEN '35-49'
                    WHEN EXTRACT(YEAR FROM AGE(m.month_start, pat.date_of_birth)) BETWEEN 50 AND 64 THEN '50-64'
                    ELSE '65+'
                END AS band,
                COUNT(*) AS cnt
            FROM encounters_diagnosis d2
            JOIN encounters_encounter e2 ON d2.encounter_id = e2.id
            JOIN patients_patient pat ON e2.patient_id = pat.id
            WHERE e2.facility_id = f.id
              AND e2.encounter_date >= m.month_start
              AND e2.encounter_date <= (m.month_start + interval '1 month' - interval '1 day')::date
              AND d2.icd10_code_id = dx_agg.icd10_id
            GROUP BY band
        ) age_data
    ), '{}'::json),

    -- Gender breakdown
    COALESCE((
        SELECT json_object_agg(gender, cnt) FROM (
            SELECT pat.gender, COUNT(*) AS cnt
            FROM encounters_diagnosis d2
            JOIN encounters_encounter e2 ON d2.encounter_id = e2.id
            JOIN patients_patient pat ON e2.patient_id = pat.id
            WHERE e2.facility_id = f.id
              AND e2.encounter_date >= m.month_start
              AND e2.encounter_date <= (m.month_start + interval '1 month' - interval '1 day')::date
              AND d2.icd10_code_id = dx_agg.icd10_id
            GROUP BY pat.gender
        ) gender_data
    ), '{}'::json),

    NOW(), NOW()

FROM core_facility f
CROSS JOIN generate_series('2026-01-01'::date, '2026-04-01'::date, '1 month'::interval) AS m(month_start)
CROSS JOIN LATERAL (
    SELECT ic.id AS icd10_id, ic.code, ic.description, COUNT(*) AS case_count
    FROM encounters_diagnosis dx
    JOIN encounters_encounter e ON dx.encounter_id = e.id
    JOIN encounters_icd10code ic ON dx.icd10_code_id = ic.id
    WHERE e.facility_id = f.id
      AND e.encounter_date >= m.month_start
      AND e.encounter_date <= (m.month_start + interval '1 month' - interval '1 day')::date
    GROUP BY ic.id, ic.code, ic.description
    ORDER BY COUNT(*) DESC
    LIMIT 50
) dx_agg
WHERE f.is_active = true

ON CONFLICT (facility_id, icd10_code, granularity, period_start) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    icd10_name = EXCLUDED.icd10_name,
    period_end = EXCLUDED.period_end,
    case_count = EXCLUDED.case_count,
    age_band_breakdown = EXCLUDED.age_band_breakdown,
    gender_breakdown = EXCLUDED.gender_breakdown,
    updated_at = NOW();


-- ============================================================================
-- 4. PATIENT DEMOGRAPHIC SNAPSHOTS (as of 2026-04-14)
-- ============================================================================

INSERT INTO analytics_patientdemographicsnapshot (
    facility_id, organization_id, snapshot_date,
    total_patients, age_distribution, gender_distribution,
    county_distribution, referral_source_distribution,
    new_vs_return, insurance_coverage,
    created_at, updated_at
)
SELECT
    f.id, f.organization_id,
    '2026-04-14'::date,

    -- Total patients
    (SELECT COUNT(*) FROM patients_patient p WHERE p.registered_at_facility_id = f.id),

    -- Age distribution
    COALESCE((
        SELECT json_object_agg(band, cnt) FROM (
            SELECT
                CASE
                    WHEN EXTRACT(YEAR FROM AGE('2026-04-14'::date, p.date_of_birth)) BETWEEN 0 AND 4 THEN '0-4'
                    WHEN EXTRACT(YEAR FROM AGE('2026-04-14'::date, p.date_of_birth)) BETWEEN 5 AND 14 THEN '5-14'
                    WHEN EXTRACT(YEAR FROM AGE('2026-04-14'::date, p.date_of_birth)) BETWEEN 15 AND 24 THEN '15-24'
                    WHEN EXTRACT(YEAR FROM AGE('2026-04-14'::date, p.date_of_birth)) BETWEEN 25 AND 34 THEN '25-34'
                    WHEN EXTRACT(YEAR FROM AGE('2026-04-14'::date, p.date_of_birth)) BETWEEN 35 AND 49 THEN '35-49'
                    WHEN EXTRACT(YEAR FROM AGE('2026-04-14'::date, p.date_of_birth)) BETWEEN 50 AND 64 THEN '50-64'
                    ELSE '65+'
                END AS band,
                COUNT(*) AS cnt
            FROM patients_patient p WHERE p.registered_at_facility_id = f.id
            GROUP BY band
        ) ad
    ), '{}'::json),

    -- Gender distribution
    COALESCE((
        SELECT json_object_agg(gender, cnt) FROM (
            SELECT p.gender, COUNT(*) AS cnt
            FROM patients_patient p WHERE p.registered_at_facility_id = f.id
            GROUP BY p.gender
        ) gd
    ), '{}'::json),

    -- County distribution (top 10)
    COALESCE((
        SELECT json_agg(row_to_json(cd)) FROM (
            SELECT c.name AS county, COUNT(*) AS count
            FROM patients_patient p
            JOIN core_county c ON p.county_id = c.id
            WHERE p.registered_at_facility_id = f.id
            GROUP BY c.name ORDER BY count DESC LIMIT 10
        ) cd
    ), '[]'::json),

    -- Referral source distribution
    COALESCE((
        SELECT json_object_agg(COALESCE(src, 'unknown'), cnt) FROM (
            SELECT p.referral_source AS src, COUNT(*) AS cnt
            FROM patients_patient p WHERE p.registered_at_facility_id = f.id
            GROUP BY p.referral_source
        ) rd
    ), '{}'::json),

    -- New vs return
    json_build_object(
        'new',
        (SELECT COUNT(*) FROM patients_patient p WHERE p.registered_at_facility_id = f.id) -
        (SELECT COUNT(DISTINCT sub.patient_id) FROM (
            SELECT e.patient_id FROM encounters_encounter e
            WHERE e.facility_id = f.id
            GROUP BY e.patient_id HAVING COUNT(*) > 1
        ) sub),
        'return',
        (SELECT COUNT(DISTINCT sub.patient_id) FROM (
            SELECT e.patient_id FROM encounters_encounter e
            WHERE e.facility_id = f.id
            GROUP BY e.patient_id HAVING COUNT(*) > 1
        ) sub)
    ),

    -- Insurance coverage (SHA vs none)
    json_build_object(
        'sha', (SELECT COUNT(*) FROM patients_patient p WHERE p.registered_at_facility_id = f.id AND p.sha_number IS NOT NULL AND p.sha_number != ''),
        'none', (SELECT COUNT(*) FROM patients_patient p WHERE p.registered_at_facility_id = f.id AND (p.sha_number IS NULL OR p.sha_number = ''))
    ),

    NOW(), NOW()

FROM core_facility f
WHERE f.is_active = true

ON CONFLICT (facility_id, snapshot_date) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    total_patients = EXCLUDED.total_patients,
    age_distribution = EXCLUDED.age_distribution,
    gender_distribution = EXCLUDED.gender_distribution,
    county_distribution = EXCLUDED.county_distribution,
    referral_source_distribution = EXCLUDED.referral_source_distribution,
    new_vs_return = EXCLUDED.new_vs_return,
    insurance_coverage = EXCLUDED.insurance_coverage,
    updated_at = NOW();


COMMIT;
