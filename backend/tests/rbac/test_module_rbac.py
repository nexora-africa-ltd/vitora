"""
Tests for Blood Bank, Dialysis, and Last Office RBAC enforcement.

Verifies that:
1. ViewSets enforce custom permissions on write operations
2. Read-only access is always allowed for authenticated users
3. Custom action endpoints (certify, release, void, crossmatch, etc.) require specific permissions
4. roles.json fixture includes correct permissions_matrix entries
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APIRequestFactory

from hmis.apps.blood_bank.permissions import (
    CanIssueBloodUnit,
    CanManageBloodBank,
    CanPerformCrossMatch,
)
from hmis.apps.dialysis.permissions import CanManageDialysis, CanPerformDialysis
from hmis.apps.patients.permissions import CanCertifyDeath, CanReleaseBody, CanVoidDeathRecord

User = get_user_model()
factory = APIRequestFactory()


# =============================================================================
# Permission class unit tests
# =============================================================================


class TestBloodBankPermissions:
    """Tests for blood bank permission classes."""

    def test_can_manage_blood_bank_allows_get(self):
        request = factory.get("/")
        request.user = MagicMock(is_authenticated=True)
        assert CanManageBloodBank().has_permission(request, None) is True

    def test_can_manage_blood_bank_denies_post_without_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=False)
        assert CanManageBloodBank().has_permission(request, None) is False
        request.user.has_perm.assert_called_with("blood_bank.manage_blood_bank")

    def test_can_manage_blood_bank_allows_post_with_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=True)
        assert CanManageBloodBank().has_permission(request, None) is True

    def test_can_issue_blood_unit_denies_post_without_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=False)
        assert CanIssueBloodUnit().has_permission(request, None) is False
        request.user.has_perm.assert_called_with("blood_bank.issue_blood_unit")

    def test_can_issue_blood_unit_allows_post_with_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=True)
        assert CanIssueBloodUnit().has_permission(request, None) is True

    def test_can_perform_crossmatch_denies_post_without_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=False)
        assert CanPerformCrossMatch().has_permission(request, None) is False
        request.user.has_perm.assert_called_with("blood_bank.perform_crossmatch")

    def test_can_perform_crossmatch_allows_get(self):
        request = factory.get("/")
        request.user = MagicMock(is_authenticated=True)
        assert CanPerformCrossMatch().has_permission(request, None) is True

    def test_can_perform_crossmatch_allows_head(self):
        request = factory.head("/")
        request.user = MagicMock(is_authenticated=True)
        assert CanPerformCrossMatch().has_permission(request, None) is True


class TestDialysisPermissions:
    """Tests for dialysis permission classes."""

    def test_can_manage_dialysis_allows_get(self):
        request = factory.get("/")
        request.user = MagicMock(is_authenticated=True)
        assert CanManageDialysis().has_permission(request, None) is True

    def test_can_manage_dialysis_denies_post_without_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=False)
        assert CanManageDialysis().has_permission(request, None) is False
        request.user.has_perm.assert_called_with("dialysis.manage_dialysis")

    def test_can_manage_dialysis_allows_post_with_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=True)
        assert CanManageDialysis().has_permission(request, None) is True

    def test_can_perform_dialysis_denies_post_without_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=False)
        assert CanPerformDialysis().has_permission(request, None) is False
        request.user.has_perm.assert_called_with("dialysis.perform_dialysis")

    def test_can_perform_dialysis_allows_post_with_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=True)
        assert CanPerformDialysis().has_permission(request, None) is True

    def test_can_perform_dialysis_allows_options(self):
        request = factory.options("/")
        request.user = MagicMock(is_authenticated=True)
        assert CanPerformDialysis().has_permission(request, None) is True


class TestDeathRecordPermissions:
    """Tests for death record (last office) permission classes."""

    def test_can_certify_death_allows_get(self):
        request = factory.get("/")
        request.user = MagicMock(is_authenticated=True)
        assert CanCertifyDeath().has_permission(request, None) is True

    def test_can_certify_death_denies_post_without_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=False)
        assert CanCertifyDeath().has_permission(request, None) is False
        request.user.has_perm.assert_called_with("patients.certify_death")

    def test_can_certify_death_allows_post_with_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=True)
        assert CanCertifyDeath().has_permission(request, None) is True

    def test_can_release_body_denies_post_without_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=False)
        assert CanReleaseBody().has_permission(request, None) is False
        request.user.has_perm.assert_called_with("patients.release_body")

    def test_can_release_body_allows_post_with_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=True)
        assert CanReleaseBody().has_permission(request, None) is True

    def test_can_void_death_record_denies_post_without_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=False)
        assert CanVoidDeathRecord().has_permission(request, None) is False
        request.user.has_perm.assert_called_with("patients.void_death_record")

    def test_can_void_death_record_allows_post_with_perm(self):
        request = factory.post("/")
        request.user = MagicMock(is_authenticated=True)
        request.user.has_perm = MagicMock(return_value=True)
        assert CanVoidDeathRecord().has_permission(request, None) is True


# =============================================================================
# Fixture completeness tests
# =============================================================================


class TestRolesFixtureModulePermissions:
    """Tests that roles.json has correct permissions for these modules."""

    @pytest.fixture
    def fixture_data(self):
        fixture_path = (
            Path(__file__).resolve().parent.parent.parent
            / "hmis"
            / "apps"
            / "core"
            / "fixtures"
            / "roles.json"
        )
        return json.loads(fixture_path.read_text())

    def _get_role_matrix(self, fixture_data, code: str) -> dict:
        for item in fixture_data:
            if item.get("model") == "core.role" and item["fields"]["code"] == code:
                return item["fields"].get("permissions_matrix", {})
        return {}

    def test_admin_has_full_blood_bank_permissions(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "ADMIN")
        assert "BloodUnit" in pm
        assert pm["BloodUnit"]["create"] is True
        assert pm["BloodUnit"]["manage_blood_bank"] is True
        assert pm["BloodUnit"]["issue_blood_unit"] is True
        assert "CrossMatch" in pm
        assert pm["CrossMatch"]["perform_crossmatch"] is True

    def test_admin_has_full_dialysis_permissions(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "ADMIN")
        assert "DialysisSession" in pm
        assert pm["DialysisSession"]["manage_dialysis"] is True
        assert pm["DialysisSession"]["perform_dialysis"] is True
        assert "DialysisOrder" in pm
        assert pm["DialysisOrder"]["manage_dialysis"] is True

    def test_lab_tech_has_blood_bank_manage(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "LAB_TECH")
        assert "BloodUnit" in pm
        assert pm["BloodUnit"]["manage_blood_bank"] is True
        assert pm["BloodUnit"]["issue_blood_unit"] is True
        assert "CrossMatch" in pm
        assert pm["CrossMatch"]["perform_crossmatch"] is True

    def test_lab_tech_has_no_dialysis(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "LAB_TECH")
        assert "DialysisSession" not in pm

    def test_doctor_has_blood_request_create(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "DOCTOR")
        assert "BloodRequest" in pm
        assert pm["BloodRequest"]["create"] is True
        assert pm["BloodRequest"]["manage_blood_bank"] is True

    def test_doctor_has_dialysis_manage(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "DOCTOR")
        assert "DialysisOrder" in pm
        assert pm["DialysisOrder"]["manage_dialysis"] is True
        assert "DialysisSession" in pm
        assert pm["DialysisSession"]["perform_dialysis"] is True

    def test_nurse_has_limited_blood_bank(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "NURSE")
        assert "BloodRequest" in pm
        assert pm["BloodRequest"]["create"] is True
        # Nurse can request but NOT manage units or perform crossmatch
        assert "BloodUnit" in pm
        assert pm["BloodUnit"]["create"] is False

    def test_nurse_has_dialysis_perform_only(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "NURSE")
        assert "DialysisSession" in pm
        assert pm["DialysisSession"]["perform_dialysis"] is True
        # Nurse cannot manage orders
        assert "DialysisOrder" in pm
        assert pm["DialysisOrder"]["create"] is False

    def test_receptionist_has_no_blood_bank(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "RECEPTIONIST")
        assert "BloodUnit" not in pm
        assert "BloodRequest" not in pm

    def test_receptionist_has_no_dialysis(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "RECEPTIONIST")
        assert "DialysisSession" not in pm
        assert "DialysisOrder" not in pm

    def test_admin_has_full_death_record_permissions(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "ADMIN")
        assert "DeathRecord" in pm
        assert pm["DeathRecord"]["certify_death"] is True
        assert pm["DeathRecord"]["release_body"] is True
        assert pm["DeathRecord"]["void_death_record"] is True

    def test_doctor_can_certify_death(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "DOCTOR")
        assert "DeathRecord" in pm
        assert pm["DeathRecord"]["certify_death"] is True

    def test_consultant_can_certify_death(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "CONSULTANT")
        assert "DeathRecord" in pm
        assert pm["DeathRecord"]["certify_death"] is True

    def test_clinical_officer_cannot_certify_death(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "CLINICAL_OFFICER")
        assert "DeathRecord" in pm
        # Clinical officers can record deaths but not certify
        assert pm["DeathRecord"].get("certify_death", False) is False

    def test_nurse_has_read_only_death_records(self, fixture_data):
        pm = self._get_role_matrix(fixture_data, "NURSE")
        assert "DeathRecord" in pm
        assert pm["DeathRecord"]["read"] is True
        assert pm["DeathRecord"]["create"] is False


# =============================================================================
# ViewSet permission integration tests
# =============================================================================


@pytest.mark.django_db
class TestBloodBankViewSetPermissions:
    """Integration tests for blood bank ViewSet permission enforcement."""

    @pytest.fixture
    def user_without_perm(self, db):
        user = User.objects.create_user(username="noperm", password="testpass")
        return user

    @pytest.fixture
    def user_with_manage_perm(self, db):
        user = User.objects.create_user(username="labtech", password="testpass")
        ct = ContentType.objects.get(app_label="blood_bank", model="bloodunit")
        perm = Permission.objects.get(content_type=ct, codename="manage_blood_bank")
        user.user_permissions.add(perm)
        return user

    def test_list_allowed_without_manage_perm(self, user_without_perm, authenticated_client):
        """Any authenticated user can list blood units."""
        authenticated_client.force_authenticate(user=user_without_perm)
        response = authenticated_client.get("/api/blood-bank/units/")
        assert response.status_code == 200

    def test_create_denied_without_manage_perm(self, user_without_perm, authenticated_client):
        """Creating blood units requires manage_blood_bank permission."""
        authenticated_client.force_authenticate(user=user_without_perm)
        response = authenticated_client.post("/api/blood-bank/units/", {})
        assert response.status_code == 403

    def test_create_allowed_with_manage_perm(self, user_with_manage_perm, authenticated_client):
        """User with manage_blood_bank can attempt creation (may get 400 for missing fields)."""
        authenticated_client.force_authenticate(user=user_with_manage_perm)
        response = authenticated_client.post("/api/blood-bank/units/", {})
        # 400 means permission passed, validation failed (expected)
        assert response.status_code in (400, 201)


@pytest.mark.django_db
class TestDialysisViewSetPermissions:
    """Integration tests for dialysis ViewSet permission enforcement."""

    @pytest.fixture
    def user_without_perm(self, db):
        user = User.objects.create_user(username="noperm_dial", password="testpass")
        return user

    @pytest.fixture
    def user_with_manage_perm(self, db):
        user = User.objects.create_user(username="doctor_dial", password="testpass")
        ct = ContentType.objects.get(app_label="dialysis", model="dialysissession")
        perm = Permission.objects.get(content_type=ct, codename="manage_dialysis")
        user.user_permissions.add(perm)
        return user

    def test_list_allowed_without_manage_perm(self, user_without_perm, authenticated_client):
        """Any authenticated user can list dialysis orders."""
        authenticated_client.force_authenticate(user=user_without_perm)
        response = authenticated_client.get("/api/dialysis/orders/")
        assert response.status_code == 200

    def test_create_denied_without_manage_perm(self, user_without_perm, authenticated_client):
        """Creating orders requires manage_dialysis permission."""
        authenticated_client.force_authenticate(user=user_without_perm)
        response = authenticated_client.post("/api/dialysis/orders/", {})
        assert response.status_code == 403

    def test_create_allowed_with_manage_perm(self, user_with_manage_perm, authenticated_client):
        """User with manage_dialysis can attempt creation."""
        authenticated_client.force_authenticate(user=user_with_manage_perm)
        response = authenticated_client.post("/api/dialysis/orders/", {})
        assert response.status_code in (400, 201)
