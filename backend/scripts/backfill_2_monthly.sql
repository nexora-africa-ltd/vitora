-- ============================================================================
-- Part 2: DEPARTMENT MONTHLY SUMMARIES
-- Run in Neon SQL Editor. Idempotent (ON CONFLICT DO UPDATE).
-- ============================================================================

-- 2a. Encounter-based departments (OPD, IPD, EMERGENCY, MCH, THEATRE)
INSERT INTO analytics_departmentmonthlysummary (
    facility_id, organization_id, year, month, department,
    visit_count, unique_patients, revenue, top_diagnoses, avg_length_of_stay_days,
    created_at, updated_at
)
SELECT
    f.id, f.organization_id,
    EXTRACT(YEAR FROM m.month_start)::int,
    EXTRACT(MONTH FROM m.month_start)::int,
    dept.code,
    (SELECT COUNT(*) FROM encounters_encounter e
     WHERE e.facility_id = f.id
       AND e.encounter_date >= m.month_start
       AND e.encounter_date <= (m.month_start + interval '1 month' - interval '1 day')::date
       AND e.encounter_type = ANY(dept.enc_types)),
    (SELECT COUNT(DISTINCT e.patient_id) FROM encounters_encounter e
     WHERE e.facility_id = f.id
       AND e.encounter_date >= m.month_start
       AND e.encounter_date <= (m.month_start + interval '1 month' - interval '1 day')::date
       AND e.encounter_type = ANY(dept.enc_types)),
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
            ORDER BY count DESC LIMIT 10
        ) top_dx
    ), '[]'::json),
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

-- 2b. Pharmacy department
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
    COALESCE((SELECT SUM(ii.line_total) FROM billing_invoiceitem ii JOIN billing_invoice inv ON ii.invoice_id = inv.id WHERE inv.facility_id = f.id AND inv.status IN ('paid','partial') AND inv.created_at::date >= m.month_start AND inv.created_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date AND ii.item_type = 'pharmacy'), 0),
    '[]'::json, NULL,
    NOW(), NOW()
FROM core_facility f
CROSS JOIN generate_series('2026-01-01'::date, '2026-04-01'::date, '1 month'::interval) AS m(month_start)
WHERE f.is_active = true
  AND (SELECT COUNT(*) FROM pharmacy_prescription rx WHERE rx.facility_id = f.id AND rx.prescribed_at::date >= m.month_start AND rx.prescribed_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date) > 0
ON CONFLICT (facility_id, year, month, department) DO UPDATE SET
    organization_id = EXCLUDED.organization_id, visit_count = EXCLUDED.visit_count,
    unique_patients = EXCLUDED.unique_patients, revenue = EXCLUDED.revenue, updated_at = NOW();

-- 2c. Laboratory department
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
    COALESCE((SELECT SUM(ii.line_total) FROM billing_invoiceitem ii JOIN billing_invoice inv ON ii.invoice_id = inv.id WHERE inv.facility_id = f.id AND inv.status IN ('paid','partial') AND inv.created_at::date >= m.month_start AND inv.created_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date AND ii.item_type = 'lab'), 0),
    '[]'::json, NULL,
    NOW(), NOW()
FROM core_facility f
CROSS JOIN generate_series('2026-01-01'::date, '2026-04-01'::date, '1 month'::interval) AS m(month_start)
WHERE f.is_active = true
  AND (SELECT COUNT(*) FROM laboratory_laborder lo WHERE lo.facility_id = f.id AND lo.ordered_at::date >= m.month_start AND lo.ordered_at::date <= (m.month_start + interval '1 month' - interval '1 day')::date) > 0
ON CONFLICT (facility_id, year, month, department) DO UPDATE SET
    organization_id = EXCLUDED.organization_id, visit_count = EXCLUDED.visit_count,
    unique_patients = EXCLUDED.unique_patients, revenue = EXCLUDED.revenue, updated_at = NOW();
