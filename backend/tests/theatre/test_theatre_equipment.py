"""
Tests for surgical equipment as schedulable resources.

Covers:
- TheatreEquipmentType model (catalog)
- CaseEquipmentRequirement M2M (case↔equipment linkage)
- Equipment conflict detection (double-booking prevention)
- API CRUD endpoints
- Domain events
- Tenant scoping
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from rest_framework import status

# ═══════════════════════════════════════════════════════════════════════════
#  Model Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestTheatreEquipmentTypeModel:
    """Tests for TheatreEquipmentType catalog model."""

    def test_create_equipment_type(self, sample_equipment_type):
        """Should create equipment type with all fields."""
        assert sample_equipment_type.pk is not None
        assert sample_equipment_type.name == "C-Arm Fluoroscope"
        assert sample_equipment_type.code == "EQ-CARM-01"
        assert sample_equipment_type.category == "IMAGING"
        assert sample_equipment_type.is_portable is True
        assert sample_equipment_type.setup_time_minutes == 10
        assert sample_equipment_type.cleanup_time_minutes == 5

    def test_str_representation(self, sample_equipment_type):
        """Should have readable string representation."""
        assert "C-Arm Fluoroscope" in str(sample_equipment_type)

    def test_facility_scoping(self, sample_equipment_type, sample_facility):
        """Should be linked to a facility."""
        assert sample_equipment_type.facility == sample_facility

    def test_unique_code_per_facility(
        self, sample_equipment_type, sample_organization, sample_facility
    ):
        """Should prevent duplicate codes within the same facility."""
        from django.db import IntegrityError

        from hmis.apps.theatre.models import TheatreEquipmentType

        with pytest.raises(IntegrityError):
            TheatreEquipmentType.objects.create(
                name="Duplicate C-Arm",
                code="EQ-CARM-01",  # Same code
                category="IMAGING",
                organization=sample_organization,
                facility=sample_facility,
            )

    def test_different_facility_same_code_ok(
        self, sample_equipment_type, sample_organization, sample_county, sample_sub_county
    ):
        """Should allow same code in different facilities."""
        from hmis.apps.core.models import Facility
        from hmis.apps.theatre.models import TheatreEquipmentType

        other_facility = Facility.objects.create(
            name="Other Facility",
            mfl_code="77777",
            level="4",
            ownership="PRIVATE",
            organization=sample_organization,
            county=sample_county,
            sub_county=sample_sub_county,
        )
        eq = TheatreEquipmentType.objects.create(
            name="Another C-Arm",
            code="EQ-CARM-01",  # Same code, different facility
            category="IMAGING",
            organization=sample_organization,
            facility=other_facility,
        )
        assert eq.pk is not None


class TestCaseEquipmentRequirementModel:
    """Tests for CaseEquipmentRequirement M2M model."""

    def test_create_case_equipment(self, sample_case_equipment):
        """Should link equipment resource to surgery case."""
        assert sample_case_equipment.pk is not None
        assert sample_case_equipment.surgery_case is not None
        assert sample_case_equipment.resource is not None
        assert sample_case_equipment.is_confirmed is True

    def test_str_representation(self, sample_case_equipment):
        """Should have readable string representation."""
        s = str(sample_case_equipment)
        assert "C-Arm" in s or "ASSET-CARM" in s

    def test_unique_case_resource_constraint(
        self, sample_case_equipment, sample_surgery_case, sample_equipment_resource, test_user
    ):
        """Should prevent assigning same resource to same case twice."""
        from django.db import IntegrityError

        from hmis.apps.theatre.models import CaseEquipmentRequirement

        with pytest.raises(IntegrityError):
            CaseEquipmentRequirement.objects.create(
                surgery_case=sample_surgery_case,
                resource=sample_equipment_resource,  # Same resource
                reserved_from=time(10, 0),
                reserved_until=time(11, 0),
                added_by=test_user,
            )

    def test_type_only_requirement(self, db, sample_surgery_case, sample_equipment_type, test_user):
        """Should allow creating a type-level requirement without specific resource."""
        from hmis.apps.theatre.models import CaseEquipmentRequirement

        req = CaseEquipmentRequirement.objects.create(
            surgery_case=sample_surgery_case,
            equipment_type=sample_equipment_type,
            resource=None,
            quantity_required=1,
            is_confirmed=False,
            reserved_from=time(9, 0),
            reserved_until=time(10, 0),
            added_by=test_user,
        )
        assert req.pk is not None
        assert req.resource is None
        assert req.equipment_type == sample_equipment_type

    def test_duration_minutes_property(self, sample_case_equipment):
        """Should compute duration from reserved_from and reserved_until."""
        assert sample_case_equipment.duration_minutes == 60


class TestResourceEquipmentTypeFK:
    """Tests for equipment_type FK on Resource model."""

    def test_resource_with_equipment_type(self, sample_equipment_resource, sample_equipment_type):
        """ASSET resource should be linked to equipment type."""
        assert sample_equipment_resource.equipment_type == sample_equipment_type
        assert sample_equipment_resource.resource_type == "ASSET"

    def test_resource_without_equipment_type(self, db, sample_organization, sample_facility):
        """Non-equipment resources should have null equipment_type."""
        from hmis.apps.scheduling.models import Resource

        resource = Resource.objects.create(
            name="Doctor Smith",
            resource_type="PERSON",
            code="DOC-001",
            organization=sample_organization,
            facility=sample_facility,
        )
        assert resource.equipment_type is None


# ═══════════════════════════════════════════════════════════════════════════
#  Conflict Detection Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestEquipmentConflictDetection:
    """Tests for equipment scheduling conflict detection."""

    def test_conflict_detected_same_resource_overlapping_times(
        self, sample_case_equipment, scheduled_surgery_case, sample_equipment_resource
    ):
        """Should detect conflict when same resource booked at overlapping times."""
        from hmis.apps.theatre.services.scheduling import detect_equipment_conflicts

        conflicts = detect_equipment_conflicts(
            resource_id=sample_equipment_resource.pk,
            scheduled_date=scheduled_surgery_case.scheduled_date,
            start_time=time(9, 30),  # Overlaps with 9:00-10:00
            duration_minutes=30,
        )
        assert len(conflicts) == 1
        assert conflicts[0]["case_number"] == scheduled_surgery_case.case_number

    def test_no_conflict_non_overlapping_times(
        self, sample_case_equipment, sample_surgery_case, sample_equipment_resource
    ):
        """Should not detect conflict for non-overlapping times."""
        from hmis.apps.theatre.services.scheduling import detect_equipment_conflicts

        conflicts = detect_equipment_conflicts(
            resource_id=sample_equipment_resource.pk,
            scheduled_date=sample_surgery_case.scheduled_date,
            start_time=time(10, 30),  # After 9:00-10:00 window
            duration_minutes=30,
        )
        assert len(conflicts) == 0

    def test_no_conflict_different_resource(
        self, sample_case_equipment, sample_surgery_case, sample_equipment_resource_2
    ):
        """Should not detect conflict for a different resource."""
        from hmis.apps.theatre.services.scheduling import detect_equipment_conflicts

        conflicts = detect_equipment_conflicts(
            resource_id=sample_equipment_resource_2.pk,
            scheduled_date=sample_surgery_case.scheduled_date,
            start_time=time(9, 0),
            duration_minutes=60,
        )
        assert len(conflicts) == 0

    def test_cancelled_case_no_conflict(
        self,
        sample_case_equipment,
        sample_surgery_case,
        sample_equipment_resource,
        test_user,
    ):
        """Cancelled cases should not cause conflicts."""
        from hmis.apps.theatre.services.scheduling import detect_equipment_conflicts

        sample_surgery_case.cancel(user=test_user, reason="Test cancellation")

        conflicts = detect_equipment_conflicts(
            resource_id=sample_equipment_resource.pk,
            scheduled_date=sample_surgery_case.scheduled_date,
            start_time=time(9, 0),
            duration_minutes=60,
        )
        assert len(conflicts) == 0

    def test_exclude_case_id_for_rescheduling(
        self, sample_case_equipment, sample_surgery_case, sample_equipment_resource
    ):
        """Should exclude specified case from conflict check (for rescheduling)."""
        from hmis.apps.theatre.services.scheduling import detect_equipment_conflicts

        conflicts = detect_equipment_conflicts(
            resource_id=sample_equipment_resource.pk,
            scheduled_date=sample_surgery_case.scheduled_date,
            start_time=time(9, 0),
            duration_minutes=60,
            exclude_case_id=sample_surgery_case.pk,
        )
        assert len(conflicts) == 0

    def test_no_conflict_different_date(
        self, sample_case_equipment, sample_surgery_case, sample_equipment_resource
    ):
        """Should not detect conflict on a different date."""
        from hmis.apps.theatre.services.scheduling import detect_equipment_conflicts

        conflicts = detect_equipment_conflicts(
            resource_id=sample_equipment_resource.pk,
            scheduled_date=date.today() + timedelta(days=1),
            start_time=time(9, 0),
            duration_minutes=60,
        )
        assert len(conflicts) == 0

    def test_equipment_availability_by_type(
        self,
        sample_equipment_type,
        sample_equipment_resource,
        sample_equipment_resource_2,
        scheduled_surgery_case,
        sample_case_equipment,
    ):
        """Should return available units of a given equipment type."""
        from hmis.apps.theatre.services.scheduling import get_equipment_availability

        result = get_equipment_availability(
            equipment_type_id=sample_equipment_type.pk,
            target_date=scheduled_surgery_case.scheduled_date,
            start_time=time(9, 0),
            duration_minutes=60,
            facility_id=scheduled_surgery_case.facility_id,
        )
        # Unit #1 is booked 9:00-10:00, Unit #2 is free
        assert result["total_units"] == 2
        assert result["available_units"] == 1
        booked = [u for u in result["units"] if not u["available"]]
        free = [u for u in result["units"] if u["available"]]
        assert len(booked) == 1
        assert len(free) == 1
        assert free[0]["resource_id"] == sample_equipment_resource_2.pk


# ═══════════════════════════════════════════════════════════════════════════
#  API Tests — TheatreEquipmentType
# ═══════════════════════════════════════════════════════════════════════════


class TestEquipmentTypeAPI:
    """Tests for /api/theatre/equipment-types/ endpoints."""

    BASE_URL = "/api/theatre/equipment-types/"

    def test_list_equipment_types(self, authenticated_client, sample_equipment_type):
        """Should list equipment types."""
        response = authenticated_client.get(self.BASE_URL)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_create_equipment_type(self, authenticated_client, sample_facility):
        """Should create equipment type with valid data."""
        data = {
            "name": "Defibrillator",
            "code": "EQ-DEFIB-01",
            "category": "LIFE_SUPPORT",
            "description": "Cardiac defibrillator",
            "is_portable": True,
            "setup_time_minutes": 2,
            "cleanup_time_minutes": 5,
        }
        response = authenticated_client.post(self.BASE_URL, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Defibrillator"
        assert response.data["code"] == "EQ-DEFIB-01"

    def test_retrieve_equipment_type(self, authenticated_client, sample_equipment_type):
        """Should retrieve equipment type detail."""
        url = f"{self.BASE_URL}{sample_equipment_type.pk}/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "C-Arm Fluoroscope"

    def test_update_equipment_type(self, authenticated_client, sample_equipment_type):
        """Should update equipment type."""
        url = f"{self.BASE_URL}{sample_equipment_type.pk}/"
        response = authenticated_client.patch(url, {"is_portable": False})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_portable"] is False

    def test_delete_equipment_type(self, authenticated_client, sample_equipment_type):
        """Should soft-delete equipment type."""
        url = f"{self.BASE_URL}{sample_equipment_type.pk}/"
        response = authenticated_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_list_unauthenticated_fails(self, api_client):
        """Should reject unauthenticated access."""
        response = api_client.get(self.BASE_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_filter_by_category(
        self, authenticated_client, sample_equipment_type, sample_equipment_type_2
    ):
        """Should filter equipment types by category."""
        response = authenticated_client.get(self.BASE_URL, {"category": "IMAGING"})
        assert response.status_code == status.HTTP_200_OK
        names = [r["name"] for r in response.data["results"]]
        assert "C-Arm Fluoroscope" in names
        assert "Ventilator" not in names

    def test_availability_action(
        self,
        authenticated_client,
        sample_equipment_type,
        sample_equipment_resource,
        sample_equipment_resource_2,
        sample_case_equipment,
        scheduled_surgery_case,
    ):
        """Should return unit availability for an equipment type on a date."""
        url = f"{self.BASE_URL}{sample_equipment_type.pk}/availability/"
        response = authenticated_client.get(
            url,
            {
                "date": str(scheduled_surgery_case.scheduled_date),
                "start_time": "09:00",
                "duration_minutes": 60,
            },
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["total_units"] == 2
        assert response.data["available_units"] == 1


# ═══════════════════════════════════════════════════════════════════════════
#  API Tests — CaseEquipmentRequirement
# ═══════════════════════════════════════════════════════════════════════════


class TestCaseEquipmentAPI:
    """Tests for /api/theatre/cases/{id}/equipment/ endpoints."""

    def _url(self, case_id, pk=None):
        base = f"/api/theatre/cases/{case_id}/equipment/"
        return f"{base}{pk}/" if pk else base

    def test_list_case_equipment(
        self, authenticated_client, sample_surgery_case, sample_case_equipment
    ):
        """Should list equipment requirements for a case."""
        response = authenticated_client.get(self._url(sample_surgery_case.pk))
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_add_equipment_to_case(
        self,
        authenticated_client,
        sample_surgery_case,
        sample_equipment_resource,
        sample_equipment_type,
    ):
        """Should add equipment requirement to a case."""
        data = {
            "resource": sample_equipment_resource.pk,
            "equipment_type": sample_equipment_type.pk,
            "quantity_required": 1,
            "reserved_from": "09:00",
            "reserved_until": "10:00",
        }
        response = authenticated_client.post(self._url(sample_surgery_case.pk), data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["resource"] == sample_equipment_resource.pk

    def test_add_type_only_requirement(
        self, authenticated_client, sample_surgery_case, sample_equipment_type
    ):
        """Should allow adding type-level requirement without specific resource."""
        data = {
            "equipment_type": sample_equipment_type.pk,
            "quantity_required": 1,
            "reserved_from": "09:00",
            "reserved_until": "10:00",
        }
        response = authenticated_client.post(self._url(sample_surgery_case.pk), data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["resource"] is None
        assert response.data["equipment_type"] == sample_equipment_type.pk

    def test_confirm_equipment(
        self, authenticated_client, sample_surgery_case, sample_case_equipment
    ):
        """Should update confirmed status."""
        url = self._url(sample_surgery_case.pk, sample_case_equipment.pk)
        response = authenticated_client.patch(url, {"is_confirmed": True})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_confirmed"] is True

    def test_remove_equipment(
        self, authenticated_client, sample_surgery_case, sample_case_equipment
    ):
        """Should remove equipment requirement."""
        url = self._url(sample_surgery_case.pk, sample_case_equipment.pk)
        response = authenticated_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_check_conflicts_action(
        self,
        authenticated_client,
        sample_surgery_case,
        sample_case_equipment,
    ):
        """Should check all equipment for conflicts."""
        url = f"/api/theatre/cases/{sample_surgery_case.pk}/equipment/check-conflicts/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert "equipment_conflicts" in response.data

    def test_unauthenticated_fails(self, api_client, sample_surgery_case):
        """Should reject unauthenticated access."""
        response = api_client.get(self._url(sample_surgery_case.pk))
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ═══════════════════════════════════════════════════════════════════════════
#  Domain Event Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestEquipmentDomainEvents:
    """Tests for equipment domain event publication."""

    def test_equipment_assigned_publishes_event(
        self, db, sample_surgery_case, sample_equipment_resource, test_user, mocker
    ):
        """Should publish EQUIPMENT_ASSIGNED event on creation."""
        mock_publish = mocker.patch("hmis.apps.theatre.signals.publish_event")
        from hmis.apps.theatre.models import CaseEquipmentRequirement

        CaseEquipmentRequirement.objects.create(
            surgery_case=sample_surgery_case,
            resource=sample_equipment_resource,
            reserved_from=time(9, 0),
            reserved_until=time(10, 0),
            added_by=test_user,
        )
        # Find the equipment assigned call among all publish_event calls
        from hmis.apps.core.events import TheatreEvents

        calls = [
            c
            for c in mock_publish.call_args_list
            if c.kwargs.get("event_type") == TheatreEvents.EQUIPMENT_ASSIGNED
            or (c.args and c.args[0] == TheatreEvents.EQUIPMENT_ASSIGNED)
        ]
        assert len(calls) >= 1

    def test_equipment_released_publishes_event(self, db, sample_case_equipment, mocker):
        """Should publish EQUIPMENT_RELEASED event on deletion."""
        mock_publish = mocker.patch("hmis.apps.theatre.signals.publish_event")
        sample_case_equipment.delete()

        from hmis.apps.core.events import TheatreEvents

        calls = [
            c
            for c in mock_publish.call_args_list
            if c.kwargs.get("event_type") == TheatreEvents.EQUIPMENT_RELEASED
            or (c.args and c.args[0] == TheatreEvents.EQUIPMENT_RELEASED)
        ]
        assert len(calls) >= 1


# ═══════════════════════════════════════════════════════════════════════════
#  Integration: Case Scheduling Context
# ═══════════════════════════════════════════════════════════════════════════


class TestCaseSchedulingContextEquipment:
    """Test equipment section in get_case_scheduling_context()."""

    def test_context_includes_equipment(self, sample_case_equipment, sample_surgery_case):
        """get_case_scheduling_context should include equipment section."""
        from hmis.apps.theatre.services.scheduling import get_case_scheduling_context

        context = get_case_scheduling_context(sample_surgery_case)
        assert "equipment" in context
        assert context["equipment"]["total_items"] == 1
        assert context["equipment"]["confirmed_items"] == 1
