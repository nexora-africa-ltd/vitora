"""
Tests for Phase 4: Supervisor Alert Acknowledgment and Constraint Override Metrics.

These tests cover:
- SupervisorAlertAcknowledgment model
- Acknowledge endpoint
- Metrics endpoint
- Permission requirements
"""

import pytest  # type: ignore
from decimal import Decimal
from django.contrib.auth.models import Permission
from django.utils import timezone
from rest_framework import status


@pytest.fixture
def supervisor_user(test_user):
    """User with receive_critical_alerts permission."""
    permission = Permission.objects.get(codename="receive_critical_alerts")
    test_user.user_permissions.add(permission)
    return test_user


@pytest.fixture
def supervisor_client(api_client, supervisor_user):
    """Authenticated client with supervisor permissions."""
    api_client.force_authenticate(user=supervisor_user)
    return api_client


@pytest.fixture
def medical_ward(db):
    """General medical ward."""
    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="Medical Ward Test",
        code="MWT-01",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
    )


@pytest.fixture
def isolation_ward(db):
    """Isolation ward."""
    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="Isolation Ward Test",
        code="ISO-01",
        ward_type="ISOLATION",
        capacity=5,
        daily_rate=Decimal("1000.00"),
        is_active=True,
        isolation_capable=True,
    )


@pytest.fixture
def admission_with_critical_violation(
    db, sample_patient, isolation_ward, test_user
):
    """
    Admission with CRITICAL violation (isolation patient in non-isolation ward).
    Note: We manually set constraint_violations to simulate a critical override.
    """
    from hmis.apps.inpatient.models import Admission

    # Create a non-isolation ward to admit the patient
    from hmis.apps.inpatient.models import Ward
    non_iso_ward = Ward.objects.create(
        name="Non-Isolation Ward",
        code="NISO-01",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
        isolation_capable=False,
    )

    # Use the first auto-generated bed and mark it as OCCUPIED
    bed = non_iso_ward.beds.first()
    bed.status = "OCCUPIED"
    bed.save()

    # Create encounter for the admission
    from hmis.apps.encounters.models import Encounter
    encounter = Encounter.objects.create(
        patient=sample_patient,
        encounter_type="IPD",
        chief_complaint="Isolation required patient",
        created_by=test_user,
    )

    admission = Admission.objects.create(
        patient=sample_patient,
        ipd_encounter=encounter,
        admission_date=timezone.now(),
        admitting_diagnosis="A00.0",
        admitting_diagnosis_text="Cholera",
        admitting_officer=test_user,
        attending_doctor=test_user,
        ward=non_iso_ward,
        bed=bed,
        payer_type="CASH",
        constraint_override=True,
        constraint_override_reason="Emergency - no isolation beds available",
        constraint_violations=[
            {
                "code": "ISOLATION_REQUIRED",
                "severity": "CRITICAL",
                "message": "Patient requires isolation but ward is not isolation-capable",
            }
        ],
    )
    return admission


@pytest.fixture
def admission_with_warning_violation(
    db, sample_county, sample_sub_county, medical_ward, test_user
):
    """Admission with WARNING violation (gender mismatch)."""
    from hmis.apps.inpatient.models import Admission, Bed, Ward
    from hmis.apps.patients.models import Patient

    # Create a separate patient for this test
    female_patient = Patient.objects.create(
        first_name="Jane",
        last_name="Doe",
        date_of_birth="1985-03-15",
        gender="F",
        county=sample_county,
        sub_county=sample_sub_county,
    )

    male_ward = Ward.objects.create(
        name="Male Ward",
        code="ML-01",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
        gender_restriction="MALE_ONLY",
    )

    bed = Bed.objects.create(ward=male_ward, bed_number="MB-001", status="AVAILABLE")

    # Create encounter for the admission
    from hmis.apps.encounters.models import Encounter
    encounter = Encounter.objects.create(
        patient=female_patient,
        encounter_type="IPD",
        chief_complaint="General admission",
        created_by=test_user,
    )

    admission = Admission.objects.create(
        patient=female_patient,
        ipd_encounter=encounter,
        admission_date=timezone.now(),
        admitting_diagnosis="J18.9",
        admitting_diagnosis_text="Pneumonia",
        admitting_officer=test_user,
        attending_doctor=test_user,
        ward=male_ward,
        bed=bed,
        payer_type="CASH",
        constraint_override=True,
        constraint_override_reason="No female beds available",
        constraint_violations=[
            {
                "code": "GENDER_MISMATCH",
                "severity": "WARNING",
                "message": "Patient gender does not match ward restriction",
            }
        ],
    )
    return admission


@pytest.mark.django_db
class TestSupervisorAlertsList:
    """Tests for the supervisor alerts list endpoint."""

    def test_list_alerts_requires_permission(self, authenticated_client):
        """User without receive_critical_alerts permission is denied."""
        response = authenticated_client.get("/api/inpatient/supervisor/alerts/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_list_alerts_with_permission(self, supervisor_client):
        """User with permission can list alerts."""
        response = supervisor_client.get("/api/inpatient/supervisor/alerts/")
        assert response.status_code == status.HTTP_200_OK
        assert "alerts" in response.data

    def test_list_alerts_includes_critical_only(
        self, supervisor_client, admission_with_critical_violation, admission_with_warning_violation
    ):
        """Only admissions with CRITICAL violations appear in alerts."""
        response = supervisor_client.get("/api/inpatient/supervisor/alerts/")
        assert response.status_code == status.HTTP_200_OK
        
        alerts = response.data["alerts"]
        admission_ids = [a["admission_id"] for a in alerts]
        
        # Critical violation should be in list
        assert admission_with_critical_violation.id in admission_ids
        # Warning violation should NOT be in list
        assert admission_with_warning_violation.id not in admission_ids

    def test_list_alerts_includes_acknowledgment_status(
        self, supervisor_client, admission_with_critical_violation, supervisor_user
    ):
        """Alerts include acknowledgment status."""
        from hmis.apps.inpatient.models import SupervisorAlertAcknowledgment

        # First check it's not acknowledged
        response = supervisor_client.get("/api/inpatient/supervisor/alerts/")
        alert = next(
            a for a in response.data["alerts"]
            if a["admission_id"] == admission_with_critical_violation.id
        )
        assert alert["is_acknowledged"] is False

        # Acknowledge it
        SupervisorAlertAcknowledgment.objects.create(
            admission=admission_with_critical_violation,
            acknowledged_by=supervisor_user,
            notes="Reviewed",
        )

        # Check again
        response = supervisor_client.get("/api/inpatient/supervisor/alerts/")
        alert = next(
            a for a in response.data["alerts"]
            if a["admission_id"] == admission_with_critical_violation.id
        )
        assert alert["is_acknowledged"] is True
        assert alert["acknowledged_by"] is not None


@pytest.mark.django_db
class TestSupervisorAlertAcknowledge:
    """Tests for the acknowledge endpoint."""

    def test_acknowledge_requires_permission(self, authenticated_client, admission_with_critical_violation):
        """User without permission cannot acknowledge alerts."""
        response = authenticated_client.post(
            "/api/inpatient/supervisor/alerts/acknowledge/",
            {"admission_id": admission_with_critical_violation.id},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_acknowledge_success(
        self, supervisor_client, admission_with_critical_violation
    ):
        """Supervisor can acknowledge an alert."""
        response = supervisor_client.post(
            "/api/inpatient/supervisor/alerts/acknowledge/",
            {
                "admission_id": admission_with_critical_violation.id,
                "notes": "Reviewed and approved",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["message"] == "Alert acknowledged successfully."
        assert "acknowledgment_id" in response.data
        assert "acknowledged_at" in response.data

    def test_acknowledge_without_notes(
        self, supervisor_client, admission_with_critical_violation
    ):
        """Acknowledgment works without notes."""
        response = supervisor_client.post(
            "/api/inpatient/supervisor/alerts/acknowledge/",
            {"admission_id": admission_with_critical_violation.id},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_acknowledge_already_acknowledged(
        self, supervisor_client, admission_with_critical_violation, supervisor_user
    ):
        """Cannot acknowledge the same alert twice."""
        from hmis.apps.inpatient.models import SupervisorAlertAcknowledgment

        # Pre-acknowledge
        SupervisorAlertAcknowledgment.objects.create(
            admission=admission_with_critical_violation,
            acknowledged_by=supervisor_user,
        )

        response = supervisor_client.post(
            "/api/inpatient/supervisor/alerts/acknowledge/",
            {"admission_id": admission_with_critical_violation.id},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already acknowledged" in response.data["detail"].lower()

    def test_acknowledge_admission_not_found(self, supervisor_client):
        """Cannot acknowledge non-existent admission."""
        response = supervisor_client.post(
            "/api/inpatient/supervisor/alerts/acknowledge/",
            {"admission_id": 99999},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_acknowledge_no_critical_violations(
        self, supervisor_client, admission_with_warning_violation
    ):
        """Cannot acknowledge admission without critical violations."""
        response = supervisor_client.post(
            "/api/inpatient/supervisor/alerts/acknowledge/",
            {"admission_id": admission_with_warning_violation.id},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "no critical violations" in response.data["detail"].lower()

    def test_acknowledge_missing_admission_id(self, supervisor_client):
        """admission_id is required."""
        response = supervisor_client.post(
            "/api/inpatient/supervisor/alerts/acknowledge/",
            {},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestConstraintOverrideMetrics:
    """Tests for the metrics endpoint."""

    def test_metrics_requires_permission(self, authenticated_client):
        """User without permission cannot access metrics."""
        response = authenticated_client.get("/api/inpatient/supervisor/alerts/metrics/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_metrics_success(self, supervisor_client):
        """Supervisor can access metrics."""
        response = supervisor_client.get("/api/inpatient/supervisor/alerts/metrics/")
        assert response.status_code == status.HTTP_200_OK
        
        # Check all expected fields are present
        assert "total_admissions" in response.data
        assert "override_count" in response.data
        assert "override_rate" in response.data
        assert "critical_override_count" in response.data
        assert "acknowledged_count" in response.data
        assert "pending_acknowledgment_count" in response.data
        assert "violation_breakdown" in response.data
        assert "ward_breakdown" in response.data
        assert "common_reasons" in response.data

    def test_metrics_with_days_parameter(self, supervisor_client):
        """Metrics can be filtered by number of days."""
        response = supervisor_client.get("/api/inpatient/supervisor/alerts/metrics/?days=7")
        assert response.status_code == status.HTTP_200_OK

    def test_metrics_counts_admissions_correctly(
        self,
        supervisor_client,
        admission_with_critical_violation,
        admission_with_warning_violation,
    ):
        """Metrics correctly count admissions."""
        response = supervisor_client.get("/api/inpatient/supervisor/alerts/metrics/")
        assert response.status_code == status.HTTP_200_OK
        
        # We have 2 admissions with overrides
        assert response.data["override_count"] == 2
        # Only 1 has critical violations
        assert response.data["critical_override_count"] == 1
        # None acknowledged yet
        assert response.data["pending_acknowledgment_count"] == 1

    def test_metrics_counts_acknowledged_correctly(
        self,
        supervisor_client,
        admission_with_critical_violation,
        supervisor_user,
    ):
        """Metrics correctly count acknowledged alerts."""
        from hmis.apps.inpatient.models import SupervisorAlertAcknowledgment

        # Pre-acknowledge
        SupervisorAlertAcknowledgment.objects.create(
            admission=admission_with_critical_violation,
            acknowledged_by=supervisor_user,
        )

        response = supervisor_client.get("/api/inpatient/supervisor/alerts/metrics/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["acknowledged_count"] == 1
        assert response.data["pending_acknowledgment_count"] == 0

    def test_metrics_violation_breakdown(
        self, supervisor_client, admission_with_critical_violation
    ):
        """Metrics include violation breakdown by type."""
        response = supervisor_client.get("/api/inpatient/supervisor/alerts/metrics/")
        assert response.status_code == status.HTTP_200_OK
        
        violations = response.data["violation_breakdown"]
        codes = [v["code"] for v in violations]
        assert "ISOLATION_REQUIRED" in codes

    def test_metrics_ward_breakdown(
        self, supervisor_client, admission_with_critical_violation
    ):
        """Metrics include ward breakdown."""
        response = supervisor_client.get("/api/inpatient/supervisor/alerts/metrics/")
        assert response.status_code == status.HTTP_200_OK
        
        ward_stats = response.data["ward_breakdown"]
        assert len(ward_stats) > 0
        assert all("ward_id" in w and "ward_name" in w and "override_count" in w for w in ward_stats)


@pytest.mark.django_db
class TestSupervisorAlertAcknowledgmentModel:
    """Tests for the SupervisorAlertAcknowledgment model."""

    def test_model_creation(self, admission_with_critical_violation, supervisor_user):
        """Can create acknowledgment record."""
        from hmis.apps.inpatient.models import SupervisorAlertAcknowledgment

        ack = SupervisorAlertAcknowledgment.objects.create(
            admission=admission_with_critical_violation,
            acknowledged_by=supervisor_user,
            notes="Test notes",
        )
        assert ack.id is not None
        assert ack.acknowledged_at is not None
        assert ack.notes == "Test notes"

    def test_one_acknowledgment_per_admission(
        self, admission_with_critical_violation, supervisor_user
    ):
        """Cannot create duplicate acknowledgments for the same admission."""
        from django.db import IntegrityError
        from hmis.apps.inpatient.models import SupervisorAlertAcknowledgment

        SupervisorAlertAcknowledgment.objects.create(
            admission=admission_with_critical_violation,
            acknowledged_by=supervisor_user,
        )

        with pytest.raises(IntegrityError):
            SupervisorAlertAcknowledgment.objects.create(
                admission=admission_with_critical_violation,
                acknowledged_by=supervisor_user,
            )

    def test_str_representation(self, admission_with_critical_violation, supervisor_user):
        """Model has a useful string representation."""
        from hmis.apps.inpatient.models import SupervisorAlertAcknowledgment

        ack = SupervisorAlertAcknowledgment.objects.create(
            admission=admission_with_critical_violation,
            acknowledged_by=supervisor_user,
        )
        str_repr = str(ack)
        assert admission_with_critical_violation.admission_number in str_repr
        assert supervisor_user.username in str_repr
