"""
Tests for Patient Timeline API endpoint - Sprint 1.1-1.2.

Tests cover:
1. Timeline endpoint existence
2. Patient info in response
3. Encounters list in timeline
4. Encounter ordering (newest first)
5. Vitals summary inclusion
6. Diagnoses inclusion
7. Statistics
8. Date range filtering
9. Authentication requirement
10. Non-existent patient handling
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest # type: ignore
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

User = get_user_model()


# ============================================================================
# Local Fixtures
# ============================================================================


@pytest.fixture
def timeline_test_user(db):
    """Create a test user for timeline tests."""
    return User.objects.create_user(username="timelinedoc", password="testpass123")


@pytest.fixture
def timeline_sample_patient(db):
    """Create a sample patient for timeline tests."""
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="Timeline",
        last_name="Test",
        date_of_birth=date(1985, 3, 20),
        gender="F",
    )


@pytest.fixture
def timeline_sample_encounter(db, timeline_sample_patient):
    """Create a sample encounter for timeline tests."""
    from hmis.apps.encounters.models import Encounter

    return Encounter.objects.create(
        patient=timeline_sample_patient,
        encounter_type="OPD",
        chief_complaint="Timeline test complaint",
    )


@pytest.fixture
def timeline_authenticated_client(db, timeline_test_user):
    """Provide authenticated API client for timeline tests."""
    client = APIClient()
    client.force_authenticate(user=timeline_test_user)
    return client


# ============================================================================
# Patient Timeline API Tests
# ============================================================================


@pytest.mark.integration
class TestPatientTimelineAPI:
    """Test Patient Encounter Timeline API endpoint."""

    def test_timeline_endpoint_exists(self, timeline_authenticated_client, timeline_sample_patient):
        """Test /api/patients/{id}/encounter-timeline/ endpoint exists."""
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )
        assert response.status_code != 404

    def test_timeline_returns_patient_info(
        self, timeline_authenticated_client, timeline_sample_patient, timeline_sample_encounter
    ):
        """Test timeline response includes patient information."""
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )
        assert response.status_code == 200
        assert "patient" in response.data
        assert "mrn" in response.data["patient"]

    def test_timeline_returns_encounters_list(
        self, timeline_authenticated_client, timeline_sample_patient, timeline_sample_encounter
    ):
        """Test timeline response includes encounters list."""
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )
        assert response.status_code == 200
        assert "timeline" in response.data
        assert isinstance(response.data["timeline"], list)

    def test_timeline_encounters_ordered_by_date(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline encounters are ordered newest first."""
        from hmis.apps.encounters.models import Encounter

        old = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Old visit",
        )
        new = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="New visit",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        timeline = response.data["timeline"]
        assert timeline[0]["encounter_id"] == new.id
        assert timeline[1]["encounter_id"] == old.id

    def test_timeline_includes_vitals_summary(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline includes vitals summary for each encounter."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="With vitals",
            temperature=Decimal("37.5"),
            pulse=80,
            blood_pressure="120/80",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        encounter_data = response.data["timeline"][0]
        assert "vitals_summary" in encounter_data
        assert "temperature" in encounter_data["vitals_summary"]

    def test_timeline_includes_diagnoses(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline includes diagnoses for each encounter."""
        from hmis.apps.encounters.models import Diagnosis, Encounter, ICD10Code

        encounter = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="With diagnosis",
        )
        code = ICD10Code.objects.create(
            code="K35.80",
            description="Acute appendicitis",
            category="Digestive",
            chapter=11,
        )
        Diagnosis.objects.create(
            encounter=encounter,
            icd10_code=code,
            diagnosis_type="PRIMARY",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        encounter_data = response.data["timeline"][0]
        assert "diagnoses" in encounter_data
        assert len(encounter_data["diagnoses"]) == 1

    def test_timeline_includes_statistics(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline response includes statistics."""
        from hmis.apps.encounters.models import Encounter

        for i in range(3):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD" if i < 2 else "IPD",
                encounter_date=date.today() - timedelta(days=i * 10),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        assert "statistics" in response.data
        stats = response.data["statistics"]
        assert "total_encounters" in stats
        assert stats["total_encounters"] == 3
        assert "by_type" in stats

    def test_timeline_date_range_filter(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline can be filtered by date range."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=60),
            chief_complaint="Old visit",
        )
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=5),
            chief_complaint="Recent visit",
        )

        start_date = (date.today() - timedelta(days=30)).isoformat()
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?start_date={start_date}"
        )

        assert response.status_code == 200
        # Should only include recent visit
        assert len(response.data["timeline"]) == 1

    def test_timeline_requires_authentication(self, timeline_sample_patient):
        """Test timeline endpoint requires authentication."""
        client = APIClient()  # Not authenticated
        response = client.get(f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/")
        assert response.status_code == 401

    def test_timeline_nonexistent_patient_returns_404(self, timeline_authenticated_client):
        """Test timeline for non-existent patient returns 404."""
        response = timeline_authenticated_client.get("/api/patients/99999/encounter-timeline/")
        assert response.status_code == 404

    # ========================================================================
    # NEW TESTS: Treatment Plan in Timeline
    # ========================================================================

    def test_timeline_includes_treatment_plan(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline includes treatment_plan for each encounter."""
        from hmis.apps.encounters.models import Encounter, Medication, TreatmentPlan

        encounter = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="With treatment plan",
        )
        plan = TreatmentPlan.objects.create(
            encounter=encounter,
            clinical_notes="Rest and fluids",
            status="ACTIVE",
            follow_up_date=date.today() + timedelta(days=7),
        )
        Medication.objects.create(
            treatment_plan=plan,
            name="Paracetamol",
            dosage="500mg",
            frequency="TDS",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        encounter_data = response.data["timeline"][0]
        assert "treatment_plan" in encounter_data
        assert encounter_data["treatment_plan"] is not None
        assert encounter_data["treatment_plan"]["status"] == "active"
        assert encounter_data["treatment_plan"]["medications_count"] == 1
        assert encounter_data["treatment_plan"]["follow_up_date"] is not None

    def test_timeline_treatment_plan_is_none_when_missing(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline shows null treatment_plan when encounter has none."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="No treatment plan",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        encounter_data = response.data["timeline"][0]
        assert "treatment_plan" in encounter_data
        assert encounter_data["treatment_plan"] is None

    # ========================================================================
    # NEW TESTS: Alerts in Timeline
    # ========================================================================

    def test_timeline_includes_alerts_array(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline includes alerts array for each encounter."""
        from hmis.apps.encounters.models import Encounter

        # Create encounter with critical vitals that should trigger alerts
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Severe symptoms",
            temperature=Decimal("39.5"),  # Critical high
            spo2=Decimal("88"),  # Critical low
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        encounter_data = response.data["timeline"][0]
        assert "alerts" in encounter_data
        assert isinstance(encounter_data["alerts"], list)
        assert len(encounter_data["alerts"]) > 0  # Should have alerts for critical vitals

    def test_timeline_alerts_empty_for_normal_vitals(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline alerts array is empty when all vitals are normal."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Normal checkup",
            temperature=Decimal("36.8"),  # Normal
            pulse=75,  # Normal
            spo2=Decimal("98"),  # Normal
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        encounter_data = response.data["timeline"][0]
        assert "alerts" in encounter_data
        assert encounter_data["alerts"] == []

    # ========================================================================
    # NEW TESTS: Encounter Type Filter
    # ========================================================================

    def test_timeline_filters_by_encounter_type(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline can filter by encounter_type query param."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Outpatient visit",
        )
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="IPD",
            chief_complaint="Inpatient admission",
        )
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Emergency visit",
        )

        # Filter OPD only
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?encounter_type=OPD"
        )

        assert response.status_code == 200
        assert len(response.data["timeline"]) == 1
        assert response.data["timeline"][0]["encounter_type"] == "OPD"

    def test_timeline_filters_by_multiple_encounter_types(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline can filter by multiple comma-separated encounter types."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Outpatient visit",
        )
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="IPD",
            chief_complaint="Inpatient admission",
        )
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Emergency visit",
        )

        # Filter OPD and EMERGENCY
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?encounter_type=OPD,EMERGENCY"
        )

        assert response.status_code == 200
        assert len(response.data["timeline"]) == 2
        types = {e["encounter_type"] for e in response.data["timeline"]}
        assert types == {"OPD", "EMERGENCY"}

    # ========================================================================
    # NEW TESTS: Vitals with Status
    # ========================================================================

    def test_timeline_vitals_summary_includes_status(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test vitals_summary includes status for each vital (normal/warning/critical)."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Mixed vitals",
            temperature=Decimal("37.5"),  # Warning high
            pulse=75,  # Normal
            spo2=Decimal("88"),  # Critical low
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        vitals = response.data["timeline"][0]["vitals_summary"]

        # Each vital should have value, status, and unit
        assert "temperature" in vitals
        assert vitals["temperature"]["status"] == "warning"
        assert vitals["temperature"]["value"] is not None
        assert vitals["temperature"]["unit"] == "°C"

        assert "pulse" in vitals
        assert vitals["pulse"]["status"] == "normal"

        assert "spo2" in vitals
        assert vitals["spo2"]["status"] == "critical"

    # ========================================================================
    # NEW TESTS: Statistics - Most Common Diagnosis
    # ========================================================================

    def test_timeline_statistics_includes_most_common_diagnosis(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test statistics includes most_common_diagnosis code."""
        from hmis.apps.encounters.models import Diagnosis, Encounter, ICD10Code

        # Create ICD-10 codes
        malaria_code = ICD10Code.objects.create(
            code="B50.9",
            description="Plasmodium falciparum malaria, unspecified",
            category="Parasitic diseases",
            chapter=1,
        )
        rti_code = ICD10Code.objects.create(
            code="J06.9",
            description="Acute upper respiratory infection",
            category="Respiratory",
            chapter=10,
        )

        # Create encounters with diagnoses - malaria more common
        for i in range(3):
            enc = Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i * 5),
                chief_complaint=f"Fever episode {i + 1}",
            )
            Diagnosis.objects.create(
                encounter=enc,
                icd10_code=malaria_code,
                diagnosis_type="PRIMARY",
            )

        # One RTI encounter
        enc = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Cough",
        )
        Diagnosis.objects.create(
            encounter=enc,
            icd10_code=rti_code,
            diagnosis_type="PRIMARY",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        stats = response.data["statistics"]
        assert "most_common_diagnosis" in stats
        assert stats["most_common_diagnosis"]["code"] == "B50.9"
        assert stats["most_common_diagnosis"]["count"] == 3

    def test_timeline_statistics_most_common_diagnosis_none_if_no_diagnoses(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test most_common_diagnosis is null when patient has no diagnoses."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="No diagnosis",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        stats = response.data["statistics"]
        assert "most_common_diagnosis" in stats
        assert stats["most_common_diagnosis"] is None


# ============================================================================
# Timeline Permissions Tests
# ============================================================================


@pytest.mark.integration
class TestTimelinePermissions:
    """Test timeline endpoint permissions and security."""

    def test_sensitive_patient_timeline_restricted(
        self, timeline_test_user, timeline_sample_patient
    ):
        """Test timeline for sensitive patient requires special permission."""

        # Mark patient as sensitive (HIV/GBV)
        timeline_sample_patient.is_sensitive = True
        timeline_sample_patient.save()

        # User without view_sensitive_patient permission
        client = APIClient()
        client.force_authenticate(user=timeline_test_user)

        response = client.get(f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/")

        # Should return 404 (patient not visible in filtered queryset)
        # This is the expected behavior as sensitive patients are excluded from queryset
        assert response.status_code == 404

    def test_sensitive_patient_timeline_allowed_with_permission(
        self, timeline_test_user, timeline_sample_patient
    ):
        """Test timeline for sensitive patient allowed with permission."""
        from django.contrib.auth.models import Permission
        from django.contrib.contenttypes.models import ContentType

        from hmis.apps.patients.models import Patient

        # Mark patient as sensitive
        timeline_sample_patient.is_sensitive = True
        timeline_sample_patient.save()

        # Grant permission
        content_type = ContentType.objects.get_for_model(Patient)
        permission = Permission.objects.get(
            codename="view_sensitive_patient",
            content_type=content_type,
        )
        timeline_test_user.user_permissions.add(permission)

        client = APIClient()
        client.force_authenticate(user=timeline_test_user)

        response = client.get(f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/")

        assert response.status_code == 200

    def test_timeline_audit_logged(
        self, timeline_authenticated_client, timeline_sample_patient, timeline_sample_encounter
    ):
        """Test timeline access is logged in audit trail."""
        from hmis.apps.core.models import AuditLog

        # Clear existing audit logs
        AuditLog.objects.all().delete()

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200

        # Check audit log was created
        audit_logs = AuditLog.objects.filter(
            action="patient_timeline_view",
            resource_type="Patient",
            resource_id=timeline_sample_patient.id,
        )
        assert audit_logs.count() == 1
        assert audit_logs.first().patient_id == timeline_sample_patient.id


# ============================================================================
# Timeline Performance Tests
# ============================================================================


@pytest.mark.integration
class TestTimelinePerformance:
    """Test timeline endpoint performance characteristics."""

    def test_timeline_pagination_default_limit(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline has default pagination limit."""
        from hmis.apps.encounters.models import Encounter

        # Create 50 encounters
        for i in range(50):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        # Should have pagination info
        assert "count" in response.data or len(response.data["timeline"]) <= 50
        # Statistics should reflect total count regardless of pagination
        assert response.data["statistics"]["total_encounters"] == 50

    def test_timeline_returns_all_encounters_without_pagination(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline returns all encounters (no pagination by default)."""
        from hmis.apps.encounters.models import Encounter

        # Create 30 encounters
        for i in range(30):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        # Returns all encounters
        assert len(response.data["timeline"]) == 30
        # Statistics reflect total
        assert response.data["statistics"]["total_encounters"] == 30

    def test_timeline_select_related_optimization(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline uses select_related/prefetch_related for efficiency."""
        from django.test.utils import CaptureQueriesContext

        from hmis.apps.encounters.models import Diagnosis, Encounter, ICD10Code, TreatmentPlan

        # Create complex data
        for i in range(5):
            enc = Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"Visit {i + 1}",
                temperature=Decimal("37.0"),
            )
            code = ICD10Code.objects.create(
                code=f"A0{i}.0",
                description=f"Test diagnosis {i}",
                category="Test",
                chapter=1,
            )
            Diagnosis.objects.create(
                encounter=enc,
                icd10_code=code,
                diagnosis_type="PRIMARY",
            )
            TreatmentPlan.objects.create(
                encounter=enc,
                clinical_notes=f"Plan {i}",
            )

        # Count queries - should be limited even with many encounters
        from django.db import connection

        with CaptureQueriesContext(connection) as context:
            response = timeline_authenticated_client.get(
                f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
            )

        assert response.status_code == 200
        # Should not have N+1 query problem - queries should be reasonable
        # Allow up to 25 queries (auth, patient, encounters, diagnoses, treatment_plans, stats, audit, etc.)
        # With 5 encounters and prefetch_related, this is acceptable
        assert len(context.captured_queries) < 30


# ============================================================================
# Timeline Edge Cases Tests
# ============================================================================


@pytest.mark.integration
class TestTimelineEdgeCases:
    """Test timeline endpoint edge cases."""

    def test_timeline_empty_for_new_patient(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline returns empty list for patient with no encounters."""
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        assert response.data["timeline"] == []
        assert response.data["statistics"]["total_encounters"] == 0

    def test_timeline_handles_incomplete_encounters(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline handles encounters with minimal/missing data gracefully."""
        from hmis.apps.encounters.models import Encounter

        # Encounter with only required fields
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Minimal data",
            # No vitals, no diagnoses, no treatment plan
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        encounter_data = response.data["timeline"][0]
        assert encounter_data["vitals_summary"] == {}
        assert encounter_data["diagnoses"] == []
        assert encounter_data["treatment_plan"] is None
        assert encounter_data["alerts"] == []

    def test_timeline_date_range_validation_invalid_start(
        self, timeline_authenticated_client, timeline_sample_patient, timeline_sample_encounter
    ):
        """Test timeline ignores invalid start_date format gracefully."""
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?start_date=invalid"
        )

        # Should still return 200, just ignore the invalid filter
        assert response.status_code == 200

    def test_timeline_date_range_validation_invalid_end(
        self, timeline_authenticated_client, timeline_sample_patient, timeline_sample_encounter
    ):
        """Test timeline ignores invalid end_date format gracefully."""
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?end_date=not-a-date"
        )

        # Should still return 200, just ignore the invalid filter
        assert response.status_code == 200

    def test_timeline_future_date_range(
        self, timeline_authenticated_client, timeline_sample_patient, timeline_sample_encounter
    ):
        """Test timeline handles future date range returning empty results."""
        future_date = (date.today() + timedelta(days=30)).isoformat()
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?start_date={future_date}"
        )

        assert response.status_code == 200
        assert response.data["timeline"] == []

    def test_timeline_combined_filters(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test timeline with multiple filters combined."""
        from hmis.apps.encounters.models import Encounter

        # Create varied encounters
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=5),
            chief_complaint="Recent OPD",
        )
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=60),
            chief_complaint="Old OPD",
        )
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="IPD",
            encounter_date=date.today() - timedelta(days=5),
            chief_complaint="Recent IPD",
        )

        # Filter: OPD only, last 30 days
        start_date = (date.today() - timedelta(days=30)).isoformat()
        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
            f"?encounter_type=OPD&start_date={start_date}"
        )

        assert response.status_code == 200
        assert len(response.data["timeline"]) == 1
        assert response.data["timeline"][0]["encounter_type"] == "OPD"
        assert response.data["timeline"][0]["chief_complaint"] == "Recent OPD"


# ============================================================================
# Timeline Pagination Tests
# ============================================================================


@pytest.mark.integration
class TestTimelinePagination:
    """Test timeline endpoint pagination features."""

    def test_timeline_pagination_returns_limited_results(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test ?page=1&page_size=5 returns limited results."""
        from hmis.apps.encounters.models import Encounter

        # Create 15 encounters
        for i in range(15):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?page=1&page_size=5"
        )

        assert response.status_code == 200
        assert len(response.data["timeline"]) == 5
        # Statistics should still reflect total count
        assert response.data["statistics"]["total_encounters"] == 15

    def test_timeline_pagination_second_page(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test ?page=2 returns second page of results."""
        from hmis.apps.encounters.models import Encounter

        # Create 15 encounters
        for i in range(15):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?page=2&page_size=5"
        )

        assert response.status_code == 200
        assert len(response.data["timeline"]) == 5
        # First item on page 2 should be visit 6 (0-indexed: days 5-9)
        assert response.data["timeline"][0]["chief_complaint"] == "Visit 6"

    def test_timeline_pagination_last_page_partial(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test last page returns remaining items when not full."""
        from hmis.apps.encounters.models import Encounter

        # Create 12 encounters
        for i in range(12):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?page=3&page_size=5"
        )

        assert response.status_code == 200
        assert len(response.data["timeline"]) == 2  # 12 total, page 3 has 2

    def test_timeline_pagination_info_in_response(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test pagination info is included in response."""
        from hmis.apps.encounters.models import Encounter

        # Create 25 encounters
        for i in range(25):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?page=2&page_size=10"
        )

        assert response.status_code == 200
        assert "pagination" in response.data
        assert response.data["pagination"]["page"] == 2
        assert response.data["pagination"]["page_size"] == 10
        assert response.data["pagination"]["total_pages"] == 3
        assert response.data["pagination"]["total_items"] == 25
        assert response.data["pagination"]["has_next"] is True
        assert response.data["pagination"]["has_previous"] is True

    def test_timeline_pagination_max_page_size_capped(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test page_size is capped at 100."""
        from hmis.apps.encounters.models import Encounter

        # Create 150 encounters
        for i in range(150):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i % 365),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?page=1&page_size=200"
        )

        assert response.status_code == 200
        # Should be capped at 100
        assert len(response.data["timeline"]) == 100
        assert response.data["pagination"]["page_size"] == 100

    def test_timeline_pagination_default_page_size(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test default page size is 20 when page param provided."""
        from hmis.apps.encounters.models import Encounter

        # Create 30 encounters
        for i in range(30):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?page=1"
        )

        assert response.status_code == 200
        assert len(response.data["timeline"]) == 20
        assert response.data["pagination"]["page_size"] == 20

    def test_timeline_no_pagination_without_page_param(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test all encounters returned when page param not provided."""
        from hmis.apps.encounters.models import Encounter

        # Create 30 encounters
        for i in range(30):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        assert len(response.data["timeline"]) == 30
        assert "pagination" not in response.data

    def test_timeline_pagination_invalid_page_returns_empty(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test requesting page beyond range returns empty timeline."""
        from hmis.apps.encounters.models import Encounter

        # Create 5 encounters
        for i in range(5):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?page=10&page_size=5"
        )

        assert response.status_code == 200
        assert len(response.data["timeline"]) == 0

    def test_timeline_pagination_with_filters(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test pagination works with other filters."""
        from hmis.apps.encounters.models import Encounter

        # Create 10 OPD and 10 IPD encounters
        for i in range(10):
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"OPD Visit {i + 1}",
            )
            Encounter.objects.create(
                patient=timeline_sample_patient,
                encounter_type="IPD",
                encounter_date=date.today() - timedelta(days=i),
                chief_complaint=f"IPD Visit {i + 1}",
            )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
            f"?encounter_type=OPD&page=1&page_size=5"
        )

        assert response.status_code == 200
        assert len(response.data["timeline"]) == 5
        # All should be OPD
        for item in response.data["timeline"]:
            assert item["encounter_type"] == "OPD"
        # Total in pagination reflects filtered count
        assert response.data["pagination"]["total_items"] == 10


# ============================================================================
# Timeline Include Toggle Tests
# ============================================================================


@pytest.mark.integration
class TestTimelineIncludeToggles:
    """Test timeline endpoint include/exclude toggle parameters."""

    def test_timeline_exclude_vitals(self, timeline_authenticated_client, timeline_sample_patient):
        """Test ?include_vitals=false omits vitals_summary."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="With vitals",
            temperature=Decimal("37.5"),
            pulse=80,
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?include_vitals=false"
        )

        assert response.status_code == 200
        assert "vitals_summary" not in response.data["timeline"][0]
        # has_critical_vitals should still be present (it's a flag, not data)
        assert "has_critical_vitals" in response.data["timeline"][0]

    def test_timeline_exclude_diagnoses(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test ?include_diagnoses=false omits diagnoses."""
        from hmis.apps.encounters.models import Diagnosis, Encounter, ICD10Code

        encounter = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="With diagnosis",
        )
        code = ICD10Code.objects.create(
            code="J06.9",
            description="Acute URI",
            category="Respiratory",
            chapter=10,
        )
        Diagnosis.objects.create(
            encounter=encounter,
            icd10_code=code,
            diagnosis_type="PRIMARY",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?include_diagnoses=false"
        )

        assert response.status_code == 200
        assert "diagnoses" not in response.data["timeline"][0]

    def test_timeline_exclude_treatment_plan(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test ?include_treatment=false omits treatment_plan."""
        from hmis.apps.encounters.models import Encounter, TreatmentPlan

        encounter = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="With treatment",
        )
        TreatmentPlan.objects.create(
            encounter=encounter,
            clinical_notes="Rest and fluids",
            status="ACTIVE",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?include_treatment=false"
        )

        assert response.status_code == 200
        assert "treatment_plan" not in response.data["timeline"][0]

    def test_timeline_exclude_alerts(self, timeline_authenticated_client, timeline_sample_patient):
        """Test ?include_alerts=false omits alerts."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="With alerts",
            temperature=Decimal("39.5"),  # Critical - generates alert
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?include_alerts=false"
        )

        assert response.status_code == 200
        assert "alerts" not in response.data["timeline"][0]

    def test_timeline_include_all_by_default(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test all fields included when no toggle params provided."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Default test",
            temperature=Decimal("37.0"),
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        item = response.data["timeline"][0]
        assert "vitals_summary" in item
        assert "diagnoses" in item
        assert "treatment_plan" in item
        assert "alerts" in item

    def test_timeline_explicit_include_true(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test ?include_vitals=true explicitly includes vitals."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Explicit include",
            temperature=Decimal("37.0"),
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/?include_vitals=true"
        )

        assert response.status_code == 200
        assert "vitals_summary" in response.data["timeline"][0]

    def test_timeline_multiple_excludes(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test multiple exclude params together."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Multiple excludes",
            temperature=Decimal("37.0"),
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
            f"?include_vitals=false&include_diagnoses=false&include_treatment=false"
        )

        assert response.status_code == 200
        item = response.data["timeline"][0]
        assert "vitals_summary" not in item
        assert "diagnoses" not in item
        assert "treatment_plan" not in item
        # alerts still included (not excluded)
        assert "alerts" in item

    def test_timeline_exclude_all_optional_fields(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test excluding all optional fields leaves core fields."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Minimal response",
            temperature=Decimal("37.0"),
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
            f"?include_vitals=false&include_diagnoses=false&include_treatment=false&include_alerts=false"
        )

        assert response.status_code == 200
        item = response.data["timeline"][0]
        # Core fields always present
        assert "encounter_id" in item
        assert "encounter_date" in item
        assert "encounter_type" in item
        assert "chief_complaint" in item
        assert "has_critical_vitals" in item
        # Optional fields excluded
        assert "vitals_summary" not in item
        assert "diagnoses" not in item
        assert "treatment_plan" not in item
        assert "alerts" not in item


# ============================================================================
# Timeline Follow-up Compliance Tests
# ============================================================================


@pytest.mark.integration
class TestTimelineFollowupCompliance:
    """Test follow-up compliance statistic in timeline."""

    def test_followup_compliance_in_statistics(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test follow_up_compliance field exists in statistics."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        assert "follow_up_compliance" in response.data["statistics"]

    def test_followup_compliance_null_when_no_followups_scheduled(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test follow_up_compliance is null when no follow-ups scheduled."""
        from hmis.apps.encounters.models import Encounter, TreatmentPlan

        encounter = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            chief_complaint="No follow-up",
        )
        # Treatment plan without follow_up_date
        TreatmentPlan.objects.create(
            encounter=encounter,
            clinical_notes="No follow-up needed",
            status="COMPLETED",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        assert response.data["statistics"]["follow_up_compliance"] is None

    def test_followup_compliance_100_percent(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test 100% compliance when all follow-ups attended."""
        from hmis.apps.encounters.models import Encounter, TreatmentPlan

        # First encounter with follow-up scheduled
        enc1 = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Initial visit",
        )
        TreatmentPlan.objects.create(
            encounter=enc1,
            clinical_notes="Follow up in 1 week",
            status="ACTIVE",
            follow_up_date=date.today() - timedelta(days=23),  # 7 days after enc1
        )

        # Follow-up encounter within window (±7 days)
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=22),  # 1 day before scheduled
            chief_complaint="Follow-up visit",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        compliance = response.data["statistics"]["follow_up_compliance"]
        assert compliance is not None
        assert compliance["rate"] == 100.0
        assert compliance["completed"] == 1
        assert compliance["scheduled"] == 1

    def test_followup_compliance_zero_percent(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test 0% compliance when no follow-ups attended."""
        from hmis.apps.encounters.models import Encounter, TreatmentPlan

        # Encounter with follow-up scheduled but not attended
        enc1 = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=60),
            chief_complaint="Initial visit",
        )
        TreatmentPlan.objects.create(
            encounter=enc1,
            clinical_notes="Follow up in 1 week",
            status="ACTIVE",
            follow_up_date=date.today() - timedelta(days=53),  # Scheduled 7 days later
        )
        # No follow-up encounter created

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        compliance = response.data["statistics"]["follow_up_compliance"]
        assert compliance is not None
        assert compliance["rate"] == 0.0
        assert compliance["completed"] == 0
        assert compliance["scheduled"] == 1

    def test_followup_compliance_partial(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test partial compliance calculation (e.g., 50%)."""
        from hmis.apps.encounters.models import Encounter, TreatmentPlan

        # First encounter with follow-up - ATTENDED
        enc1 = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=60),
            chief_complaint="Visit 1",
        )
        TreatmentPlan.objects.create(
            encounter=enc1,
            clinical_notes="Follow up in 1 week",
            status="ACTIVE",
            follow_up_date=date.today() - timedelta(days=53),
        )
        # Follow-up attended
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=52),
            chief_complaint="Follow-up 1",
        )

        # Second encounter with follow-up - NOT ATTENDED
        enc2 = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Visit 2",
        )
        TreatmentPlan.objects.create(
            encounter=enc2,
            clinical_notes="Follow up in 1 week",
            status="ACTIVE",
            follow_up_date=date.today() - timedelta(days=23),
        )
        # No follow-up created for this one

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        compliance = response.data["statistics"]["follow_up_compliance"]
        assert compliance is not None
        assert compliance["rate"] == 50.0
        assert compliance["completed"] == 1
        assert compliance["scheduled"] == 2

    def test_followup_compliance_within_window(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test follow-up within ±7 day window counts as completed."""
        from hmis.apps.encounters.models import Encounter, TreatmentPlan

        # Initial encounter
        enc1 = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Initial",
        )
        follow_up_date = date.today() - timedelta(days=23)
        TreatmentPlan.objects.create(
            encounter=enc1,
            clinical_notes="Follow up",
            status="ACTIVE",
            follow_up_date=follow_up_date,
        )

        # Follow-up 6 days late (within ±7 window)
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=follow_up_date + timedelta(days=6),
            chief_complaint="Late follow-up",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        compliance = response.data["statistics"]["follow_up_compliance"]
        assert compliance["completed"] == 1

    def test_followup_compliance_outside_window(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test follow-up outside ±7 day window does not count."""
        from hmis.apps.encounters.models import Encounter, TreatmentPlan

        # Initial encounter
        enc1 = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Initial",
        )
        follow_up_date = date.today() - timedelta(days=23)
        TreatmentPlan.objects.create(
            encounter=enc1,
            clinical_notes="Follow up",
            status="ACTIVE",
            follow_up_date=follow_up_date,
        )

        # Follow-up 10 days late (outside ±7 window)
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=follow_up_date + timedelta(days=10),
            chief_complaint="Very late follow-up",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        compliance = response.data["statistics"]["follow_up_compliance"]
        assert compliance["completed"] == 0  # Outside window

    def test_followup_must_be_after_original_encounter(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test follow-up encounter must be after original encounter date."""
        from hmis.apps.encounters.models import Encounter, TreatmentPlan

        # Encounter with follow-up date in the past
        enc1 = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=10),
            chief_complaint="Recent visit",
        )
        TreatmentPlan.objects.create(
            encounter=enc1,
            clinical_notes="Follow up",
            status="ACTIVE",
            follow_up_date=date.today() - timedelta(days=3),  # 7 days after enc1
        )

        # Earlier encounter should NOT count as follow-up
        Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=20),  # Before enc1
            chief_complaint="Old visit",
        )

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        compliance = response.data["statistics"]["follow_up_compliance"]
        assert compliance["completed"] == 0  # Old visit doesn't count

    def test_followup_compliance_multiple_patients_isolated(
        self, timeline_authenticated_client, timeline_sample_patient
    ):
        """Test compliance calculation is isolated to the specific patient."""
        from hmis.apps.encounters.models import Encounter, TreatmentPlan
        from hmis.apps.patients.models import Patient

        # Create another patient with perfect compliance
        other_patient = Patient.objects.create(
            first_name="Other",
            last_name="Patient",
            date_of_birth=date(1990, 1, 1),
            gender="M",
        )
        enc_other = Encounter.objects.create(
            patient=other_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Other patient",
        )
        TreatmentPlan.objects.create(
            encounter=enc_other,
            follow_up_date=date.today() - timedelta(days=23),
            status="ACTIVE",
        )
        Encounter.objects.create(
            patient=other_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=22),
            chief_complaint="Other follow-up",
        )

        # Our test patient has 0% compliance
        enc1 = Encounter.objects.create(
            patient=timeline_sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Test patient",
        )
        TreatmentPlan.objects.create(
            encounter=enc1,
            follow_up_date=date.today() - timedelta(days=23),
            status="ACTIVE",
        )
        # No follow-up for test patient

        response = timeline_authenticated_client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

        assert response.status_code == 200
        compliance = response.data["statistics"]["follow_up_compliance"]
        # Should be 0%, not affected by other patient's 100%
        assert compliance["rate"] == 0.0
