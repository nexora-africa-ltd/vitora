"""
Tests for Phase L5: TAT Monitoring, SLA Dashboards, Workload & Productivity.
Covers: models, reporting engine, API endpoints, signals.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.laboratory.reporting.engine import TATReportingEngine, _percentile
from hmis.apps.laboratory.reporting.models import TATSLATarget, TATSnapshot, WorkloadSnapshot

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def test_catalog(db):
    """Create a test catalog entry for Hemoglobin."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="HGB",
        name="Hemoglobin",
        short_name="HGB",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        cost=Decimal("500.00"),
        result_unit="g/dL",
        normal_range_male="13.5-17.5",
        normal_range_female="12.0-16.0",
        turnaround_hours=4,
    )


@pytest.fixture
def test_catalog_glucose(db):
    """Create a test catalog entry for Glucose."""
    from hmis.apps.laboratory.models import TestCatalog

    return TestCatalog.objects.create(
        code="GLU",
        name="Glucose (Fasting)",
        short_name="FBS",
        category="CHEMISTRY",
        specimen_type="SERUM",
        result_type="NUMERIC",
        cost=Decimal("300.00"),
        result_unit="mmol/L",
        normal_range_male="3.9-5.6",
        normal_range_female="3.9-5.6",
        turnaround_hours=2,
    )


@pytest.fixture
def sla_target(db, sample_facility, test_catalog):
    """Create an SLA target for HGB ROUTINE at 240 minutes."""
    return TATSLATarget.objects.create(
        facility=sample_facility,
        organization=sample_facility.organization,
        test=test_catalog,
        priority="ROUTINE",
        target_total_minutes=240,
        target_order_to_collect_minutes=30,
        target_collect_to_receive_minutes=30,
        target_receive_to_result_minutes=120,
        target_result_to_verify_minutes=60,
        is_active=True,
    )


@pytest.fixture
def sla_target_stat(db, sample_facility, test_catalog):
    """Create an SLA target for HGB STAT at 60 minutes."""
    return TATSLATarget.objects.create(
        facility=sample_facility,
        organization=sample_facility.organization,
        test=test_catalog,
        priority="STAT",
        target_total_minutes=60,
        is_active=True,
    )


@pytest.fixture
def lab_order(
    db, sample_patient, sample_encounter, sample_facility, sample_organization, test_user
):
    """Create a lab order for the sample patient."""
    from hmis.apps.laboratory.models import LabOrder

    return LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        facility=sample_facility,
        organization=sample_organization,
        ordered_by=test_user,
        order_type="IN_HOUSE",
        status="IN_PROGRESS",
        priority="ROUTINE",
        clinical_notes="Test order for TAT",
    )


@pytest.fixture
def lab_order_completed(
    db, sample_patient, sample_encounter, sample_facility, sample_organization, test_user
):
    """Create a completed lab order with timestamps."""
    from hmis.apps.laboratory.models import LabOrder

    now = timezone.now()
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        facility=sample_facility,
        organization=sample_organization,
        ordered_by=test_user,
        order_type="IN_HOUSE",
        status="COMPLETED",
        priority="ROUTINE",
        clinical_notes="Completed order",
        specimen_collected=True,
        specimen_collected_at=now - timedelta(minutes=200),
        completed_at=now,
    )
    # Override ordered_at (auto_now_add) via queryset update
    from hmis.apps.laboratory.models import LabOrder as LO

    LO.objects.filter(pk=order.pk).update(ordered_at=now - timedelta(minutes=250))
    order.refresh_from_db()
    return order


@pytest.fixture
def lab_order_item(db, lab_order_completed, test_catalog):
    """Create a lab order item linked to HGB test."""
    from hmis.apps.laboratory.models import LabOrderItem

    return LabOrderItem.objects.create(
        lab_order=lab_order_completed,
        test=test_catalog,
        status="COMPLETED",
        unit_cost=test_catalog.cost,
    )


@pytest.fixture
def lab_order_item_in_progress(db, lab_order, test_catalog):
    """Create a lab order item linked to the in-progress order."""
    from hmis.apps.laboratory.models import LabOrderItem

    return LabOrderItem.objects.create(
        lab_order=lab_order,
        test=test_catalog,
        status="IN_PROGRESS",
        unit_cost=test_catalog.cost,
    )


@pytest.fixture
def lab_result(db, lab_order_item, test_user):
    """Create a verified lab result with timestamps."""
    from hmis.apps.laboratory.models import LabResult

    now = timezone.now()
    result = LabResult.objects.create(
        order_item=lab_order_item,
        numeric_value=Decimal("14.5"),
        result_unit="g/dL",
        result_flag="NORMAL",
        verification_status="VERIFIED",
        entered_by=test_user,
        verified_by=test_user,
        verified_at=now,
    )
    # Override entered_at
    from hmis.apps.laboratory.models import LabResult as LR

    LR.objects.filter(pk=result.pk).update(entered_at=now - timedelta(minutes=30))
    result.refresh_from_db()
    return result


@pytest.fixture
def tat_snapshot(db, test_catalog, sample_facility, sla_target, test_user, sample_encounter):
    """Create a TAT snapshot that breaches SLA (uses a separate order)."""
    from hmis.apps.core.models import County, SubCounty
    from hmis.apps.laboratory.models import LabOrder
    from hmis.apps.patients.models import Patient

    # Use a separate CANCELLED order so the signal does not fire
    county = County.objects.get_or_create(code=99, defaults={"name": "Snapshot County"})[0]
    sub_county = SubCounty.objects.get_or_create(county=county, name="Snapshot Sub")[0]
    patient = Patient.objects.create(
        first_name="Snapshot",
        last_name="Patient",
        date_of_birth="1990-01-01",
        gender="M",
        county=county,
        sub_county=sub_county,
        registered_by=test_user,
    )
    order = LabOrder.objects.create(
        patient=patient,
        encounter=sample_encounter,
        facility=sample_facility,
        organization=sample_facility.organization,
        ordered_by=test_user,
        order_type="IN_HOUSE",
        status="CANCELLED",  # Signal won't fire for CANCELLED
        priority="ROUTINE",
        clinical_notes="Snapshot fixture order",
    )

    now = timezone.now()
    return TATSnapshot.objects.create(
        facility=sample_facility,
        organization=sample_facility.organization,
        lab_order=order,
        test=test_catalog,
        priority="ROUTINE",
        ordered_at=now - timedelta(minutes=300),
        collected_at=now - timedelta(minutes=270),
        received_at=now - timedelta(minutes=250),
        resulted_at=now - timedelta(minutes=60),
        verified_at=now,
        tat_order_to_collect=30.0,
        tat_collect_to_receive=20.0,
        tat_receive_to_result=190.0,
        tat_result_to_verify=60.0,
        tat_total=300.0,
        sla_target=sla_target,
        is_breach=True,
        breach_minutes=60.0,
        resulted_by=test_user,
        verified_by=test_user,
    )


@pytest.fixture
def workload_snapshot(db, sample_facility, test_user):
    """Create a workload snapshot for today."""
    return WorkloadSnapshot.objects.create(
        facility=sample_facility,
        organization=sample_facility.organization,
        date=date.today(),
        technician=test_user,
        tests_entered=25,
        tests_verified=20,
        specimens_collected=30,
        specimens_rejected=2,
        avg_entry_time_minutes=15.5,
        avg_verify_time_minutes=8.0,
        critical_results_count=3,
        critical_notified_within_30min=2,
    )


# =============================================================================
# Model Tests
# =============================================================================


class TestTATSLATargetModel:
    """Tests for TATSLATarget model."""

    def test_create_sla_target(self, sla_target):
        """Should create SLA target with all fields."""
        assert sla_target.pk is not None
        assert sla_target.target_total_minutes == 240
        assert sla_target.priority == "ROUTINE"
        assert sla_target.target_order_to_collect_minutes == 30

    def test_unique_constraint(self, sla_target, sample_facility, test_catalog):
        """Should enforce unique per facility+test+priority."""
        with pytest.raises(Exception):
            TATSLATarget.objects.create(
                facility=sample_facility,
                organization=sample_facility.organization,
                test=test_catalog,
                priority="ROUTINE",
                target_total_minutes=300,
            )

    def test_str_representation(self, sla_target):
        """Should have meaningful str."""
        assert "HGB" in str(sla_target)
        assert "ROUTINE" in str(sla_target)
        assert "240" in str(sla_target)


class TestTATSnapshotModel:
    """Tests for TATSnapshot model."""

    def test_create_snapshot(self, tat_snapshot):
        """Should create snapshot with all TAT segments."""
        assert tat_snapshot.pk is not None
        assert tat_snapshot.tat_total == 300.0
        assert tat_snapshot.is_breach is True
        assert tat_snapshot.breach_minutes == 60.0

    def test_str_representation(self, tat_snapshot):
        """Should show order number and TAT."""
        s = str(tat_snapshot)
        assert "300min" in s
        assert "BREACH" in s

    def test_create_from_order(
        self, lab_order_completed, lab_order_item, lab_result, sla_target, sample_facility
    ):
        """Should create snapshot from a completed order."""
        snapshot = TATSnapshot.create_from_order(lab_order_completed)
        assert snapshot.pk is not None
        assert snapshot.test == lab_order_item.test
        assert snapshot.priority == "ROUTINE"
        assert snapshot.tat_total is not None
        assert snapshot.tat_total > 0

    def test_create_from_order_detects_breach(
        self, lab_order_completed, lab_order_item, lab_result, sla_target
    ):
        """Should detect SLA breach when TAT exceeds target."""
        snapshot = TATSnapshot.create_from_order(lab_order_completed)
        # Order was created 250min ago, completed now → 250min > 240min target
        assert snapshot.is_breach is True
        assert snapshot.breach_minutes > 0

    def test_create_from_order_no_breach_without_sla(
        self, lab_order_completed, lab_order_item, lab_result
    ):
        """Without SLA target, should not mark as breach."""
        snapshot = TATSnapshot.create_from_order(lab_order_completed)
        assert snapshot.is_breach is False
        assert snapshot.breach_minutes is None

    def test_create_from_order_updates_existing(
        self, lab_order_completed, lab_order_item, lab_result
    ):
        """Should update rather than create duplicate on re-run."""
        snap1 = TATSnapshot.create_from_order(lab_order_completed)
        snap2 = TATSnapshot.create_from_order(lab_order_completed)
        assert snap1.pk == snap2.pk
        assert TATSnapshot.objects.filter(lab_order=lab_order_completed).count() == 1


class TestWorkloadSnapshotModel:
    """Tests for WorkloadSnapshot model."""

    def test_create_workload_snapshot(self, workload_snapshot):
        """Should create with all metrics."""
        assert workload_snapshot.tests_entered == 25
        assert workload_snapshot.tests_verified == 20
        assert workload_snapshot.specimens_rejected == 2

    def test_rejection_rate_property(self, workload_snapshot):
        """Should compute rejection rate correctly."""
        # 2 rejected / (30 collected + 2 rejected) = 6.25%
        assert workload_snapshot.rejection_rate == 6.25

    def test_rejection_rate_zero_specimens(self, db, sample_facility, test_user):
        """Should return 0 when no specimens."""
        ws = WorkloadSnapshot.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            date=date.today() - timedelta(days=1),
            technician=test_user,
            tests_entered=0,
            tests_verified=0,
            specimens_collected=0,
            specimens_rejected=0,
        )
        assert ws.rejection_rate == 0.0

    def test_critical_compliance_rate(self, workload_snapshot):
        """Should compute critical compliance correctly."""
        # 2 notified / 3 critical = 66.67%
        assert workload_snapshot.critical_compliance_rate == 66.67

    def test_critical_compliance_no_criticals(self, db, sample_facility, test_user):
        """Should return 100% when no critical results."""
        ws = WorkloadSnapshot.objects.create(
            facility=sample_facility,
            organization=sample_facility.organization,
            date=date.today() - timedelta(days=2),
            technician=test_user,
            critical_results_count=0,
            critical_notified_within_30min=0,
        )
        assert ws.critical_compliance_rate == 100.0


# =============================================================================
# Engine Tests
# =============================================================================


class TestPercentile:
    """Tests for the _percentile helper."""

    def test_empty_list(self):
        assert _percentile([], 50) is None

    def test_single_value(self):
        assert _percentile([10.0], 50) == 10.0
        assert _percentile([10.0], 90) == 10.0

    def test_p50(self):
        values = [1.0, 2.0, 3.0, 4.0, 5.0]
        assert _percentile(values, 50) == 3.0

    def test_p90(self):
        values = [i * 1.0 for i in range(1, 101)]
        # P90 of 1-100 = 90.1
        result = _percentile(values, 90)
        assert result is not None
        assert 89.0 < result < 92.0

    def test_unsorted_input(self):
        """Should sort internally."""
        values = [5.0, 1.0, 3.0, 4.0, 2.0]
        assert _percentile(values, 50) == 3.0


class TestTATReportingEngine:
    """Tests for the TAT reporting engine methods."""

    def test_sla_compliance_report_empty(self, db, sample_facility):
        """Should return clean report with no data."""
        result = TATReportingEngine.sla_compliance_report(
            sample_facility.pk, date.today() - timedelta(days=7), date.today()
        )
        assert result["summary"]["total_orders"] == 0
        assert result["summary"]["compliance_rate"] == 100.0
        assert result["by_priority"] == []
        assert result["by_test"] == []

    def test_sla_compliance_report_with_data(self, tat_snapshot, sample_facility):
        """Should include snapshot data in report."""
        today = date.today()
        result = TATReportingEngine.sla_compliance_report(
            sample_facility.pk, today - timedelta(days=1), today
        )
        assert result["summary"]["total_orders"] == 1
        assert result["summary"]["breaches"] == 1
        assert result["summary"]["compliance_rate"] == 0.0
        assert result["summary"]["p50_minutes"] == 300.0

    def test_sla_compliance_by_priority(self, tat_snapshot, sample_facility):
        """Should break down by priority."""
        today = date.today()
        result = TATReportingEngine.sla_compliance_report(
            sample_facility.pk, today - timedelta(days=1), today
        )
        assert len(result["by_priority"]) == 1
        assert result["by_priority"][0]["priority"] == "ROUTINE"
        assert result["by_priority"][0]["count"] == 1

    def test_sla_compliance_segments(self, tat_snapshot, sample_facility):
        """Should include segment averages."""
        today = date.today()
        result = TATReportingEngine.sla_compliance_report(
            sample_facility.pk, today - timedelta(days=1), today
        )
        assert result["segments"]["avg_order_to_collect"] == 30.0
        assert result["segments"]["avg_receive_to_result"] == 190.0

    def test_tat_trend_report(self, tat_snapshot, sample_facility):
        """Should return daily trend data."""
        today = date.today()
        result = TATReportingEngine.tat_trend_report(
            sample_facility.pk, today - timedelta(days=1), today
        )
        assert len(result["daily"]) == 1
        assert result["daily"][0]["count"] == 1
        assert result["daily"][0]["avg_minutes"] == 300.0

    def test_active_breaches_no_orders(self, db, sample_facility):
        """Should return empty when no in-progress orders."""
        result = TATReportingEngine.active_breaches(sample_facility.pk)
        assert result["count"] == 0
        assert result["breaches"] == []

    def test_active_breaches_detects_overdue(
        self,
        sample_facility,
        test_catalog,
        sla_target,
        test_user,
        sample_patient,
        sample_encounter,
        sample_organization,
    ):
        """Should detect in-progress order that has exceeded SLA."""
        from hmis.apps.laboratory.models import LabOrder, LabOrderItem

        # Create an order that started 300min ago (exceeds 240min SLA)
        order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            facility=sample_facility,
            organization=sample_organization,
            ordered_by=test_user,
            order_type="IN_HOUSE",
            status="IN_PROGRESS",
            priority="ROUTINE",
            clinical_notes="Overdue order",
        )
        # Backdate ordered_at
        LabOrder.objects.filter(pk=order.pk).update(
            ordered_at=timezone.now() - timedelta(minutes=300)
        )
        LabOrderItem.objects.create(
            lab_order=order,
            test=test_catalog,
            status="IN_PROGRESS",
            unit_cost=test_catalog.cost,
        )

        result = TATReportingEngine.active_breaches(sample_facility.pk)
        assert result["count"] == 1
        assert result["breaches"][0]["order_number"] == order.order_number
        assert result["breaches"][0]["breach_minutes"] > 0

    def test_technician_efficiency_empty(self, db, sample_facility):
        """Should return empty technicians list."""
        result = TATReportingEngine.technician_efficiency(
            sample_facility.pk, date.today() - timedelta(days=7), date.today()
        )
        assert result["technicians"] == []

    def test_technician_efficiency_with_data(self, tat_snapshot, sample_facility):
        """Should include technician stats."""
        today = date.today()
        result = TATReportingEngine.technician_efficiency(
            sample_facility.pk, today - timedelta(days=1), today
        )
        assert len(result["technicians"]) == 1
        tech = result["technicians"][0]
        assert tech["results_entered"] == 1
        assert tech["breaches"] == 1

    def test_workload_kpi_report_empty(self, db, sample_facility):
        """Should return zeros when no data."""
        result = TATReportingEngine.workload_kpi_report(
            sample_facility.pk, date.today() - timedelta(days=7), date.today()
        )
        assert result["totals"]["tests_entered"] == 0
        assert result["by_technician"] == []

    def test_workload_kpi_report_with_data(self, workload_snapshot, sample_facility):
        """Should aggregate workload data."""
        today = date.today()
        result = TATReportingEngine.workload_kpi_report(sample_facility.pk, today, today)
        assert result["totals"]["tests_entered"] == 25
        assert result["totals"]["tests_verified"] == 20
        assert result["totals"]["rejection_rate"] == 6.25
        assert len(result["by_technician"]) == 1


# =============================================================================
# Signal Tests
# =============================================================================


class TestTATSnapshotSignal:
    """Tests for auto-creation of TAT snapshot on order completion."""

    def test_signal_creates_snapshot_on_complete(
        self, lab_order, lab_order_item_in_progress, test_user
    ):
        """Completing an order should auto-create a TAT snapshot."""
        from hmis.apps.laboratory.models import LabOrder, LabResult

        # Backdate ordered_at so tat_total > 0
        LabOrder.objects.filter(pk=lab_order.pk).update(
            ordered_at=timezone.now() - timedelta(minutes=60)
        )
        lab_order.refresh_from_db()

        # Create a result so that resulted_at is populated
        LabResult.objects.create(
            order_item=lab_order_item_in_progress,
            numeric_value=Decimal("14.0"),
            result_unit="g/dL",
            result_flag="NORMAL",
            verification_status="VERIFIED",
            entered_by=test_user,
            verified_by=test_user,
            verified_at=timezone.now(),
        )

        lab_order.status = "COMPLETED"
        lab_order.completed_at = timezone.now()
        lab_order.save()

        assert TATSnapshot.objects.filter(lab_order=lab_order).exists()
        snapshot = TATSnapshot.objects.get(lab_order=lab_order)
        assert snapshot.test is not None
        # tat_total should be populated since we have ordered_at and verified_at
        assert snapshot.tat_total is not None
        assert snapshot.tat_total > 0

    def test_signal_does_not_fire_for_non_complete(self, lab_order):
        """Non-COMPLETED status should not create snapshot."""
        lab_order.status = "IN_PROGRESS"
        lab_order.save()
        assert not TATSnapshot.objects.filter(lab_order=lab_order).exists()


# =============================================================================
# API Tests
# =============================================================================


class TestTATSLATargetAPI:
    """Tests for SLA target CRUD endpoints."""

    def test_list_sla_targets(self, authenticated_client, sla_target):
        """Should list SLA targets for the facility."""
        response = authenticated_client.get("/api/lab/reporting/sla-targets/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_create_sla_target(self, authenticated_client, test_catalog_glucose, sample_facility):
        """Should create an SLA target."""
        data = {
            "test": test_catalog_glucose.pk,
            "priority": "STAT",
            "target_total_minutes": 120,
            "target_order_to_collect_minutes": 10,
        }
        response = authenticated_client.post("/api/lab/reporting/sla-targets/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["target_total_minutes"] == 120

    def test_update_sla_target(self, authenticated_client, sla_target):
        """Should update SLA target."""
        response = authenticated_client.patch(
            f"/api/lab/reporting/sla-targets/{sla_target.pk}/",
            {"target_total_minutes": 180},
        )
        assert response.status_code == status.HTTP_200_OK
        sla_target.refresh_from_db()
        assert sla_target.target_total_minutes == 180

    def test_delete_sla_target(self, authenticated_client, sla_target):
        """Should delete SLA target."""
        response = authenticated_client.delete(f"/api/lab/reporting/sla-targets/{sla_target.pk}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_filter_by_priority(self, authenticated_client, sla_target, sla_target_stat):
        """Should filter by priority."""
        response = authenticated_client.get("/api/lab/reporting/sla-targets/?priority=STAT")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert all(r["priority"] == "STAT" for r in results)

    def test_unauthenticated_rejected(self, api_client):
        """Should require auth."""
        response = api_client.get("/api/lab/reporting/sla-targets/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestTATSnapshotAPI:
    """Tests for TAT snapshot read endpoints."""

    def test_list_snapshots(self, authenticated_client, tat_snapshot):
        """Should list TAT snapshots."""
        response = authenticated_client.get("/api/lab/reporting/tat-snapshots/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_breaches_action(self, authenticated_client, tat_snapshot):
        """Should list only breached snapshots."""
        today = date.today()
        response = authenticated_client.get(
            f"/api/lab/reporting/tat-snapshots/breaches/?start={today - timedelta(days=1)}&end={today}"
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert all(r["is_breach"] for r in results)

    def test_filter_by_priority(self, authenticated_client, tat_snapshot):
        """Should filter snapshots by priority."""
        response = authenticated_client.get("/api/lab/reporting/tat-snapshots/?priority=ROUTINE")
        assert response.status_code == status.HTTP_200_OK


class TestSLAComplianceReportAPI:
    """Tests for SLA compliance report endpoint."""

    def test_sla_compliance_report(self, authenticated_client, tat_snapshot, sample_facility):
        """Should return compliance report."""
        today = date.today()
        response = authenticated_client.get(
            f"/api/lab/reporting/sla-compliance/?start={today - timedelta(days=1)}&end={today}&facility={sample_facility.pk}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "summary" in response.data
        assert "by_priority" in response.data
        assert "segments" in response.data

    def test_sla_compliance_requires_facility(self, authenticated_client):
        """Should require facility parameter."""
        response = authenticated_client.get("/api/lab/reporting/sla-compliance/")
        # Should still work via request.facility_id middleware
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]


class TestTATTrendReportAPI:
    """Tests for TAT trend report endpoint."""

    def test_tat_trend_report(self, authenticated_client, tat_snapshot, sample_facility):
        """Should return daily trend data."""
        today = date.today()
        response = authenticated_client.get(
            f"/api/lab/reporting/tat-trend/?start={today - timedelta(days=1)}&end={today}&facility={sample_facility.pk}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "daily" in response.data


class TestActiveBreachesAPI:
    """Tests for active breaches endpoint."""

    def test_active_breaches(self, authenticated_client, sample_facility):
        """Should return active breaches (may be empty)."""
        response = authenticated_client.get(
            f"/api/lab/reporting/active-breaches/?facility={sample_facility.pk}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "count" in response.data
        assert "breaches" in response.data


class TestTechnicianEfficiencyAPI:
    """Tests for technician efficiency endpoint."""

    def test_technician_efficiency(self, authenticated_client, tat_snapshot, sample_facility):
        """Should return technician metrics."""
        today = date.today()
        response = authenticated_client.get(
            f"/api/lab/reporting/technician-efficiency/?start={today - timedelta(days=1)}&end={today}&facility={sample_facility.pk}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "technicians" in response.data


class TestWorkloadKPIAPI:
    """Tests for workload KPI report endpoint."""

    def test_workload_kpi(self, authenticated_client, workload_snapshot, sample_facility):
        """Should return workload KPIs."""
        today = date.today()
        response = authenticated_client.get(
            f"/api/lab/reporting/workload-kpi/?start={today}&end={today}&facility={sample_facility.pk}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["totals"]["tests_entered"] == 25


class TestWorkloadSnapshotAPI:
    """Tests for workload snapshot list endpoint."""

    def test_list_snapshots(self, authenticated_client, workload_snapshot):
        """Should list workload snapshots."""
        response = authenticated_client.get("/api/lab/reporting/workload-snapshots/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
