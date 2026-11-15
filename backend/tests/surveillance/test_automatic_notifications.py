# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for automatic, auditable surveillance notifications.

Run with:
    poetry run pytest tests/surveillance/test_automatic_notifications.py --no-cov

Inputs:
    Uses standard surveillance, facility, patient, and encounter pytest fixtures.
"""

from unittest.mock import patch

import pytest


@pytest.mark.django_db
class TestAutomaticCountyNotifications:
    """Verify automatic notification of DHA-reportable surveillance alerts."""

    @patch("hmis.apps.surveillance.services.send_transactional_email")
    def test_immediate_alert_dispatches_tracked_county_email(
        self,
        mock_send_transactional_email,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """An immediate alert should create delivered county evidence without manual action."""
        from hmis.apps.surveillance.models import (
            CountyNotificationDelivery,
            NotifiableCase,
            NotifiableDisease,
            SurveillanceAlert,
            SurveillanceFacilitySettings,
        )
        from hmis.apps.surveillance.services import SurveillanceService

        mock_send_transactional_email.return_value = {
            "accepted": True,
            "provider": "smtp",
            "provider_message_id": None,
            "terminal_state": "delivered",
        }
        disease = NotifiableDisease.objects.create(
            name="Automatic Cholera",
            icd10_codes="A00",
            category="IMMEDIATE",
            requires_county_notification=True,
            reporting_hours=24,
        )
        case = NotifiableCase.objects.create(
            disease=disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        SurveillanceFacilitySettings.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            notify_via_email=True,
            email_recipient="dha-county-test@example.org",
        )

        alert = SurveillanceService.create_alert(
            case=case,
            alert_type=SurveillanceAlert.AlertType.NEW_CASE,
        )

        case.refresh_from_db()
        delivery = CountyNotificationDelivery.objects.get(case=case, channel="EMAIL")
        alert.refresh_from_db()
        assert delivery.status == "DELIVERED"
        assert delivery.provider == "smtp"
        assert case.notification_status == "NOTIFIED"
        assert alert.sent_via_email is True
        assert mock_send_transactional_email.call_count == 1

    @patch("hmis.apps.surveillance.services.send_transactional_email")
    def test_outbreak_alert_notifies_county_for_weekly_disease(
        self,
        mock_send_transactional_email,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """An outbreak alert should notify the county even when the disease is weekly-reportable."""
        from hmis.apps.surveillance.models import (
            CountyNotificationDelivery,
            NotifiableCase,
            NotifiableDisease,
            SurveillanceAlert,
            SurveillanceFacilitySettings,
        )
        from hmis.apps.surveillance.services import SurveillanceService

        mock_send_transactional_email.return_value = {
            "accepted": True,
            "provider": "smtp",
            "provider_message_id": None,
            "terminal_state": "delivered",
        }
        disease = NotifiableDisease.objects.create(
            name="Automatic Measles Outbreak",
            icd10_codes="B05",
            category="WEEKLY",
            reporting_hours=168,
        )
        case = NotifiableCase.objects.create(
            disease=disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        SurveillanceFacilitySettings.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            notify_via_email=True,
            email_recipient="dha-county-test@example.org",
        )

        alert = SurveillanceService.create_alert(
            case=case,
            alert_type=SurveillanceAlert.AlertType.OUTBREAK,
        )

        case.refresh_from_db()
        delivery = CountyNotificationDelivery.objects.get(case=case, channel="EMAIL")
        alert.refresh_from_db()
        assert delivery.status == "DELIVERED"
        assert case.notification_status == "NOTIFIED"
        assert alert.sent_via_email is True
        assert mock_send_transactional_email.call_count == 1
