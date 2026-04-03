"""Tests for procedure API endpoints: CRUD, workflow actions, dashboard."""

from datetime import date, timedelta

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.procedures.models import (
    ProcedureConsent,
    ProcedureLog,
    ProcedureOrder,
)


class TestProcedureCatalogAPI:
    """Tests for /api/procedures/catalog/ endpoints."""

    def test_list_catalog(self, authenticated_client, procedure_catalog_entry):
        response = authenticated_client.get("/api/procedures/catalog/")
        assert response.status_code == status.HTTP_200_OK

    def test_retrieve_catalog(self, authenticated_client, procedure_catalog_entry):
        response = authenticated_client.get(
            f"/api/procedures/catalog/{procedure_catalog_entry.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "PROC-WC-001"

    def test_search_catalog(self, authenticated_client, procedure_catalog_entry):
        response = authenticated_client.get("/api/procedures/catalog/?search=Wound")
        assert response.status_code == status.HTTP_200_OK

    def test_filter_by_category(self, authenticated_client, procedure_catalog_entry):
        response = authenticated_client.get("/api/procedures/catalog/?category=WOUND_CARE")
        assert response.status_code == status.HTTP_200_OK

    def test_unauthenticated_access_denied(self, api_client):
        response = api_client.get("/api/procedures/catalog/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestProcedureOrderCRUD:
    """Tests for /api/procedures/orders/ CRUD operations."""

    def test_create_order(self, authenticated_client, procedure_order_data):
        response = authenticated_client.post(
            "/api/procedures/orders/",
            procedure_order_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["order_number"].startswith("PROC-")
        assert response.data["status"] == "ORDERED"

    def test_create_order_auto_sets_ordered_by(
        self, authenticated_client, procedure_order_data, test_user
    ):
        response = authenticated_client.post(
            "/api/procedures/orders/",
            procedure_order_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        order = ProcedureOrder.objects.get(id=response.data["id"])
        assert order.ordered_by == test_user

    def test_create_order_missing_indication(
        self, authenticated_client, procedure_catalog_entry, sample_patient
    ):
        data = {
            "procedure": procedure_catalog_entry.id,
            "patient": sample_patient.id,
        }
        response = authenticated_client.post(
            "/api/procedures/orders/", data, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "indication" in response.data

    def test_list_orders(self, authenticated_client, procedure_order):
        response = authenticated_client.get("/api/procedures/orders/")
        assert response.status_code == status.HTTP_200_OK

    def test_retrieve_order(self, authenticated_client, procedure_order):
        response = authenticated_client.get(
            f"/api/procedures/orders/{procedure_order.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["order_number"] == procedure_order.order_number

    def test_unauthenticated_access_denied(self, api_client, procedure_order):
        response = api_client.get("/api/procedures/orders/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestProcedureOrderWorkflow:
    """Tests for workflow @action endpoints."""

    def test_schedule_order(self, authenticated_client, procedure_order):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/schedule/",
            {"scheduled_date": tomorrow, "scheduled_location": "Room 3"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        procedure_order.refresh_from_db()
        assert procedure_order.status == ProcedureOrder.Status.SCHEDULED

    def test_start_procedure(self, authenticated_client, procedure_order):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/start/",
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        procedure_order.refresh_from_db()
        assert procedure_order.status == ProcedureOrder.Status.IN_PROGRESS
        assert ProcedureLog.objects.filter(order=procedure_order).exists()

    def test_start_procedure_wrong_status(self, authenticated_client, procedure_order):
        # Order is ORDERED, not SCHEDULED
        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/start/",
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "SCHEDULED or READY" in response.data["error"]

    def test_complete_procedure(self, authenticated_client, procedure_order, test_user):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        procedure_order.start_procedure(performed_by=test_user)

        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/complete/",
            {
                "status": "COMPLETED",
                "immediate_outcome": "Procedure successful",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        procedure_order.refresh_from_db()
        assert procedure_order.status == ProcedureOrder.Status.COMPLETED

    def test_complete_wrong_status(self, authenticated_client, procedure_order):
        # Order is ORDERED, not IN_PROGRESS
        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/complete/",
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cancel_order(self, authenticated_client, procedure_order):
        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/cancel/",
            {"reason": "Patient request"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        procedure_order.refresh_from_db()
        assert procedure_order.status == ProcedureOrder.Status.CANCELLED
        assert procedure_order.cancellation_reason == "Patient request"

    def test_cancel_completed_order_fails(self, authenticated_client, procedure_order):
        procedure_order.status = ProcedureOrder.Status.COMPLETED
        procedure_order.save()
        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/cancel/",
            {"reason": "Too late"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cancel_requires_reason(self, authenticated_client, procedure_order):
        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/cancel/",
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestProcedureConsentAPI:
    """Tests for consent @action endpoints."""

    def test_create_consent(self, authenticated_client, procedure_order):
        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/consent/create/",
            {
                "consent_type": "WRITTEN",
                "consent_text": "I consent to the wound dressing procedure.",
                "procedure_explained": True,
                "risks_explained": True,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "PENDING"
        procedure_order.refresh_from_db()
        assert procedure_order.status == ProcedureOrder.Status.CONSENT_PENDING

    def test_get_consent(self, authenticated_client, procedure_order, test_user):
        ProcedureConsent.objects.create(
            order=procedure_order,
            consent_text="I consent.",
            obtained_by=test_user,
        )
        response = authenticated_client.get(
            f"/api/procedures/orders/{procedure_order.id}/consent/"
        )
        assert response.status_code == status.HTTP_200_OK

    def test_get_consent_not_found(self, authenticated_client, procedure_order):
        response = authenticated_client.get(
            f"/api/procedures/orders/{procedure_order.id}/consent/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_sign_consent(self, authenticated_client, procedure_order, test_user):
        ProcedureConsent.objects.create(
            order=procedure_order,
            consent_text="I consent.",
            obtained_by=test_user,
            signed_by_patient=True,
        )
        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/consent/sign/",
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "SIGNED"

    def test_decline_consent(self, authenticated_client, procedure_order, test_user):
        ProcedureConsent.objects.create(
            order=procedure_order,
            consent_text="I consent.",
            obtained_by=test_user,
        )
        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/consent/decline/",
            {"reason": "Fear of needles"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "DECLINED"


class TestProcedureConsumableAPI:
    """Tests for consumable @action endpoints."""

    def test_list_consumables(self, authenticated_client, procedure_order, test_user):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        procedure_order.start_procedure(performed_by=test_user)
        response = authenticated_client.get(
            f"/api/procedures/orders/{procedure_order.id}/consumables/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_consumables_no_log(self, authenticated_client, procedure_order):
        response = authenticated_client.get(
            f"/api/procedures/orders/{procedure_order.id}/consumables/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestProcedureOutcomeAPI:
    """Tests for outcome @action endpoints."""

    def test_list_outcomes(self, authenticated_client, procedure_order, test_user):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        procedure_order.start_procedure(performed_by=test_user)
        response = authenticated_client.get(
            f"/api/procedures/orders/{procedure_order.id}/outcomes/"
        )
        assert response.status_code == status.HTTP_200_OK

    def test_add_outcome(self, authenticated_client, procedure_order, test_user):
        procedure_order.status = ProcedureOrder.Status.SCHEDULED
        procedure_order.save()
        log = procedure_order.start_procedure(performed_by=test_user)
        log.complete()

        response = authenticated_client.post(
            f"/api/procedures/orders/{procedure_order.id}/outcomes/add/",
            {
                "assessment_date": date.today().isoformat(),
                "outcome": "HEALING",
                "findings": "Wound healing well",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED


class TestProcedureDashboard:
    """Tests for /api/procedures/dashboard/ endpoint."""

    def test_dashboard_stats(self, authenticated_client):
        response = authenticated_client.get("/api/procedures/dashboard/")
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert "scheduled_today" in data
        assert "pending_consent" in data
        assert "in_progress" in data
        assert "completed_today" in data

    def test_dashboard_unauthenticated(self, api_client):
        response = api_client.get("/api/procedures/dashboard/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_dashboard_counts(
        self, authenticated_client, procedure_catalog_entry, sample_patient, sample_encounter, test_user
    ):
        # Create orders in various states
        order1 = ProcedureOrder.objects.create(
            procedure=procedure_catalog_entry,
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            indication="Test 1",
            status=ProcedureOrder.Status.SCHEDULED,
            scheduled_date=date.today(),
        )
        order2 = ProcedureOrder.objects.create(
            procedure=procedure_catalog_entry,
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            indication="Test 2",
            status=ProcedureOrder.Status.CONSENT_PENDING,
        )
        order3 = ProcedureOrder.objects.create(
            procedure=procedure_catalog_entry,
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            indication="Test 3",
            status=ProcedureOrder.Status.IN_PROGRESS,
        )

        response = authenticated_client.get("/api/procedures/dashboard/")
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["scheduled_today"] >= 1
        assert data["pending_consent"] >= 1
        assert data["in_progress"] >= 1
