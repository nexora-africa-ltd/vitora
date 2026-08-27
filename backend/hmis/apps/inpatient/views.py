# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
What this file is for: backward-compatible import surface for inpatient viewsets.
How to use: existing routers may continue importing viewsets from ``hmis.apps.inpatient.views``.
Supported inputs/args: N/A (module-level re-exports).
"""

from .viewsets.admission import AdmissionViewSet
from .viewsets.admission_recommendation import AdmissionRecommendationViewSet
from .viewsets.atr import AdverseTransfusionReactionViewSet
from .viewsets.discharge import DischargeViewSet
from .viewsets.discharge_template import DischargeTemplateViewSet
from .viewsets.interfacility_transfer import InterFacilityTransferViewSet
from .viewsets.medication_vitals import BPMonitoringViewSet, MedicationAdministrationViewSet
from .viewsets.nursing_kardex import NursingKardexViewSet
from .viewsets.observation_chart import (
    BloodTransfusionViewSet,
    FluidBalanceEntryViewSet,
    FluidBalanceSheetViewSet,
    TemperatureReadingViewSet,
)
from .viewsets.review_request import ReviewRequestViewSet
from .viewsets.shift_handover import ShiftHandoverViewSet
from .viewsets.supervisor_alert import SupervisorAlertViewSet
from .viewsets.transfer import TransferViewSet
from .viewsets.ward_bed import BedViewSet, WardViewSet
from .viewsets.ward_round import WardRoundViewSet

__all__ = [
    "AdmissionRecommendationViewSet",
    "AdmissionViewSet",
    "AdverseTransfusionReactionViewSet",
    "BPMonitoringViewSet",
    "BedViewSet",
    "BloodTransfusionViewSet",
    "DischargeTemplateViewSet",
    "DischargeViewSet",
    "FluidBalanceEntryViewSet",
    "FluidBalanceSheetViewSet",
    "InterFacilityTransferViewSet",
    "MedicationAdministrationViewSet",
    "NursingKardexViewSet",
    "ReviewRequestViewSet",
    "ShiftHandoverViewSet",
    "SupervisorAlertViewSet",
    "TemperatureReadingViewSet",
    "TransferViewSet",
    "WardViewSet",
    "WardRoundViewSet",
]
