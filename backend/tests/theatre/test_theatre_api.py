"""
Tests for Theatre module API endpoints.

Covers:
- Operating Theatre CRUD
- Surgery Case CRUD + workflow actions
- Team member management
- WHO checklist endpoints
- Anesthesia record endpoints
- Operative note endpoints
- Consumable endpoints
- PACU endpoints
"""

from datetime import date, time

import pytest  # type: ignore
from rest_framework import status

THEATRES_URL = "/api/theatre/operating-theatres/"
CASES_URL = "/api/theatre/cases/"


def _case_url(case_number):
    return f"{CASES_URL}{case_number}/"


def _case_action_url(case_number, action):
    return f"{CASES_URL}{case_number}/{action}/"


# ═══════════════════════════════════════════════════════════════════════════
#  OperatingTheatre CRUD
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestOperatingTheatreAPI:
    def test_list_theatres(self, authenticated_client, sample_theatre):
        response = authenticated_client.get(THEATRES_URL)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_create_theatre_requires_manage_settings_permission(self, authenticated_client):
        data = {
            "code": "OT-NEW",
            "name": "New Operating Theatre",
            "theatre_type": "GENERAL",
            "location": "Block B",
        }
        response = authenticated_client.post(THEATRES_URL, data)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_theatre(self, authenticated_client, grant_theatre_settings_permission):
        data = {
            "code": "OT-NEW",
            "name": "New Operating Theatre",
            "theatre_type": "GENERAL",
            "location": "Block B",
        }
        response = authenticated_client.post(THEATRES_URL, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "OT-NEW"

    def test_retrieve_theatre(self, authenticated_client, sample_theatre):
        response = authenticated_client.get(f"{THEATRES_URL}{sample_theatre.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["code"] == "OT-01"

    def test_update_theatre_requires_manage_settings_permission(
        self, authenticated_client, sample_theatre
    ):
        response = authenticated_client.patch(
            f"{THEATRES_URL}{sample_theatre.id}/",
            {"name": "Updated Theatre"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_update_theatre(
        self, authenticated_client, sample_theatre, grant_theatre_settings_permission
    ):
        response = authenticated_client.patch(
            f"{THEATRES_URL}{sample_theatre.id}/",
            {"name": "Updated Theatre"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Theatre"

    def test_filter_by_theatre_type(self, authenticated_client, sample_theatre):
        response = authenticated_client.get(THEATRES_URL, {"theatre_type": "GENERAL"})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_search_by_name(self, authenticated_client, sample_theatre):
        response = authenticated_client.get(THEATRES_URL, {"search": "Theatre 1"})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_theatre_availability(self, authenticated_client, sample_theatre):
        today = str(date.today())
        response = authenticated_client.get(
            f"{THEATRES_URL}{sample_theatre.id}/availability/",
            {"date": today},
        )
        assert response.status_code == status.HTTP_200_OK
        assert "slots" in response.data
        assert isinstance(response.data["slots"], list)
        assert "integration_source" in response.data
        assert "scheduling_resource" in response.data
        assert response.data["has_resource_schedule"] is True
        assert response.data["integration_source"] == "scheduling_resource"

    def test_theatre_availability_missing_date(self, authenticated_client, sample_theatre):
        response = authenticated_client.get(f"{THEATRES_URL}{sample_theatre.id}/availability/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_unauthenticated_access_denied(self, api_client):
        response = api_client.get(THEATRES_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ═══════════════════════════════════════════════════════════════════════════
#  SurgeryCase CRUD
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestSurgeryCaseAPI:
    def test_list_cases(self, authenticated_client, sample_surgery_case):
        response = authenticated_client.get(CASES_URL)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_create_case(self, authenticated_client, surgery_case_data):
        response = authenticated_client.post(CASES_URL, surgery_case_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["case_number"].startswith("SURG-")
        assert response.data["status"] == "REQUESTED"

    def test_retrieve_case_by_case_number(self, authenticated_client, sample_surgery_case):
        response = authenticated_client.get(_case_url(sample_surgery_case.case_number))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["case_number"] == sample_surgery_case.case_number

    def test_filter_by_status(self, authenticated_client, sample_surgery_case):
        response = authenticated_client.get(CASES_URL, {"status": "REQUESTED"})
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert all(r["status"] == "REQUESTED" for r in results)

    def test_search_by_patient_name(self, authenticated_client, sample_surgery_case):
        response = authenticated_client.get(CASES_URL, {"search": "Jane"})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_daily_list(self, authenticated_client, sample_surgery_case):
        sample_surgery_case.schedule()
        response = authenticated_client.get(
            f"{CASES_URL}daily-list/",
            {"date": str(date.today())},
        )
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_unauthenticated_create_denied(self, api_client, surgery_case_data):
        response = api_client.post(CASES_URL, surgery_case_data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ═══════════════════════════════════════════════════════════════════════════
#  Workflow Actions
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestSurgeryCaseWorkflow:
    def test_schedule_case(self, authenticated_client, sample_surgery_case):
        url = _case_action_url(sample_surgery_case.case_number, "schedule")
        response = authenticated_client.post(url, {})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "SCHEDULED"

    def test_start_pre_op(self, authenticated_client, scheduled_surgery_case):
        url = _case_action_url(scheduled_surgery_case.case_number, "start-pre-op")
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "PRE_OP"

    def test_enter_theatre(self, authenticated_client, pre_op_surgery_case):
        url = _case_action_url(pre_op_surgery_case.case_number, "enter-theatre")
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_THEATRE"

    def test_start_surgery(self, authenticated_client, in_theatre_surgery_case):
        url = _case_action_url(in_theatre_surgery_case.case_number, "start-surgery")
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_SURGERY"

    def test_end_surgery(self, authenticated_client, in_surgery_case):
        url = _case_action_url(in_surgery_case.case_number, "end-surgery")
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PACU"

    def test_discharge(self, authenticated_client, in_pacu_surgery_case):
        url = _case_action_url(in_pacu_surgery_case.case_number, "discharge")
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "DISCHARGED"

    def test_cancel_case(self, authenticated_client, sample_surgery_case):
        url = _case_action_url(sample_surgery_case.case_number, "cancel")
        response = authenticated_client.post(url, {"reason": "Patient request"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_postpone_case(self, authenticated_client, scheduled_surgery_case):
        url = _case_action_url(scheduled_surgery_case.case_number, "postpone")
        response = authenticated_client.post(url, {"postponed_to_date": "2026-05-01"})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "POSTPONED"

    def test_invalid_transition_returns_error(self, authenticated_client, sample_surgery_case):
        """Cannot go directly from REQUESTED to IN_SURGERY."""
        url = _case_action_url(sample_surgery_case.case_number, "start-surgery")
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Cannot transition" in response.data["error"]


# ═══════════════════════════════════════════════════════════════════════════
#  Team Management
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestSurgicalTeamAPI:
    def test_list_team(self, authenticated_client, sample_surgery_case):
        url = _case_action_url(sample_surgery_case.case_number, "team")
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_add_team_member(
        self, authenticated_client, sample_surgery_case, test_user, theatre_shift
    ):
        url = _case_action_url(sample_surgery_case.case_number, "team/add")
        response = authenticated_client.post(
            url,
            {
                "staff_member": test_user.id,
                "role": "LEAD_SURGEON",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["role"] == "LEAD_SURGEON"

    def test_add_team_member_requires_shift_coverage(
        self, authenticated_client, sample_surgery_case, test_user
    ):
        url = _case_action_url(sample_surgery_case.case_number, "team/add")
        response = authenticated_client.post(
            url,
            {
                "staff_member": test_user.id,
                "role": "LEAD_SURGEON",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "staff_member" in response.data

    def test_remove_team_member(self, authenticated_client, sample_surgery_case, test_user):
        from hmis.apps.theatre.models import SurgicalTeamMember

        member = SurgicalTeamMember.objects.create(
            surgery_case=sample_surgery_case,
            staff_member=test_user,
            role="SCRUB_NURSE",
        )
        url = f"{_case_url(sample_surgery_case.case_number)}team/{member.pk}/"
        response = authenticated_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_case_scheduling_context(
        self, authenticated_client, sample_surgery_case, test_user, theatre_shift
    ):
        add_url = _case_action_url(sample_surgery_case.case_number, "team/add")
        authenticated_client.post(
            add_url,
            {
                "staff_member": test_user.id,
                "role": "LEAD_SURGEON",
            },
        )
        context_url = _case_action_url(sample_surgery_case.case_number, "scheduling-context")
        response = authenticated_client.get(context_url)
        assert response.status_code == status.HTTP_200_OK
        assert (
            response.data["theatre"]["scheduling_resource_id"]
            == sample_surgery_case.theatre.scheduling_resource_id
        )
        assert response.data["team_summary"]["coverage_complete"] is True


# ═══════════════════════════════════════════════════════════════════════════
#  WHO Checklist
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestWHOChecklistAPI:
    def test_get_checklist_not_found(self, authenticated_client, sample_surgery_case):
        url = _case_action_url(sample_surgery_case.case_number, "who-checklist")
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_complete_sign_in(self, authenticated_client, sample_surgery_case):
        url = _case_action_url(sample_surgery_case.case_number, "who-checklist/sign-in")
        data = {
            "patient_identity_confirmed": True,
            "procedure_site_marked": True,
            "consent_signed": True,
            "anesthesia_machine_checked": True,
            "pulse_oximeter_attached": True,
            "allergies_reviewed": True,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["sign_in_complete"] is True

    def test_time_out_requires_sign_in(self, authenticated_client, sample_surgery_case):
        """Time-Out should fail if Sign-In not completed."""
        url = _case_action_url(sample_surgery_case.case_number, "who-checklist/time-out")
        data = {
            "team_members_introduced": True,
            "patient_name_confirmed": True,
            "procedure_confirmed": True,
            "site_confirmed": True,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_complete_time_out_after_sign_in(self, authenticated_client, sample_surgery_case):
        # First complete sign-in
        sign_in_url = _case_action_url(sample_surgery_case.case_number, "who-checklist/sign-in")
        authenticated_client.post(
            sign_in_url,
            {
                "patient_identity_confirmed": True,
                "procedure_site_marked": True,
                "consent_signed": True,
                "anesthesia_machine_checked": True,
                "pulse_oximeter_attached": True,
                "allergies_reviewed": True,
            },
        )
        # Now time-out
        time_out_url = _case_action_url(sample_surgery_case.case_number, "who-checklist/time-out")
        data = {
            "team_members_introduced": True,
            "patient_name_confirmed": True,
            "procedure_confirmed": True,
            "site_confirmed": True,
        }
        response = authenticated_client.post(time_out_url, data)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["time_out_complete"] is True

    def test_complete_sign_out_after_time_out(self, authenticated_client, sample_surgery_case):
        # Complete sign-in
        sign_in_url = _case_action_url(sample_surgery_case.case_number, "who-checklist/sign-in")
        authenticated_client.post(
            sign_in_url,
            {
                "patient_identity_confirmed": True,
                "procedure_site_marked": True,
                "consent_signed": True,
                "anesthesia_machine_checked": True,
                "pulse_oximeter_attached": True,
                "allergies_reviewed": True,
            },
        )
        # Complete time-out
        time_out_url = _case_action_url(sample_surgery_case.case_number, "who-checklist/time-out")
        authenticated_client.post(
            time_out_url,
            {
                "team_members_introduced": True,
                "patient_name_confirmed": True,
                "procedure_confirmed": True,
                "site_confirmed": True,
            },
        )
        # Complete sign-out
        sign_out_url = _case_action_url(sample_surgery_case.case_number, "who-checklist/sign-out")
        data = {
            "procedure_name_recorded": True,
            "instrument_count_correct": True,
            "sponge_count_correct": True,
            "needle_count_correct": True,
        }
        response = authenticated_client.post(sign_out_url, data)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["sign_out_complete"] is True


# ═══════════════════════════════════════════════════════════════════════════
#  Anesthesia Record
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestAnesthesiaRecordAPI:
    def test_get_anesthesia_not_found(self, authenticated_client, sample_surgery_case):
        url = _case_action_url(sample_surgery_case.case_number, "anesthesia")
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_anesthesia_record(self, authenticated_client, sample_surgery_case, test_user):
        url = _case_action_url(sample_surgery_case.case_number, "anesthesia/create")
        data = {
            "anesthesiologist": test_user.id,
            "mallampati_class": "II",
            "npo_confirmed": True,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["mallampati_class"] == "II"

    def test_create_anesthesia_requires_manage_theatre_permission(
        self, theatre_permissionless_client, sample_surgery_case, another_user
    ):
        url = _case_action_url(sample_surgery_case.case_number, "anesthesia/create")
        response = theatre_permissionless_client.post(url, {"anesthesiologist": another_user.id})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_create_duplicate_fails(self, authenticated_client, sample_surgery_case, test_user):
        url = _case_action_url(sample_surgery_case.case_number, "anesthesia/create")
        data = {"anesthesiologist": test_user.id}
        authenticated_client.post(url, data)
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_add_intraop_vital(self, authenticated_client, sample_surgery_case, test_user):
        from django.utils import timezone

        # Create anesthesia record first
        create_url = _case_action_url(sample_surgery_case.case_number, "anesthesia/create")
        authenticated_client.post(create_url, {"anesthesiologist": test_user.id})
        # Add vital reading
        vitals_url = _case_action_url(sample_surgery_case.case_number, "anesthesia/vitals")
        data = {
            "recorded_at": timezone.now().isoformat(),
            "recorded_by": test_user.id,
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "heart_rate": 72,
            "spo2": 98,
        }
        response = authenticated_client.post(vitals_url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["systolic_bp"] == 120


# ═══════════════════════════════════════════════════════════════════════════
#  Operative Note
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestOperativeNoteAPI:
    def test_create_operative_note(self, authenticated_client, sample_surgery_case, test_user):
        url = _case_action_url(sample_surgery_case.case_number, "operative-note/create")
        data = {
            "dictated_by": test_user.id,
            "pre_operative_diagnosis": "Acute appendicitis",
            "post_operative_diagnosis": "Acute appendicitis confirmed",
            "procedure_performed": "Laparoscopic appendectomy",
            "findings": "Inflamed appendix",
            "technique_description": "Standard 3-port technique",
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["pre_operative_diagnosis"] == "Acute appendicitis"

    def test_create_operative_note_requires_document_surgery_permission(
        self, theatre_permissionless_client, sample_surgery_case, another_user
    ):
        url = _case_action_url(sample_surgery_case.case_number, "operative-note/create")
        response = theatre_permissionless_client.post(
            url,
            {
                "dictated_by": another_user.id,
                "pre_operative_diagnosis": "Acute appendicitis",
                "post_operative_diagnosis": "Acute appendicitis confirmed",
                "procedure_performed": "Laparoscopic appendectomy",
                "findings": "Inflamed appendix",
                "technique_description": "Standard 3-port technique",
            },
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_sign_operative_note(self, authenticated_client, sample_surgery_case, test_user):
        from hmis.apps.theatre.models import OperativeNote

        OperativeNote.objects.create(
            surgery_case=sample_surgery_case,
            dictated_by=test_user,
            pre_operative_diagnosis="Test",
            post_operative_diagnosis="Test",
            procedure_performed="Test",
            findings="Test",
            technique_description="Test",
        )
        url = _case_action_url(sample_surgery_case.case_number, "operative-note/sign")
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["signed_at"] is not None

    def test_get_operative_note(self, authenticated_client, sample_surgery_case, test_user):
        from hmis.apps.theatre.models import OperativeNote

        OperativeNote.objects.create(
            surgery_case=sample_surgery_case,
            dictated_by=test_user,
            pre_operative_diagnosis="Test",
            post_operative_diagnosis="Test",
            procedure_performed="Test",
            findings="Test",
            technique_description="Test",
        )
        url = _case_action_url(sample_surgery_case.case_number, "operative-note")
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK


# ═══════════════════════════════════════════════════════════════════════════
#  PACU
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestPACURecordAPI:
    def test_create_pacu_record(self, authenticated_client, in_pacu_surgery_case, test_user):
        from django.utils import timezone

        url = _case_action_url(in_pacu_surgery_case.case_number, "pacu/create")
        data = {
            "arrival_time": timezone.now().isoformat(),
            "arriving_nurse": test_user.id,
            "initial_aldrete_score": 7,
            "initial_pain_score": 4,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["initial_aldrete_score"] == 7

    def test_add_pacu_vital(self, authenticated_client, in_pacu_surgery_case, test_user):
        from django.utils import timezone

        from hmis.apps.theatre.models import PACURecord

        # Create PACU record first
        PACURecord.objects.create(
            surgery_case=in_pacu_surgery_case,
            arrival_time=timezone.now(),
            arriving_nurse=test_user,
            initial_aldrete_score=7,
        )
        url = _case_action_url(in_pacu_surgery_case.case_number, "pacu/vitals")
        data = {
            "recorded_at": timezone.now().isoformat(),
            "recorded_by": test_user.id,
            "heart_rate": 78,
            "spo2": 97,
            "aldrete_score": 8,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED

    def test_discharge_pacu(self, authenticated_client, in_pacu_surgery_case, test_user):
        from django.utils import timezone

        from hmis.apps.theatre.models import PACURecord

        PACURecord.objects.create(
            surgery_case=in_pacu_surgery_case,
            arrival_time=timezone.now(),
            arriving_nurse=test_user,
            initial_aldrete_score=7,
        )
        url = _case_action_url(in_pacu_surgery_case.case_number, "pacu/discharge")
        data = {
            "discharge_aldrete_score": 9,
            "discharge_destination": "WARD",
            "discharge_notes": "Stable for ward transfer",
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["discharge_aldrete_score"] == 9
        # Case should now be DISCHARGED
        in_pacu_surgery_case.refresh_from_db()
        assert in_pacu_surgery_case.status == "DISCHARGED"
