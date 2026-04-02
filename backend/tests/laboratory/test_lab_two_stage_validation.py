"""
Tests for two-stage validation (Phase L2).

Tests the ResultValidation model and the two-stage validation workflow:
- Technical validation by lab technician
- Clinical sign-off by pathologist (for complex tests)
"""

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.laboratory.models import (
    LabOrder,
    LabOrderItem,
    LabResult,
    ResultValidation,
    TestCatalog,
)
from tests.conftest import ensure_staff_profile

User = get_user_model()


@pytest.fixture
def lab_technician(db):
    """Create a lab technician user."""
    return User.objects.create_user(
        username="lab_tech",
        email="tech@example.com",
        password="testpass123",
        first_name="Lab",
        last_name="Technician",
    )


@pytest.fixture
def pathologist(db):
    """Create a pathologist user for clinical sign-off."""
    return User.objects.create_user(
        username="pathologist",
        email="pathologist@example.com",
        password="testpass123",
        first_name="Dr. Pat",
        last_name="Pathologist",
    )


@pytest.fixture
def simple_test(db):
    """Create a simple test that doesn't require clinical sign-off."""
    return TestCatalog.objects.create(
        code="CBC001",
        name="Complete Blood Count",
        short_name="CBC",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="PANEL",
        requires_clinical_signoff=False,
        is_active=True,
    )


@pytest.fixture
def complex_test(db):
    """Create a complex test that requires clinical sign-off."""
    return TestCatalog.objects.create(
        code="HISTO001",
        name="Histopathology Biopsy",
        short_name="Biopsy",
        category="HISTOPATHOLOGY",
        specimen_type="TISSUE",
        result_type="TEXT",
        requires_clinical_signoff=True,  # Requires pathologist sign-off
        is_active=True,
    )


@pytest.fixture
def lab_result_simple(db, sample_patient, sample_encounter, simple_test, lab_technician, sample_organization, sample_facility):
    """Create a lab result for a simple test."""
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=lab_technician,
        order_type="IN_HOUSE",
        priority="ROUTINE",
        facility=sample_facility,
        organization=sample_organization,
    )
    item = LabOrderItem.objects.create(
        lab_order=order,
        test=simple_test,
        status="COMPLETED",
    )
    return LabResult.objects.create(
        order_item=item,
        numeric_value=12.5,
        result_unit="g/dL",
        entered_by=lab_technician,
    )


@pytest.fixture
def lab_result_complex(db, sample_patient, sample_encounter, complex_test, lab_technician, sample_organization, sample_facility):
    """Create a lab result for a complex test requiring clinical sign-off."""
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=lab_technician,
        order_type="IN_HOUSE",
        priority="ROUTINE",
        facility=sample_facility,
        organization=sample_organization,
    )
    item = LabOrderItem.objects.create(
        lab_order=order,
        test=complex_test,
        status="COMPLETED",
    )
    return LabResult.objects.create(
        order_item=item,
        text_value="No malignant cells observed",
        entered_by=lab_technician,
    )


# ============================================================================
# Model Tests
# ============================================================================


class TestResultValidationModel:
    """Tests for the ResultValidation model."""

    def test_create_technical_validation(self, lab_result_simple, lab_technician):
        """Should create a technical validation record."""
        validation = ResultValidation.objects.create(
            result=lab_result_simple,
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
            comment="Values within normal range",
        )

        assert validation.id is not None
        assert validation.validation_type == "TECHNICAL"
        assert validation.status == "APPROVED"
        assert validation.validated_by == lab_technician
        assert validation.comment == "Values within normal range"
        assert validation.validated_at is not None

    def test_create_clinical_validation(self, lab_result_complex, pathologist):
        """Should create a clinical validation record."""
        validation = ResultValidation.objects.create(
            result=lab_result_complex,
            validation_type="CLINICAL",
            status="APPROVED",
            validated_by=pathologist,
            comment="Confirmed no malignancy",
        )

        assert validation.id is not None
        assert validation.validation_type == "CLINICAL"
        assert validation.status == "APPROVED"
        assert validation.validated_by == pathologist

    def test_unique_validation_per_type_constraint(self, lab_result_simple, lab_technician):
        """Should enforce unique validation per type per result."""
        ResultValidation.objects.create(
            result=lab_result_simple,
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
        )

        # Attempting to create another TECHNICAL validation should fail
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            ResultValidation.objects.create(
                result=lab_result_simple,
                validation_type="TECHNICAL",
                status="REJECTED",
                validated_by=lab_technician,
            )


class TestLabResultVerifyMethod:
    """Tests for LabResult.verify() with two-stage validation."""

    def test_verify_creates_technical_validation(self, lab_result_simple, lab_technician):
        """verify() should create a technical validation by default."""
        lab_result_simple.verify(lab_technician)

        assert lab_result_simple.verification_status == "VERIFIED"
        assert lab_result_simple.verified_by == lab_technician
        assert lab_result_simple.verified_at is not None

        # Check validation record was created
        validations = lab_result_simple.validations.all()
        assert validations.count() == 1
        assert validations[0].validation_type == "TECHNICAL"
        assert validations[0].status == "APPROVED"

    def test_verify_with_comment(self, lab_result_simple, lab_technician):
        """verify() should store comment in validation record."""
        lab_result_simple.verify(lab_technician, comment="All values normal")

        validation = lab_result_simple.validations.first()
        assert validation.comment == "All values normal"

    def test_verify_complex_test_stays_unverified_after_technical(
        self, lab_result_complex, lab_technician
    ):
        """Complex test should remain UNVERIFIED after only technical validation."""
        lab_result_complex.verify(lab_technician, validation_type="TECHNICAL")

        assert lab_result_complex.verification_status == "UNVERIFIED"
        assert lab_result_complex.validations.filter(
            validation_type="TECHNICAL", status="APPROVED"
        ).exists()

    def test_verify_complex_test_verified_after_both_validations(
        self, lab_result_complex, lab_technician, pathologist
    ):
        """Complex test should be VERIFIED after both technical and clinical validation."""
        # Technical validation
        lab_result_complex.verify(lab_technician, validation_type="TECHNICAL")
        assert lab_result_complex.verification_status == "UNVERIFIED"

        # Clinical sign-off
        lab_result_complex.verify(pathologist, validation_type="CLINICAL")
        assert lab_result_complex.verification_status == "VERIFIED"
        assert lab_result_complex.verified_by == pathologist


class TestLabResultAddValidation:
    """Tests for LabResult.add_validation() method."""

    def test_add_validation_creates_record(self, lab_result_simple, lab_technician):
        """add_validation() should create a validation record."""
        validation = lab_result_simple.add_validation(
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
            comment="Verified",
        )

        assert validation.id is not None
        assert validation.result == lab_result_simple
        assert validation.validation_type == "TECHNICAL"
        assert validation.status == "APPROVED"

    def test_add_rejected_validation(self, lab_result_simple, lab_technician):
        """Should be able to add a rejected validation."""
        lab_result_simple.add_validation(
            validation_type="TECHNICAL",
            status="REJECTED",
            validated_by=lab_technician,
            comment="Hemolyzed sample, results unreliable",
        )
        lab_result_simple._update_verification_status()

        assert lab_result_simple.verification_status == "REJECTED"


class TestLabResultVerificationStatusDerivation:
    """Tests for _update_verification_status() logic."""

    def test_rejection_takes_precedence(self, lab_result_complex, lab_technician, pathologist):
        """REJECTED status should take precedence over any approvals."""
        # Technical approval
        lab_result_complex.add_validation(
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
        )
        # Clinical rejection
        lab_result_complex.add_validation(
            validation_type="CLINICAL",
            status="REJECTED",
            validated_by=pathologist,
            comment="Need additional staining",
        )
        lab_result_complex._update_verification_status()

        assert lab_result_complex.verification_status == "REJECTED"
        assert lab_result_complex.verified_by == pathologist

    def test_simple_test_verified_with_technical_only(self, lab_result_simple, lab_technician):
        """Simple test (no clinical required) should be VERIFIED after technical approval."""
        lab_result_simple.add_validation(
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
        )
        lab_result_simple._update_verification_status()

        assert lab_result_simple.verification_status == "VERIFIED"


class TestLabResultValidationSummary:
    """Tests for get_validation_summary() method."""

    def test_summary_for_simple_test(self, lab_result_simple, lab_technician):
        """Summary should show technical validation only for simple tests."""
        lab_result_simple.add_validation(
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
        )

        summary = lab_result_simple.get_validation_summary()

        assert summary["requires_clinical_signoff"] is False
        assert summary["technical_validation"]["status"] == "APPROVED"
        assert summary["clinical_validation"] is None

    def test_summary_for_complex_test_pending(self, lab_result_complex):
        """Summary should show pending validations for complex tests."""
        summary = lab_result_complex.get_validation_summary()

        assert summary["requires_clinical_signoff"] is True
        assert summary["technical_validation"]["status"] == "PENDING"
        assert summary["clinical_validation"]["status"] == "PENDING"

    def test_summary_for_complex_test_after_technical(self, lab_result_complex, lab_technician):
        """Summary should show technical approved, clinical pending."""
        lab_result_complex.add_validation(
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
        )

        summary = lab_result_complex.get_validation_summary()

        assert summary["technical_validation"]["status"] == "APPROVED"
        assert summary["technical_validation"]["validated_by"] == "Lab Technician"
        assert summary["clinical_validation"]["status"] == "PENDING"


# ============================================================================
# API Tests
# ============================================================================


@pytest.fixture
def authenticated_tech_client(lab_technician, sample_organization, sample_facility):
    """API client authenticated as lab technician."""
    client = APIClient()
    ensure_staff_profile(lab_technician, sample_organization, sample_facility)
    client.force_authenticate(user=lab_technician)
    return client


@pytest.fixture
def authenticated_pathologist_client(pathologist, sample_organization, sample_facility):
    """API client authenticated as pathologist."""
    client = APIClient()
    ensure_staff_profile(pathologist, sample_organization, sample_facility)
    client.force_authenticate(user=pathologist)
    return client


class TestVerifyEndpointTwoStage:
    """Tests for the /verify/ endpoint with two-stage validation."""

    def test_verify_with_default_technical_type(self, authenticated_tech_client, lab_result_simple):
        """POST /results/{id}/verify/ should default to TECHNICAL validation."""
        response = authenticated_tech_client.post(
            f"/api/lab/results/{lab_result_simple.id}/verify/",
            {"approved": True, "comments": "All good"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["verification_status"] == "VERIFIED"

        # Check validation record
        lab_result_simple.refresh_from_db()
        validation = lab_result_simple.validations.first()
        assert validation.validation_type == "TECHNICAL"

    def test_verify_with_explicit_clinical_type(
        self,
        authenticated_tech_client,
        authenticated_pathologist_client,
        lab_result_complex,
        lab_technician,
    ):
        """POST /results/{id}/verify/ should accept validation_type=CLINICAL."""
        # First add technical validation
        lab_result_complex.add_validation(
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
        )
        lab_result_complex._update_verification_status()

        # Now clinical sign-off
        response = authenticated_pathologist_client.post(
            f"/api/lab/results/{lab_result_complex.id}/verify/",
            {"approved": True, "validation_type": "CLINICAL", "comments": "Confirmed"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["verification_status"] == "VERIFIED"

    def test_reject_via_verify_endpoint(self, authenticated_tech_client, lab_result_simple):
        """POST /results/{id}/verify/ with approved=False should reject."""
        response = authenticated_tech_client.post(
            f"/api/lab/results/{lab_result_simple.id}/verify/",
            {"approved": False, "comments": "Sample was hemolyzed"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["verification_status"] == "REJECTED"


class TestValidationsEndpoint:
    """Tests for the /validations/ endpoint."""

    def test_get_validations(self, authenticated_tech_client, lab_result_simple, lab_technician):
        """GET /results/{id}/validations/ should return all validations."""
        lab_result_simple.add_validation(
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
        )

        response = authenticated_tech_client.get(
            f"/api/lab/results/{lab_result_simple.id}/validations/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["validation_type"] == "TECHNICAL"
        assert response.data[0]["status"] == "APPROVED"


class TestValidateEndpoint:
    """Tests for the /validate/ endpoint (explicit two-stage)."""

    def test_add_technical_validation(self, authenticated_tech_client, lab_result_simple):
        """POST /results/{id}/validate/ should add a validation."""
        response = authenticated_tech_client.post(
            f"/api/lab/results/{lab_result_simple.id}/validate/",
            {"validation_type": "TECHNICAL", "status": "APPROVED", "comment": "Verified"},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["validation_type"] == "TECHNICAL"
        assert response.data["status"] == "APPROVED"

    def test_add_clinical_validation_after_technical(
        self, authenticated_tech_client, authenticated_pathologist_client, lab_result_complex
    ):
        """Should allow adding clinical validation after technical."""
        # Add technical
        authenticated_tech_client.post(
            f"/api/lab/results/{lab_result_complex.id}/validate/",
            {"validation_type": "TECHNICAL", "status": "APPROVED"},
        )

        # Add clinical
        response = authenticated_pathologist_client.post(
            f"/api/lab/results/{lab_result_complex.id}/validate/",
            {"validation_type": "CLINICAL", "status": "APPROVED"},
        )

        assert response.status_code == status.HTTP_201_CREATED

        lab_result_complex.refresh_from_db()
        assert lab_result_complex.verification_status == "VERIFIED"

    def test_duplicate_validation_type_rejected(self, authenticated_tech_client, lab_result_simple):
        """Should reject duplicate validation type for same result."""
        # First validation
        authenticated_tech_client.post(
            f"/api/lab/results/{lab_result_simple.id}/validate/",
            {"validation_type": "TECHNICAL", "status": "APPROVED"},
        )

        # Duplicate should fail
        response = authenticated_tech_client.post(
            f"/api/lab/results/{lab_result_simple.id}/validate/",
            {"validation_type": "TECHNICAL", "status": "REJECTED"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already exists" in response.data["error"]


class TestPendingVerificationEndpoint:
    """Tests for filtered pending verification endpoints."""

    def test_pending_technical(
        self, authenticated_tech_client, lab_result_simple, lab_result_complex
    ):
        """Should return results pending technical validation."""
        response = authenticated_tech_client.get(
            "/api/lab/results/pending-verification/?validation_type=TECHNICAL"
        )

        assert response.status_code == status.HTTP_200_OK
        result_ids = [r["id"] for r in response.data]
        assert lab_result_simple.id in result_ids
        assert lab_result_complex.id in result_ids

    def test_pending_clinical(self, authenticated_tech_client, lab_result_complex, lab_technician):
        """Should return results pending clinical sign-off."""
        # Add technical validation to complex test
        lab_result_complex.add_validation(
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
        )
        lab_result_complex._update_verification_status()

        response = authenticated_tech_client.get(
            "/api/lab/results/pending-verification/?validation_type=CLINICAL"
        )

        assert response.status_code == status.HTTP_200_OK
        result_ids = [r["id"] for r in response.data]
        assert lab_result_complex.id in result_ids

    def test_pending_clinical_signoff_endpoint(
        self, authenticated_tech_client, lab_result_complex, lab_technician
    ):
        """GET /results/pending-clinical-signoff/ endpoint."""
        # Add technical validation
        lab_result_complex.add_validation(
            validation_type="TECHNICAL",
            status="APPROVED",
            validated_by=lab_technician,
        )
        lab_result_complex._update_verification_status()

        response = authenticated_tech_client.get("/api/lab/results/pending-clinical-signoff/")

        assert response.status_code == status.HTTP_200_OK
        result_ids = [r["id"] for r in response.data]
        assert lab_result_complex.id in result_ids


class TestValidationSummaryInSerializer:
    """Tests that validation_summary appears in API responses."""

    def test_result_detail_includes_validation_summary(
        self, authenticated_tech_client, lab_result_complex
    ):
        """GET /results/{id}/ should include validation_summary."""
        response = authenticated_tech_client.get(f"/api/lab/results/{lab_result_complex.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert "validation_summary" in response.data
        assert response.data["validation_summary"]["requires_clinical_signoff"] is True
