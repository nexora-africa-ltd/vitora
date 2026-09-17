"""
Unit tests for Disease Surveillance module.

Tests for NotifiableDisease, NotifiableCase, SurveillanceAlert,
OutbreakThreshold models, views, and services.
"""

import base64
import hashlib
import hmac
import json
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# ============================================================================
# NotifiableDisease Model Tests
# ============================================================================


class TestNotifiableDiseaseModel:
    """Tests for NotifiableDisease model."""

    def test_create_notifiable_disease(self, db):
        """Should create a notifiable disease with valid data."""
        from hmis.apps.surveillance.models import NotifiableDisease

        disease = NotifiableDisease.objects.create(
            name="Test Disease",
            icd10_codes="A00,A00.1,A00.9",
            category="IMMEDIATE",
            reporting_hours=24,
            description="Test description",
        )

        assert disease.id is not None
        assert disease.name == "Test Disease"
        assert disease.category == "IMMEDIATE"
        assert disease.reporting_hours == 24

    def test_get_icd10_code_list(self, db):
        """Should parse ICD-10 codes into list."""
        from hmis.apps.surveillance.models import NotifiableDisease

        disease = NotifiableDisease.objects.create(
            name="Cholera",
            icd10_codes="A00, A00.0, A00.1, A00.9",
            category="IMMEDIATE",
            reporting_hours=24,
        )

        codes = disease.get_icd10_code_list()
        assert codes == ["A00", "A00.0", "A00.1", "A00.9"]

    def test_is_immediate_property(self, db):
        """Should return True for IMMEDIATE category diseases."""
        from hmis.apps.surveillance.models import NotifiableDisease

        immediate = NotifiableDisease.objects.create(
            name="Cholera",
            icd10_codes="A00",
            category="IMMEDIATE",
            reporting_hours=24,
        )
        weekly = NotifiableDisease.objects.create(
            name="Malaria",
            icd10_codes="B50",
            category="WEEKLY",
            reporting_hours=168,
        )

        assert immediate.is_immediate is True
        assert weekly.is_immediate is False

    def test_disease_str_representation(self, db):
        """Should return formatted string representation."""
        from hmis.apps.surveillance.models import NotifiableDisease

        disease = NotifiableDisease.objects.create(
            name="Cholera",
            icd10_codes="A00",
            category="IMMEDIATE",
            reporting_hours=24,
        )

        assert str(disease) == "Cholera (Immediate (within 24 hours))"

    def test_seeded_diseases_exist(self, db):
        """Should have seeded MOH 502 diseases after migration."""
        from django.core.management import call_command

        from hmis.apps.surveillance.models import NotifiableDisease

        # Seed diseases
        call_command("seed_notifiable_diseases", verbosity=0)

        # Check counts
        assert NotifiableDisease.objects.filter(category="IMMEDIATE").count() >= 10
        assert NotifiableDisease.objects.filter(category="WEEKLY").count() >= 10

        # Check specific diseases
        assert NotifiableDisease.objects.filter(name="Cholera").exists()
        assert NotifiableDisease.objects.filter(name="Measles").exists()
        assert NotifiableDisease.objects.filter(name="Malaria").exists()


# ============================================================================
# NotifiableCase Model Tests
# ============================================================================


class TestNotifiableCaseModel:
    """Tests for NotifiableCase model."""

    @pytest.fixture
    def cholera_disease(self, db):
        """Create cholera disease fixture."""
        from hmis.apps.surveillance.models import NotifiableDisease

        return NotifiableDisease.objects.create(
            name="Cholera",
            icd10_codes="A00,A00.0,A00.1,A00.9",
            category="IMMEDIATE",
            reporting_hours=24,
        )

    def test_create_notifiable_case(self, db, cholera_disease, sample_patient, sample_encounter):
        """Should create a notifiable case with valid data."""
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
        )

        assert case.id is not None
        assert case.disease == cholera_disease
        assert case.notification_status == "PENDING"

    def test_notification_deadline_auto_calculated(
        self, db, cholera_disease, sample_patient, sample_encounter
    ):
        """Should auto-calculate notification deadline based on disease reporting_hours."""
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
        )

        assert case.notification_deadline is not None
        expected_deadline = case.detected_at + timedelta(hours=24)
        # Allow 1 second tolerance
        assert abs((case.notification_deadline - expected_deadline).total_seconds()) < 1

    def test_county_auto_set_from_patient(
        self, db, cholera_disease, sample_patient, sample_encounter
    ):
        """Should auto-set county from patient on save."""
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
        )

        assert case.county == sample_patient.county
        assert case.sub_county == sample_patient.sub_county

    def test_is_overdue_when_past_deadline(
        self, db, cholera_disease, sample_patient, sample_encounter
    ):
        """Should return True when notification deadline has passed."""
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
        )
        # Set deadline to past
        case.notification_deadline = timezone.now() - timedelta(hours=1)
        case.save()

        assert case.is_overdue is True

    def test_is_not_overdue_when_notified(
        self, db, cholera_disease, sample_patient, sample_encounter
    ):
        """Should return False for overdue check when already notified."""
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            notification_status="NOTIFIED",
        )
        case.notification_deadline = timezone.now() - timedelta(hours=1)
        case.save()

        assert case.is_overdue is False

    def test_mark_notified(self, db, cholera_disease, sample_patient, sample_encounter, test_user):
        """Should update status and timestamp when marked as notified."""
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
        )

        case.mark_notified(user=test_user)

        assert case.notification_status == "NOTIFIED"
        assert case.notified_at is not None
        assert case.notified_by == test_user

    def test_unique_constraint_patient_encounter_disease(
        self, db, cholera_disease, sample_patient, sample_encounter
    ):
        """Should prevent duplicate case for same patient/encounter/disease."""
        from django.db import IntegrityError

        from hmis.apps.surveillance.models import NotifiableCase

        NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
        )

        with pytest.raises(IntegrityError):
            NotifiableCase.objects.create(
                disease=cholera_disease,
                patient=sample_patient,
                encounter=sample_encounter,
            )

    def test_hours_until_deadline(self, db, cholera_disease, sample_patient, sample_encounter):
        """Should calculate hours until deadline correctly."""
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
        )
        # Set deadline to 12 hours from now
        case.notification_deadline = timezone.now() + timedelta(hours=12)
        case.save()

        hours = case.hours_until_deadline
        assert 11 <= hours <= 12


# ============================================================================
# OutbreakThreshold Model Tests
# ============================================================================


class TestOutbreakThresholdModel:
    """Tests for OutbreakThreshold model."""

    @pytest.fixture
    def cholera_disease(self, db):
        """Create cholera disease fixture."""
        from hmis.apps.surveillance.models import NotifiableDisease

        return NotifiableDisease.objects.create(
            name="Cholera",
            icd10_codes="A00",
            category="IMMEDIATE",
            reporting_hours=24,
        )

    def test_create_outbreak_threshold(self, db, cholera_disease, sample_county):
        """Should create an outbreak threshold."""
        from hmis.apps.surveillance.models import OutbreakThreshold

        threshold = OutbreakThreshold.objects.create(
            disease=cholera_disease,
            county=sample_county,
            case_threshold=3,
            period_days=7,
        )

        assert threshold.id is not None
        assert threshold.case_threshold == 3
        assert threshold.period_days == 7

    def test_check_threshold_not_exceeded(self, db, cholera_disease):
        """Should return False when threshold not exceeded."""
        from hmis.apps.surveillance.models import OutbreakThreshold

        threshold = OutbreakThreshold.objects.create(
            disease=cholera_disease,
            case_threshold=5,
            period_days=7,
        )

        exceeded, count = threshold.check_threshold()
        assert exceeded is False
        assert count == 0

    def test_check_threshold_exceeded(
        self,
        db,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
    ):
        """Should return True when threshold exceeded."""
        from hmis.apps.surveillance.models import NotifiableCase, OutbreakThreshold

        threshold = OutbreakThreshold.objects.create(
            disease=cholera_disease,
            case_threshold=2,
            period_days=7,
        )

        # Create 3 cases
        for i in range(3):
            patient = sample_patient
            # Create unique encounters for each case
            from hmis.apps.encounters.models import Encounter

            enc = Encounter.objects.create(
                patient=patient,
                encounter_type="EMERGENCY",
                chief_complaint=f"Cholera symptoms {i}",
                facility=sample_facility,
            )
            NotifiableCase.objects.create(
                disease=cholera_disease,
                patient=patient,
                encounter=enc,
            )

        exceeded, count = threshold.check_threshold()
        assert exceeded is True
        assert count == 3


# ============================================================================
# SurveillanceAlert Model Tests
# ============================================================================


class TestSurveillanceAlertModel:
    """Tests for SurveillanceAlert model."""

    @pytest.fixture
    def sample_case(
        self, db, sample_patient, sample_encounter, sample_facility, sample_organization
    ):
        """Create sample notifiable case."""
        from hmis.apps.surveillance.models import NotifiableCase, NotifiableDisease

        disease = NotifiableDisease.objects.create(
            name="Measles",
            icd10_codes="B05",
            category="IMMEDIATE",
            reporting_hours=24,
        )
        return NotifiableCase.objects.create(
            disease=disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )

    def test_create_alert(self, db, sample_case):
        """Should create a surveillance alert."""
        from hmis.apps.surveillance.models import SurveillanceAlert

        alert = SurveillanceAlert.objects.create(
            case=sample_case,
            alert_type="NEW_CASE",
            message="New measles case detected",
        )

        assert alert.id is not None
        assert alert.is_acknowledged is False
        assert alert.sent_via_websocket is False

    def test_acknowledge_alert(self, db, sample_case, test_user):
        """Should mark alert as acknowledged."""
        from hmis.apps.surveillance.models import SurveillanceAlert

        alert = SurveillanceAlert.objects.create(
            case=sample_case,
            alert_type="NEW_CASE",
            message="New case",
        )

        alert.acknowledge(test_user)

        assert alert.is_acknowledged is True
        assert alert.acknowledged_by == test_user
        assert alert.acknowledged_at is not None


# ============================================================================
# SurveillanceService Tests
# ============================================================================


class TestSurveillanceService:
    """Tests for SurveillanceService."""

    @pytest.fixture
    def cholera_disease(self, db):
        """Create cholera disease fixture."""
        from hmis.apps.surveillance.models import NotifiableDisease

        return NotifiableDisease.objects.create(
            name="Cholera",
            icd10_codes="A00,A00.0,A00.1,A00.9",
            category="IMMEDIATE",
            reporting_hours=24,
        )

    @pytest.fixture
    def cholera_icd10(self, db):
        """Create cholera ICD-10 code."""
        from hmis.apps.encounters.models import ICD10Code

        return ICD10Code.objects.create(
            code="A00",
            description="Cholera",
            category="Infectious diseases",
            chapter=1,
        )

    def test_check_diagnosis_for_notifiable_disease(
        self, db, cholera_disease, cholera_icd10, sample_encounter
    ):
        """Should match diagnosis to notifiable disease."""
        from hmis.apps.encounters.models import Diagnosis
        from hmis.apps.surveillance.services import SurveillanceService

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=cholera_icd10,
            diagnosis_type="PRIMARY",
        )

        matched = SurveillanceService.check_diagnosis_for_notifiable_disease(diagnosis)

        assert matched is not None
        assert matched.name == "Cholera"

    def test_check_diagnosis_no_match(self, db, cholera_disease, sample_encounter):
        """Should return None when no matching disease."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code
        from hmis.apps.surveillance.services import SurveillanceService

        other_icd10 = ICD10Code.objects.create(
            code="Z00",
            description="General examination",
            category="Factors influencing health status",
            chapter=21,
        )
        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=other_icd10,
            diagnosis_type="PRIMARY",
        )

        matched = SurveillanceService.check_diagnosis_for_notifiable_disease(diagnosis)

        assert matched is None

    def test_create_case_from_diagnosis(
        self, db, cholera_disease, cholera_icd10, sample_encounter, test_user
    ):
        """Should create NotifiableCase from diagnosis."""
        from hmis.apps.encounters.models import Diagnosis
        from hmis.apps.surveillance.models import NotifiableCase
        from hmis.apps.surveillance.services import SurveillanceService

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=cholera_icd10,
            diagnosis_type="PRIMARY",
            diagnosed_by=test_user,
        )

        case = SurveillanceService.create_case_from_diagnosis(
            diagnosis=diagnosis,
            disease=cholera_disease,
            reported_by=test_user,
        )

        assert case.id is not None
        assert case.disease == cholera_disease
        assert case.patient == sample_encounter.patient
        assert case.reported_by == test_user

    def test_create_case_does_not_duplicate(
        self, db, cholera_disease, cholera_icd10, sample_encounter, test_user
    ):
        """Should return existing case if duplicate."""
        from hmis.apps.encounters.models import Diagnosis
        from hmis.apps.surveillance.models import NotifiableCase
        from hmis.apps.surveillance.services import SurveillanceService

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=cholera_icd10,
            diagnosis_type="PRIMARY",
        )

        # Create first case
        case1 = SurveillanceService.create_case_from_diagnosis(
            diagnosis=diagnosis,
            disease=cholera_disease,
        )

        # Try to create duplicate
        case2 = SurveillanceService.create_case_from_diagnosis(
            diagnosis=diagnosis,
            disease=cholera_disease,
        )

        assert case1.id == case2.id
        assert NotifiableCase.objects.count() == 1

    @patch("hmis.apps.surveillance.services.get_channel_layer")
    def test_broadcast_alert(self, mock_channel_layer, db, sample_patient, sample_encounter):
        """Should broadcast alert via WebSocket."""
        from hmis.apps.surveillance.models import (
            NotifiableCase,
            NotifiableDisease,
            SurveillanceAlert,
        )
        from hmis.apps.surveillance.services import SurveillanceService

        disease = NotifiableDisease.objects.create(
            name="Measles",
            icd10_codes="B05",
            category="IMMEDIATE",
            reporting_hours=24,
        )
        case = NotifiableCase.objects.create(
            disease=disease,
            patient=sample_patient,
            encounter=sample_encounter,
        )
        alert = SurveillanceAlert.objects.create(
            case=case,
            alert_type="NEW_CASE",
            message="Test alert",
        )

        # Mock channel layer
        mock_layer = MagicMock()
        mock_channel_layer.return_value = mock_layer

        SurveillanceService.broadcast_alert(alert)

        # Verify group_send was called
        mock_layer.group_send.assert_called_once()


# ============================================================================
# API ViewSet Tests
# ============================================================================


class TestNotifiableDiseaseAPI:
    """Tests for NotifiableDisease API endpoints."""

    def test_list_diseases_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/surveillance/diseases/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_diseases(self, authenticated_client, db):
        """Should list notifiable diseases."""
        from django.core.management import call_command

        call_command("seed_notifiable_diseases", verbosity=0)

        response = authenticated_client.get("/api/surveillance/diseases/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) > 0

    def test_filter_diseases_by_category(self, authenticated_client, db):
        """Should filter diseases by category."""
        from django.core.management import call_command

        call_command("seed_notifiable_diseases", verbosity=0)

        response = authenticated_client.get("/api/surveillance/diseases/?category=IMMEDIATE")

        assert response.status_code == status.HTTP_200_OK
        for disease in response.data["results"]:
            assert disease["category"] == "IMMEDIATE"

    def test_get_immediate_diseases(self, authenticated_client, db):
        """Should return only immediate diseases."""
        from django.core.management import call_command

        call_command("seed_notifiable_diseases", verbosity=0)

        response = authenticated_client.get("/api/surveillance/diseases/immediate/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) > 0


class TestNotifiableCaseAPI:
    """Tests for NotifiableCase API endpoints."""

    @pytest.fixture
    def cholera_disease(self, db):
        """Create cholera disease."""
        from hmis.apps.surveillance.models import NotifiableDisease

        return NotifiableDisease.objects.create(
            name="Cholera",
            icd10_codes="A00",
            category="IMMEDIATE",
            reporting_hours=24,
        )

    def test_list_cases_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/surveillance/cases/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_case(
        self, authenticated_client, cholera_disease, sample_patient, sample_encounter
    ):
        """Should create a notifiable case."""
        data = {
            "disease": cholera_disease.id,
            "patient": sample_patient.id,
            "encounter": sample_encounter.id,
            "severity": "MODERATE",
        }

        response = authenticated_client.post("/api/surveillance/cases/", data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["disease"] == cholera_disease.id

        # Verify case was created in DB with correct status
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.get(id=response.data["id"])
        assert case.notification_status == "PENDING"
        assert case.disease == cholera_disease
        assert case.onset_date == sample_encounter.encounter_date

    def test_onset_date_can_be_manually_overridden(
        self,
        authenticated_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Should allow manual override of onset_date after defaulting from encounter."""
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        assert case.onset_date == sample_encounter.encounter_date

        response = authenticated_client.patch(
            f"/api/surveillance/cases/{case.id}/",
            {"onset_date": "2026-01-15"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        case.refresh_from_db()
        assert str(case.onset_date) == "2026-01-15"

    def test_list_pending_cases(
        self, authenticated_client, cholera_disease, sample_patient, sample_encounter
    ):
        """Should list pending cases."""
        from hmis.apps.surveillance.models import NotifiableCase

        NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
        )

        response = authenticated_client.get("/api/surveillance/cases/pending/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    @patch("hmis.apps.surveillance.services.send_sms")
    def test_notify_county(
        self,
        mock_send_sms,
        authenticated_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Should mark case as notified."""
        from hmis.apps.surveillance.models import NotifiableCase, SurveillanceFacilitySettings

        mock_send_sms.return_value = True

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        SurveillanceFacilitySettings.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            notify_via_sms=True,
            sms_recipient="+254700123456",
        )

        response = authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/notify_county/",
            {"notification_notes": "Notified via phone"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["notification_status"] == "NOTIFIED"

    @patch("hmis.apps.surveillance.services.send_transactional_email")
    @patch("hmis.apps.surveillance.services.send_sms")
    def test_notify_county_dispatches_delivery_records(
        self,
        mock_send_sms,
        mock_send_transactional_email,
        authenticated_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Should create outbound county delivery records and dispatch channels."""
        from hmis.apps.surveillance.models import (
            CountyNotificationDelivery,
            NotifiableCase,
            SurveillanceFacilitySettings,
        )

        mock_send_sms.return_value = True
        mock_send_transactional_email.return_value = {
            "accepted": True,
            "provider": "resend",
            "provider_message_id": "email-123",
            "terminal_state": None,
        }

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        SurveillanceFacilitySettings.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            notify_via_sms=True,
            notify_via_email=True,
            sms_recipient="+254700123456",
            email_recipient="county.alerts@example.org",
        )

        response = authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/notify_county/",
            {"notification_notes": "Notified county desk"},
        )

        assert response.status_code == status.HTTP_200_OK
        case.refresh_from_db()
        assert case.notification_status == "NOTIFIED"
        deliveries = CountyNotificationDelivery.objects.filter(case=case).order_by("channel")
        assert deliveries.count() == 2
        assert {d.channel for d in deliveries} == {"SMS", "EMAIL"}
        assert set(deliveries.values_list("status", flat=True)) == {"SENT"}
        assert all(d.attempt_count == 1 for d in deliveries)
        email_call = mock_send_transactional_email.call_args
        assert email_call is not None
        assert email_call.kwargs["facility"] == sample_facility
        html_body = str(email_call.kwargs.get("html_body") or "")
        assert "Facility" in html_body
        assert sample_facility.name in html_body
        assert "Reported By" in html_body
        assert "ICD-10 Codes" in html_body
        assert "Acknowledge Receipt" in html_body
        assert case.disease.name in html_body
        assert "Notification Deadline" in html_body
        assert "View Case" not in html_body
        assert "/surveillance/cases/" not in html_body
        assert "review this case in Vitora HMIS" not in html_body

    @patch("hmis.apps.surveillance.services.send_transactional_email")
    def test_notify_county_email_only_returns_accepted_until_delivery_confirmation(
        self,
        mock_send_transactional_email,
        authenticated_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Email acceptance should keep case pending until provider confirms delivery."""
        from hmis.apps.surveillance.models import (
            CountyNotificationDelivery,
            NotifiableCase,
            SurveillanceFacilitySettings,
        )

        mock_send_transactional_email.return_value = {
            "accepted": True,
            "provider": "resend",
            "provider_message_id": "email-only-abc",
            "terminal_state": None,
        }

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        SurveillanceFacilitySettings.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            notify_via_sms=False,
            notify_via_email=True,
            email_recipient="county.alerts@example.org",
        )

        notify_response = authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/notify_county/",
            {"notification_notes": "Email only"},
        )

        assert notify_response.status_code == status.HTTP_202_ACCEPTED
        case.refresh_from_db()
        assert case.notification_status == "PENDING"

        delivery = CountyNotificationDelivery.objects.get(case=case, channel="EMAIL")
        assert delivery.status == "SENT"
        assert delivery.provider_message_id == "email-only-abc"

        payload = {
            "type": "email.delivered",
            "data": {"id": "email-only-abc"},
        }

        webhook_response = authenticated_client.post(
            "/api/surveillance/webhooks/email-delivery/",
            data=payload,
            format="json",
        )
        assert webhook_response.status_code == status.HTTP_200_OK

        case.refresh_from_db()
        delivery.refresh_from_db()
        assert delivery.status == "DELIVERED"
        assert case.notification_status == "NOTIFIED"

    @patch("hmis.apps.surveillance.services.send_transactional_email")
    def test_notify_county_webhook_accepts_svix_signature(
        self,
        mock_send_transactional_email,
        authenticated_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        settings,
    ):
        """Webhook should validate production-style Svix signatures."""
        from hmis.apps.surveillance.models import (
            CountyNotificationDelivery,
            NotifiableCase,
            SurveillanceFacilitySettings,
        )

        signing_key = b"svix-test-secret"
        secret = "whsec_" + base64.urlsafe_b64encode(signing_key).decode("utf-8").rstrip("=")
        settings.RESEND_WEBHOOK_SECRET = secret

        mock_send_transactional_email.return_value = {
            "accepted": True,
            "provider": "resend",
            "provider_message_id": "svix-email-abc",
            "terminal_state": None,
        }

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        SurveillanceFacilitySettings.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            notify_via_sms=False,
            notify_via_email=True,
            email_recipient="county.alerts@example.org",
        )

        authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/notify_county/",
            {"notification_notes": "Email only"},
        )
        delivery = CountyNotificationDelivery.objects.get(case=case, channel="EMAIL")

        payload = {"type": "email.delivered", "data": {"id": "svix-email-abc"}}
        body_text = json.dumps(payload)
        msg_id = "msg_123"
        timestamp = str(int(timezone.now().timestamp()))
        signed_content = f"{msg_id}.{timestamp}.{body_text}".encode()
        signature = base64.b64encode(
            hmac.new(signing_key, signed_content, hashlib.sha256).digest()
        ).decode("utf-8")

        webhook_response = authenticated_client.post(
            "/api/surveillance/webhooks/email-delivery/",
            data=body_text,
            content_type="application/json",
            HTTP_SVIX_ID=msg_id,
            HTTP_SVIX_TIMESTAMP=timestamp,
            HTTP_SVIX_SIGNATURE=f"v1,{signature}",
        )
        assert webhook_response.status_code == status.HTTP_200_OK

        delivery.refresh_from_db()
        case.refresh_from_db()
        assert delivery.status == "DELIVERED"
        assert case.notification_status == "NOTIFIED"

    def test_webhook_rejects_missing_secret_outside_development(self, api_client, settings):
        """A public webhook cannot be left unsigned in a deployed environment."""
        settings.TESTING = False
        settings.DEBUG = False
        settings.RESEND_WEBHOOK_SECRET = ""

        response = api_client.post(
            "/api/surveillance/webhooks/email-delivery/",
            {"type": "email.delivered", "data": {"id": "ignored"}},
            format="json",
        )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    def test_webhook_rejects_stale_svix_timestamp(self, api_client, settings):
        """Svix signatures are only accepted inside the configured freshness window."""
        signing_key = b"svix-test-secret"
        settings.RESEND_WEBHOOK_SECRET = "whsec_" + base64.urlsafe_b64encode(
            signing_key
        ).decode().rstrip("=")
        body = json.dumps({"type": "email.delivered", "data": {"id": "ignored"}})
        msg_id = "msg_stale"
        timestamp = "1"
        signature = base64.b64encode(
            hmac.new(signing_key, f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
        ).decode()

        response = api_client.post(
            "/api/surveillance/webhooks/email-delivery/",
            data=body,
            content_type="application/json",
            HTTP_SVIX_ID=msg_id,
            HTTP_SVIX_TIMESTAMP=timestamp,
            HTTP_SVIX_SIGNATURE=f"v1,{signature}",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @patch("hmis.apps.surveillance.services.send_transactional_email")
    def test_county_ack_link_marks_case_acknowledged(
        self,
        mock_send_transactional_email,
        authenticated_client,
        api_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Public county ack link should set case status to ACKNOWLEDGED."""
        from hmis.apps.surveillance.models import (
            CountyNotificationDelivery,
            NotifiableCase,
            SurveillanceFacilitySettings,
        )
        from hmis.apps.surveillance.services import SurveillanceService

        mock_send_transactional_email.return_value = {
            "accepted": True,
            "provider": "resend",
            "provider_message_id": "ack-link-email-1",
            "terminal_state": None,
        }

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        SurveillanceFacilitySettings.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            notify_via_sms=False,
            notify_via_email=True,
            email_recipient="county.alerts@example.org",
        )

        notify_response = authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/notify_county/",
            {"notification_notes": "Email only for ack"},
        )
        assert notify_response.status_code == status.HTTP_202_ACCEPTED

        delivery = CountyNotificationDelivery.objects.get(case=case, channel="EMAIL")
        ack_token = SurveillanceService.build_county_ack_token(delivery)
        ack_response = api_client.get(f"/api/surveillance/county-ack/{ack_token}/")

        assert ack_response.status_code == status.HTTP_200_OK
        case.refresh_from_db()
        delivery.refresh_from_db()
        assert case.notification_status == "ACKNOWLEDGED"
        assert delivery.status == "DELIVERED"
        assert delivery.provider_event == "county_acknowledged"

    @patch("hmis.apps.surveillance.services.send_sms")
    def test_retry_county_notifications_updates_failed_delivery(
        self,
        mock_send_sms,
        authenticated_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Should retry failed county deliveries and persist attempt history."""
        from hmis.apps.surveillance.models import (
            CountyNotificationDelivery,
            NotifiableCase,
            SurveillanceFacilitySettings,
        )

        # First attempt fails, retry succeeds
        mock_send_sms.side_effect = [False, True]

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        SurveillanceFacilitySettings.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            notify_via_sms=True,
            notify_via_email=False,
            sms_recipient="+254700123456",
            max_retry_attempts=3,
            retry_backoff_minutes=5,
        )

        notify_response = authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/notify_county/",
            {"notification_notes": "Initial county notify"},
        )
        assert notify_response.status_code == status.HTTP_502_BAD_GATEWAY

        case.refresh_from_db()
        assert case.notification_status == "PENDING"

        delivery = CountyNotificationDelivery.objects.get(case=case, channel="SMS")
        assert delivery.status == "RETRY_SCHEDULED"
        assert delivery.attempt_count == 1

        retry_response = authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/retry_county_notifications/"
        )
        assert retry_response.status_code == status.HTTP_200_OK

        delivery.refresh_from_db()
        assert delivery.status == "SENT"
        assert delivery.attempt_count == 2
        case.refresh_from_db()
        assert case.notification_status == "NOTIFIED"

    def test_case_notification_deliveries_endpoint(
        self,
        authenticated_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Should list delivery records for a notifiable case."""
        from hmis.apps.surveillance.models import CountyNotificationDelivery, NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        CountyNotificationDelivery.objects.create(
            case=case,
            facility=sample_facility,
            organization=sample_organization,
            channel="EMAIL",
            status="FAILED",
            recipient="county.alerts@example.org",
            attempt_count=1,
            max_retry_attempts=3,
            last_error="SMTP timeout",
        )

        response = authenticated_client.get(
            f"/api/surveillance/cases/{case.id}/notification_deliveries/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["channel"] == "EMAIL"
        assert response.data[0]["status"] == "FAILED"

    def test_mark_investigated_and_close_case_workflow(
        self,
        authenticated_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Should support explicit investigation and closure transitions."""
        from hmis.apps.surveillance.models import NotifiableCase, NotificationStatus

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
            notification_status=NotificationStatus.NOTIFIED,
        )

        investigated = authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/mark_investigated/",
            {"notes": "County has started field review"},
            format="json",
        )
        assert investigated.status_code == status.HTTP_200_OK
        assert investigated.data["notification_status"] == "INVESTIGATED"

        closed = authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/close_case/",
            {"notes": "Investigation complete"},
            format="json",
        )
        assert closed.status_code == status.HTTP_200_OK
        assert closed.data["notification_status"] == "CLOSED"

    def test_mark_investigated_requires_notified_or_acknowledged(
        self,
        authenticated_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Should block investigation transition from PENDING state."""
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )

        response = authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/mark_investigated/",
            {"notes": "Start now"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch("hmis.apps.surveillance.services.send_sms")
    def test_notify_county_accepts_notes_alias(
        self,
        mock_send_sms,
        authenticated_client,
        cholera_disease,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
    ):
        """Should accept notes alias for backward-compatible clients."""
        from hmis.apps.surveillance.models import NotifiableCase, SurveillanceFacilitySettings

        mock_send_sms.return_value = True

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
        )
        SurveillanceFacilitySettings.objects.create(
            facility=sample_facility,
            organization=sample_organization,
            notify_via_sms=True,
            sms_recipient="+254700123456",
        )

        response = authenticated_client.post(
            f"/api/surveillance/cases/{case.id}/notify_county/",
            {"notes": "Notified via facility hotline"},
        )

        assert response.status_code == status.HTTP_200_OK
        case.refresh_from_db()
        assert "Notified via facility hotline" in case.investigation_notes

    def test_case_detail_uses_full_names_for_reported_and_notified_by(
        self, authenticated_client, cholera_disease, sample_patient, sample_encounter
    ):
        """Should expose full names instead of raw usernames when available."""
        from hmis.apps.surveillance.models import NotifiableCase

        user = authenticated_client.handler._force_user
        user.first_name = "Amina"
        user.last_name = "Hassan"
        user.save(update_fields=["first_name", "last_name"])

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
            reported_by=user,
        )
        case.mark_notified(user=user)

        response = authenticated_client.get(f"/api/surveillance/cases/{case.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["reported_by_name"] == "Amina Hassan"
        assert response.data["notified_by_name"] == "Amina Hassan"

    def test_list_overdue_cases(
        self, authenticated_client, cholera_disease, sample_patient, sample_encounter
    ):
        """Should list overdue cases."""
        from hmis.apps.surveillance.models import NotifiableCase

        case = NotifiableCase.objects.create(
            disease=cholera_disease,
            patient=sample_patient,
            encounter=sample_encounter,
        )
        # Set deadline to past
        case.notification_deadline = timezone.now() - timedelta(hours=1)
        case.save()

        response = authenticated_client.get("/api/surveillance/cases/overdue/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1


class TestSurveillanceAlertAPI:
    """Tests for SurveillanceAlert API endpoints."""

    @pytest.fixture
    def sample_alert(
        self, db, sample_patient, sample_encounter, sample_facility, sample_organization
    ):
        """Create sample alert."""
        from hmis.apps.surveillance.models import (
            NotifiableCase,
            NotifiableDisease,
            SurveillanceAlert,
        )

        disease = NotifiableDisease.objects.create(
            name="Measles",
            icd10_codes="B05",
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
        return SurveillanceAlert.objects.create(
            case=case,
            alert_type="NEW_CASE",
            message="New measles case",
            facility=sample_facility,
            organization=sample_organization,
        )

    def test_list_alerts(self, authenticated_client, sample_alert):
        """Should list alerts."""
        response = authenticated_client.get("/api/surveillance/alerts/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_acknowledge_alert(self, authenticated_client, sample_alert):
        """Should acknowledge an alert."""
        response = authenticated_client.post(
            f"/api/surveillance/alerts/{sample_alert.id}/acknowledge/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_acknowledged"] is True

    def test_list_unacknowledged_alerts(self, authenticated_client, sample_alert):
        """Should list unacknowledged alerts."""
        response = authenticated_client.get("/api/surveillance/alerts/unacknowledged/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1


class TestSurveillanceSettingsAPI:
    """Tests for facility surveillance notification settings endpoints."""

    def test_get_current_settings(self, authenticated_client):
        """Should return (and create) current facility settings."""
        response = authenticated_client.get("/api/surveillance/settings/current/")

        assert response.status_code == status.HTTP_200_OK
        assert "notify_via_sms" in response.data
        assert "notify_via_email" in response.data
        assert "sms_recipient_masked" in response.data
        assert "email_recipient_masked" in response.data

    def test_patch_settings_with_recipients(self, authenticated_client):
        """Should store recipients while returning masked values only."""
        current = authenticated_client.get("/api/surveillance/settings/current/")
        settings_id = current.data["id"]

        response = authenticated_client.patch(
            f"/api/surveillance/settings/{settings_id}/",
            {
                "notify_via_sms": True,
                "notify_via_email": True,
                "sms_recipient": "+254700123456",
                "email_recipient": "county.alerts@example.org",
                "max_retry_attempts": 4,
                "retry_backoff_minutes": 10,
                "include_patient_identifiers": False,
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["notify_via_sms"] is True
        assert response.data["notify_via_email"] is True
        assert response.data["sms_recipient_masked"]
        assert response.data["email_recipient_masked"]


class TestSurveillanceDashboardAPI:
    """Tests for surveillance dashboard endpoint."""

    def test_dashboard_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/surveillance/dashboard/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_dashboard_returns_stats(self, authenticated_client, db):
        """Should return dashboard statistics."""
        response = authenticated_client.get("/api/surveillance/dashboard/")

        assert response.status_code == status.HTTP_200_OK
        assert "total_active_cases" in response.data
        assert "immediate_cases_pending" in response.data
        assert "overdue_notifications" in response.data
        assert "cases_today" in response.data
        assert "top_diseases" in response.data


class TestCountyReportAPI:
    """Tests for county report endpoint."""

    def test_county_report(self, authenticated_client, sample_county):
        """Should generate county report."""
        response = authenticated_client.get(f"/api/surveillance/reports/county/{sample_county.id}/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["county_id"] == sample_county.id
        assert "cases_by_disease" in response.data
        assert "total_cases" in response.data

    def test_county_report_not_found(self, authenticated_client):
        """Should return 404 for invalid county."""
        response = authenticated_client.get("/api/surveillance/reports/county/99999/")

        assert response.status_code == status.HTTP_404_NOT_FOUND


# ============================================================================
# Signal Tests
# ============================================================================


class TestSurveillanceSignals:
    """Tests for surveillance signals."""

    @pytest.fixture
    def cholera_disease(self, db):
        """Create cholera disease."""
        from hmis.apps.surveillance.models import NotifiableDisease

        return NotifiableDisease.objects.create(
            name="Cholera",
            icd10_codes="A00,A00.0,A00.1",
            category="IMMEDIATE",
            reporting_hours=24,
        )

    @pytest.fixture
    def cholera_icd10(self, db):
        """Create cholera ICD-10."""
        from hmis.apps.encounters.models import ICD10Code

        return ICD10Code.objects.create(
            code="A00",
            description="Cholera",
            category="Infectious diseases",
            chapter=1,
        )

    def test_auto_create_case_on_diagnosis(
        self, db, cholera_disease, cholera_icd10, sample_encounter
    ):
        """Should auto-create NotifiableCase when diagnosis matches."""
        from hmis.apps.encounters.models import Diagnosis
        from hmis.apps.surveillance.models import NotifiableCase

        # Create diagnosis with cholera ICD-10 code
        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=cholera_icd10,
            diagnosis_type="PRIMARY",
        )

        # Check that case was auto-created
        case = NotifiableCase.objects.filter(
            disease=cholera_disease,
            encounter=sample_encounter,
        ).first()

        assert case is not None
        assert case.disease.name == "Cholera"

    def test_no_case_for_non_notifiable_diagnosis(self, db, sample_encounter):
        """Should not create case for non-notifiable diagnosis."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code
        from hmis.apps.surveillance.models import NotifiableCase

        # Create non-notifiable ICD-10
        other_icd10 = ICD10Code.objects.create(
            code="Z00.0",
            description="General medical examination",
            category="Factors",
            chapter=21,
        )

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=other_icd10,
            diagnosis_type="PRIMARY",
        )

        assert NotifiableCase.objects.count() == 0

    def test_no_case_for_ruled_out_diagnosis(
        self, db, cholera_disease, cholera_icd10, sample_encounter
    ):
        """Should not create case for ruled out diagnosis."""
        from hmis.apps.encounters.models import Diagnosis
        from hmis.apps.surveillance.models import NotifiableCase

        diagnosis = Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=cholera_icd10,
            diagnosis_type="DIFFERENTIAL",
            certainty="ruled_out",
        )

        assert NotifiableCase.objects.count() == 0
