"""
Tests for the referrals audit fixes.

Covers:
- EXTERNAL referral type mapping (target_service=OTHER + external_facility_name)
- EXTERNAL referrals skip clinic-visit creation on accept
- Tenant scoping (facility/organization auto-populated from encounter)
- Cancel reason persistence
- Permission enforcement (accept/decline gates, sensitive filter)
- Expire-referrals Celery task
- Tenant-scoped clinic fallback for routing
- Domain event publication (CREATED, ACCEPTED, etc.)
- Encounter disposition revert on cancel/decline/expire
- Concurrent referral-number generation
"""

from datetime import timedelta
from unittest import mock

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status


@pytest.fixture
def referral_data(sample_encounter):
    return {
        "encounter": sample_encounter.id,
        "target_service": "PHYSIOTHERAPY",
        "reason": "Knee rehab",
        "priority": "ROUTINE",
    }


# ---------------------------------------------------------------------------
# EXTERNAL mapping
# ---------------------------------------------------------------------------


class TestExternalReferralMapping:
    def test_external_referral_maps_to_external_type(self, db, sample_encounter, test_user):
        """target_service=OTHER + external_facility_name → referral_type=EXTERNAL."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="OTHER",
            external_facility_name="Kenyatta National Hospital",
            reason="Specialist consult",
            referred_by=test_user,
        )

        assert referral.referral_type == "EXTERNAL"
        assert referral.is_external is True

    def test_external_referral_skips_clinic_visit_on_accept(
        self, db, sample_encounter, test_user, authenticated_client
    ):
        """Accepting an EXTERNAL referral must NOT create a ClinicVisit."""
        from hmis.apps.clinics.models import ClinicVisit
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="OTHER",
            external_facility_name="Aga Khan Hospital",
            reason="External imaging",
            referred_by=test_user,
        )

        before = ClinicVisit.objects.count()
        response = authenticated_client.post(
            f"/api/referrals/{referral.id}/accept/", {}, format="json"
        )

        assert response.status_code == status.HTTP_200_OK
        assert ClinicVisit.objects.count() == before
        referral.refresh_from_db()
        assert referral.clinic_visit is None


# ---------------------------------------------------------------------------
# Tenant scoping
# ---------------------------------------------------------------------------


class TestReferralTenantScoping:
    def test_referral_has_facility_and_organization_set(self, db, sample_encounter, test_user):
        """facility / organization auto-resolved from encounter on save."""
        from hmis.apps.referrals.models import ClinicalReferral

        referral = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Rehab",
            referred_by=test_user,
        )

        assert referral.facility_id == sample_encounter.facility_id
        assert referral.organization_id == sample_encounter.organization_id


# ---------------------------------------------------------------------------
# Cancel reason persistence
# ---------------------------------------------------------------------------


class TestCancelReason:
    def test_cancel_referral_persists_reason(self, authenticated_client, referral_data, test_user):
        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        referral_id = create_resp.data["id"]

        response = authenticated_client.post(
            f"/api/referrals/{referral_id}/cancel/",
            {"reason": "Patient declined treatment"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        from hmis.apps.referrals.models import ClinicalReferral

        ref = ClinicalReferral.objects.get(pk=referral_id)
        assert ref.status == "CANCELLED"
        assert ref.cancel_reason == "Patient declined treatment"
        assert ref.cancelled_by_id == test_user.id
        assert ref.cancelled_at is not None


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------


class TestPermissionEnforcement:
    def test_accept_requires_permission(self, authenticated_client, referral_data, test_user):
        """User without accept_referral perm receives 403."""
        from django.contrib.auth.models import Permission

        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        referral_id = create_resp.data["id"]

        # Revoke accept perm only
        perm = Permission.objects.get(codename="accept_referral")
        test_user.user_permissions.remove(perm)

        response = authenticated_client.post(
            f"/api/referrals/{referral_id}/accept/", {}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_decline_requires_permission(self, authenticated_client, referral_data, test_user):
        """User without decline_referral perm receives 403."""
        from django.contrib.auth.models import Permission

        create_resp = authenticated_client.post("/api/referrals/", referral_data, format="json")
        referral_id = create_resp.data["id"]

        perm = Permission.objects.get(codename="decline_referral")
        test_user.user_permissions.remove(perm)

        response = authenticated_client.post(
            f"/api/referrals/{referral_id}/decline/",
            {"decline_reason": "Not appropriate"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_sensitive_referral_filtered_from_unauthorized_user(
        self, db, authenticated_client, sample_encounter, test_user
    ):
        """List response excludes is_sensitive=True for users without view_sensitive_referral."""
        from django.contrib.auth.models import Permission

        from hmis.apps.referrals.models import ClinicalReferral

        sensitive = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PSYCHIATRY",
            reason="Mental health follow-up",
            is_sensitive=True,
            referred_by=test_user,
        )
        normal = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Rehab",
            referred_by=test_user,
        )

        # Revoke sensitive perm
        perm = Permission.objects.get(codename="view_sensitive_referral")
        test_user.user_permissions.remove(perm)

        response = authenticated_client.get("/api/referrals/")

        assert response.status_code == status.HTTP_200_OK
        ids = [r["id"] for r in response.data["results"]]
        assert normal.id in ids
        assert sensitive.id not in ids


# ---------------------------------------------------------------------------
# Expire referrals task
# ---------------------------------------------------------------------------


class TestExpireReferralsTask:
    def test_expire_referrals_task_marks_pending_past_expiry(self, db, sample_encounter, test_user):
        from hmis.apps.referrals.models import ClinicalReferral
        from hmis.apps.referrals.tasks import expire_referrals

        ref = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Rehab",
            referred_by=test_user,
        )
        ClinicalReferral.objects.filter(pk=ref.pk).update(
            expires_at=timezone.now() - timedelta(hours=1)
        )

        result = expire_referrals()

        ref.refresh_from_db()
        assert ref.status == "EXPIRED"
        assert result["expired"] == 1
        assert ref.referral_number in result["referral_numbers"]

    def test_expire_referrals_task_skips_non_pending(self, db, sample_encounter, test_user):
        from hmis.apps.referrals.models import ClinicalReferral
        from hmis.apps.referrals.tasks import expire_referrals

        ref = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Rehab",
            referred_by=test_user,
        )
        ref.accept(user=test_user)
        ClinicalReferral.objects.filter(pk=ref.pk).update(
            expires_at=timezone.now() - timedelta(hours=1)
        )

        result = expire_referrals()

        ref.refresh_from_db()
        assert ref.status == "ACCEPTED"
        assert result["expired"] == 0


# ---------------------------------------------------------------------------
# Tenant-scoped clinic fallback
# ---------------------------------------------------------------------------


class TestClinicFallbackTenantScope:
    def test_clinic_fallback_constrained_to_facility(
        self, db, sample_encounter, test_user, sample_county, sample_sub_county
    ):
        """A clinic in a different facility must NOT be selected as fallback."""
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.core.models import Facility, Organization
        from hmis.apps.referrals.models import ClinicalReferral

        # Build an unrelated org/facility and put a DENTAL clinic only there.
        other_org = Organization.objects.create(name="Other Org", slug="other-org")
        other_fac = Facility.objects.create(
            organization=other_org,
            name="Other Facility",
            mfl_code="88888",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
        )
        Clinic.objects.create(
            name="Other Dental",
            code="OTH-DEN",
            clinic_type="DENTAL",
            facility=other_fac,
            organization=other_org,
        )

        ref = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="DENTISTRY",
            reason="Caries",
            referred_by=test_user,
        )
        ref.accept(user=test_user)

        ref.refresh_from_db()
        # No clinic in source facility → should NOT have routed to other_fac's clinic.
        assert ref.clinic_visit is None


# ---------------------------------------------------------------------------
# Domain events
# ---------------------------------------------------------------------------


class TestDomainEvents:
    def test_referral_creation_publishes_domain_event(self, db, sample_encounter, test_user):
        from hmis.apps.core.events.types import ReferralEvents
        from hmis.apps.referrals.models import ClinicalReferral

        with mock.patch("hmis.apps.referrals.signals.publish_event") as pub:
            ClinicalReferral.objects.create(
                encounter=sample_encounter,
                patient=sample_encounter.patient,
                target_service="PHYSIOTHERAPY",
                reason="Rehab",
                referred_by=test_user,
            )

        event_types = [
            (c.kwargs.get("event_type") or (c.args[0] if c.args else None))
            for c in pub.call_args_list
        ]
        assert ReferralEvents.CREATED in event_types

    def test_referral_acceptance_publishes_event(self, db, sample_encounter, test_user):
        from hmis.apps.core.events.types import ReferralEvents
        from hmis.apps.referrals.models import ClinicalReferral

        ref = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Rehab",
            referred_by=test_user,
        )

        with mock.patch("hmis.apps.referrals.signals.publish_event") as pub:
            ref.accept(user=test_user)

        event_types = [
            (c.kwargs.get("event_type") or (c.args[0] if c.args else None))
            for c in pub.call_args_list
        ]
        assert ReferralEvents.ACCEPTED in event_types

    def test_referral_cancellation_publishes_event(self, db, sample_encounter, test_user):
        from hmis.apps.core.events.types import ReferralEvents
        from hmis.apps.referrals.models import ClinicalReferral

        ref = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Rehab",
            referred_by=test_user,
        )

        with mock.patch("hmis.apps.referrals.signals.publish_event") as pub:
            ref.cancel(user=test_user, reason="Test")

        event_types = [
            (c.kwargs.get("event_type") or (c.args[0] if c.args else None))
            for c in pub.call_args_list
        ]
        assert ReferralEvents.CANCELLED in event_types


# ---------------------------------------------------------------------------
# Encounter disposition revert
# ---------------------------------------------------------------------------


class TestEncounterDispositionRevert:
    def test_cancel_reverts_disposition_when_no_active_siblings(
        self, db, sample_encounter, test_user
    ):
        """Cancelling the only active referral clears encounter.disposition."""
        from hmis.apps.referrals.models import ClinicalReferral

        ref = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Rehab",
            referred_by=test_user,
        )
        sample_encounter.refresh_from_db()
        assert sample_encounter.disposition  # signal set it

        ref.cancel(user=test_user, reason="Patient declined")

        sample_encounter.refresh_from_db()
        assert sample_encounter.disposition in ("", None)

    def test_cancel_keeps_disposition_when_other_active_referral_exists(
        self, db, sample_encounter, test_user
    ):
        """Cancelling one referral when another is still active leaves disposition intact."""
        from hmis.apps.referrals.models import ClinicalReferral

        ref1 = ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="PHYSIOTHERAPY",
            reason="Rehab",
            referred_by=test_user,
        )
        ClinicalReferral.objects.create(
            encounter=sample_encounter,
            patient=sample_encounter.patient,
            target_service="NUTRITION",
            reason="Diet plan",
            referred_by=test_user,
        )
        sample_encounter.refresh_from_db()
        original = sample_encounter.disposition
        assert original

        ref1.cancel(user=test_user, reason="Duplicate")

        sample_encounter.refresh_from_db()
        assert sample_encounter.disposition == original


# ---------------------------------------------------------------------------
# Concurrent number generation
# ---------------------------------------------------------------------------


class TestConcurrentNumbering:
    def test_sequential_numbering_uniqueness_under_load(self, db, sample_encounter, test_user):
        """Bulk-creating referrals must produce unique referral_numbers."""
        from hmis.apps.referrals.models import ClinicalReferral

        created = []
        for _ in range(20):
            ref = ClinicalReferral.objects.create(
                encounter=sample_encounter,
                patient=sample_encounter.patient,
                target_service="PHYSIOTHERAPY",
                reason="Rehab",
                referred_by=test_user,
            )
            created.append(ref.referral_number)

        assert len(set(created)) == len(created)
