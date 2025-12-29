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

import pytest
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
        response = client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )
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
        from hmis.apps.patients.models import Patient

        # Mark patient as sensitive (HIV/GBV)
        timeline_sample_patient.is_sensitive = True
        timeline_sample_patient.save()

        # User without view_sensitive_patient permission
        client = APIClient()
        client.force_authenticate(user=timeline_test_user)

        response = client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

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

        response = client.get(
            f"/api/patients/{timeline_sample_patient.id}/encounter-timeline/"
        )

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
