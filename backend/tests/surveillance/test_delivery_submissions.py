# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for facility-scoped surveillance delivery submissions and audit evidence.

Run with:
    poetry run pytest tests/surveillance/test_delivery_submissions.py --no-cov

Inputs:
    Standard surveillance, facility, patient, encounter, and authenticated-client fixtures.
"""

from unittest.mock import patch

import pytest
from django.contrib.auth.models import Permission
from rest_framework import status


@pytest.fixture
def other_facility(db, sample_organization, sample_county, sample_sub_county):
    """Create a separate facility for delivery ledger isolation checks."""
    from hmis.apps.core.models import Facility

    return Facility.objects.create(
        organization=sample_organization,
        name="Other Delivery Test Health Centre",
        mfl_code="99996",
        level="3",
        county=sample_county,
        sub_county=sample_sub_county,
        is_active=True,
        has_surveillance=True,
    )


@pytest.mark.django_db
class TestDeliverySubmissions:
    """Verify the delivery ledger, manual retries, and external-delivery audit trail."""

    @pytest.fixture
    def failed_delivery(
        self,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Create a failed SMS delivery for a facility-scoped notifiable case."""
        from hmis.apps.surveillance.models import (
            CountyNotificationDelivery,
            NotifiableCase,
            NotifiableDisease,
        )

        disease = NotifiableDisease.objects.create(
            name="Delivery Ledger Cholera",
            icd10_codes="A00",
            category="IMMEDIATE",
            reporting_hours=24,
        )
        case = NotifiableCase.objects.create(
            disease=disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        return CountyNotificationDelivery.objects.create(
            case=case,
            facility=sample_facility,
            organization=sample_organization,
            channel="SMS",
            status="FAILED",
            recipient="+254700123456",
            attempt_count=3,
            max_retry_attempts=3,
            last_error="Gateway unavailable",
        )

    @staticmethod
    def grant_delivery_permissions(authenticated_client, *codenames: str) -> None:
        """Grant the ledger permissions needed by an API assertion."""
        user = authenticated_client.handler._force_user
        permissions = Permission.objects.filter(
            content_type__app_label="surveillance",
            codename__in=codenames,
        )
        user.user_permissions.add(*permissions)
        authenticated_client.force_authenticate(user=user)

    def test_list_submissions_requires_explicit_view_permission(self, authenticated_client):
        """Authenticated users without delivery access must not read the facility ledger."""
        response = authenticated_client.get("/api/surveillance/deliveries/")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.parametrize(
        "role_code",
        ("OWNER", "ADMIN", "ORG-ADMIN", "DHA_EVIDENCE_READER"),
    )
    def test_privileged_roles_can_view_submissions(
        self,
        authenticated_client,
        failed_delivery,
        test_staff_profile,
        role_code,
    ):
        """Tenant administrators and DHA readers can obtain facility delivery evidence."""
        role = test_staff_profile.primary_role
        role.code = role_code
        role.save(update_fields=["code"])

        response = authenticated_client.get("/api/surveillance/deliveries/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["results"][0]["id"] == failed_delivery.id

    @pytest.mark.parametrize("role_code", ("OWNER", "ADMIN", "ORG-ADMIN"))
    @patch("hmis.apps.surveillance.services.send_sms")
    def test_tenant_administrators_can_retry_submissions(
        self,
        mock_send_sms,
        authenticated_client,
        failed_delivery,
        test_staff_profile,
        role_code,
    ):
        """Tenant administrative roles may resend failed facility notifications."""
        role = test_staff_profile.primary_role
        role.code = role_code
        role.save(update_fields=["code"])
        mock_send_sms.return_value = True

        response = authenticated_client.post(
            f"/api/surveillance/deliveries/{failed_delivery.id}/retry/"
        )

        assert response.status_code == status.HTTP_200_OK

    def test_dha_evidence_reader_cannot_retry_submissions(
        self,
        authenticated_client,
        failed_delivery,
        test_staff_profile,
    ):
        """DHA readers are intentionally limited to read-only delivery evidence."""
        role = test_staff_profile.primary_role
        role.code = "DHA_EVIDENCE_READER"
        role.save(update_fields=["code"])

        response = authenticated_client.post(
            f"/api/surveillance/deliveries/{failed_delivery.id}/retry/"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_list_submissions_includes_origin_and_sender_context(
        self,
        authenticated_client,
        failed_delivery,
    ):
        """The delivery ledger should expose safe drill-down and sender context."""
        self.grant_delivery_permissions(
            authenticated_client,
            "view_countynotificationdelivery",
        )
        response = authenticated_client.get("/api/surveillance/deliveries/")

        assert response.status_code == status.HTTP_200_OK
        item = response.data["results"][0]
        assert item["id"] == failed_delivery.id
        assert item["case"] == failed_delivery.case_id
        assert item["case_disease_name"] == "Delivery Ledger Cholera"
        assert item["case_notification_status"] == "PENDING"
        assert item["sent_by_name"] == "Automated system"

    def test_delivery_from_other_facility_is_hidden(
        self,
        authenticated_client,
        failed_delivery,
        other_facility,
    ):
        """A delivery must not be visible or retrievable outside the active facility."""
        from hmis.apps.surveillance.models import (
            CountyNotificationDelivery,
            NotifiableCase,
            NotifiableDisease,
        )

        self.grant_delivery_permissions(
            authenticated_client,
            "view_countynotificationdelivery",
        )
        other_disease = NotifiableDisease.objects.create(
            name="Other Facility Delivery Disease",
            icd10_codes="A01",
            category="IMMEDIATE",
            reporting_hours=24,
        )
        other_case = NotifiableCase.objects.create(
            disease=other_disease,
            patient=failed_delivery.case.patient,
            encounter=failed_delivery.case.encounter,
            facility=other_facility,
            organization=other_facility.organization,
        )
        other_delivery = CountyNotificationDelivery.objects.create(
            case=other_case,
            facility=other_facility,
            organization=other_facility.organization,
            channel="SMS",
            status="FAILED",
            recipient="+254711123456",
        )

        list_response = authenticated_client.get("/api/surveillance/deliveries/")
        retrieve_response = authenticated_client.get(
            f"/api/surveillance/deliveries/{other_delivery.id}/"
        )

        assert list_response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in list_response.data["results"]] == [failed_delivery.id]
        assert retrieve_response.status_code == status.HTTP_404_NOT_FOUND

    def test_retry_requires_explicit_change_permission(
        self,
        authenticated_client,
        failed_delivery,
    ):
        """Ledger viewers must not be able to resend county notifications."""
        self.grant_delivery_permissions(
            authenticated_client,
            "view_countynotificationdelivery",
        )

        response = authenticated_client.post(
            f"/api/surveillance/deliveries/{failed_delivery.id}/retry/"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @patch("hmis.apps.surveillance.services.send_sms")
    def test_manual_retry_creates_auditable_delivery_attempt(
        self,
        mock_send_sms,
        authenticated_client,
        failed_delivery,
    ):
        """A permitted user can retry a failed delivery and the action is audited."""
        from hmis.apps.core.models import AuditLog

        self.grant_delivery_permissions(
            authenticated_client,
            "view_countynotificationdelivery",
            "change_countynotificationdelivery",
        )
        mock_send_sms.return_value = True

        response = authenticated_client.post(
            f"/api/surveillance/deliveries/{failed_delivery.id}/retry/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "SENT"
        assert response.data["attempt_count"] == 4
        assert response.data["sent_by_name"] == "testuser"
        assert AuditLog.objects.filter(
            action="county_notification_delivery_manual_retry",
            resource_type="CountyNotificationDelivery",
            resource_id=failed_delivery.id,
        ).exists()

    def test_email_delivery_webhook_records_audit_transition(
        self,
        failed_delivery,
    ):
        """A provider delivery result should be independently auditable."""
        from hmis.apps.core.models import AuditLog
        from hmis.apps.surveillance.services import SurveillanceService

        failed_delivery.channel = "EMAIL"
        failed_delivery.status = "SENT"
        failed_delivery.provider_message_id = "dha-delivery-audit-402"
        failed_delivery.save(
            update_fields=["channel", "status", "provider_message_id", "updated_at"]
        )

        delivery = SurveillanceService.apply_email_webhook_status(
            provider_message_id="dha-delivery-audit-402",
            event_type="email.delivered",
        )

        assert delivery is not None
        assert delivery.status == "DELIVERED"
        assert AuditLog.objects.filter(
            action="county_notification_delivery_status_changed",
            resource_type="CountyNotificationDelivery",
            resource_id=failed_delivery.id,
        ).exists()

    def test_late_provider_event_cannot_restore_a_superseded_delivery(
        self,
        failed_delivery,
    ):
        """A corrected-recipient reissue must retain the original delivery as superseded."""
        from hmis.apps.core.models import AuditLog
        from hmis.apps.surveillance.services import SurveillanceService

        failed_delivery.channel = "EMAIL"
        failed_delivery.status = "SUPERSEDED"
        failed_delivery.provider_message_id = "dha-superseded-delivery-402"
        failed_delivery.save(
            update_fields=["channel", "status", "provider_message_id", "updated_at"]
        )

        delivery = SurveillanceService.apply_email_webhook_status(
            provider_message_id="dha-superseded-delivery-402",
            event_type="email.delivered",
        )

        assert delivery is not None
        assert delivery.status == "SUPERSEDED"
        assert delivery.provider_event == "email.delivered"
        assert AuditLog.objects.filter(
            action="county_notification_delivery_provider_event_ignored",
            resource_type="CountyNotificationDelivery",
            resource_id=failed_delivery.id,
        ).exists()
