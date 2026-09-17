# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Facility-scoped pharmacy alert configuration tests.

Run with: poetry run pytest tests/pharmacy/test_alert_settings_recipients.py -q
Inputs: standard tenant and pharmacy pytest fixtures.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission

from hmis.apps.core.models import Facility, StaffProfile
from hmis.apps.pharmacy.models import AlertSettings, StockAlert
from hmis.apps.pharmacy.tasks import queue_stock_alert_digest, send_stock_alert_digest

User = get_user_model()


@pytest.mark.django_db
class TestFacilityAlertSettings:
    """Alert recipients are isolated to the active facility."""

    def test_recipient_resolution_includes_role_and_explicit_users_at_facility(
        self, sample_facility, test_user, sample_role, sample_department
    ):
        configured_user = User.objects.create_user(username="stock-recipient")
        StaffProfile.objects.create(
            user=configured_user,
            primary_role=sample_role,
            primary_department=sample_department,
            primary_facility=sample_facility,
            date_joined=date.today(),
        )
        settings = AlertSettings.get_settings(sample_facility)
        settings.stock_alert_roles.add(sample_role)
        settings.stock_alert_users.add(configured_user)

        assert set(settings.resolve_stock_alert_recipients()) == {configured_user}

    def test_pharmacy_alert_settings_do_not_expose_lab_escalation_fields(self, sample_facility):
        """Laboratory escalation routing belongs exclusively to LaboratoryAlertSettings."""
        settings = AlertSettings.get_settings(sample_facility)

        assert not hasattr(settings, "lab_critical_alert_roles")
        assert not hasattr(settings, "lab_critical_alert_users")

    def test_alert_settings_api_is_scoped_to_the_authenticated_facility(
        self, authenticated_client, test_user, test_staff_profile, sample_facility
    ):
        """The legacy URL creates and returns only the caller's facility settings."""
        test_user.user_permissions.add(Permission.objects.get(codename="view_alertsettings"))

        response = authenticated_client.get("/api/pharmacy/alert-settings/")

        assert response.status_code == 200
        assert response.data["facility"] == sample_facility.id

    def test_recipient_resolution_excludes_user_at_another_facility(
        self, sample_facility, test_user, sample_role, sample_department
    ):
        other_facility = Facility.objects.create(
            name="Other Facility",
            mfl_code="OTHER-ALERT",
            level="3",
            organization=sample_facility.organization,
        )
        other_user = User.objects.create_user(username="other-facility-recipient")
        StaffProfile.objects.create(
            user=other_user,
            primary_role=sample_role,
            primary_department=sample_department,
            primary_facility=other_facility,
            date_joined=date.today(),
        )
        settings = AlertSettings.get_settings(sample_facility)
        settings.stock_alert_users.add(other_user)
        settings.stock_alert_roles.add(sample_role)

        assert other_user not in settings.resolve_stock_alert_recipients()

    def test_expiry_alerts_keep_originating_facility_and_do_not_cross_deduplicate(
        self, sample_facility, sample_stock_batch
    ):
        other_facility = Facility.objects.create(
            name="Other Facility",
            mfl_code="OTHER-EXPIRY",
            level="3",
            organization=sample_facility.organization,
        )
        sample_stock_batch.facility = sample_facility
        sample_stock_batch.expiry_date = date.today() - timedelta(days=1)
        sample_stock_batch.save()
        duplicate = type(sample_stock_batch).objects.create(
            drug=sample_stock_batch.drug,
            batch_number="OTHER-EXPIRY-BATCH",
            quantity_received=1,
            quantity_available=1,
            manufacture_date=date.today() - timedelta(days=2),
            expiry_date=date.today() - timedelta(days=1),
            received_date=date.today(),
            cost_price=Decimal("1"),
            selling_price=Decimal("1"),
            received_by=sample_stock_batch.received_by,
            status="AVAILABLE",
            facility=other_facility,
        )

        StockAlert.generate_expiry_alerts()

        assert StockAlert.objects.filter(
            batch=sample_stock_batch, facility=sample_facility
        ).exists()
        assert StockAlert.objects.filter(batch=duplicate, facility=other_facility).exists()


@pytest.mark.django_db
class TestStockAlertEmailDigests:
    """Facility-scoped stock alert email batching."""

    def test_digest_sends_one_email_per_unique_recipient_for_high_volume_alerts(
        self, mocker, sample_facility, sample_stock_batch, test_user, test_staff_profile
    ):
        settings = AlertSettings.get_settings(sample_facility)
        settings.enable_email_notifications = True
        settings.stock_alert_digest_minutes = 15
        settings.notification_email_recipients = f"{test_user.email}, {test_user.email.upper()}"
        settings.save()
        settings.stock_alert_users.add(test_user)
        sample_stock_batch.quantity_available = 0
        sample_stock_batch.save()
        StockAlert.objects.bulk_create(
            [
                StockAlert(
                    drug=sample_stock_batch.drug,
                    batch=sample_stock_batch,
                    alert_type="OUT_OF_STOCK",
                    severity="CRITICAL",
                    message=f"Item {index} is out of stock",
                    facility=sample_facility,
                    organization=sample_facility.organization,
                )
                for index in range(5109)
            ]
        )
        send_email = mocker.patch(
            "hmis.apps.pharmacy.tasks.send_transactional_email", return_value={"accepted": True}
        )

        result = send_stock_alert_digest(sample_facility.id)
        send_stock_alert_digest(sample_facility.id)

        assert result["alerts"] == 5109
        send_email.assert_called_once()
        assert send_email.call_args.kwargs["to_email"] == test_user.email
        assert send_email.call_args.kwargs["facility"] == sample_facility
        assert "5,109" in send_email.call_args.kwargs["subject"]

    def test_digest_keeps_facilities_and_recipients_separate(
        self, mocker, sample_facility, sample_stock_batch, test_user, test_staff_profile
    ):
        other_facility = Facility.objects.create(
            name="Other Facility",
            mfl_code="OTHER-DIGEST",
            level="3",
            organization=sample_facility.organization,
        )
        other_user = User.objects.create_user(
            username="other-digest-user", email="other@example.com"
        )
        StaffProfile.objects.create(
            user=other_user,
            primary_role=test_staff_profile.primary_role,
            primary_department=test_staff_profile.primary_department,
            primary_facility=other_facility,
            date_joined=date.today(),
        )
        for facility, recipient, suffix in (
            (sample_facility, test_user, "one"),
            (other_facility, other_user, "two"),
        ):
            config = AlertSettings.get_settings(facility)
            config.enable_email_notifications = True
            config.save()
            config.stock_alert_users.add(recipient)
            StockAlert.objects.create(
                drug=sample_stock_batch.drug,
                alert_type="LOW_STOCK",
                severity="HIGH",
                message=f"{suffix} low stock",
                facility=facility,
                organization=facility.organization,
            )
        send_email = mocker.patch(
            "hmis.apps.pharmacy.tasks.send_transactional_email", return_value={"accepted": True}
        )

        send_stock_alert_digest(sample_facility.id)
        send_stock_alert_digest(other_facility.id)

        assert {call.kwargs["to_email"] for call in send_email.call_args_list} == {
            test_user.email,
            other_user.email,
        }
        assert {call.kwargs["facility"] for call in send_email.call_args_list} == {
            sample_facility,
            other_facility,
        }

    def test_digest_does_not_send_when_email_notifications_are_disabled(
        self, mocker, sample_facility, sample_stock_batch
    ):
        StockAlert.objects.create(
            drug=sample_stock_batch.drug,
            alert_type="LOW_STOCK",
            severity="HIGH",
            message="Low stock",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        send_email = mocker.patch("hmis.apps.pharmacy.tasks.send_transactional_email")

        result = send_stock_alert_digest(sample_facility.id)

        assert result["sent"] is False
        send_email.assert_not_called()

    def test_queue_debounces_per_facility(self, mocker, sample_facility):
        cache_add = mocker.patch("hmis.apps.pharmacy.tasks.cache.add", side_effect=[True, False])
        delay = mocker.patch("hmis.apps.pharmacy.tasks.send_stock_alert_digest.apply_async")

        queue_stock_alert_digest(sample_facility.id, 15)
        queue_stock_alert_digest(sample_facility.id, 15)

        assert cache_add.call_count == 2
        delay.assert_called_once_with(args=[sample_facility.id], countdown=900)
