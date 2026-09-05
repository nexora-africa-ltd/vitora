"""
Tests for extended dashboard stats: checkin, inpatient, imaging, emergency, mch, theatre, allied_health.

Covers:
- Response structure (required keys present)
- Value types (all counts are ints, rate is float)
- Actual data accuracy when records are created
"""

import builtins
import logging

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status

from hmis.apps.core import dashboard_views_stats as dashboard_views

DASHBOARD_STATS_URL = "/api/core/dashboard/stats/"


def _fresh_stats(client):
    """Fetch dashboard stats bypassing cache."""
    cache.delete("dashboard_stats")
    return client.get(DASHBOARD_STATS_URL + "?refresh=true")


# =============================================================================
# Response structure – each new section must be present with required keys
# =============================================================================


@pytest.mark.django_db
class TestDashboardStatsCheckinSection:
    """Check-in section structure and accuracy."""

    def test_response_contains_checkin_section(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "checkin" in response.data
        checkin = response.data["checkin"]
        assert "checked_in_today" in checkin
        assert "waiting" in checkin
        assert "completed_today" in checkin

    def test_checkin_values_are_integers(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        for key in ("checked_in_today", "waiting", "completed_today"):
            assert isinstance(response.data["checkin"][key], int)

    def test_checkin_counts_reflect_data(
        self, authenticated_client, sample_patient, sample_facility
    ):
        """Creating check-ins should be reflected in stats."""
        from hmis.apps.checkin.models import CheckIn
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Check-in test",
            facility=sample_facility,
        )

        CheckIn.objects.create(
            patient=sample_patient,
            status="WAITING",
            checked_in_at=timezone.now(),
            encounter=encounter,
        )
        CheckIn.objects.create(
            patient=sample_patient,
            status="COMPLETED",
            checked_in_at=timezone.now(),
            encounter=encounter,
        )

        response = _fresh_stats(authenticated_client)
        checkin = response.data["checkin"]
        assert checkin["checked_in_today"] >= 2
        assert checkin["waiting"] >= 1
        assert checkin["completed_today"] >= 1


@pytest.mark.django_db
class TestDashboardStatsInpatientSection:
    """Inpatient / bed occupancy section."""

    def test_response_contains_inpatient_section(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "inpatient" in response.data
        inpatient = response.data["inpatient"]
        assert "current_admissions" in inpatient
        assert "available_beds" in inpatient
        assert "discharged_today" in inpatient
        assert "occupancy_rate" in inpatient

    def test_inpatient_count_values_are_integers(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        for key in ("current_admissions", "available_beds", "discharged_today"):
            assert isinstance(response.data["inpatient"][key], int)

    def test_occupancy_rate_is_number(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert isinstance(response.data["inpatient"]["occupancy_rate"], (int, float))

    def test_occupancy_rate_between_zero_and_hundred(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        rate = response.data["inpatient"]["occupancy_rate"]
        assert 0 <= rate <= 100


@pytest.mark.django_db
class TestDashboardStatsImagingSection:
    """Imaging / radiology section."""

    def test_response_contains_imaging_section(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "imaging" in response.data
        imaging = response.data["imaging"]
        assert "pending_orders" in imaging
        assert "completed_today" in imaging
        assert "urgent_orders" in imaging

    def test_imaging_values_are_integers(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        for key in ("pending_orders", "completed_today", "urgent_orders"):
            assert isinstance(response.data["imaging"][key], int)

    def test_urgent_orders_subset_of_pending(self, authenticated_client):
        """Urgent orders should never exceed total pending."""
        response = _fresh_stats(authenticated_client)
        imaging = response.data["imaging"]
        assert imaging["urgent_orders"] <= imaging["pending_orders"]


@pytest.mark.django_db
class TestDashboardStatsEmergencySection:
    """Emergency access override section."""

    def test_response_contains_emergency_section(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "emergency" in response.data
        emergency = response.data["emergency"]
        assert "active_overrides" in emergency
        assert "pending_review" in emergency

    def test_emergency_values_are_integers(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        for key in ("active_overrides", "pending_review"):
            assert isinstance(response.data["emergency"][key], int)

    def test_emergency_counts_reflect_data(self, authenticated_client, test_user, sample_patient):
        """Creating an active emergency access should appear in stats."""
        from hmis.apps.core.emergency_access.models import EmergencyAccess

        EmergencyAccess.objects.create(
            user=test_user,
            patient=sample_patient,
            reason="LIFE_THREATENING",
            reason_details="Test active override",
            status="ACTIVE",
            duration_minutes=60,
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )

        response = _fresh_stats(authenticated_client)
        assert response.data["emergency"]["active_overrides"] >= 1


@pytest.mark.django_db
class TestDashboardStatsMCHSection:
    """MCH (Maternal & Child Health) section."""

    def test_response_contains_mch_section(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "mch" in response.data
        mch = response.data["mch"]
        assert "active_registrations" in mch
        assert "high_risk" in mch
        assert "deliveries_today" in mch

    def test_mch_values_are_integers(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        for key in ("active_registrations", "high_risk", "deliveries_today"):
            assert isinstance(response.data["mch"][key], int)

    def test_high_risk_subset_of_active(self, authenticated_client):
        """High risk count should not exceed active registrations."""
        response = _fresh_stats(authenticated_client)
        mch = response.data["mch"]
        assert mch["high_risk"] <= mch["active_registrations"]


@pytest.mark.django_db
class TestDashboardStatsTheatreSection:
    """Theatre / scheduling section."""

    def test_response_contains_theatre_section(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "theatre" in response.data
        theatre = response.data["theatre"]
        assert "scheduled_today" in theatre
        assert "in_progress" in theatre
        assert "completed_today" in theatre

    def test_theatre_values_are_integers(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        for key in ("scheduled_today", "in_progress", "completed_today"):
            assert isinstance(response.data["theatre"][key], int)

    def test_in_progress_subset_of_scheduled(self, authenticated_client):
        """In-progress procedures should not exceed total scheduled."""
        response = _fresh_stats(authenticated_client)
        theatre = response.data["theatre"]
        assert theatre["in_progress"] <= theatre["scheduled_today"]


@pytest.mark.django_db
class TestDashboardStatsAlliedHealthSection:
    """Allied health section (physio, nutrition, OT, social work)."""

    def test_response_contains_allied_health_section(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK
        assert "allied_health" in response.data
        ah = response.data["allied_health"]
        assert "pending_referrals" in ah
        assert "sessions_today" in ah
        assert "open_cases" in ah

    def test_allied_health_values_are_integers(self, authenticated_client):
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        for key in ("pending_referrals", "sessions_today", "open_cases"):
            assert isinstance(response.data["allied_health"][key], int)

    def test_allied_health_values_non_negative(self, authenticated_client):
        response = _fresh_stats(authenticated_client)
        for key in ("pending_referrals", "sessions_today", "open_cases"):
            assert response.data["allied_health"][key] >= 0


# =============================================================================
# Cross-section consistency
# =============================================================================


@pytest.mark.django_db
class TestDashboardStatsExtendedCrossCuts:
    """Cross-cutting tests for all new sections."""

    def test_all_new_sections_present_in_single_response(self, authenticated_client):
        """A single request should include all 7 new sections."""
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        assert response.status_code == status.HTTP_200_OK
        for section in (
            "checkin",
            "inpatient",
            "imaging",
            "emergency",
            "mch",
            "theatre",
            "allied_health",
        ):
            assert section in response.data, f"Missing section: {section}"

    def test_new_sections_survive_cache_roundtrip(self, authenticated_client):
        """Cached response must still contain all new sections."""
        cache.delete("dashboard_stats")
        # First request populates cache
        authenticated_client.get(DASHBOARD_STATS_URL)
        # Second request reads from cache
        response = authenticated_client.get(DASHBOARD_STATS_URL)
        for section in (
            "checkin",
            "inpatient",
            "imaging",
            "emergency",
            "mch",
            "theatre",
            "allied_health",
        ):
            assert section in response.data

    def test_cache_bypass_returns_fresh_new_sections(self, authenticated_client):
        """Refresh=true should still include all new sections."""
        response = _fresh_stats(authenticated_client)
        assert response.status_code == status.HTTP_200_OK
        for section in (
            "checkin",
            "inpatient",
            "imaging",
            "emergency",
            "mch",
            "theatre",
            "allied_health",
        ):
            assert section in response.data

    def test_all_new_section_counts_non_negative(self, authenticated_client):
        """Every numeric value in new sections should be >= 0."""
        response = _fresh_stats(authenticated_client)
        for section in (
            "checkin",
            "inpatient",
            "imaging",
            "emergency",
            "mch",
            "theatre",
            "allied_health",
        ):
            for key, value in response.data[section].items():
                assert isinstance(value, (int, float)), (
                    f"{section}.{key} should be numeric, got {type(value)}"
                )
                assert value >= 0, f"{section}.{key} should be >= 0, got {value}"


@pytest.mark.django_db
class TestDashboardStatsFailurePaths:
    """Failure-path behavior for dashboard fallback resilience boundaries."""

    def test_billing_stats_query_failure_logs_and_falls_back(
        self, monkeypatch, caplog, sample_facility, sample_organization
    ):
        from hmis.apps.billing.models import Payment

        def _raise_timeout(*_args, **_kwargs):
            raise TimeoutError("payment query timed out")

        monkeypatch.setattr(Payment.objects, "filter", _raise_timeout)
        caplog.set_level(logging.ERROR)

        result = dashboard_views._get_billing_stats(
            today=timezone.localdate(),
            facility=sample_facility,
            organization=sample_organization,
        )

        assert result == {"revenue_today": 0, "pending_payments": 0, "sha_claims_pending": 0}
        assert any(
            getattr(record, "section", "") == "billing" and "returning fallback" in record.message
            for record in caplog.records
        )

    def test_pharmacy_missing_dependency_logs_and_falls_back(
        self, monkeypatch, caplog, sample_facility, sample_organization
    ):
        original_import = builtins.__import__

        def _raise_for_pharmacy(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "hmis.apps.pharmacy.models":
                raise ImportError("pharmacy disabled")
            return original_import(name, globals, locals, fromlist, level)

        monkeypatch.setattr(builtins, "__import__", _raise_for_pharmacy)
        caplog.set_level(logging.INFO)

        result = dashboard_views._get_pharmacy_stats(
            today=timezone.localdate(),
            facility=sample_facility,
            organization=sample_organization,
        )

        assert result == {
            "prescriptions_today": 0,
            "pending_dispensing": 0,
            "low_stock_items": 0,
            "expiring_soon": 0,
        }
        assert any(
            getattr(record, "section", "") == "pharmacy" and "missing dependency" in record.message
            for record in caplog.records
        )


@pytest.mark.django_db
class TestDashboardStatsFieldRegression:
    """Regressions for schema-drift field names in dashboard stat helpers."""

    def test_laboratory_stats_count_critical_results_via_lab_order_scope(
        self, sample_lab_result, sample_facility, sample_organization
    ):
        sample_lab_result.is_critical_result = True
        sample_lab_result.save(update_fields=["is_critical_result"])

        stats = dashboard_views._get_laboratory_stats(
            today=timezone.localdate(),
            facility=sample_facility,
            organization=sample_organization,
        )

        assert stats["critical_results"] == 1

    def test_triage_stats_use_current_triage_fields(
        self,
        sample_patient,
        sample_facility,
        sample_organization,
        test_user,
    ):
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.triage.models import TriageAssessment

        now = timezone.now()
        waiting_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            chief_complaint="Shortness of breath",
            facility=sample_facility,
            organization=sample_organization,
        )
        seen_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Follow-up review",
            facility=sample_facility,
            organization=sample_organization,
        )

        TriageAssessment.objects.create(
            encounter=waiting_encounter,
            chief_complaint="Shortness of breath",
            chief_complaint_category="DIFFICULTY_BREATHING",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="RED",
            auto_calculated_category="RED",
            assigned_area="ER_RESUS",
            arrival_time=now - timezone.timedelta(minutes=25),
            triage_start_time=now - timezone.timedelta(minutes=20),
            triaged_by=test_user,
        )
        TriageAssessment.objects.create(
            encounter=seen_encounter,
            chief_complaint="Follow-up review",
            chief_complaint_category="OTHER",
            mental_status="A",
            mobility="AMBULATORY",
            triage_category="GREEN",
            auto_calculated_category="GREEN",
            assigned_area="OPD",
            arrival_time=now - timezone.timedelta(minutes=45),
            triage_start_time=now - timezone.timedelta(minutes=35),
            seen_by_clinician_time=now - timezone.timedelta(minutes=5),
            triaged_by=test_user,
        )

        stats = dashboard_views._get_triage_stats(
            today=timezone.localdate(),
            facility=sample_facility,
            organization=sample_organization,
        )

        assert stats["waiting"] == 1
        assert stats["emergency_count"] == 1
        assert stats["avg_wait_time_minutes"] == 30.0

    def test_alert_stats_use_is_resolved_flag(
        self, sample_drug, sample_facility, sample_organization
    ):
        from hmis.apps.pharmacy.models import StockAlert

        StockAlert.objects.create(
            drug=sample_drug,
            alert_type="LOW_STOCK",
            severity="CRITICAL",
            message="Critical stock alert",
            is_resolved=False,
            facility=sample_facility,
            organization=sample_organization,
        )
        StockAlert.objects.create(
            drug=sample_drug,
            alert_type="LOW_STOCK",
            severity="HIGH",
            message="High stock alert",
            is_resolved=False,
            facility=sample_facility,
            organization=sample_organization,
        )
        StockAlert.objects.create(
            drug=sample_drug,
            alert_type="LOW_STOCK",
            severity="MEDIUM",
            message="Resolved stock alert",
            is_resolved=True,
            facility=sample_facility,
            organization=sample_organization,
        )

        stats = dashboard_views._get_alert_stats(
            facility=sample_facility,
            organization=sample_organization,
        )

        assert stats["critical"] == 1
        assert stats["high"] == 1
        assert stats["medium"] == 0
        assert stats["total_unresolved"] == 2

    def test_billing_stats_scope_payments_via_invoice_relation(
        self, monkeypatch, sample_facility, sample_organization
    ):
        from hmis.apps.billing.models import Payment

        class _AggQuery:
            def aggregate(self, **_kwargs):
                return {"total": 0}

        captured_kwargs = {}

        def _capture_filter(*_args, **kwargs):
            captured_kwargs.update(kwargs)
            return _AggQuery()

        monkeypatch.setattr(Payment.objects, "filter", _capture_filter)

        stats = dashboard_views._get_billing_stats(
            today=timezone.localdate(),
            facility=sample_facility,
            organization=sample_organization,
        )

        assert "invoice__facility" in captured_kwargs
        assert "facility" not in captured_kwargs
        assert stats["revenue_today"] == 0

    def test_imaging_stats_scope_via_encounter_relation(
        self, monkeypatch, sample_facility, sample_organization
    ):
        from hmis.apps.imaging.models import ImagingOrder

        class _CountQuery:
            def count(self):
                return 0

        calls = []

        def _capture_filter(*_args, **kwargs):
            calls.append(kwargs)
            return _CountQuery()

        monkeypatch.setattr(ImagingOrder.objects, "filter", _capture_filter)

        stats = dashboard_views._get_imaging_stats(
            today=timezone.localdate(),
            facility=sample_facility,
            organization=sample_organization,
        )

        assert calls
        assert all("encounter__facility" in kwargs for kwargs in calls)
        assert all("facility" not in kwargs for kwargs in calls)
        assert stats == {"pending_orders": 0, "completed_today": 0, "urgent_orders": 0}

    def test_allied_health_uses_status_changed_at_for_physio_sessions(
        self, monkeypatch, sample_facility, sample_organization
    ):
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        class _CountQuery:
            def count(self):
                return 0

        calls = []

        def _capture_filter(*_args, **kwargs):
            calls.append(kwargs)
            return _CountQuery()

        monkeypatch.setattr(PhysiotherapyOrder.objects, "filter", _capture_filter)

        stats = dashboard_views._get_allied_health_stats(
            today=timezone.localdate(),
            facility=sample_facility,
            organization=sample_organization,
        )

        assert any("status_changed_at__date" in kwargs for kwargs in calls)
        assert all("updated_at__date" not in kwargs for kwargs in calls)
        assert stats["sessions_today"] >= 0

    def test_allied_health_scopes_social_work_cases_through_referral(
        self, monkeypatch, sample_facility, sample_organization
    ):
        """Social work cases inherit tenant scope from their referral, not a direct facility FK."""
        from hmis.apps.social_work.models import SocialWorkCase

        class _CountQuery:
            def count(self):
                return 0

        calls = []

        def _capture_filter(*_args, **kwargs):
            calls.append(kwargs)
            return _CountQuery()

        monkeypatch.setattr(SocialWorkCase.objects, "filter", _capture_filter)

        dashboard_views._get_allied_health_stats(
            today=timezone.localdate(), facility=sample_facility, organization=sample_organization
        )

        assert calls == [{"status": "OPEN", "referral__facility": sample_facility}]

    def test_allied_health_logging_extra_avoids_reserved_module_key(
        self, monkeypatch, caplog, sample_facility, sample_organization
    ):
        from hmis.apps.physiotherapy.models import PhysiotherapyOrder

        def _raise_timeout(*_args, **_kwargs):
            raise TimeoutError("physio aggregate timed out")

        monkeypatch.setattr(PhysiotherapyOrder.objects, "filter", _raise_timeout)
        caplog.set_level(logging.ERROR)

        stats = dashboard_views._get_allied_health_stats(
            today=timezone.localdate(),
            facility=sample_facility,
            organization=sample_organization,
        )

        assert stats["pending_referrals"] >= 0
        assert any(
            getattr(record, "source_module", "") == "physiotherapy"
            and "aggregation failed" in record.message
            for record in caplog.records
        )
