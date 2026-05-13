"""
Tests for Inpatient module Django admin registrations.

Verifies that all 22 inpatient models are registered in admin
with correct list_display, list_filter, search_fields, and custom methods.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from django.utils import timezone

from hmis.apps.inpatient.admin import (
    AdmissionAdmin,
    AdmissionRecommendationAdmin,
    BedAdmin,
    BloodTransfusionObservationAdmin,
    BPMonitoringReadingAdmin,
    DischargeAdmin,
    FluidBalanceEntryAdmin,
    FluidBalanceEntryInline,
    FluidBalanceSheetAdmin,
    InpatientConsumableUsageAdmin,
    KardexHandoverNoteAdmin,
    KardexShiftNoteAdmin,
    MedicationAdministrationAdmin,
    NursingCarePlanEntryAdmin,
    NursingKardexAdmin,
    ReviewRequestAdmin,
    ShiftHandoverAdmin,
    SupervisorAlertAcknowledgmentAdmin,
    TemperatureReadingAdmin,
    TransferAdmin,
    TransfusionObservationEntryAdmin,
    TransfusionObservationEntryInline,
    WardAdmin,
    WardRoundAdmin,
)
from hmis.apps.inpatient.models import (
    Admission,
    AdmissionRecommendation,
    Bed,
    BloodTransfusionObservation,
    BPMonitoringReading,
    Discharge,
    FluidBalanceEntry,
    FluidBalanceSheet,
    InpatientConsumableUsage,
    KardexHandoverNote,
    KardexShiftNote,
    MedicationAdministration,
    NursingCarePlanEntry,
    NursingKardex,
    ReviewRequest,
    ShiftHandover,
    SupervisorAlertAcknowledgment,
    TemperatureReading,
    Transfer,
    TransfusionObservationEntry,
    Ward,
    WardRound,
)

User = get_user_model()

site = AdminSite()


# ============================================================================
# Registration Tests
# ============================================================================


class TestInpatientAdminRegistration:
    """All 22 inpatient models must be registered in admin."""

    @pytest.mark.parametrize(
        "model,admin_class",
        [
            (Ward, WardAdmin),
            (Bed, BedAdmin),
            (AdmissionRecommendation, AdmissionRecommendationAdmin),
            (Admission, AdmissionAdmin),
            (Discharge, DischargeAdmin),
            (Transfer, TransferAdmin),
            (WardRound, WardRoundAdmin),
            (NursingKardex, NursingKardexAdmin),
            (NursingCarePlanEntry, NursingCarePlanEntryAdmin),
            (KardexShiftNote, KardexShiftNoteAdmin),
            (KardexHandoverNote, KardexHandoverNoteAdmin),
            (InpatientConsumableUsage, InpatientConsumableUsageAdmin),
            (ShiftHandover, ShiftHandoverAdmin),
            (ReviewRequest, ReviewRequestAdmin),
            (SupervisorAlertAcknowledgment, SupervisorAlertAcknowledgmentAdmin),
            (TemperatureReading, TemperatureReadingAdmin),
            (BPMonitoringReading, BPMonitoringReadingAdmin),
            (FluidBalanceSheet, FluidBalanceSheetAdmin),
            (FluidBalanceEntry, FluidBalanceEntryAdmin),
            (BloodTransfusionObservation, BloodTransfusionObservationAdmin),
            (TransfusionObservationEntry, TransfusionObservationEntryAdmin),
            (MedicationAdministration, MedicationAdministrationAdmin),
        ],
    )
    def test_model_registered(self, model, admin_class):
        """Each inpatient model should be registered with the correct admin class."""
        from django.contrib import admin as django_admin

        assert model in django_admin.site._registry
        assert isinstance(django_admin.site._registry[model], admin_class)


# ============================================================================
# List Display & Filter Tests
# ============================================================================


class TestAdminListDisplay:
    """Admin classes should have proper list_display and list_filter."""

    @pytest.mark.parametrize(
        "admin_class,expected_columns",
        [
            (WardAdmin, ["code", "name", "ward_type", "capacity"]),
            (BedAdmin, ["bed_number", "ward", "status"]),
            (AdmissionAdmin, ["admission_number", "patient", "ward", "admission_status"]),
            (DischargeAdmin, ["admission", "discharge_type", "discharge_date"]),
            (TransferAdmin, ["admission", "source_ward", "destination_ward"]),
            (WardRoundAdmin, ["admission", "round_date", "conducted_by"]),
            (ReviewRequestAdmin, ["admission", "review_type", "urgency", "status"]),
            (SupervisorAlertAcknowledgmentAdmin, ["admission", "acknowledged_by"]),
            (TemperatureReadingAdmin, ["admission", "temperature", "recorded_by"]),
            (BPMonitoringReadingAdmin, ["admission", "bp_display", "pulse"]),
            (
                FluidBalanceSheetAdmin,
                [
                    "admission",
                    "chart_date",
                    "total_intake_display",
                    "total_output_display",
                    "net_balance_display",
                ],
            ),
            (FluidBalanceEntryAdmin, ["fluid_balance_sheet", "entry_type", "amount_ml"]),
            (
                BloodTransfusionObservationAdmin,
                ["admission", "blood_product", "status", "reaction_occurred"],
            ),
            (
                MedicationAdministrationAdmin,
                ["admission", "prescription_item", "status", "dose_given"],
            ),
            (ShiftHandoverAdmin, ["ward", "shift_date", "outgoing_nurse"]),
        ],
    )
    def test_list_display_contains_expected_columns(self, admin_class, expected_columns):
        """Each admin class should include expected columns in list_display."""
        admin_instance = admin_class(Ward if admin_class == WardAdmin else Admission, site)
        for col in expected_columns:
            assert col in admin_instance.list_display, (
                f"{admin_class.__name__}.list_display missing '{col}'"
            )

    @pytest.mark.parametrize(
        "admin_class,expected_filters",
        [
            (WardAdmin, ["ward_type", "is_active"]),
            (BedAdmin, ["status"]),
            (AdmissionAdmin, ["admission_status", "payer_type"]),
            (ReviewRequestAdmin, ["status", "urgency", "review_type"]),
            (BloodTransfusionObservationAdmin, ["status", "blood_product", "reaction_occurred"]),
            (MedicationAdministrationAdmin, ["status", "is_prn"]),
            (BPMonitoringReadingAdmin, ["position"]),
        ],
    )
    def test_list_filter_contains_expected_filters(self, admin_class, expected_filters):
        """Each admin class should include expected filters in list_filter."""
        admin_instance = admin_class(Ward if admin_class == WardAdmin else Admission, site)
        for f in expected_filters:
            assert f in admin_instance.list_filter, (
                f"{admin_class.__name__}.list_filter missing '{f}'"
            )


# ============================================================================
# Search Fields Tests
# ============================================================================


class TestAdminSearchFields:
    """Admin classes should have search_fields for patient/admission lookups."""

    @pytest.mark.parametrize(
        "admin_class",
        [
            AdmissionAdmin,
            DischargeAdmin,
            TransferAdmin,
            WardRoundAdmin,
            ReviewRequestAdmin,
            TemperatureReadingAdmin,
            BPMonitoringReadingAdmin,
            FluidBalanceSheetAdmin,
            BloodTransfusionObservationAdmin,
            MedicationAdministrationAdmin,
        ],
    )
    def test_search_fields_include_patient_identifiers(self, admin_class):
        """Clinical admin classes should be searchable by patient name or admission number."""
        admin_instance = admin_class(Admission, site)
        search_fields = admin_instance.search_fields
        has_patient_search = any(
            "patient__first_name" in f
            or "patient__last_name" in f
            or "admission_number" in f
            or "admission__admission_number" in f
            or "admission__patient__first_name" in f
            for f in search_fields
        )
        assert has_patient_search, (
            f"{admin_class.__name__}.search_fields should include patient identifiers"
        )


# ============================================================================
# Custom Method Tests
# ============================================================================


class TestAdminCustomMethods:
    """Admin classes with custom display methods should return correct values."""

    def test_shift_handover_acknowledged_display(self):
        """ShiftHandoverAdmin.is_acknowledged_display should show correct status text."""
        admin_instance = ShiftHandoverAdmin(ShiftHandover, site)

        class FakeObj:
            is_acknowledged = True

        assert "Acknowledged" in admin_instance.is_acknowledged_display(FakeObj())

        FakeObj.is_acknowledged = False
        assert "Pending" in admin_instance.is_acknowledged_display(FakeObj())

    def test_bp_monitoring_bp_display(self):
        """BPMonitoringReadingAdmin.bp_display should format systolic/diastolic."""
        admin_instance = BPMonitoringReadingAdmin(BPMonitoringReading, site)

        class FakeObj:
            systolic = 120
            diastolic = 80

        assert admin_instance.bp_display(FakeObj()) == "120/80"

    def test_fluid_balance_sheet_totals(self, sample_admission, test_user):
        """FluidBalanceSheetAdmin total display methods should format correctly."""
        admin_instance = FluidBalanceSheetAdmin(FluidBalanceSheet, site)

        sheet = FluidBalanceSheet.objects.create(
            admission=sample_admission,
            chart_date=date.today(),
            recorded_by=test_user,
        )

        # With no entries, totals should be 0
        assert admin_instance.total_intake_display(sheet) == "0 ml"
        assert admin_instance.total_output_display(sheet) == "0 ml"
        assert admin_instance.net_balance_display(sheet) == "+0 ml"

    def test_fluid_balance_sheet_net_balance_negative(self, sample_admission, test_user):
        """Net balance display should show negative values without double sign."""
        admin_instance = FluidBalanceSheetAdmin(FluidBalanceSheet, site)

        sheet = FluidBalanceSheet.objects.create(
            admission=sample_admission,
            chart_date=date.today(),
            recorded_by=test_user,
        )
        # Add an output entry but no intake
        FluidBalanceEntry.objects.create(
            fluid_balance_sheet=sheet,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            entry_type="URINE",
            amount_ml=500,
        )

        assert admin_instance.net_balance_display(sheet) == "-500 ml"

    def test_nursing_care_plan_entry_truncation(self):
        """NursingCarePlanEntryAdmin.nursing_diagnosis_short should truncate long text."""
        admin_instance = NursingCarePlanEntryAdmin(NursingCarePlanEntry, site)

        class FakeShort:
            nursing_diagnosis = "Pain"

        class FakeLong:
            nursing_diagnosis = "A" * 100

        assert admin_instance.nursing_diagnosis_short(FakeShort()) == "Pain"
        result = admin_instance.nursing_diagnosis_short(FakeLong())
        assert result.endswith("...")
        assert len(result) == 63  # 60 chars + "..."

    def test_discharge_length_of_stay_display(self):
        """DischargeAdmin.length_of_stay_days should format correctly."""
        admin_instance = DischargeAdmin(Discharge, site)

        class FakeObj:
            length_of_stay = 5

        assert admin_instance.length_of_stay_days(FakeObj()) == "5 days"


# ============================================================================
# Inline Tests
# ============================================================================


class TestAdminInlines:
    """Fluid balance and transfusion admin should have correct inlines."""

    def test_fluid_balance_sheet_has_entry_inline(self):
        admin_instance = FluidBalanceSheetAdmin(FluidBalanceSheet, site)
        inline_classes = [i.__class__ for i in admin_instance.get_inline_instances(None)]
        assert any(
            isinstance(i, FluidBalanceEntryInline)
            for i in admin_instance.get_inline_instances(None)
        )

    def test_blood_transfusion_has_observation_inline(self):
        admin_instance = BloodTransfusionObservationAdmin(BloodTransfusionObservation, site)
        assert any(
            isinstance(i, TransfusionObservationEntryInline)
            for i in admin_instance.get_inline_instances(None)
        )


# ============================================================================
# Permission Tests
# ============================================================================


class TestAdminPermissions:
    """Append-only models should restrict add/delete in admin."""

    def test_kardex_shift_note_no_add(self):
        """Shift notes should not be addable via admin."""
        admin_instance = KardexShiftNoteAdmin(KardexShiftNote, site)
        factory = RequestFactory()
        request = factory.get("/admin/")
        assert admin_instance.has_add_permission(request) is False

    def test_kardex_shift_note_no_delete(self):
        """Shift notes should not be deletable via admin."""
        admin_instance = KardexShiftNoteAdmin(KardexShiftNote, site)
        factory = RequestFactory()
        request = factory.get("/admin/")
        assert admin_instance.has_delete_permission(request) is False

    def test_kardex_handover_note_no_add(self):
        """Handover notes should not be addable via admin."""
        admin_instance = KardexHandoverNoteAdmin(KardexHandoverNote, site)
        factory = RequestFactory()
        request = factory.get("/admin/")
        assert admin_instance.has_add_permission(request) is False

    def test_kardex_handover_note_no_delete(self):
        """Handover notes should not be deletable via admin."""
        admin_instance = KardexHandoverNoteAdmin(KardexHandoverNote, site)
        factory = RequestFactory()
        request = factory.get("/admin/")
        assert admin_instance.has_delete_permission(request) is False


# ============================================================================
# DB-level Integration Tests
# ============================================================================


class TestAdminIntegration:
    """Admin classes should work with real model instances."""

    def test_review_request_admin_list(self, sample_admission, test_user):
        """ReviewRequest should be listable in admin."""
        ReviewRequest.objects.create(
            admission=sample_admission,
            review_type="URGENT_REVIEW",
            urgency="URGENT",
            reason="Deteriorating vitals",
            requested_by=test_user,
        )
        assert ReviewRequest.objects.count() == 1

    def test_supervisor_alert_admin_list(self, sample_admission, test_user):
        """SupervisorAlertAcknowledgment should be listable in admin."""
        SupervisorAlertAcknowledgment.objects.create(
            admission=sample_admission,
            acknowledged_by=test_user,
            notes="Reviewed and approved",
        )
        assert SupervisorAlertAcknowledgment.objects.count() == 1

    def test_temperature_reading_admin_list(self, sample_admission, test_user):
        """TemperatureReading should be creatable and listable."""
        reading = TemperatureReading.objects.create(
            admission=sample_admission,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            temperature=Decimal("37.2"),
            pulse=72,
            respiratory_rate=18,
        )
        assert reading.is_febrile is False
        assert TemperatureReading.objects.count() == 1

    def test_bp_reading_admin_list(self, sample_admission, test_user):
        """BPMonitoringReading should display BP and flag hypertension."""
        reading = BPMonitoringReading.objects.create(
            admission=sample_admission,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            systolic=150,
            diastolic=95,
            pulse=88,
            position="SITTING",
        )
        assert reading.bp_display == "150/95"
        assert reading.is_hypertensive is True

    def test_blood_transfusion_admin_list(self, sample_admission, test_user):
        """BloodTransfusionObservation should be creatable and listable."""
        transfusion = BloodTransfusionObservation.objects.create(
            admission=sample_admission,
            blood_product="PACKED_RED_CELLS",
            blood_unit_number="BU-001",
            blood_group="O+",
            amount_ml=450,
            transfusion_date=date.today(),
            started_by=test_user,
            status="IN_PROGRESS",
        )
        assert BloodTransfusionObservation.objects.count() == 1

        # Add observation entry
        entry = TransfusionObservationEntry.objects.create(
            transfusion=transfusion,
            observation_interval="BEFORE",
            exact_time="08:00",
            recorded_by=test_user,
            blood_pressure="120/80",
            temperature=Decimal("36.8"),
            pulse=72,
        )
        assert TransfusionObservationEntry.objects.count() == 1

    def test_fluid_balance_with_entries(self, sample_admission, test_user):
        """FluidBalanceSheet net balance should compute from entries."""
        sheet = FluidBalanceSheet.objects.create(
            admission=sample_admission,
            chart_date=date.today(),
            recorded_by=test_user,
        )
        now = timezone.now()

        # Intake
        FluidBalanceEntry.objects.create(
            fluid_balance_sheet=sheet,
            recorded_at=now,
            recorded_by=test_user,
            entry_type="INTRAVENOUS",
            item_type="Normal Saline",
            bottle_number="1",
            amount_ml=1000,
        )
        # Output
        FluidBalanceEntry.objects.create(
            fluid_balance_sheet=sheet,
            recorded_at=now,
            recorded_by=test_user,
            entry_type="URINE",
            amount_ml=600,
        )

        assert sheet.total_intake_ml == 1000
        assert sheet.total_output_ml == 600
        assert sheet.net_balance_ml == 400
