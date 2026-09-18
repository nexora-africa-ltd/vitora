# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for surveillance contact tracing entity and workflow engine.

What this file is for:
- Validate contact tracing contact/follow-up CRUD and workflow transitions.

How to use it:
- Run with `poetry run pytest tests/surveillance/test_contact_tracing.py -q`.

Supported inputs/args:
- Pytest fixtures from backend/tests/conftest.py and surveillance fixtures.
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status


@pytest.fixture
def cholera_disease(db):
    from hmis.apps.surveillance.models import NotifiableDisease

    return NotifiableDisease.objects.create(
        name="Cholera",
        icd10_codes="A00",
        category="IMMEDIATE",
        reporting_hours=24,
    )


@pytest.fixture
def notifiable_case(
    db,
    cholera_disease,
    sample_patient,
    sample_encounter,
    sample_facility,
    sample_organization,
):
    from hmis.apps.surveillance.models import NotifiableCase

    return NotifiableCase.objects.create(
        disease=cholera_disease,
        patient=sample_patient,
        encounter=sample_encounter,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.mark.django_db
class TestContactTracingContactsAPI:
    def test_create_contact_updates_case_stats(self, authenticated_client, notifiable_case):
        from hmis.apps.surveillance.models import ContactTracingContact

        response = authenticated_client.post(
            "/api/surveillance/contacts/",
            {
                "case": notifiable_case.id,
                "full_name": "Close Contact One",
                "phone_number": "+254700111222",
                "relationship_to_case": "Household",
                "risk_level": "HIGH",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["phone_number_masked"] == "***222"
        notifiable_case.refresh_from_db()
        assert notifiable_case.contact_tracing_initiated is True
        assert notifiable_case.contacts_identified == 1

        contact = ContactTracingContact.objects.get(pk=response.data["id"])
        assert contact.phone_number == "+254700111222"
        assert contact.phone_number_encrypted

    def test_mark_contacted_transition(self, authenticated_client, notifiable_case):
        create = authenticated_client.post(
            "/api/surveillance/contacts/",
            {
                "case": notifiable_case.id,
                "full_name": "Close Contact Two",
                "risk_level": "MEDIUM",
            },
            format="json",
        )
        contact_id = create.data["id"]

        response = authenticated_client.post(
            f"/api/surveillance/contacts/{contact_id}/mark_contacted/",
            {"notes": "Reached via phone"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CONTACTED"

    def test_start_monitoring_sets_dates(self, authenticated_client, notifiable_case):
        create = authenticated_client.post(
            "/api/surveillance/contacts/",
            {
                "case": notifiable_case.id,
                "full_name": "Close Contact Three",
                "risk_level": "HIGH",
            },
            format="json",
        )
        contact_id = create.data["id"]

        response = authenticated_client.post(
            f"/api/surveillance/contacts/{contact_id}/start_monitoring/",
            {"monitoring_days": 10},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "UNDER_MONITORING"
        assert response.data["monitoring_start_date"]
        assert response.data["monitoring_end_date"]
        assert response.data["next_followup_date"]

    def test_record_followup_symptomatic_escalates(self, authenticated_client, notifiable_case):
        create = authenticated_client.post(
            "/api/surveillance/contacts/",
            {
                "case": notifiable_case.id,
                "full_name": "Close Contact Four",
                "risk_level": "MEDIUM",
            },
            format="json",
        )
        contact_id = create.data["id"]
        authenticated_client.post(
            f"/api/surveillance/contacts/{contact_id}/start_monitoring/",
            {},
            format="json",
        )

        response = authenticated_client.post(
            f"/api/surveillance/contacts/{contact_id}/record_followup/",
            {
                "followup_date": str(timezone.localdate()),
                "method": "PHONE",
                "symptoms_present": True,
                "temperature_c": "38.4",
                "notes": "Now febrile",
                "outcome": "ESCALATE_TESTING",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED

        detail = authenticated_client.get(f"/api/surveillance/contacts/{contact_id}/")
        assert detail.status_code == status.HTTP_200_OK
        assert detail.data["status"] == "SYMPTOMATIC"
        assert len(detail.data["followups"]) == 1

    def test_record_followup_supports_manual_next_followup_date(
        self, authenticated_client, notifiable_case
    ):
        create = authenticated_client.post(
            "/api/surveillance/contacts/",
            {
                "case": notifiable_case.id,
                "full_name": "Close Contact Manual Date",
                "risk_level": "MEDIUM",
            },
            format="json",
        )
        contact_id = create.data["id"]
        authenticated_client.post(
            f"/api/surveillance/contacts/{contact_id}/start_monitoring/",
            {},
            format="json",
        )

        custom_next = timezone.localdate() + timedelta(days=4)
        response = authenticated_client.post(
            f"/api/surveillance/contacts/{contact_id}/record_followup/",
            {
                "followup_date": str(timezone.localdate()),
                "next_followup_date": str(custom_next),
                "method": "PHONE",
                "symptoms_present": False,
                "outcome": "CONTINUE_MONITORING",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        detail = authenticated_client.get(f"/api/surveillance/contacts/{contact_id}/")
        assert detail.status_code == status.HTTP_200_OK
        assert detail.data["next_followup_date"] == str(custom_next)

    def test_delete_contact_requires_permission(self, authenticated_client, notifiable_case):
        create = authenticated_client.post(
            "/api/surveillance/contacts/",
            {
                "case": notifiable_case.id,
                "full_name": "Close Contact Five",
                "risk_level": "LOW",
            },
            format="json",
        )
        contact_id = create.data["id"]

        # Remove permission explicitly in case inherited from role fixtures.
        user = authenticated_client.handler._force_user
        user.user_permissions.clear()
        user = get_user_model().objects.get(pk=user.pk)
        authenticated_client.force_authenticate(user=user)

        response = authenticated_client.delete(f"/api/surveillance/contacts/{contact_id}/")
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestContactTracingFollowUpsView:
    def test_followups_list_endpoint(self, authenticated_client, notifiable_case):
        from hmis.apps.surveillance.models import ContactTracingContact, ContactTracingFollowUp

        contact = ContactTracingContact.objects.create(
            case=notifiable_case,
            full_name="Close Contact Six",
            risk_level="LOW",
            facility=notifiable_case.facility,
            organization=notifiable_case.organization,
        )
        ContactTracingFollowUp.objects.create(
            contact=contact,
            followup_date=timezone.localdate() - timedelta(days=1),
            method="PHONE",
            symptoms_present=False,
            outcome="CONTINUE_MONITORING",
            facility=contact.facility,
            organization=contact.organization,
        )

        response = authenticated_client.get("/api/surveillance/contact-followups/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1
