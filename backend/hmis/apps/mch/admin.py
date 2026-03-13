"""Admin configuration for MCH module."""

from django.contrib import admin

from hmis.apps.mch.models import (
    AEFI,
    ANCVisit,
    CommunityScreening,
    Delivery,
    GrowthMeasurement,
    LabourPartograph,
    LabourPartographObservation,
    HEIFollowUp,
    HEIPCRTest,
    ImmunizationRecord,
    MCHRegistration,
    PNCVisit,
    Vaccine,
    VitaminASupplement,
)


@admin.register(MCHRegistration)
class MCHRegistrationAdmin(admin.ModelAdmin):
    list_display = ("mch_number", "mother", "status", "registration_date", "is_high_risk")
    search_fields = ("mch_number", "mother__first_name", "mother__last_name", "mother__mrn")
    list_filter = ("status", "is_high_risk", "linda_jamii_beneficiary")


@admin.register(ANCVisit)
class ANCVisitAdmin(admin.ModelAdmin):
    list_display = ("registration", "visit_number", "visit_date", "gestation_weeks")
    list_filter = ("visit_number",)
    search_fields = ("registration__mch_number",)


@admin.register(CommunityScreening)
class CommunityScreeningAdmin(admin.ModelAdmin):
    list_display = ("screening_type", "patient", "screening_date", "chu_name", "territory", "captured_by")
    list_filter = ("screening_type", "screening_date")
    search_fields = (
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "patient_name_snapshot",
        "patient_mrn_snapshot",
        "chu_name",
        "territory",
    )


@admin.register(Delivery)
class DeliveryAdmin(admin.ModelAdmin):
    list_display = ("registration", "delivery_date", "delivery_type", "delivery_outcome", "status")
    list_filter = ("delivery_type", "delivery_outcome", "status")
    search_fields = ("registration__mch_number",)


@admin.register(LabourPartograph)
class LabourPartographAdmin(admin.ModelAdmin):
    list_display = ("registration", "started_at", "status", "parity", "gestation_weeks")
    list_filter = ("status", "membrane_status", "liquor")
    search_fields = (
        "registration__mch_number",
        "registration__mother__first_name",
        "registration__mother__last_name",
    )


@admin.register(LabourPartographObservation)
class LabourPartographObservationAdmin(admin.ModelAdmin):
    list_display = (
        "partograph",
        "observation_time",
        "fetal_heart_rate",
        "cervical_dilation_cm",
        "contractions_per_10_min",
        "maternal_pulse",
    )
    list_filter = ("urine_protein", "urine_acetone")
    search_fields = ("partograph__registration__mch_number",)


@admin.register(PNCVisit)
class PNCVisitAdmin(admin.ModelAdmin):
    list_display = ("registration", "visit_number", "visit_date", "days_postpartum")
    list_filter = ("visit_number",)
    search_fields = ("registration__mch_number",)


@admin.register(GrowthMeasurement)
class GrowthMeasurementAdmin(admin.ModelAdmin):
    list_display = ("patient", "measurement_date", "weight", "height", "muac", "muac_classification")
    list_filter = ("muac_classification",)
    search_fields = ("patient__first_name", "patient__last_name", "patient__mrn")


@admin.register(Vaccine)
class VaccineAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "standard_age_days", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")


@admin.register(ImmunizationRecord)
class ImmunizationRecordAdmin(admin.ModelAdmin):
    list_display = ("patient", "vaccine", "scheduled_date", "status", "administered_date")
    list_filter = ("status", "vaccine")
    search_fields = ("patient__first_name", "patient__last_name", "patient__mrn")


@admin.register(VitaminASupplement)
class VitaminASupplementAdmin(admin.ModelAdmin):
    list_display = ("patient", "administered_date", "dose")
    list_filter = ("dose",)


@admin.register(AEFI)
class AEFIAdmin(admin.ModelAdmin):
    list_display = ("immunization_record", "event_date", "event_type", "severity")
    list_filter = ("event_type", "severity")


@admin.register(HEIFollowUp)
class HEIFollowUpAdmin(admin.ModelAdmin):
    list_display = ("hei_number", "infant", "status", "enrollment_date")
    list_filter = ("status",)
    search_fields = ("hei_number", "infant__first_name", "infant__last_name", "infant__mrn")


@admin.register(HEIPCRTest)
class HEIPCRTestAdmin(admin.ModelAdmin):
    list_display = ("hei_followup", "test_number", "scheduled_date", "actual_date", "result")
    list_filter = ("result", "test_number")
