"""RBAC denial / authorization tests for laboratory endpoints.

These tests verify that the role-based permission classes wired onto the
laboratory ViewSets actually deny unauthorized roles. The lab module's
``conftest.py`` promotes the default ``test_user`` to ``LAB_SCIENTIST`` so
existing tests exercise the success path; here we override the role inline
to reach the failure paths.
"""

from datetime import date

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import Role, StaffProfile
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _set_role(user, code: str, name: str = "", level: int = 5) -> Role:
    """Reassign ``user.staff_profile.primary_role`` to ``Role(code=code)``."""
    role, _ = Role.objects.get_or_create(
        code=code,
        defaults={"name": name or code.title(), "hierarchy_level": level, "is_active": True},
    )
    profile = user.staff_profile
    profile.primary_role = role
    profile.save(update_fields=["primary_role"])
    return role


@pytest.fixture
def sample_test_item(db):
    return TestCatalog.objects.create(
        code="CBC",
        name="Complete Blood Count",
        short_name="CBC",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="PANEL",
        is_active=True,
    )


@pytest.fixture
def sample_lab_order(
    db,
    sample_patient,
    sample_encounter,
    sample_facility,
    sample_organization,
    test_user,
    sample_test_item,
):
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        order_type="IN_HOUSE",
        priority="ROUTINE",
        status="ORDERED",
        facility=sample_facility,
        organization=sample_organization,
    )
    LabOrderItem.objects.create(
        lab_order=order,
        test=sample_test_item,
        unit_cost=sample_test_item.cost or 0,
    )
    return order


@pytest.fixture
def sample_lab_result(db, sample_lab_order, test_user):
    item = sample_lab_order.items.first()
    item.status = "COMPLETED"
    item.save(update_fields=["status"])
    return LabResult.objects.create(
        order_item=item,
        numeric_value=12.5,
        result_unit="g/dL",
        entered_by=test_user,
    )


# ---------------------------------------------------------------------------
# LaboratoryModuleRequired
# ---------------------------------------------------------------------------


class TestLaboratoryModuleRequired:
    def test_lab_endpoints_blocked_when_module_disabled(
        self, authenticated_client, sample_facility, test_staff_profile
    ):
        sample_facility.has_laboratory = False
        sample_facility.has_lis_standalone = False
        sample_facility.save(update_fields=["has_laboratory", "has_lis_standalone"])
        response = authenticated_client.get("/api/lab/orders/")
        assert response.status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# LISCollectSamplePermission
# ---------------------------------------------------------------------------


class TestCollectSamplePermission:
    def test_billing_clerk_cannot_collect_specimen(
        self, authenticated_client, sample_lab_order, test_user, test_staff_profile
    ):
        _set_role(test_user, "BILLING_CLERK", "Billing Clerk")
        url = f"/api/lab/orders/{sample_lab_order.order_number}/collect-specimen/"
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_phlebotomist_can_collect_specimen(
        self, authenticated_client, sample_lab_order, test_user, test_staff_profile
    ):
        _set_role(test_user, "PHLEBOTOMIST", "Phlebotomist")
        url = f"/api/lab/orders/{sample_lab_order.order_number}/collect-specimen/"
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# LISVerifyResultsPermission / LISReleaseResultsPermission
# ---------------------------------------------------------------------------


class TestVerifyAndReleasePermissions:
    def test_lab_tech_can_perform_technical_verify(
        self, authenticated_client, sample_lab_result, test_user, test_staff_profile
    ):
        _set_role(test_user, "LAB_TECH", "Laboratory Technician", level=4)
        url = f"/api/lab/results/{sample_lab_result.id}/verify/"
        response = authenticated_client.post(
            url, {"approved": True, "comments": "ok"}, format="json"
        )
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)

    def test_doctor_role_cannot_create_lab_result(
        self, authenticated_client, sample_lab_order, test_user, test_staff_profile
    ):
        _set_role(test_user, "DOC", "Doctor")
        item = sample_lab_order.items.first()
        response = authenticated_client.post(
            "/api/lab/results/",
            {"order_item": item.id, "numeric_value": 11.0, "result_unit": "g/dL"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


# ---------------------------------------------------------------------------
# LISManageCatalogPermission
# ---------------------------------------------------------------------------


class TestCatalogPermission:
    def test_doctor_cannot_create_test_catalog_entry(
        self, authenticated_client, test_user, test_staff_profile
    ):
        _set_role(test_user, "DOC", "Doctor")
        response = authenticated_client.post(
            "/api/lab/tests/",
            {
                "code": "BMP",
                "name": "Basic Metabolic Panel",
                "short_name": "BMP",
                "category": "CHEMISTRY",
                "specimen_type": "BLOOD",
                "result_type": "PANEL",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_doctor_can_still_read_test_catalog(
        self, authenticated_client, test_user, test_staff_profile, sample_test_item
    ):
        # Read-only methods are allowed for any authenticated user.
        _set_role(test_user, "DOC", "Doctor")
        response = authenticated_client.get("/api/lab/tests/")
        assert response.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# LISQCPermission
# ---------------------------------------------------------------------------


class TestQCPermission:
    def test_phlebotomist_cannot_write_qc_material(
        self, authenticated_client, test_user, test_staff_profile
    ):
        _set_role(test_user, "PHLEBOTOMIST", "Phlebotomist")
        response = authenticated_client.post(
            "/api/lab/qc/materials/",
            {"name": "Level 1 Control", "lot_number": "L1", "manufacturer": "Bio-Rad"},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
