"""
Tests for AEFI MOH compliance — Kenya Ministry of Health AEFI Reporting Form.

Covers:
- AEFI model expansion (event_types multi-select, report_type, follow-up chain)
- ImmunizationRecord new fields (diluent, manufacturer, vaccination_service_type)
- AEFI serializer validation (event_types, follow-up logic, OTHER detail requirement)
- AEFI API workflow (create initial → create follow-up → submit to authorities)
- Auto-population of facility info on AEFI save
- is_severe_or_death property for escalation
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.immunizations.models import (
    AEFI,
    AEFIEventType,
    AEFIOutcome,
    AEFIReportType,
    AEFISeverity,
    ImmunizationRecord,
    VaccinationServiceType,
    VaccineCampaign,
    VaccineDefinition,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def child_patient(
    db, test_user, sample_county, sample_sub_county,
    sample_organization, sample_facility,
):
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
def administered_record(child_patient, bcg_vaccine, test_user, sample_facility):
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
        vaccine_manufacturer="Serum Institute of India",
        diluent_batch_number="DIL-2026-001",
        diluent_manufacturer="SII",
        diluent_expiry_date=date.today() + timedelta(days=365),
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def sample_aefi(administered_record, sample_facility):
    return AEFI.objects.create(
        immunization_record=administered_record,
        event_date=date.today(),
        event_types=[AEFIEventType.BCG_LYMPHADENITIS],
        severity=AEFISeverity.MILD,
        description="Lump in armpit following BCG vaccination",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


# =============================================================================
# AEFI Model Tests — MOH Field Coverage
# =============================================================================


@pytest.mark.django_db
class TestAEFIModelMOH:
    """Tests for AEFI model fields aligned with MOH AEFI Reporting Form."""

    def test_create_aefi_with_all_moh_fields(self, administered_record, test_user, sample_facility, sample_county):
        """Should create AEFI with all fields from MOH form."""
        aefi = AEFI.objects.create(
            immunization_record=administered_record,
            report_type=AEFIReportType.INITIAL,
            guardian_name="Mary Wanjiku",
            vaccination_centre_name="Kenyatta National Hospital",
            vaccination_centre_county=sample_county,
            institution_mfl_code="12345",
            vaccination_service_type=VaccinationServiceType.STATIC,
            event_date=date.today(),
            onset_time=time(14, 30),
            event_types=[AEFIEventType.BCG_LYMPHADENITIS, AEFIEventType.HIGH_FEVER],
            severity=AEFISeverity.MODERATE,
            description="Lump in armpit and high fever within 24 hours of BCG",
            outcome=AEFIOutcome.RECOVERING,
            past_medical_history_notes="No known allergies. No concomitant medications.",
            treatment_given=True,
            treatment_details="Paracetamol 250mg 6-hourly, observation",
            specimen_collected=False,
            reported_by=test_user,
            reported_by_designation="Nurse",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert aefi.id is not None
        assert aefi.report_type == AEFIReportType.INITIAL
        assert aefi.guardian_name == "Mary Wanjiku"
        assert aefi.onset_time == time(14, 30)
        assert len(aefi.event_types) == 2
        assert AEFIEventType.BCG_LYMPHADENITIS in aefi.event_types
        assert AEFIEventType.HIGH_FEVER in aefi.event_types
        assert aefi.treatment_given is True
        assert aefi.specimen_collected is False
        assert aefi.reported_to_authorities is False

    def test_multi_select_event_types(self, administered_record, sample_facility):
        """MOH form uses checkboxes — multiple event types per report."""
        aefi = AEFI.objects.create(
            immunization_record=administered_record,
            event_types=[
                AEFIEventType.CONVULSION,
                AEFIEventType.HIGH_FEVER,
                AEFIEventType.ANAPHYLAXIS,
            ],
            severity=AEFISeverity.SEVERE,
            description="Multiple concurrent reactions",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert len(aefi.event_types) == 3

    def test_report_type_default_is_initial(self, administered_record, sample_facility):
        """Default report_type should be INITIAL."""
        aefi = AEFI.objects.create(
            immunization_record=administered_record,
            event_types=[AEFIEventType.INJECTION_SITE_ABSCESS],
            severity=AEFISeverity.MILD,
            description="Abscess at injection site",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert aefi.report_type == AEFIReportType.INITIAL

    def test_follow_up_report_chain(self, sample_aefi, administered_record, sample_facility):
        """Follow-up reports should link to parent."""
        follow_up = AEFI.objects.create(
            immunization_record=administered_record,
            report_type=AEFIReportType.FOLLOW_UP,
            parent_report=sample_aefi,
            event_types=[AEFIEventType.BCG_LYMPHADENITIS],
            severity=AEFISeverity.MILD,
            description="Lump has reduced in size, no fever",
            outcome=AEFIOutcome.RECOVERING,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert follow_up.parent_report == sample_aefi
        assert sample_aefi.follow_ups.count() == 1
        assert sample_aefi.follow_ups.first() == follow_up

    def test_is_severe_or_death(self, administered_record, sample_facility):
        """Should flag severe cases for escalation."""
        severe_aefi = AEFI.objects.create(
            immunization_record=administered_record,
            event_types=[AEFIEventType.ANAPHYLAXIS],
            severity=AEFISeverity.SEVERE,
            description="Anaphylactic shock",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert severe_aefi.is_severe_or_death is True

        death_aefi = AEFI.objects.create(
            immunization_record=administered_record,
            event_types=[AEFIEventType.TOXIC_SHOCK],
            severity=AEFISeverity.SEVERE,
            description="Death following vaccination",
            outcome=AEFIOutcome.DEATH,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert death_aefi.is_severe_or_death is True

    def test_mild_aefi_not_flagged_for_escalation(self, sample_aefi):
        """Mild AEFI should not be flagged for escalation."""
        assert sample_aefi.is_severe_or_death is False

    def test_submit_to_authorities(self, sample_aefi, test_user):
        """Should mark as reported and set report date."""
        sample_aefi.submit_to_authorities(user=test_user, notes="Submitted to sub-county PHN")
        sample_aefi.refresh_from_db()
        assert sample_aefi.reported_to_authorities is True
        assert sample_aefi.report_date == date.today()
        assert "Submitted to sub-county PHN" in sample_aefi.investigation_notes

    def test_auto_populate_facility_info(self, administered_record, sample_facility):
        """Should auto-populate vaccination centre details from facility on save."""
        aefi = AEFI.objects.create(
            immunization_record=administered_record,
            event_types=[AEFIEventType.HIGH_FEVER],
            severity=AEFISeverity.MILD,
            description="High fever",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert aefi.vaccination_centre_name == sample_facility.name
        assert aefi.institution_mfl_code == sample_facility.mfl_code

    def test_auto_populate_service_type_from_record(self, administered_record, sample_facility):
        """Should default vaccination_service_type from the immunization record."""
        administered_record.vaccination_service_type = VaccinationServiceType.OUTREACH
        administered_record.save(update_fields=["vaccination_service_type"])

        aefi = AEFI.objects.create(
            immunization_record=administered_record,
            event_types=[AEFIEventType.SEVERE_LOCAL_REACTION],
            severity=AEFISeverity.MODERATE,
            description="Redness past nearest joint",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        assert aefi.vaccination_service_type == VaccinationServiceType.OUTREACH

    def test_str_representation_with_multiple_types(self, administered_record, sample_facility):
        """String should show comma-separated event types and vaccine code."""
        aefi = AEFI.objects.create(
            immunization_record=administered_record,
            event_types=[AEFIEventType.CONVULSION, AEFIEventType.HIGH_FEVER],
            severity=AEFISeverity.MODERATE,
            description="Convulsion with fever",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        s = str(aefi)
        assert "BCG" in s
        assert "CONVULSION" in s
        assert "HIGH_FEVER" in s


# =============================================================================
# ImmunizationRecord New Fields Tests
# =============================================================================


@pytest.mark.django_db
class TestImmunizationRecordMOHFields:
    """Tests for new ImmunizationRecord fields (diluent, manufacturer, service type)."""

    def test_diluent_fields(self, administered_record):
        """Should store diluent details (required for reconstituted vaccines like BCG)."""
        assert administered_record.diluent_batch_number == "DIL-2026-001"
        assert administered_record.diluent_manufacturer == "SII"
        assert administered_record.diluent_expiry_date is not None

    def test_vaccine_manufacturer(self, administered_record):
        """Should store vaccine manufacturer captured at administration time."""
        assert administered_record.vaccine_manufacturer == "Serum Institute of India"

    def test_vaccination_service_type_default(self, child_patient, bcg_vaccine):
        """Default service type should be STATIC."""
        record = ImmunizationRecord.objects.create(
            patient=child_patient,
            vaccine=bcg_vaccine,
            dose_number=1,
            scheduled_date=date.today(),
        )
        assert record.vaccination_service_type == VaccinationServiceType.STATIC

    def test_campaign_auto_sets_mass_service_type(self, child_patient, bcg_vaccine):
        """Linking to a campaign should auto-set service type to MASS."""
        campaign = VaccineCampaign.objects.create(
            name="BCG Catch-up",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            status="ACTIVE",
        )
        record = ImmunizationRecord.objects.create(
            patient=child_patient,
            vaccine=bcg_vaccine,
            dose_number=1,
            scheduled_date=date.today(),
            campaign=campaign,
        )
        assert record.vaccination_service_type == VaccinationServiceType.MASS


# =============================================================================
# AEFI Serializer Validation Tests
# =============================================================================


@pytest.mark.django_db
class TestAEFISerializerValidation:
    """Tests for AEFI serializer validation rules."""

    def test_event_types_must_be_list(self, authenticated_client, administered_record):
        """event_types must be a non-empty list."""
        data = {
            "immunization_record": administered_record.id,
            "event_types": [],  # Empty
            "severity": "MILD",
            "description": "Test",
        }
        response = authenticated_client.post(
            "/api/immunizations/aefi/", data, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "event_types" in response.data

    def test_invalid_event_type_rejected(self, authenticated_client, administered_record):
        """Invalid event type values should be rejected."""
        data = {
            "immunization_record": administered_record.id,
            "event_types": ["MADE_UP_TYPE"],
            "severity": "MILD",
            "description": "Test",
        }
        response = authenticated_client.post(
            "/api/immunizations/aefi/", data, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "event_types" in response.data

    def test_other_event_type_requires_detail(self, authenticated_client, administered_record):
        """Selecting OTHER event type requires other_event_type_detail."""
        data = {
            "immunization_record": administered_record.id,
            "event_types": ["OTHER"],
            "severity": "MILD",
            "description": "Test",
        }
        response = authenticated_client.post(
            "/api/immunizations/aefi/", data, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "other_event_type_detail" in response.data

    def test_other_event_type_with_detail_accepted(self, authenticated_client, administered_record):
        """OTHER event type with detail should be accepted."""
        data = {
            "immunization_record": administered_record.id,
            "event_types": ["OTHER"],
            "other_event_type_detail": "Unusual rash pattern",
            "severity": "MILD",
            "description": "Uncommon rash",
        }
        response = authenticated_client.post(
            "/api/immunizations/aefi/", data, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["other_event_type_detail"] == "Unusual rash pattern"

    def test_follow_up_requires_parent(self, authenticated_client, administered_record):
        """Follow-up report must reference a parent."""
        data = {
            "immunization_record": administered_record.id,
            "report_type": "FOLLOW_UP",
            "event_types": ["BCG_LYMPHADENITIS"],
            "severity": "MILD",
            "description": "Follow-up",
        }
        response = authenticated_client.post(
            "/api/immunizations/aefi/", data, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "parent_report" in response.data

    def test_initial_report_rejects_parent(self, authenticated_client, administered_record, sample_aefi):
        """Initial report must not have a parent."""
        data = {
            "immunization_record": administered_record.id,
            "report_type": "INITIAL",
            "parent_report": sample_aefi.id,
            "event_types": ["HIGH_FEVER"],
            "severity": "MILD",
            "description": "Test",
        }
        response = authenticated_client.post(
            "/api/immunizations/aefi/", data, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "parent_report" in response.data

    def test_follow_up_with_parent_accepted(self, authenticated_client, administered_record, sample_aefi):
        """Valid follow-up with parent should work."""
        data = {
            "immunization_record": administered_record.id,
            "report_type": "FOLLOW_UP",
            "parent_report": sample_aefi.id,
            "event_types": ["BCG_LYMPHADENITIS"],
            "severity": "MILD",
            "description": "Lump reduced, patient recovering",
            "outcome": "RECOVERING",
        }
        response = authenticated_client.post(
            "/api/immunizations/aefi/", data, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["report_type"] == "FOLLOW_UP"
        assert response.data["parent_report"] == sample_aefi.id

    def test_all_moh_event_types_accepted(self, authenticated_client, administered_record):
        """All 11 MOH event types should be valid individually."""
        for event_type in AEFIEventType:
            extra = {}
            if event_type == AEFIEventType.OTHER:
                extra["other_event_type_detail"] = "Custom event"
            data = {
                "immunization_record": administered_record.id,
                "event_types": [event_type.value],
                "severity": "MILD",
                "description": f"Test {event_type.label}",
                **extra,
            }
            response = authenticated_client.post(
                "/api/immunizations/aefi/", data, format="json"
            )
            assert response.status_code == status.HTTP_201_CREATED, (
                f"Failed for event type {event_type.value}: {response.data}"
            )


# =============================================================================
# AEFI API Workflow Tests
# =============================================================================


@pytest.mark.django_db
class TestAEFIAPIWorkflow:
    """Tests for the full AEFI reporting workflow via API."""

    def test_create_initial_report(self, authenticated_client, administered_record):
        """Should create an initial AEFI report with auto-set reported_by."""
        data = {
            "immunization_record": administered_record.id,
            "event_date": date.today().isoformat(),
            "onset_time": "14:30:00",
            "event_types": ["BCG_LYMPHADENITIS"],
            "severity": "MILD",
            "description": "Lump in armpit following BCG vaccination",
            "guardian_name": "Mary Wanjiku",
            "vaccination_service_type": "STATIC",
            "treatment_given": True,
            "treatment_details": "Cold compress applied",
        }
        response = authenticated_client.post(
            "/api/immunizations/aefi/", data, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["report_type"] == "INITIAL"
        assert response.data["reported_by"] is not None  # Auto-set
        assert response.data["onset_time"] == "14:30:00"
        assert response.data["guardian_name"] == "Mary Wanjiku"
        assert response.data["treatment_given"] is True

    def test_create_then_follow_up(self, authenticated_client, administered_record):
        """Should create initial then follow-up report."""
        # Create initial
        initial_data = {
            "immunization_record": administered_record.id,
            "event_types": ["ANAPHYLAXIS"],
            "severity": "SEVERE",
            "description": "Anaphylactic reaction within 30 minutes",
            "treatment_given": True,
            "treatment_details": "Epinephrine 0.3mg IM, IV fluids",
        }
        initial_response = authenticated_client.post(
            "/api/immunizations/aefi/", initial_data, format="json"
        )
        assert initial_response.status_code == status.HTTP_201_CREATED
        initial_id = initial_response.data["id"]

        # Create follow-up
        follow_up_data = {
            "immunization_record": administered_record.id,
            "report_type": "FOLLOW_UP",
            "parent_report": initial_id,
            "event_types": ["ANAPHYLAXIS"],
            "severity": "MODERATE",
            "description": "Patient stabilized, transferred to ward",
            "outcome": "RECOVERING",
        }
        follow_up_response = authenticated_client.post(
            "/api/immunizations/aefi/", follow_up_data, format="json"
        )
        assert follow_up_response.status_code == status.HTTP_201_CREATED
        assert follow_up_response.data["parent_report"] == initial_id

        # Verify follow-up count on initial
        detail_response = authenticated_client.get(
            f"/api/immunizations/aefi/{initial_id}/"
        )
        assert detail_response.data["follow_up_count"] == 1

    def test_submit_to_authorities(self, authenticated_client, sample_aefi):
        """Should mark AEFI as reported to authorities."""
        response = authenticated_client.post(
            f"/api/immunizations/aefi/{sample_aefi.id}/submit-to-authorities/",
            {"notes": "Forwarded to sub-county PHN"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["reported_to_authorities"] is True
        assert response.data["report_date"] is not None

    def test_submit_to_authorities_idempotent(self, authenticated_client, sample_aefi):
        """Should reject re-submission."""
        # First submission
        authenticated_client.post(
            f"/api/immunizations/aefi/{sample_aefi.id}/submit-to-authorities/",
            format="json",
        )
        # Second attempt
        response = authenticated_client.post(
            f"/api/immunizations/aefi/{sample_aefi.id}/submit-to-authorities/",
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_detail_includes_vaccination_details(self, authenticated_client, sample_aefi):
        """Detail response should include vaccination_details from record."""
        response = authenticated_client.get(
            f"/api/immunizations/aefi/{sample_aefi.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        vax = response.data["vaccination_details"]
        assert vax["batch_number"] == "BCG-2026-001"
        assert vax["lot_number"] == "LOT-123"
        assert vax["vaccine_manufacturer"] == "Serum Institute of India"
        assert vax["diluent_batch_number"] == "DIL-2026-001"
        assert vax["diluent_manufacturer"] == "SII"
        assert vax["site"] == "LEFT_ARM"

    def test_detail_includes_patient_context(self, authenticated_client, sample_aefi):
        """Detail response should include patient details for the MOH form."""
        response = authenticated_client.get(
            f"/api/immunizations/aefi/{sample_aefi.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["patient_name"] == "Baby Wanjiku"
        assert response.data["patient_gender"] == "F"
        assert response.data["patient_date_of_birth"] is not None
        assert response.data["patient_mrn"] is not None
        assert response.data["vaccine_code"] == "BCG"
        assert response.data["vaccine_name"] == "Bacille Calmette-Guérin"

    def test_list_filters_by_report_type(self, authenticated_client, administered_record, sample_aefi, sample_facility):
        """Should filter AEFI list by report_type."""
        # Create a follow-up
        AEFI.objects.create(
            immunization_record=administered_record,
            report_type=AEFIReportType.FOLLOW_UP,
            parent_report=sample_aefi,
            event_types=[AEFIEventType.BCG_LYMPHADENITIS],
            severity=AEFISeverity.MILD,
            description="Follow-up check",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        # Filter for initial only
        response = authenticated_client.get(
            "/api/immunizations/aefi/?report_type=INITIAL"
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        for r in results:
            assert r["report_type"] == "INITIAL"

    def test_list_filters_by_reported_to_authorities(self, authenticated_client, sample_aefi):
        """Should filter by reported_to_authorities status."""
        response = authenticated_client.get(
            "/api/immunizations/aefi/?reported_to_authorities=false"
        )
        assert response.status_code == status.HTTP_200_OK

    def test_unauthenticated_rejected(self, api_client, sample_aefi):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/immunizations/aefi/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
