# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F401
"""Encounters views shared for Vitora HMIS.

What this file is for:
- Implement views shared logic for the encounters domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from django.core.exceptions import ValidationError
from django.db.models import ProtectedError
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, inline_serializer
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.checkin.serializers import ClinicalSnapshotSerializer
from hmis.apps.core.history_views import ModelHistoryMixin
from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    PublicIdLookupMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
)
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    RequiresActiveShiftPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)
from hmis.apps.core.utils import resolve_model_pk_or_public_id

from .filters import EncounterFilter
from .models import (
    ChronicCondition,
    CurrentMedication,
    Diagnosis,
    Encounter,
    FamilyHistory,
    ICD10Code,
    Medication,
    PastSurgery,
    SocialHistoryObservation,
    TreatmentPlan,
    TreatmentPlanTemplate,
    VitalFlagSuggestion,
    VitalFlagSuggestionAction,
)
from .serializers import (
    ChronicConditionCreateSerializer,
    ChronicConditionSerializer,
    ClaimedEncounterSerializer,
    CurrentMedicationCreateSerializer,
    CurrentMedicationSerializer,
    DiagnosisSerializer,
    EncounterListSerializer,
    EncounterSerializer,
    FamilyHistoryCreateSerializer,
    FamilyHistorySerializer,
    ICD10CodeSerializer,
    MedicationSerializer,
    PastSurgeryCreateSerializer,
    PastSurgerySerializer,
    SocialHistoryObservationCreateSerializer,
    SocialHistoryObservationSerializer,
    TreatmentPlanSerializer,
    TreatmentPlanTemplateSerializer,
    VitalFlagSuggestionAcceptSerializer,
    VitalFlagSuggestionAcknowledgeSerializer,
    VitalFlagSuggestionMapSerializer,
    VitalFlagSuggestionRejectSerializer,
    VitalFlagSuggestionSerializer,
)


def resolve_encounter_lookup(lookup_value):
    """Resolve encounter by integer primary key or UUID public_id."""
    return resolve_model_pk_or_public_id(Encounter, lookup_value)[0]
