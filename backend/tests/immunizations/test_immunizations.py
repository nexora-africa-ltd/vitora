"""
Tests for the immunizations app.

Covers:
- VaccineDefinition model (KEPI + adult vaccines, target populations, programs)
- ImmunizationRecord model (multi-dose support, overdue logic)
- VaccineCampaign model (mass campaigns)
- AEFI model (adverse event reporting)
- Schedule generation service (KEPI for children, protocol-based for adults)
- Coverage calculation service
- API endpoints (CRUD, administer, generate schedule, coverage stats)

Uses global conftest fixtures: authenticated_client, api_client, test_user,
sample_county, sample_sub_county, sample_organization, sample_facility.
"""

from datetime import date, timedelta

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.immunizations.models import (
    AEFI,
    ImmunizationRecord,
    VaccineCampaign,
    VaccineDefinition,
)
from hmis.apps.immunizations.services.coverage import calculate_coverage
from hmis.apps.immunizations.services.schedule import (
    generate_adult_schedule,
    generate_kepi_schedule,
)


# =============================================================================
# Immunization-Specific Fixtures
# =============================================================================


@pytest.fixture
def child_patient(
    db, test_user, sample_county, sample_sub_county,
    sample_organization, sample_facility,
):
    """Child patient born 30 days ago for KEPI schedule tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Baby",
        last_name="Wanjiku",
        date_of_birth=date.today() - timedelta(days=30),
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
        registered_at_facility=sample_facility,
    )


@pytest.fixture
def adult_patient(
    db, test_user, sample_county, sample_sub_county,
    sample_organization, sample_facility,
):
    """Adult patient for non-KEPI vaccine tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="John",
        last_name="Kamau",
        date_of_birth=date(1985, 6, 15),
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
        registered_at_facility=sample_facility,
    )


@pytest.fixture
def bcg_vaccine(db):
    return VaccineDefinition.objects.create(
        code="BCG",
        name="Bacille Calmette-Guérin",
        disease_target="Tuberculosis",
        standard_age_days=0,
        route="ID",
        dose_number=1,
        series_name="BCG",
        target_population="INFANT",
        program="KEPI",
    )


@pytest.fixture
def penta_vaccines(db):
    vaccines = []
    for i in range(1, 4):
        v = VaccineDefinition.objects.create(
            code=f"PENTA{i}",
            name=f"Pentavalent Vaccine ({i} dose)",
            disease_target="Diphtheria, Pertussis, Tetanus, Hepatitis B, Hib",
            standard_age_days=42 + (i - 1) * 28,
            route="IM",
            dose_number=i,
            series_name="Pentavalent",
            target_population="INFANT",
            program="KEPI",
        )
        vaccines.append(v)
    return vaccines


@pytest.fixture
def hepatitis_b_adult_vaccine(db):
    return VaccineDefinition.objects.create(
        code="HEPB_ADULT",
        name="Hepatitis B Vaccine (Adult)",
        disease_target="Hepatitis B",
        route="IM",
        dose_number=1,
        total_doses=3,
        series_name="Hepatitis B Adult",
        target_population="ADULT",
        program="ROUTINE",
        min_age_days=6570,  # ~18 years
        interval_days=28,
    )


@pytest.fixture
def covid_vaccine(db):
    return VaccineDefinition.objects.create(
        code="COVID19_PF",
        name="COVID-19 Pfizer-BioNTech",
        disease_target="COVID-19",
        route="IM",
        dose_number=1,
        total_doses=2,
        series_name="COVID-19 Pfizer",
        target_population="ALL",
        program="CAMPAIGN",
        interval_days=21,
    )


@pytest.fixture
def flu_vaccine(db):
    return VaccineDefinition.objects.create(
        code="FLU_ANNUAL",
        name="Influenza Vaccine (Annual)",
        disease_target="Influenza",
        route="IM",
        dose_number=1,
        total_doses=1,
        series_name="Influenza",
        target_population="ALL",
        program="ROUTINE",
        min_age_days=180,
    )


@pytest.fixture
def sample_campaign(db, covid_vaccine):
    campaign = VaccineCampaign.objects.create(
        name="COVID-19 National Vaccination Drive 2026",
        description="Mass COVID-19 vaccination campaign",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=90),
        target_population="ADULT",
        status="ACTIVE",
    )
    campaign.vaccines.add(covid_vaccine)
    return campaign


@pytest.fixture
def sample_immunization(child_patient, bcg_vaccine, test_user):
    return ImmunizationRecord.objects.create(
        patient=child_patient,
        vaccine=bcg_vaccine,
        dose_number=1,
        scheduled_date=child_patient.date_of_birth,
        administered_date=child_patient.date_of_birth,
        status="ADMINISTERED",
        administered_by=test_user,
        batch_number="BCG-2026-001",
        lot_number="LOT-123",
        site="LEFT_ARM",
    )


# =============================================================================
# VaccineDefinition Model Tests
# =============================================================================


@pytest.mark.django_db
class TestVaccineDefinition:
    """Tests for VaccineDefinition model."""

    def test_create_kepi_vaccine(self, bcg_vaccine):
        """Should create a KEPI vaccine with standard fields."""
        assert bcg_vaccine.code == "BCG"
        assert bcg_vaccine.target_population == "INFANT"
        assert bcg_vaccine.program == "KEPI"
        assert bcg_vaccine.is_active is True

    def test_create_adult_vaccine(self, hepatitis_b_adult_vaccine):
        """Should create an adult vaccine with multi-dose support."""
        assert hepatitis_b_adult_vaccine.target_population == "ADULT"
        assert hepatitis_b_adult_vaccine.program == "ROUTINE"
        assert hepatitis_b_adult_vaccine.total_doses == 3
        assert hepatitis_b_adult_vaccine.interval_days == 28
        assert hepatitis_b_adult_vaccine.min_age_days == 6570

    def test_create_campaign_vaccine(self, covid_vaccine):
        """Should create a campaign vaccine targeting all populations."""
        assert covid_vaccine.target_population == "ALL"
        assert covid_vaccine.program == "CAMPAIGN"
        assert covid_vaccine.total_doses == 2

    def test_vaccine_str(self, bcg_vaccine):
        """String representation should include code and name."""
        assert "BCG" in str(bcg_vaccine)

    def test_unique_code(self, bcg_vaccine):
        """Vaccine code must be unique."""
        from django.db import IntegrityError
        with pytest.raises(IntegrityError):
            VaccineDefinition.objects.create(
                code="BCG",
                name="Duplicate BCG",
                standard_age_days=0,
                target_population="INFANT",
                program="KEPI",
            )

    def test_default_ordering(self, bcg_vaccine, penta_vaccines):
        """Vaccines should be ordered by standard_age_days then code."""
        vaccines = list(VaccineDefinition.objects.all())
        assert vaccines[0].code == "BCG"  # day 0
        assert vaccines[1].code == "PENTA1"  # day 42

    def test_kepi_program_filter(self, bcg_vaccine, penta_vaccines, covid_vaccine):
        """Should filter vaccines by program."""
        kepi = VaccineDefinition.objects.filter(program="KEPI")
        assert kepi.count() == 4  # BCG + 3 Penta
        campaign = VaccineDefinition.objects.filter(program="CAMPAIGN")
        assert campaign.count() == 1

    def test_target_population_filter(self, bcg_vaccine, hepatitis_b_adult_vaccine, covid_vaccine):
        """Should filter vaccines by target population."""
        adult = VaccineDefinition.objects.filter(target_population="ADULT")
        assert adult.count() == 1
        all_pop = VaccineDefinition.objects.filter(target_population="ALL")
        assert all_pop.count() == 1


# =============================================================================
# ImmunizationRecord Model Tests
# =============================================================================


@pytest.mark.django_db
class TestImmunizationRecord:
    """Tests for ImmunizationRecord model."""

    def test_create_record(self, sample_immunization):
        """Should create an immunization record."""
        assert sample_immunization.status == "ADMINISTERED"
        assert sample_immunization.batch_number == "BCG-2026-001"
        assert sample_immunization.dose_number == 1

    def test_scheduled_record_is_overdue(self, child_patient, bcg_vaccine):
        """Scheduled record past due date should be overdue."""
        record = ImmunizationRecord.objects.create(
            patient=child_patient,
            vaccine=bcg_vaccine,
            dose_number=1,
            scheduled_date=date.today() - timedelta(days=14),
            status="SCHEDULED",
        )
        assert record.is_overdue is True
        assert record.days_overdue == 14

    def test_future_scheduled_not_overdue(self, child_patient, bcg_vaccine):
        """Scheduled record with future date should not be overdue."""
        record = ImmunizationRecord.objects.create(
            patient=child_patient,
            vaccine=bcg_vaccine,
            dose_number=1,
            scheduled_date=date.today() + timedelta(days=7),
            status="SCHEDULED",
        )
        assert record.is_overdue is False
        assert record.days_overdue is None

    def test_administered_not_overdue(self, sample_immunization):
        """Administered record should not be overdue regardless of dates."""
        assert sample_immunization.is_overdue is False

    def test_multi_dose_same_vaccine_different_dose_numbers(self, child_patient, covid_vaccine):
        """Should allow multiple records for same vaccine with different dose numbers."""
        r1 = ImmunizationRecord.objects.create(
            patient=child_patient,
            vaccine=covid_vaccine,
            dose_number=1,
            scheduled_date=date.today(),
        )
        r2 = ImmunizationRecord.objects.create(
            patient=child_patient,
            vaccine=covid_vaccine,
            dose_number=2,
            scheduled_date=date.today() + timedelta(days=21),
        )
        assert r1.pk != r2.pk
        records = ImmunizationRecord.objects.filter(
            patient=child_patient, vaccine=covid_vaccine
        )
        assert records.count() == 2

    def test_str_representation(self, sample_immunization):
        """String should include vaccine code and patient."""
        s = str(sample_immunization)
        assert "BCG" in s

    def test_encounter_link_optional(self, child_patient, bcg_vaccine):
        """Encounter FK should be optional."""
        record = ImmunizationRecord.objects.create(
            patient=child_patient,
            vaccine=bcg_vaccine,
            dose_number=1,
            scheduled_date=date.today(),
        )
        assert record.encounter is None

    def test_campaign_link_optional(self, child_patient, bcg_vaccine):
        """Campaign FK should be optional."""
        record = ImmunizationRecord.objects.create(
            patient=child_patient,
            vaccine=bcg_vaccine,
            dose_number=1,
            scheduled_date=date.today(),
        )
        assert record.campaign is None


# =============================================================================
# VaccineCampaign Model Tests
# =============================================================================


@pytest.mark.django_db
class TestVaccineCampaign:
    """Tests for VaccineCampaign model."""

    def test_create_campaign(self, sample_campaign, covid_vaccine):
        """Should create a campaign with vaccines."""
        assert sample_campaign.status == "ACTIVE"
        assert sample_campaign.vaccines.count() == 1
        assert sample_campaign.vaccines.first() == covid_vaccine

    def test_campaign_str(self, sample_campaign):
        """String should include campaign name."""
        assert "COVID-19" in str(sample_campaign)

    def test_campaign_statuses(self, db, covid_vaccine):
        """Should support all campaign status transitions."""
        for status_code in ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]:
            campaign = VaccineCampaign.objects.create(
                name=f"Campaign {status_code}",
                start_date=date.today(),
                end_date=date.today() + timedelta(days=30),
                status=status_code,
            )
            assert campaign.status == status_code
            campaign.delete()

    def test_campaign_is_active_property(self, sample_campaign):
        """is_active should reflect status and date range."""
        assert sample_campaign.is_running is True

    def test_completed_campaign_not_running(self, sample_campaign):
        """Completed campaign should not be running."""
        sample_campaign.status = "COMPLETED"
        sample_campaign.save()
        assert sample_campaign.is_running is False


# =============================================================================
# AEFI Model Tests
# =============================================================================


@pytest.mark.django_db
class TestAEFI:
    """Tests for AEFI model."""

    def test_create_aefi(self, sample_immunization):
        """Should create an AEFI report."""
        aefi = AEFI.objects.create(
            immunization_record=sample_immunization,
            event_date=date.today(),
            event_types=["INJECTION_SITE_ABSCESS"],
            severity="MILD",
            description="Swelling at injection site",
        )
        assert aefi.outcome == "UNKNOWN"
        assert aefi.reported_to_authorities is False

    def test_aefi_str(self, sample_immunization):
        """String should include vaccine code."""
        aefi = AEFI.objects.create(
            immunization_record=sample_immunization,
            event_date=date.today(),
            event_types=["HIGH_FEVER"],
            severity="MODERATE",
            description="Fever and malaise",
        )
        assert "BCG" in str(aefi)


# =============================================================================
# Schedule Generation Tests
# =============================================================================


@pytest.mark.django_db
class TestScheduleGeneration:
    """Tests for immunization schedule generation services."""

    def test_generate_kepi_schedule(self, child_patient, bcg_vaccine, penta_vaccines):
        """Should generate KEPI schedule for a child based on DOB."""
        records = generate_kepi_schedule(child_patient)
        assert len(records) == 4  # BCG + 3 Penta
        # BCG should be scheduled on DOB
        bcg_record = next(r for r in records if r.vaccine.code == "BCG")
        assert bcg_record.scheduled_date == child_patient.date_of_birth
        assert bcg_record.status == "SCHEDULED"

    def test_kepi_schedule_idempotent(self, child_patient, bcg_vaccine, penta_vaccines):
        """Calling generate twice should not duplicate records."""
        first = generate_kepi_schedule(child_patient)
        second = generate_kepi_schedule(child_patient)
        assert len(first) == len(second)
        total = ImmunizationRecord.objects.filter(patient=child_patient).count()
        assert total == 4

    def test_kepi_schedule_dates_from_dob(self, child_patient, bcg_vaccine, penta_vaccines):
        """Scheduled dates should be DOB + standard_age_days."""
        records = generate_kepi_schedule(child_patient)
        penta1_record = next(r for r in records if r.vaccine.code == "PENTA1")
        expected = child_patient.date_of_birth + timedelta(days=42)
        assert penta1_record.scheduled_date == expected

    def test_generate_adult_schedule(self, adult_patient, hepatitis_b_adult_vaccine):
        """Should generate multi-dose schedule for adult vaccine."""
        records = generate_adult_schedule(
            patient=adult_patient,
            vaccine=hepatitis_b_adult_vaccine,
            start_date=date.today(),
        )
        assert len(records) == 3  # 3-dose series
        assert records[0].dose_number == 1
        assert records[1].dose_number == 2
        assert records[2].dose_number == 3
        # Second dose should be interval_days after first
        assert records[1].scheduled_date == records[0].scheduled_date + timedelta(days=28)

    def test_adult_schedule_idempotent(self, adult_patient, hepatitis_b_adult_vaccine):
        """Adult schedule should not duplicate records on re-generation."""
        first = generate_adult_schedule(
            patient=adult_patient,
            vaccine=hepatitis_b_adult_vaccine,
            start_date=date.today(),
        )
        second = generate_adult_schedule(
            patient=adult_patient,
            vaccine=hepatitis_b_adult_vaccine,
            start_date=date.today(),
        )
        assert len(first) == len(second)
        total = ImmunizationRecord.objects.filter(
            patient=adult_patient, vaccine=hepatitis_b_adult_vaccine
        ).count()
        assert total == 3

    def test_no_kepi_vaccines_returns_empty(self, child_patient):
        """Should return empty list if no KEPI vaccines defined."""
        records = generate_kepi_schedule(child_patient)
        assert records == []


# =============================================================================
# Coverage Calculation Tests
# =============================================================================


@pytest.mark.django_db
class TestCoverageCalculation:
    """Tests for immunization coverage statistics."""

    def test_coverage_calculation(self, child_patient, adult_patient, bcg_vaccine, test_user):
        """Should calculate coverage percentage for a vaccine."""
        # Create 2 records: 1 administered for child, 1 scheduled for adult
        ImmunizationRecord.objects.create(
            patient=child_patient,
            vaccine=bcg_vaccine,
            dose_number=1,
            scheduled_date=date.today() - timedelta(days=30),
            administered_date=date.today() - timedelta(days=30),
            status="ADMINISTERED",
            administered_by=test_user,
        )
        ImmunizationRecord.objects.create(
            patient=adult_patient,
            vaccine=bcg_vaccine,
            dose_number=1,
            scheduled_date=date.today() - timedelta(days=60),
            status="SCHEDULED",
        )

        result = calculate_coverage(vaccine_code="BCG")
        assert result["total"] == 2
        assert result["administered"] == 1
        assert result["coverage_pct"] == 50.0

    def test_coverage_empty_returns_zero(self, bcg_vaccine):
        """Coverage with no records should return 0."""
        result = calculate_coverage(vaccine_code="BCG")
        assert result["total"] == 0
        assert result["coverage_pct"] == 0.0


# =============================================================================
# API Endpoint Tests
# =============================================================================


@pytest.mark.django_db
class TestVaccineDefinitionAPI:
    """Tests for /api/immunizations/vaccines/ endpoints."""

    def test_list_vaccines(self, authenticated_client, bcg_vaccine, penta_vaccines):
        """Should list all active vaccines."""
        response = authenticated_client.get("/api/immunizations/vaccines/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 4

    def test_list_vaccines_filter_by_program(self, authenticated_client, bcg_vaccine, covid_vaccine):
        """Should filter vaccines by program."""
        response = authenticated_client.get("/api/immunizations/vaccines/?program=KEPI")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["code"] == "BCG"

    def test_list_vaccines_filter_by_target(self, authenticated_client, bcg_vaccine, covid_vaccine):
        """Should filter vaccines by target population."""
        response = authenticated_client.get("/api/immunizations/vaccines/?target_population=ALL")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["code"] == "COVID19_PF"

    def test_unauthenticated_rejected(self, api_client, bcg_vaccine):
        """Unauthenticated requests should be rejected."""
        response = api_client.get("/api/immunizations/vaccines/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestImmunizationRecordAPI:
    """Tests for /api/immunizations/records/ endpoints."""

    def test_list_records(self, authenticated_client, sample_immunization):
        """Should list immunization records."""
        response = authenticated_client.get("/api/immunizations/records/")
        assert response.status_code == status.HTTP_200_OK

    def test_create_record(self, authenticated_client, child_patient, bcg_vaccine):
        """Should create an immunization record."""
        data = {
            "patient": child_patient.id,
            "vaccine": bcg_vaccine.id,
            "dose_number": 1,
            "scheduled_date": str(date.today()),
        }
        response = authenticated_client.post("/api/immunizations/records/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["vaccine_code"] == "BCG"

    def test_administer_vaccine(self, authenticated_client, child_patient, bcg_vaccine):
        """Should administer a scheduled vaccine."""
        record = ImmunizationRecord.objects.create(
            patient=child_patient,
            vaccine=bcg_vaccine,
            dose_number=1,
            scheduled_date=date.today(),
            status="SCHEDULED",
        )
        data = {
            "administered_date": str(date.today()),
            "batch_number": "BCG-2026-BATCH",
            "site": "LEFT_ARM",
        }
        response = authenticated_client.post(
            f"/api/immunizations/records/{record.id}/administer/", data
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ADMINISTERED"
        assert response.data["batch_number"] == "BCG-2026-BATCH"

    def test_generate_kepi_schedule_via_api(
        self, authenticated_client, child_patient, bcg_vaccine, penta_vaccines
    ):
        """Should generate KEPI schedule via API."""
        response = authenticated_client.post(
            "/api/immunizations/records/generate-kepi-schedule/",
            {"patient": child_patient.id},
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 4

    def test_generate_adult_schedule_via_api(
        self, authenticated_client, adult_patient, hepatitis_b_adult_vaccine
    ):
        """Should generate adult vaccine schedule via API."""
        response = authenticated_client.post(
            "/api/immunizations/records/generate-adult-schedule/",
            {
                "patient": adult_patient.id,
                "vaccine": hepatitis_b_adult_vaccine.id,
                "start_date": str(date.today()),
            },
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 3  # 3-dose series

    def test_filter_by_patient(self, authenticated_client, sample_immunization, child_patient):
        """Should filter records by patient."""
        response = authenticated_client.get(
            f"/api/immunizations/records/?patient={child_patient.id}"
        )
        assert response.status_code == status.HTTP_200_OK

    def test_filter_by_status(self, authenticated_client, sample_immunization):
        """Should filter records by status."""
        response = authenticated_client.get(
            "/api/immunizations/records/?status=ADMINISTERED"
        )
        assert response.status_code == status.HTTP_200_OK

    def test_filter_by_program(self, authenticated_client, sample_immunization):
        """Should filter records by vaccine program."""
        response = authenticated_client.get(
            "/api/immunizations/records/?program=KEPI"
        )
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestVaccineCampaignAPI:
    """Tests for /api/immunizations/campaigns/ endpoints."""

    def test_list_campaigns(self, authenticated_client, sample_campaign):
        """Should list campaigns."""
        response = authenticated_client.get("/api/immunizations/campaigns/")
        assert response.status_code == status.HTTP_200_OK

    def test_create_campaign(self, authenticated_client, covid_vaccine):
        """Should create a campaign."""
        data = {
            "name": "Polio Mop-Up",
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=14)),
            "target_population": "CHILD",
            "status": "PLANNED",
            "vaccines": [covid_vaccine.id],
        }
        response = authenticated_client.post("/api/immunizations/campaigns/", data)
        assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
class TestAEFIAPI:
    """Tests for /api/immunizations/aefi/ endpoints."""

    def test_create_aefi(self, authenticated_client, sample_immunization):
        """Should create an AEFI report."""
        data = {
            "immunization_record": sample_immunization.id,
            "event_date": str(date.today()),
            "event_types": ["INJECTION_SITE_ABSCESS"],
            "severity": "MILD",
            "description": "Redness at injection site",
        }
        response = authenticated_client.post("/api/immunizations/aefi/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_list_aefi(self, authenticated_client, sample_immunization):
        """Should list AEFI reports."""
        AEFI.objects.create(
            immunization_record=sample_immunization,
            event_date=date.today(),
            event_types=["SEVERE_LOCAL_REACTION"],
            severity="MILD",
            description="Swelling",
        )
        response = authenticated_client.get("/api/immunizations/aefi/")
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestCoverageAPI:
    """Tests for /api/immunizations/coverage/ endpoint."""

    def test_coverage_endpoint(self, authenticated_client, sample_immunization, bcg_vaccine):
        """Should return coverage statistics."""
        response = authenticated_client.get(
            "/api/immunizations/coverage/?vaccine_code=BCG"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "coverage_pct" in response.data
        assert "total" in response.data
        assert "administered" in response.data

    def test_coverage_by_period(self, authenticated_client, sample_immunization, bcg_vaccine):
        """Should support period-based coverage."""
        start = str(date.today() - timedelta(days=90))
        end = str(date.today())
        response = authenticated_client.get(
            f"/api/immunizations/coverage/?vaccine_code=BCG&start_date={start}&end_date={end}"
        )
        assert response.status_code == status.HTTP_200_OK
