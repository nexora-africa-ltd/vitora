-- ============================================================================
-- Part 3: DIAGNOSIS TRENDS (Monthly, top 50 per facility per month)
-- Run in Neon SQL Editor. Idempotent (ON CONFLICT DO UPDATE).
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
