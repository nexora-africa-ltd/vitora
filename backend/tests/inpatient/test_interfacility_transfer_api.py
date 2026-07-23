"""Tests for inter-facility transfer foundation APIs."""

import pytest
from django.contrib.auth.models import Permission
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.core.models import Facility
from hmis.apps.inpatient.models import Admission, Bed, Discharge, InterFacilityTransfer, Ward
from tests.conftest import ensure_staff_profile


@pytest.mark.django_db
class TestInterFacilityTransferAPI:
    @staticmethod
    def _client_for_user(user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    @staticmethod
    def _grant_permissions(user, codenames):
        for codename in codenames:
            user.user_permissions.add(Permission.objects.get(codename=codename))

    def _create_transfer(self, authenticated_client, sample_admission, destination_facility_id):
        payload = {
            "source_admission": sample_admission.id,
            "destination_facility": destination_facility_id,
            "reason_code": "HIGHER_LEVEL_CARE",
            "reason_details": "Requires ventilatory support",
            "priority": "URGENT",
            "clinical_summary": "Escalating respiratory distress",
            "handover_notes": "Oxygen initiated and broad-spectrum antibiotics started",
            "transport_mode": "AMBULANCE",
            "escort_required": True,
            "escort_name": "Nurse Wanjiku",
        }
        response = authenticated_client.post(
            "/api/inpatient/inter-facility-transfers/", payload, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        return response.data

    def _create_destination_capacity(self, destination_facility, organization, *, code_prefix):
        ward = Ward.objects.create(
            name=f"{code_prefix} Destination Ward",
            code=f"{code_prefix}-WARD",
            ward_type="MEDICAL",
            capacity=10,
            daily_rate="1200.00",
            facility=destination_facility,
            organization=organization,
        )
        bed = Bed.objects.create(
            ward=ward,
            bed_number=f"{code_prefix}-BED-01",
            status="AVAILABLE",
        )
        return ward, bed

    def test_create_interfacility_transfer_draft(
        self,
        authenticated_client,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital",
            mfl_code="88888",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )

        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        assert created["status"] == "DRAFT"
        assert created["source_admission"] == sample_admission.id
        assert created["destination_facility"] == destination_facility.id

        transfer = InterFacilityTransfer.objects.get(id=created["id"])
        assert transfer.transfer_number.startswith("IFT-")
        assert transfer.patient_id == sample_admission.patient_id
        assert transfer.source_facility_id == sample_admission.facility_id

    def test_list_interfacility_transfer(
        self,
        authenticated_client,
        sample_admission,
    ):
        InterFacilityTransfer.objects.create(
            source_admission=sample_admission,
            patient=sample_admission.patient,
            source_facility=sample_admission.facility,
            destination_facility_name="Outside Network Facility",
            reason_code="OTHER",
            reason_details="Network test",
            requested_by=sample_admission.admitting_officer,
        )

        response = authenticated_client.get("/api/inpatient/inter-facility-transfers/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1
        assert response.data["results"][0]["source_admission"] == sample_admission.id

    def test_create_interfacility_transfer_requires_destination(
        self,
        authenticated_client,
        sample_admission,
    ):
        payload = {
            "source_admission": sample_admission.id,
            "reason_code": "NO_CAPACITY",
            "reason_details": "No ICU bed available",
        }

        response = authenticated_client.post(
            "/api/inpatient/inter-facility-transfers/", payload, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "destination_facility_name" in response.data

    def test_transfer_phase2_happy_path(
        self,
        authenticated_client,
        test_user,
        another_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital B",
            mfl_code="77777",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        ensure_staff_profile(another_user, sample_organization, destination_facility)
        destination_client = self._client_for_user(another_user)
        self._grant_permissions(
            test_user,
            ["submit_interfacility_transfer", "dispatch_interfacility_transfer"],
        )
        self._grant_permissions(
            another_user,
            ["accept_interfacility_transfer", "arrive_interfacility_transfer", "add_admission"],
        )
        destination_ward, _destination_bed = self._create_destination_capacity(
            destination_facility,
            sample_organization,
            code_prefix="HPY",
        )
        sample_admission.admission_status = "TRANSFERRED_OUT"
        sample_admission.save(update_fields=["admission_status"])

        submit = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        assert submit.status_code == status.HTTP_200_OK
        assert submit.data["status"] == "PENDING_ACCEPTANCE"

        accept = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/accept/",
            {"destination_ward": destination_ward.id},
            format="json",
        )
        assert accept.status_code == status.HTTP_200_OK
        assert accept.data["status"] == "ACCEPTED"
        assert accept.data["accepted_at"] is not None

        dispatch = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/dispatch/", {}, format="json"
        )
        assert dispatch.status_code == status.HTTP_200_OK
        assert dispatch.data["status"] == "IN_TRANSIT"
        assert dispatch.data["dispatched_at"] is not None

        arrive = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/arrive/", {}, format="json"
        )
        assert arrive.status_code == status.HTTP_200_OK
        assert arrive.data["status"] == "ARRIVED"
        assert arrive.data["arrived_at"] is not None

    def test_transfer_reject_requires_reason(
        self,
        authenticated_client,
        test_user,
        another_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital C",
            mfl_code="66666",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        ensure_staff_profile(another_user, sample_organization, destination_facility)
        destination_client = self._client_for_user(another_user)
        self._grant_permissions(test_user, ["submit_interfacility_transfer"])
        self._grant_permissions(another_user, ["reject_interfacility_transfer"])

        authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        reject = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/reject/", {}, format="json"
        )
        assert reject.status_code == status.HTTP_400_BAD_REQUEST
        assert "reason" in reject.data

        reject_ok = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/reject/",
            {"reason": "Destination ICU unavailable"},
            format="json",
        )
        assert reject_ok.status_code == status.HTTP_200_OK
        assert reject_ok.data["status"] == "REJECTED"
        assert reject_ok.data["rejection_reason"] == "Destination ICU unavailable"

    def test_accept_auto_creates_destination_admission(
        self,
        authenticated_client,
        test_user,
        another_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Accept Admit",
            mfl_code="65656",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        destination_ward, destination_bed = self._create_destination_capacity(
            destination_facility,
            sample_organization,
            code_prefix="ACP",
        )
        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        ensure_staff_profile(another_user, sample_organization, destination_facility)
        destination_client = self._client_for_user(another_user)
        self._grant_permissions(test_user, ["submit_interfacility_transfer"])
        self._grant_permissions(
            another_user,
            ["accept_interfacility_transfer", "add_admission"],
        )
        sample_admission.admission_status = "TRANSFERRED_OUT"
        sample_admission.save(update_fields=["admission_status"])

        submit = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        assert submit.status_code == status.HTTP_200_OK

        accept = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/accept/",
            {
                "destination_ward": destination_ward.id,
                "destination_bed": destination_bed.id,
            },
            format="json",
        )
        assert accept.status_code == status.HTTP_200_OK
        assert accept.data["status"] == "ACCEPTED"
        assert accept.data["destination_admission_id"] is not None
        assert accept.data["destination_ipd_encounter_id"] is not None

        transfer = InterFacilityTransfer.objects.get(id=transfer_id)
        assert transfer.destination_admission_id == accept.data["destination_admission_id"]

    def test_transfer_invalid_transition_blocked(
        self,
        authenticated_client,
        test_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital D",
            mfl_code="55555",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        self._grant_permissions(test_user, ["dispatch_interfacility_transfer"])

        dispatch = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/dispatch/", {}, format="json"
        )
        assert dispatch.status_code == status.HTTP_400_BAD_REQUEST

        patch_status = authenticated_client.patch(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/",
            {"status": "ACCEPTED"},
            format="json",
        )
        assert patch_status.status_code == status.HTTP_400_BAD_REQUEST
        assert "status" in patch_status.data

    def test_source_vs_destination_action_permissions(
        self,
        authenticated_client,
        test_user,
        another_user,
        sample_admission,
        sample_organization,
        sample_facility,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital E",
            mfl_code="44444",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        ensure_staff_profile(another_user, sample_organization, destination_facility)
        destination_client = self._client_for_user(another_user)
        self._grant_permissions(
            test_user,
            [
                "submit_interfacility_transfer",
                "accept_interfacility_transfer",
                "dispatch_interfacility_transfer",
                "arrive_interfacility_transfer",
            ],
        )
        self._grant_permissions(
            another_user,
            [
                "submit_interfacility_transfer",
                "accept_interfacility_transfer",
                "dispatch_interfacility_transfer",
                "arrive_interfacility_transfer",
                "add_admission",
            ],
        )
        destination_ward, _destination_bed = self._create_destination_capacity(
            destination_facility,
            sample_organization,
            code_prefix="SRC",
        )

        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        sample_admission.admission_status = "TRANSFERRED_OUT"
        sample_admission.save(update_fields=["admission_status"])

        source_accept = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/accept/", {}, format="json"
        )
        assert source_accept.status_code == status.HTTP_403_FORBIDDEN

        destination_submit = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        assert destination_submit.status_code == status.HTTP_403_FORBIDDEN

        submit_ok = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        assert submit_ok.status_code == status.HTTP_200_OK

        accept_ok = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/accept/",
            {"destination_ward": destination_ward.id},
            format="json",
        )
        assert accept_ok.status_code == status.HTTP_200_OK

        destination_dispatch = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/dispatch/", {}, format="json"
        )
        assert destination_dispatch.status_code == status.HTTP_403_FORBIDDEN

        source_arrive = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/arrive/", {}, format="json"
        )
        assert source_arrive.status_code == status.HTTP_403_FORBIDDEN

    def test_timeline_events_created_and_exposed(
        self,
        authenticated_client,
        test_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Timeline",
            mfl_code="33333",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        self._grant_permissions(test_user, ["submit_interfacility_transfer"])

        detail = authenticated_client.get(f"/api/inpatient/inter-facility-transfers/{transfer_id}/")
        assert detail.status_code == status.HTTP_200_OK
        assert len(detail.data["timeline_events"]) == 1
        assert detail.data["timeline_events"][0]["event_type"] == "CREATED"
        assert detail.data["timeline_events"][0]["to_status"] == "DRAFT"

        submit = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        assert submit.status_code == status.HTTP_200_OK

        timeline = authenticated_client.get(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/timeline/"
        )
        assert timeline.status_code == status.HTTP_200_OK
        assert [event["event_type"] for event in timeline.data] == ["CREATED", "SUBMITTED"]
        assert timeline.data[1]["from_status"] == "DRAFT"
        assert timeline.data[1]["to_status"] == "PENDING_ACCEPTANCE"

    def test_destination_queue_only_shows_incoming_open_transfers(
        self,
        authenticated_client,
        test_user,
        another_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Queue",
            mfl_code="22222",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        ensure_staff_profile(another_user, sample_organization, destination_facility)
        destination_client = self._client_for_user(another_user)
        self._grant_permissions(
            test_user,
            ["submit_interfacility_transfer", "cancel_interfacility_transfer"],
        )

        first = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        first_id = first["id"]
        submit = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{first_id}/submit/", {}, format="json"
        )
        assert submit.status_code == status.HTTP_200_OK

        queue = destination_client.get("/api/inpatient/inter-facility-transfers/destination-queue/")
        assert queue.status_code == status.HTTP_200_OK
        queue_ids = {item["id"] for item in queue.data}
        assert first_id in queue_ids

        cancelled = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{first_id}/cancel/",
            {"reason": "Transport unavailable"},
            format="json",
        )
        assert cancelled.status_code == status.HTTP_200_OK

        queue_after_cancel = destination_client.get(
            "/api/inpatient/inter-facility-transfers/destination-queue/"
        )
        assert queue_after_cancel.status_code == status.HTTP_200_OK
        queue_after_ids = {item["id"] for item in queue_after_cancel.data}
        assert first_id not in queue_after_ids

    def test_source_staff_user_cannot_accept_destination_transfer(
        self,
        authenticated_client,
        test_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Staff Guard",
            mfl_code="21212",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        self._grant_permissions(
            test_user,
            ["submit_interfacility_transfer", "accept_interfacility_transfer"],
        )
        test_user.is_staff = True
        test_user.save(update_fields=["is_staff"])

        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]

        submit = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        assert submit.status_code == status.HTTP_200_OK

        source_accept = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/accept/", {}, format="json"
        )
        assert source_accept.status_code == status.HTTP_403_FORBIDDEN

    def test_source_staff_user_does_not_see_destination_queue(
        self,
        authenticated_client,
        test_user,
        another_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Queue Guard",
            mfl_code="23232",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        ensure_staff_profile(another_user, sample_organization, destination_facility)
        destination_client = self._client_for_user(another_user)
        self._grant_permissions(test_user, ["submit_interfacility_transfer"])

        test_user.is_staff = True
        test_user.save(update_fields=["is_staff"])

        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        submit = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        assert submit.status_code == status.HTTP_200_OK

        source_queue = authenticated_client.get(
            "/api/inpatient/inter-facility-transfers/destination-queue/"
        )
        assert source_queue.status_code == status.HTTP_200_OK
        source_ids = {item["id"] for item in source_queue.data}
        assert transfer_id not in source_ids

        destination_queue = destination_client.get(
            "/api/inpatient/inter-facility-transfers/destination-queue/"
        )
        assert destination_queue.status_code == status.HTTP_200_OK
        destination_ids = {item["id"] for item in destination_queue.data}
        assert transfer_id in destination_ids

    def test_arrive_with_auto_admit_creates_destination_admission_and_ipd_encounter(
        self,
        authenticated_client,
        test_user,
        another_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Auto Admit",
            mfl_code="12121",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        destination_ward = Ward.objects.create(
            name="Destination Medical Ward",
            code="DMW-01",
            ward_type="MEDICAL",
            capacity=10,
            daily_rate="1200.00",
            facility=destination_facility,
            organization=sample_organization,
        )
        destination_bed = Bed.objects.create(
            ward=destination_ward,
            bed_number="DMW-B01",
            status="AVAILABLE",
        )

        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        ensure_staff_profile(another_user, sample_organization, destination_facility)
        destination_client = self._client_for_user(another_user)
        self._grant_permissions(
            test_user,
            ["submit_interfacility_transfer", "dispatch_interfacility_transfer"],
        )
        self._grant_permissions(
            another_user,
            ["accept_interfacility_transfer", "arrive_interfacility_transfer", "add_admission"],
        )

        sample_admission.admission_status = "TRANSFERRED_OUT"
        sample_admission.save(update_fields=["admission_status"])

        submit = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        assert submit.status_code == status.HTTP_200_OK
        accept = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/accept/",
            {"destination_ward": destination_ward.id},
            format="json",
        )
        assert accept.status_code == status.HTTP_200_OK
        dispatch = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/dispatch/", {}, format="json"
        )
        assert dispatch.status_code == status.HTTP_200_OK

        arrive = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/arrive/",
            {
                "auto_admit": True,
                "destination_ward": destination_ward.id,
                "destination_bed": destination_bed.id,
            },
            format="json",
        )
        assert arrive.status_code == status.HTTP_200_OK
        assert arrive.data["status"] == "ARRIVED"
        assert arrive.data["destination_admission_id"] is not None
        assert arrive.data["destination_ipd_encounter_id"] is not None

        destination_admission = Admission.objects.get(id=arrive.data["destination_admission_id"])
        assert destination_admission.facility_id == destination_facility.id
        assert destination_admission.patient_id == sample_admission.patient_id
        assert destination_admission.ipd_encounter.encounter_type == "IPD"

    def test_accept_with_auto_admit_requires_finalized_source_admission(
        self,
        authenticated_client,
        test_user,
        another_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Auto Admit Guard",
            mfl_code="13131",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        destination_ward = Ward.objects.create(
            name="Destination Guard Ward",
            code="DGW-01",
            ward_type="MEDICAL",
            capacity=8,
            daily_rate="1000.00",
            facility=destination_facility,
            organization=sample_organization,
        )
        destination_bed = Bed.objects.create(
            ward=destination_ward,
            bed_number="DGW-B01",
            status="AVAILABLE",
        )

        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        ensure_staff_profile(another_user, sample_organization, destination_facility)
        destination_client = self._client_for_user(another_user)
        self._grant_permissions(
            test_user,
            ["submit_interfacility_transfer", "dispatch_interfacility_transfer"],
        )
        self._grant_permissions(
            another_user,
            ["accept_interfacility_transfer", "arrive_interfacility_transfer", "add_admission"],
        )

        authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        accept = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/accept/",
            {"destination_ward": destination_ward.id},
            format="json",
        )
        assert accept.status_code == status.HTTP_400_BAD_REQUEST
        assert "source_admission" in accept.data

    def test_arrive_and_admit_alias_auto_admits_without_auto_admit_flag(
        self,
        authenticated_client,
        test_user,
        another_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Alias",
            mfl_code="14141",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        destination_ward = Ward.objects.create(
            name="Destination Alias Ward",
            code="DAW-01",
            ward_type="MEDICAL",
            capacity=6,
            daily_rate="1000.00",
            facility=destination_facility,
            organization=sample_organization,
        )
        destination_bed = Bed.objects.create(
            ward=destination_ward,
            bed_number="DAW-B01",
            status="AVAILABLE",
        )

        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        ensure_staff_profile(another_user, sample_organization, destination_facility)
        destination_client = self._client_for_user(another_user)
        self._grant_permissions(
            test_user,
            ["submit_interfacility_transfer", "dispatch_interfacility_transfer"],
        )
        self._grant_permissions(
            another_user,
            ["accept_interfacility_transfer", "arrive_interfacility_transfer", "add_admission"],
        )

        sample_admission.admission_status = "TRANSFERRED_OUT"
        sample_admission.save(update_fields=["admission_status"])

        authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/accept/",
            {"destination_ward": destination_ward.id},
            format="json",
        )
        authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/dispatch/", {}, format="json"
        )

        arrive_and_admit = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/arrive-and-admit/",
            {
                "destination_ward": destination_ward.id,
                "destination_bed": destination_bed.id,
            },
            format="json",
        )

        assert arrive_and_admit.status_code == status.HTTP_200_OK
        assert arrive_and_admit.data["status"] == "ARRIVED"
        assert arrive_and_admit.data["destination_admission_id"] is not None

    def test_destination_can_request_and_source_can_share_discharge_summary(
        self,
        authenticated_client,
        test_user,
        another_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Request",
            mfl_code="15151",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        ensure_staff_profile(another_user, sample_organization, destination_facility)
        destination_client = self._client_for_user(another_user)
        self._grant_permissions(test_user, ["submit_interfacility_transfer"])
        self._grant_permissions(another_user, ["accept_interfacility_transfer"])

        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]
        authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )

        request_summary = destination_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/request-discharge-summary/",
            {},
            format="json",
        )
        assert request_summary.status_code == status.HTTP_200_OK
        assert request_summary.data["discharge_summary_requested"] is True

        transfer = InterFacilityTransfer.objects.get(id=transfer_id)
        discharge = Discharge.objects.create(
            admission=sample_admission,
            discharge_type="TRANSFERRED",
            discharge_date=sample_admission.admission_date,
            discharged_by=test_user,
            admission_diagnosis="J18",
            final_diagnosis="J960",
            final_diagnosis_text="Acute respiratory failure",
            procedures_performed="Non-invasive ventilation",
            treatment_summary="Stabilized and referred for higher-level ICU support.",
            discharge_medications=[{"name": "Ceftriaxone", "dose": "1g BD"}],
            patient_instructions="Continue oxygen as advised.",
            follow_up_instructions="Follow up at destination ICU team.",
            pharmacy_cleared=True,
            billing_cleared=True,
            lab_results_acknowledged=True,
        )
        transfer.source_discharge = discharge
        transfer.save(update_fields=["source_discharge", "updated_at"])

        share_summary = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/share-discharge-summary/",
            {},
            format="json",
        )
        assert share_summary.status_code == status.HTTP_200_OK
        assert share_summary.data["discharge_summary_requested"] is False
        assert share_summary.data["discharge_summary_snapshot"] is not None
        assert (
            share_summary.data["discharge_summary_snapshot"]["final_diagnosis_text"]
            == "Acute respiratory failure"
        )

    def test_source_cannot_share_discharge_summary_without_pending_request(
        self,
        authenticated_client,
        test_user,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Share Guard",
            mfl_code="16161",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        self._grant_permissions(test_user, ["submit_interfacility_transfer"])

        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]

        share_summary = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/share-discharge-summary/",
            {},
            format="json",
        )
        assert share_summary.status_code == status.HTTP_400_BAD_REQUEST
        assert "source_discharge" in share_summary.data

    def test_accept_requires_destination_active_facility_context(
        self,
        authenticated_client,
        test_user,
        test_staff_profile,
        sample_admission,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        destination_facility = Facility.objects.create(
            organization=sample_organization,
            name="Referral Hospital Context Guard",
            mfl_code="17171",
            level="5",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        destination_ward, _destination_bed = self._create_destination_capacity(
            destination_facility,
            sample_organization,
            code_prefix="CTX",
        )
        test_staff_profile.secondary_facilities.add(destination_facility)
        self._grant_permissions(
            test_user,
            [
                "submit_interfacility_transfer",
                "accept_interfacility_transfer",
                "add_admission",
            ],
        )

        authenticated_client.credentials(HTTP_X_FACILITY_ID=str(sample_admission.facility_id))
        created = self._create_transfer(
            authenticated_client, sample_admission, destination_facility.id
        )
        transfer_id = created["id"]

        sample_admission.admission_status = "TRANSFERRED_OUT"
        sample_admission.save(update_fields=["admission_status"])

        submit = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/submit/", {}, format="json"
        )
        assert submit.status_code == status.HTTP_200_OK

        accept_from_source_context = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/accept/",
            {"destination_ward": destination_ward.id},
            format="json",
        )
        assert accept_from_source_context.status_code == status.HTTP_403_FORBIDDEN

        authenticated_client.credentials(HTTP_X_FACILITY_ID=str(destination_facility.id))
        accept_from_destination_context = authenticated_client.post(
            f"/api/inpatient/inter-facility-transfers/{transfer_id}/accept/",
            {"destination_ward": destination_ward.id},
            format="json",
        )
        assert accept_from_destination_context.status_code == status.HTTP_200_OK
        assert accept_from_destination_context.data["status"] == "ACCEPTED"
