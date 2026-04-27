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

from datetime import date, datetime, time
from decimal import Decimal

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

    def test_filter_cases_by_patient_id_alias(
        self,
        authenticated_client,
        sample_surgery_case,
        sample_county,
        sample_sub_county,
    ):
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.patients.models import Patient
        from hmis.apps.theatre.models import SurgeryCase

        other_patient = Patient.objects.create(
            first_name="Other",
            last_name="Surgery",
            date_of_birth="1985-02-14",
            gender="M",
            county=sample_county,
            sub_county=sample_sub_county,
            organization=sample_surgery_case.organization,
            registered_at_facility=sample_surgery_case.facility,
        )
        other_encounter = Encounter.objects.create(
            patient=other_patient,
            encounter_type="PROCEDURE",
            chief_complaint="Other surgery",
            organization=sample_surgery_case.organization,
            facility=sample_surgery_case.facility,
        )
        SurgeryCase.objects.create(
            patient=other_patient,
            encounter=other_encounter,
            primary_procedure=sample_surgery_case.primary_procedure,
            theatre=sample_surgery_case.theatre,
            scheduled_date=sample_surgery_case.scheduled_date,
            scheduled_start_time=time(11, 0),
            estimated_duration_minutes=90,
            priority=sample_surgery_case.priority,
            diagnosis="Other patient surgery",
            laterality=sample_surgery_case.laterality,
            asa_class=sample_surgery_case.asa_class,
            anesthesia_type=sample_surgery_case.anesthesia_type,
            requesting_doctor=sample_surgery_case.requesting_doctor,
            organization=sample_surgery_case.organization,
            facility=sample_surgery_case.facility,
        )

        response = authenticated_client.get(
            CASES_URL,
            {"patient_id": sample_surgery_case.patient_id},
        )

        assert response.status_code == status.HTTP_200_OK
        case_numbers = {item["case_number"] for item in response.data["results"]}
        assert sample_surgery_case.case_number in case_numbers
        assert all(
            item["patient"] == sample_surgery_case.patient_id for item in response.data["results"]
        )

    def test_filter_cases_by_encounter_id_alias(self, authenticated_client, sample_surgery_case):
        response = authenticated_client.get(
            CASES_URL,
            {"encounter_id": sample_surgery_case.encounter_id},
        )

        assert response.status_code == status.HTTP_200_OK
        case_numbers = {item["case_number"] for item in response.data["results"]}
        assert case_numbers == {sample_surgery_case.case_number}

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
        # Add vital reading — recorded_by is auto-set from request.user
        vitals_url = _case_action_url(sample_surgery_case.case_number, "anesthesia/vitals")
        data = {
            "recorded_at": timezone.now().isoformat(),
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "heart_rate": 72,
            "spo2": 98,
        }
        response = authenticated_client.post(vitals_url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["systolic_bp"] == 120
        assert response.data["recorded_by"] == test_user.id


@pytest.mark.django_db
class TestIntraOpVitalsAPI:
    """Comprehensive tests for intra-operative vital readings."""

    def _create_anesthesia(self, client, case_number, user_id):
        url = _case_action_url(case_number, "anesthesia/create")
        return client.post(url, {"anesthesiologist": user_id})

    def _vitals_url(self, case_number):
        return _case_action_url(case_number, "anesthesia/vitals")

    # -- B3: recorded_by auto-set from request.user -----------------------

    def test_recorded_by_auto_set(self, authenticated_client, sample_surgery_case, test_user):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        data = {
            "recorded_at": timezone.now().isoformat(),
            "heart_rate": 80,
        }
        response = authenticated_client.post(
            self._vitals_url(sample_surgery_case.case_number), data
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["recorded_by"] == test_user.id

    def test_client_cannot_spoof_recorded_by(
        self, authenticated_client, sample_surgery_case, test_user
    ):
        """Sending recorded_by in payload should be ignored."""
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        data = {
            "recorded_at": timezone.now().isoformat(),
            "heart_rate": 80,
            "recorded_by": 9999,  # should be ignored
        }
        response = authenticated_client.post(
            self._vitals_url(sample_surgery_case.case_number), data
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["recorded_by"] == test_user.id

    # -- B1: Vital range validation ----------------------------------------

    def test_heart_rate_out_of_range_rejected(
        self, authenticated_client, sample_surgery_case, test_user
    ):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {"recorded_at": timezone.now().isoformat(), "heart_rate": 500}
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "heart_rate" in response.data

    def test_spo2_over_100_rejected(self, authenticated_client, sample_surgery_case, test_user):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {"recorded_at": timezone.now().isoformat(), "spo2": 105}
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "spo2" in response.data

    def test_diastolic_gte_systolic_rejected(
        self, authenticated_client, sample_surgery_case, test_user
    ):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {
            "recorded_at": timezone.now().isoformat(),
            "systolic_bp": 100,
            "diastolic_bp": 110,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "diastolic_bp" in response.data

    def test_fio2_below_21_rejected(self, authenticated_client, sample_surgery_case, test_user):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {"recorded_at": timezone.now().isoformat(), "fio2": 15}
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "fio2" in response.data

    def test_pain_score_over_10_rejected(
        self, authenticated_client, sample_surgery_case, test_user
    ):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {"recorded_at": timezone.now().isoformat(), "pain_score": 15}
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "pain_score" in response.data

    def test_valid_ranges_accepted(self, authenticated_client, sample_surgery_case, test_user):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {
            "recorded_at": timezone.now().isoformat(),
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "heart_rate": 72,
            "spo2": 98,
            "etco2": 35,
            "fio2": 50,
            "tidal_volume": 500,
            "peak_pressure": 20,
            "temperature": 36.5,
            "cvp": 8,
            "bis_index": 45,
            "tof_count": 2,
            "blood_glucose": 6.5,
            "pain_score": 3,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED

    # -- B2: Critical alerting ---------------------------------------------

    def test_critical_vitals_flagged(self, authenticated_client, sample_surgery_case, test_user):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {
            "recorded_at": timezone.now().isoformat(),
            "spo2": 85,
            "heart_rate": 35,
            "systolic_bp": 70,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["has_critical_vitals"] is True
        assert len(response.data["alerts"]) == 3

    def test_normal_vitals_no_alerts(self, authenticated_client, sample_surgery_case, test_user):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {
            "recorded_at": timezone.now().isoformat(),
            "spo2": 98,
            "heart_rate": 72,
            "systolic_bp": 120,
            "diastolic_bp": 80,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["has_critical_vitals"] is False
        assert response.data["alerts"] == []

    def test_mean_arterial_pressure_computed(
        self, authenticated_client, sample_surgery_case, test_user
    ):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {
            "recorded_at": timezone.now().isoformat(),
            "systolic_bp": 120,
            "diastolic_bp": 80,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        # MAP = (120 + 2*80) / 3 = 93.3
        assert response.data["mean_arterial_pressure"] == 93.3

    # -- B4: Update vital --------------------------------------------------

    def test_update_intraop_vital(self, authenticated_client, sample_surgery_case, test_user):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        create_data = {
            "recorded_at": timezone.now().isoformat(),
            "heart_rate": 72,
        }
        create_resp = authenticated_client.post(url, create_data)
        vital_id = create_resp.data["id"]

        update_url = f"{CASES_URL}{sample_surgery_case.case_number}/anesthesia/vitals/{vital_id}/"
        response = authenticated_client.patch(update_url, {"heart_rate": 80})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["heart_rate"] == 80

    def test_update_nonexistent_vital_returns_404(
        self, authenticated_client, sample_surgery_case, test_user
    ):
        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = f"{CASES_URL}{sample_surgery_case.case_number}/anesthesia/vitals/99999/"
        response = authenticated_client.patch(url, {"heart_rate": 80})
        assert response.status_code == status.HTTP_404_NOT_FOUND

    # -- B4: Delete vital --------------------------------------------------

    def test_delete_intraop_vital(self, authenticated_client, sample_surgery_case, test_user):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        create_data = {
            "recorded_at": timezone.now().isoformat(),
            "heart_rate": 72,
        }
        create_resp = authenticated_client.post(url, create_data)
        vital_id = create_resp.data["id"]

        delete_url = (
            f"{CASES_URL}{sample_surgery_case.case_number}/anesthesia/vitals/{vital_id}/delete/"
        )
        response = authenticated_client.delete(delete_url)
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify deleted
        list_resp = authenticated_client.get(url)
        assert list_resp.status_code == status.HTTP_200_OK
        assert len(list_resp.data) == 0

    # -- B8: Bulk create ---------------------------------------------------

    def test_bulk_add_vitals(self, authenticated_client, sample_surgery_case, test_user):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        bulk_url = _case_action_url(sample_surgery_case.case_number, "anesthesia/vitals/bulk")
        now = timezone.now()
        data = [
            {
                "recorded_at": (now - timezone.timedelta(minutes=10)).isoformat(),
                "heart_rate": 72,
                "spo2": 98,
            },
            {
                "recorded_at": (now - timezone.timedelta(minutes=5)).isoformat(),
                "heart_rate": 75,
                "spo2": 97,
            },
            {
                "recorded_at": now.isoformat(),
                "heart_rate": 78,
                "spo2": 96,
            },
        ]
        response = authenticated_client.post(bulk_url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data) == 3
        assert all(v["recorded_by"] == test_user.id for v in response.data)

    def test_bulk_add_rejects_non_list(self, authenticated_client, sample_surgery_case, test_user):
        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        bulk_url = _case_action_url(sample_surgery_case.case_number, "anesthesia/vitals/bulk")
        response = authenticated_client.post(bulk_url, {"heart_rate": 72}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # -- B5: Audit logging -------------------------------------------------

    def test_add_vital_creates_audit_log(
        self, authenticated_client, sample_surgery_case, test_user
    ):
        from django.utils import timezone

        from hmis.apps.core.models import AuditLog

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {"recorded_at": timezone.now().isoformat(), "heart_rate": 72}
        authenticated_client.post(url, data)

        assert AuditLog.objects.filter(
            action="intraop_vital_create",
            resource_type="IntraOpVitalReading",
        ).exists()

    # -- B6: Domain events -------------------------------------------------

    def test_create_vital_publishes_domain_event(
        self, authenticated_client, sample_surgery_case, test_user, mocker
    ):
        from django.utils import timezone

        mock_publish = mocker.patch("hmis.apps.theatre.signals.publish_event")
        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {"recorded_at": timezone.now().isoformat(), "heart_rate": 72, "spo2": 98}
        authenticated_client.post(url, data)

        # Check that INTRAOP_VITAL_RECORDED event was published
        vital_calls = [
            c
            for c in mock_publish.call_args_list
            if c.kwargs.get("event_type", c.args[0] if c.args else "")
            == "theatre.intraop_vital.recorded"
        ]
        assert len(vital_calls) >= 1

    # -- B7: Extended fields -----------------------------------------------

    def test_extended_fields_stored_and_returned(
        self, authenticated_client, sample_surgery_case, test_user
    ):
        from django.utils import timezone

        self._create_anesthesia(authenticated_client, sample_surgery_case.case_number, test_user.id)
        url = self._vitals_url(sample_surgery_case.case_number)
        data = {
            "recorded_at": timezone.now().isoformat(),
            "cvp": 8,
            "bis_index": 45,
            "tof_count": 2,
            "blood_glucose": 6.5,
            "pain_score": 3,
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["cvp"] == 8
        assert response.data["bis_index"] == 45
        assert response.data["tof_count"] == 2
        assert float(response.data["blood_glucose"]) == 6.5
        assert response.data["pain_score"] == 3

    # -- No anesthesia record guard ----------------------------------------

    def test_add_vital_without_anesthesia_record_returns_404(
        self, authenticated_client, sample_surgery_case
    ):
        from django.utils import timezone

        url = self._vitals_url(sample_surgery_case.case_number)
        data = {"recorded_at": timezone.now().isoformat(), "heart_rate": 72}
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestTheatreReportingAPI:
    def test_reports_summary_returns_utilization_turnaround_and_throughput(
        self,
        authenticated_client,
        sample_surgery_case,
        sample_theatre_2,
        sample_patient,
        sample_encounter,
        sample_procedure_catalog,
        test_user,
        sample_organization,
        sample_facility,
        django_user_model,
    ):
        from django.utils import timezone

        from hmis.apps.theatre.models import (
            AnesthesiaRecord,
            OperativeNote,
            SurgeryCase,
            SurgicalTeamMember,
        )

        lead_surgeon = django_user_model.objects.create_user(
            username="lead-surgeon",
            email="lead-surgeon@example.com",
            password="password123",
            first_name="Lead",
            last_name="Surgeon",
        )
        second_surgeon = django_user_model.objects.create_user(
            username="second-surgeon",
            email="second-surgeon@example.com",
            password="password123",
            first_name="Second",
            last_name="Surgeon",
        )
        anesthesiologist = django_user_model.objects.create_user(
            username="theatre-anesthetist",
            email="anesthetist@example.com",
            password="password123",
            first_name="Ana",
            last_name="Esthetist",
        )

        sample_surgery_case.scheduled_start_time = time(9, 0)
        sample_surgery_case.estimated_duration_minutes = 60
        sample_surgery_case.save(
            update_fields=["scheduled_start_time", "estimated_duration_minutes"]
        )
        sample_surgery_case.schedule(user=test_user)
        sample_surgery_case.start_pre_op(user=test_user)
        sample_surgery_case.enter_theatre(user=test_user)
        sample_surgery_case.start_surgery(user=test_user)
        sample_surgery_case.end_surgery(user=test_user)
        sample_surgery_case.discharge(user=test_user)

        OperativeNote.objects.create(
            surgery_case=sample_surgery_case,
            dictated_by=test_user,
            incision_time=timezone.make_aware(datetime.combine(date.today(), time(9, 5))),
            closure_time=timezone.make_aware(datetime.combine(date.today(), time(9, 50))),
            pre_operative_diagnosis="Acute appendicitis",
            post_operative_diagnosis="Acute appendicitis confirmed",
            procedure_performed="Appendectomy",
            findings="Inflamed appendix",
            technique_description="Standard open appendectomy",
            estimated_blood_loss=50,
        )
        SurgicalTeamMember.objects.create(
            surgery_case=sample_surgery_case,
            staff_member=lead_surgeon,
            role="LEAD_SURGEON",
        )
        AnesthesiaRecord.objects.create(
            surgery_case=sample_surgery_case,
            anesthesiologist=anesthesiologist,
            induction_time=timezone.make_aware(datetime.combine(date.today(), time(8, 58))),
        )

        follow_up_case = SurgeryCase.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            primary_procedure=sample_procedure_catalog,
            theatre=sample_surgery_case.theatre,
            scheduled_date=date.today(),
            scheduled_start_time=time(10, 30),
            estimated_duration_minutes=45,
            priority="URGENT",
            diagnosis="Follow-up abdominal washout",
            requesting_doctor=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        follow_up_case.schedule(user=test_user)
        SurgicalTeamMember.objects.create(
            surgery_case=follow_up_case,
            staff_member=second_surgeon,
            role="LEAD_SURGEON",
        )
        AnesthesiaRecord.objects.create(
            surgery_case=follow_up_case,
            anesthesiologist=anesthesiologist,
            induction_time=timezone.make_aware(datetime.combine(date.today(), time(10, 50))),
        )

        second_theatre_case = SurgeryCase.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            primary_procedure=sample_procedure_catalog,
            theatre=sample_theatre_2,
            scheduled_date=date.today(),
            scheduled_start_time=time(11, 0),
            estimated_duration_minutes=30,
            priority="ELECTIVE",
            diagnosis="Day-case procedure",
            requesting_doctor=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        second_theatre_case.schedule(user=test_user)

        response = authenticated_client.get(
            f"{CASES_URL}reports/summary/",
            {"date_from": str(date.today()), "date_to": str(date.today())},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["totals"]["case_count"] == 3
        assert response.data["totals"]["completed_case_count"] == 1
        assert response.data["totals"]["scheduled_minutes"] == 135
        assert response.data["turnaround"]["cases_with_measurement_count"] == 1
        assert response.data["turnaround"]["average_minutes"] == 40.0
        assert response.data["on_time_starts"]["measured_case_count"] == 2
        assert response.data["on_time_starts"]["on_time_case_count"] == 1
        assert response.data["on_time_starts"]["late_case_count"] == 1
        assert response.data["on_time_starts"]["threshold_minutes"] == 15
        assert response.data["on_time_starts"]["percent"] == 50.0
        assert len(response.data["throughput_by_day"]) == 1
        assert response.data["throughput_by_day"][0]["case_count"] == 3
        theatre_codes = {item["theatre_code"] for item in response.data["utilization_by_theatre"]}
        assert {sample_surgery_case.theatre.code, sample_theatre_2.code}.issubset(theatre_codes)
        surgeon_workload = {
            item["clinician_name"]: item for item in response.data["surgeon_workload"]
        }
        assert surgeon_workload[lead_surgeon.get_full_name()]["case_count"] == 1
        assert surgeon_workload[second_surgeon.get_full_name()]["case_count"] == 1
        assert surgeon_workload[test_user.get_full_name() or test_user.username]["case_count"] == 1
        anesthesiologist_workload = {
            item["clinician_name"]: item for item in response.data["anesthesiologist_workload"]
        }
        assert anesthesiologist_workload[anesthesiologist.get_full_name()]["case_count"] == 2

    def test_reports_summary_uses_requesting_doctor_when_no_lead_surgeon_is_assigned(
        self,
        authenticated_client,
        sample_surgery_case,
        test_user,
    ):
        sample_surgery_case.schedule(user=test_user)

        response = authenticated_client.get(
            f"{CASES_URL}reports/summary/",
            {"date_from": str(date.today()), "date_to": str(date.today())},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["surgeon_workload"][0]["clinician_name"] == (
            test_user.get_full_name() or test_user.username
        )
        assert response.data["surgeon_workload"][0]["case_count"] == 1


@pytest.mark.django_db
class TestTheatreConsumableStockAPI:
    def test_add_consumable_deducts_stock_and_sets_cost(
        self,
        authenticated_client,
        sample_surgery_case,
        theatre_stock_drug,
        theatre_stock_batch,
    ):
        url = _case_action_url(sample_surgery_case.case_number, "consumables/add")
        response = authenticated_client.post(
            url,
            {
                "item": theatre_stock_drug.id,
                "quantity_used": 5,
                "is_implant": False,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        theatre_stock_batch.refresh_from_db()
        assert theatre_stock_batch.quantity_available == 15
        assert theatre_stock_batch.quantity_dispensed == 5
        assert Decimal(response.data["unit_cost"]) == Decimal("950.00")
        assert response.data["lot_number"] == theatre_stock_batch.batch_number
        assert response.data["total_cost"] == "4750.00"
        assert response.data["allocation_count"] == 1

    def test_remove_consumable_restores_stock(
        self,
        authenticated_client,
        sample_surgery_case,
        theatre_stock_drug,
        theatre_stock_batch,
    ):
        add_url = _case_action_url(sample_surgery_case.case_number, "consumables/add")
        add_response = authenticated_client.post(
            add_url,
            {
                "item": theatre_stock_drug.id,
                "quantity_used": 4,
            },
        )
        consumable_id = add_response.data["id"]

        remove_response = authenticated_client.delete(
            f"{_case_url(sample_surgery_case.case_number)}consumables/{consumable_id}/"
        )

        assert remove_response.status_code == status.HTTP_204_NO_CONTENT
        theatre_stock_batch.refresh_from_db()
        assert theatre_stock_batch.quantity_available == 20
        assert theatre_stock_batch.quantity_dispensed == 0

    def test_add_consumable_rejects_insufficient_stock(
        self,
        authenticated_client,
        sample_surgery_case,
        theatre_stock_drug,
        theatre_stock_batch,
    ):
        url = _case_action_url(sample_surgery_case.case_number, "consumables/add")
        response = authenticated_client.post(
            url,
            {
                "item": theatre_stock_drug.id,
                "quantity_used": 999,
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        theatre_stock_batch.refresh_from_db()
        assert theatre_stock_batch.quantity_available == 20


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

    def test_download_operative_note_pdf(
        self, authenticated_client, sample_surgery_case, test_user
    ):
        from hmis.apps.theatre.models import OperativeNote

        OperativeNote.objects.create(
            surgery_case=sample_surgery_case,
            dictated_by=test_user,
            pre_operative_diagnosis="Acute appendicitis",
            post_operative_diagnosis="Acute appendicitis confirmed",
            procedure_performed="Laparoscopic appendectomy",
            findings="Inflamed appendix",
            technique_description="Standard 3-port technique",
        )

        url = _case_action_url(sample_surgery_case.case_number, "operative-note/pdf")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/pdf"
        assert "operative-note" in response["Content-Disposition"]


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

        from hmis.apps.theatre.models import PACURecord, PACUVitalReading

        record = PACURecord.objects.create(
            surgery_case=in_pacu_surgery_case,
            arrival_time=timezone.now(),
            arriving_nurse=test_user,
            initial_aldrete_score=7,
        )
        PACUVitalReading.objects.create(
            pacu_record=record,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            heart_rate=78,
            spo2=98,
            aldrete_score=9,
        )
        url = _case_action_url(in_pacu_surgery_case.case_number, "pacu/discharge")
        data = {
            "discharge_aldrete_score": 9,
            "discharge_destination": "WARD",
            "discharge_notes": "Stable for ward transfer",
            "handover_given_to": "Ward nurse",
            "handover_notes": "Continue monitoring, analgesia charted.",
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["discharge_aldrete_score"] == 9
        assert response.data["handover_given_to"] == "Ward nurse"
        # Case should now be DISCHARGED
        in_pacu_surgery_case.refresh_from_db()
        assert in_pacu_surgery_case.status == "DISCHARGED"

    def test_update_pacu_record_supports_complications_and_handover(
        self, authenticated_client, in_pacu_surgery_case, test_user
    ):
        from django.utils import timezone

        from hmis.apps.theatre.models import PACURecord

        PACURecord.objects.create(
            surgery_case=in_pacu_surgery_case,
            arrival_time=timezone.now(),
            arriving_nurse=test_user,
            initial_aldrete_score=7,
        )

        url = _case_action_url(in_pacu_surgery_case.case_number, "pacu/update")
        response = authenticated_client.patch(
            url,
            {
                "respiratory_issues": True,
                "complications_notes": "Transient desaturation corrected with oxygen.",
                "medications_given": "Paracetamol IV 1g",
                "handover_given_to": "ICU nurse",
                "handover_notes": "High-dependency monitoring for 2 hours.",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["respiratory_issues"] is True
        assert response.data["ready_for_discharge"] is False
        assert response.data["handover_completed_at"] is not None

    def test_discharge_pacu_rejects_missing_handover_and_observations(
        self, authenticated_client, in_pacu_surgery_case, test_user
    ):
        from django.utils import timezone

        from hmis.apps.theatre.models import PACURecord

        PACURecord.objects.create(
            surgery_case=in_pacu_surgery_case,
            arrival_time=timezone.now(),
            arriving_nurse=test_user,
            initial_aldrete_score=8,
        )

        url = _case_action_url(in_pacu_surgery_case.case_number, "pacu/discharge")
        response = authenticated_client.post(
            url,
            {
                "discharge_aldrete_score": 8,
                "discharge_destination": "WARD",
                "discharge_notes": "Stable",
                "handover_given_to": "Ward nurse",
                "handover_notes": "Observe",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "discharge_aldrete_score" in response.data or "non_field_errors" in response.data

    def test_download_pacu_pdf(self, authenticated_client, in_pacu_surgery_case, test_user):
        from django.utils import timezone

        from hmis.apps.theatre.models import PACURecord, PACUVitalReading

        record = PACURecord.objects.create(
            surgery_case=in_pacu_surgery_case,
            arrival_time=timezone.now(),
            arriving_nurse=test_user,
            initial_aldrete_score=8,
            handover_given_to="Ward nurse",
            handover_notes="Standard recovery handover completed.",
            handover_completed_at=timezone.now(),
        )
        PACUVitalReading.objects.create(
            pacu_record=record,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            heart_rate=76,
            spo2=98,
            aldrete_score=9,
        )

        url = _case_action_url(in_pacu_surgery_case.case_number, "pacu/pdf")
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/pdf"
        assert "pacu-summary" in response["Content-Disposition"]
