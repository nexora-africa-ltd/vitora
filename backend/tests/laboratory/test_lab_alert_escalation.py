# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Facility-scoped critical laboratory escalation tests.

Run with: poetry run pytest tests/laboratory/test_lab_alert_escalation.py -q
Inputs: standard laboratory pytest fixtures.
"""

from datetime import date
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model

from hmis.apps.core.models import StaffProfile
from hmis.apps.laboratory.models import LaboratoryAlertSettings
from hmis.apps.laboratory.serializers import LaboratoryAlertSettingsSerializer
from hmis.apps.laboratory.services.notifications import LabNotificationService

User = get_user_model()


@pytest.mark.django_db
def test_critical_lab_email_includes_ordering_clinician_and_facility_escalation_once(
    sample_lab_order, sample_lab_result, sample_role, sample_department
):
    """Critical email recipients combine clinician and local configured recipients without duplicates."""
    sample_lab_result.is_critical_result = True
    sample_lab_result.save()
    clinician = sample_lab_order.ordered_by
    clinician.email = "clinician@example.com"
    clinician.save()
    escalation_user = User.objects.create_user(
        username="lab-escalation", email="lab-escalation@example.com"
    )
    StaffProfile.objects.create(
        user=escalation_user,
        primary_role=sample_role,
        primary_department=sample_department,
        primary_facility=sample_lab_order.facility,
        date_joined=date.today(),
    )
    config = LaboratoryAlertSettings.get_settings(sample_lab_order.facility)
    config.lab_critical_alert_users.add(escalation_user, clinician)

    with patch("hmis.apps.laboratory.services.notifications.send_transactional_email") as send:
        send.return_value = {"accepted": True}
        LabNotificationService().send_result_notification(sample_lab_order)

    assert {call.kwargs["to_email"] for call in send.call_args_list} == {
        "clinician@example.com",
        "lab-escalation@example.com",
    }
    assert all(call.kwargs["facility"] == sample_lab_order.facility for call in send.call_args_list)


@pytest.mark.django_db
def test_laboratory_alert_settings_reject_explicit_user_from_another_facility(
    sample_lab_order, sample_role, sample_department, rf
):
    """Explicit critical-result recipients cannot cross facility boundaries."""
    other_user = User.objects.create_user(username="other-lab-recipient")
    StaffProfile.objects.create(
        user=other_user,
        primary_role=sample_role,
        primary_department=sample_department,
        date_joined=date.today(),
    )
    request = rf.patch("/api/lab/settings/alerts/")
    request.facility = sample_lab_order.facility
    serializer = LaboratoryAlertSettingsSerializer(
        LaboratoryAlertSettings.get_settings(sample_lab_order.facility),
        data={"lab_critical_alert_users": [other_user.pk]},
        partial=True,
        context={"request": request},
    )

    assert not serializer.is_valid()
    assert "lab_critical_alert_users" in serializer.errors
