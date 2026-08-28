# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: shared serializer helpers for inpatient serializer modules.
How to use: imported by split inpatient serializer modules and the compatibility shim.
Supported inputs/args: DRF serializer helper fields and utility validators.
"""

from rest_framework import serializers

from hmis.apps.blood_bank.models import UnitStatus
from hmis.apps.core.models import Facility
from hmis.apps.core.utils import resolve_model_pk_or_public_id
from hmis.apps.encounters.models import Encounter
from hmis.apps.mch.services.postpartum_continuity import (
    route_registration_to_pnc_queue,
    schedule_registration_pnc_follow_up,
    transition_registration_to_postnatal,
)

from .clearance import calculate_patient_blocking_balance
from .models import (
    Admission,
    AdmissionRecommendation,
    AdverseTransfusionReaction,
    Bed,
    BloodTransfusionObservation,
    BPMonitoringReading,
    CardiacRespiratoryReaction,
    DermatologicalReaction,
    Discharge,
    DischargeDiagnosis,
    DischargeDraft,
    DischargeTemplate,
    FluidBalanceEntry,
    FluidBalanceSheet,
    GeneralReaction,
    HaematologicalReaction,
    InpatientConsumableUsage,
    InterFacilityTransfer,
    InterFacilityTransferEvent,
    KardexFieldChange,
    KardexHandoverNote,
    KardexScheduleItem,
    KardexShiftNote,
    MedicationAdministration,
    NursingCarePlanEntry,
    NursingCarePlanEntryChange,
    NursingKardex,
    RenalReaction,
    ReviewRequest,
    ShiftHandover,
    SupervisorAlertAcknowledgment,
    TemperatureReading,
    Transfer,
    TransfusionObservationEntry,
    Ward,
    WardRound,
)


class PublicIdOrPkRelatedField(serializers.PrimaryKeyRelatedField):
    """Accept either integer PK or UUID `public_id` for related model fields."""

    def to_internal_value(self, data):
        queryset = self.get_queryset()
        model = queryset.model if queryset is not None else None
        if model is None:
            return super().to_internal_value(data)

        try:
            instance, _lookup_kind = resolve_model_pk_or_public_id(model, data)
        except model.DoesNotExist:
            self.fail("does_not_exist", pk_value=data)

        if queryset is not None and not queryset.filter(pk=instance.pk).exists():
            self.fail("does_not_exist", pk_value=data)

        return instance
