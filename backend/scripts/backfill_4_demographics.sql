-- ============================================================================
-- Part 4: PATIENT DEMOGRAPHIC SNAPSHOTS (as of 2026-04-14)
-- Run in Neon SQL Editor. Idempotent (ON CONFLICT DO UPDATE).
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

    -- Total unique patients seen at this facility
    (SELECT COUNT(DISTINCT e.patient_id) FROM encounters_encounter e WHERE e.facility_id = f.id),

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
                COUNT(DISTINCT p.id) AS cnt
            FROM patients_patient p
            JOIN encounters_encounter e ON e.patient_id = p.id
            WHERE e.facility_id = f.id
            GROUP BY band
        ) ad
    ), '{}'::json),

    -- Gender distribution
    COALESCE((
        SELECT json_object_agg(gender, cnt) FROM (
            SELECT p.gender, COUNT(DISTINCT p.id) AS cnt
            FROM patients_patient p
            JOIN encounters_encounter e ON e.patient_id = p.id
            WHERE e.facility_id = f.id
            GROUP BY p.gender
        ) gd
    ), '{}'::json),

    -- County distribution (top 10)
    COALESCE((
        SELECT json_agg(row_to_json(cd)) FROM (
            SELECT c.name AS county, COUNT(DISTINCT p.id) AS count
            FROM patients_patient p
            JOIN encounters_encounter e ON e.patient_id = p.id
            JOIN core_county c ON p.county_id = c.id
            WHERE e.facility_id = f.id
            GROUP BY c.name ORDER BY count DESC LIMIT 10
        ) cd
    ), '[]'::json),

    -- Referral source distribution
    COALESCE((
        SELECT json_object_agg(COALESCE(src, 'unknown'), cnt) FROM (
            SELECT p.referral_source AS src, COUNT(DISTINCT p.id) AS cnt
            FROM patients_patient p
            JOIN encounters_encounter e ON e.patient_id = p.id
            WHERE e.facility_id = f.id
            GROUP BY p.referral_source
        ) rd
    ), '{}'::json),

    -- New vs return
    json_build_object(
        'new',
        (SELECT COUNT(DISTINCT e.patient_id) FROM encounters_encounter e WHERE e.facility_id = f.id) -
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

    -- Insurance coverage
    json_build_object(
        'sha', (SELECT COUNT(DISTINCT p.id) FROM patients_patient p JOIN encounters_encounter e ON e.patient_id = p.id WHERE e.facility_id = f.id AND p.sha_number IS NOT NULL AND p.sha_number != ''),
        'none', (SELECT COUNT(DISTINCT p.id) FROM patients_patient p JOIN encounters_encounter e ON e.patient_id = p.id WHERE e.facility_id = f.id AND (p.sha_number IS NULL OR p.sha_number = ''))
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
