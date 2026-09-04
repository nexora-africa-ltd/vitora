# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002
"""Laboratory views catalog orders for Vitora HMIS.

What this file is for:
- Implement views catalog orders logic for the laboratory domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from datetime import date
from difflib import SequenceMatcher

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models, transaction
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    TenantScopedViewMixin,
    resolve_request_tenant,
)
from hmis.apps.core.pagination import StandardPagination
from hmis.apps.core.permissions import ReadRequiresModelPermission, RequiresActiveShiftPermission
from hmis.apps.licensing.permissions import requires_feature

from .models import (
    DiagnosticReport,
    LabOrder,
    LabOrderItem,
    LabResult,
    LabResultAttachment,
    TestCatalog,
)
from .permissions import (
    LaboratoryModuleRequired,
    LISCollectSamplePermission,
    LISEnterResultsPermission,
    LISManageCatalogPermission,
    LISReleaseResultsPermission,
)
from .serializers import (
    DiagnosticReportCreateSerializer,
    DiagnosticReportSerializer,
    LabOrderCreateSerializer,
    LabOrderItemSerializer,
    LabOrderSerializer,
    LabResultAttachmentCreateSerializer,
    LabResultAttachmentSerializer,
    LabResultCreateSerializer,
    LabResultSerializer,
    LabResultVerifySerializer,
    SpecimenSerializer,
    TestCatalogCreateSerializer,
    TestCatalogDetailSerializer,
    TestCatalogSerializer,
)
from .services import LabAlertService, LabWorkflowService

logger = logging.getLogger(__name__)


def _parse_date_range(request) -> tuple[date, date]:
    start_param = request.query_params.get("start")
    end_param = request.query_params.get("end")

    errors: dict[str, str] = {}
    if not start_param:
        errors["start"] = "start query param is required (YYYY-MM-DD)."
    if not end_param:
        errors["end"] = "end query param is required (YYYY-MM-DD)."

    if errors:
        raise ValidationError(errors)

    try:
        start_date = date.fromisoformat(start_param)
    except ValueError as exc:
        raise ValidationError({"start": "Invalid date format. Use YYYY-MM-DD."}) from exc

    try:
        end_date = date.fromisoformat(end_param)
    except ValueError as exc:
        raise ValidationError({"end": "Invalid date format. Use YYYY-MM-DD."}) from exc

    if start_date > end_date:
        raise ValidationError({"end": "End date must be on or after start date."})

    return start_date, end_date


class TestCatalogViewSet(AuditedMutationMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for test catalog.
    Provides full CRUD operations with search functionality.
    List/retrieve are available to all authenticated users.
    Create/update/delete require admin role.
    """

    queryset = TestCatalog.objects.all()
    audit_resource_type = "TestCatalog"
    audit_action_prefix = "laboratory.test_catalog"
    audit_source = "laboratory_api"
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISManageCatalogPermission,
        ReadRequiresModelPermission,
    ]
    lookup_field = "code"

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return TestCatalogCreateSerializer
        if self.action == "retrieve":
            return TestCatalogDetailSerializer
        return TestCatalogSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Non-admin list views default to active tests only
        if self.action == "list":
            show_inactive = self.request.query_params.get("show_inactive", "").lower() == "true"
            if not show_inactive:
                queryset = queryset.filter(is_active=True)

        # Search by name or code
        search = self.request.query_params.get("search", None)
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search)
                | models.Q(code__icontains=search)
                | models.Q(short_name__icontains=search)
                | models.Q(loinc_code__icontains=search)
            )

        # Filter by category
        category = self.request.query_params.get("category", None)
        if category:
            queryset = queryset.filter(category=category)

        # Filter by specimen type
        specimen_type = self.request.query_params.get("specimen_type", None)
        if specimen_type:
            queryset = queryset.filter(specimen_type=specimen_type)

        return queryset

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    def perform_update(self, serializer):
        serializer.save()

    @action(detail=False, methods=["post"], url_path="resolve")
    def resolve(self, request):
        """Resolve a list of test names/LOINC codes to catalog entries using fuzzy matching.

        Accepts: {"tests": [{"name": "Complete Blood Count", "loinc_code": "26604-2"}, ...]}
        Returns: {"resolved": [{"query_name": "...", "match": {...} | null, "score": 0.85}, ...]}
        """
        tests = request.data.get("tests", [])
        if not isinstance(tests, list) or len(tests) == 0:
            return Response(
                {"error": "Provide a non-empty 'tests' array."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(tests) > 20:
            return Response(
                {"error": "Maximum 20 tests per request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        catalog = list(
            TestCatalog.objects.filter(is_active=True).values(
                "id",
                "code",
                "name",
                "short_name",
                "loinc_code",
                "category",
                "specimen_type",
                "cost",
            )
        )

        resolved = []
        for item in tests:
            query_name = (item.get("name") or "").strip()
            query_loinc = (item.get("loinc_code") or "").strip()

            best_match = None
            best_score = 0.0

            # Try exact LOINC match first (highest priority)
            if query_loinc:
                for entry in catalog:
                    if entry["loinc_code"] and entry["loinc_code"].lower() == query_loinc.lower():
                        best_match = entry
                        best_score = 1.0
                        break

            # Fuzzy name matching
            if not best_match and query_name:
                query_lower = query_name.lower()
                for entry in catalog:
                    # Exact name match
                    if entry["name"].lower() == query_lower:
                        best_match = entry
                        best_score = 1.0
                        break
                    # Short name exact match
                    if entry["short_name"] and entry["short_name"].lower() == query_lower:
                        best_match = entry
                        best_score = 0.95
                        continue
                    # Fuzzy similarity
                    score = max(
                        SequenceMatcher(None, query_lower, entry["name"].lower()).ratio(),
                        SequenceMatcher(
                            None, query_lower, (entry["short_name"] or "").lower()
                        ).ratio(),
                    )
                    if score > best_score:
                        best_score = score
                        best_match = entry

            resolved.append(
                {
                    "query_name": query_name,
                    "query_loinc": query_loinc,
                    "match": best_match if best_score >= 0.4 else None,
                    "score": round(best_score, 3),
                }
            )

        return Response({"resolved": resolved})

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        """Seed essential Kenya laboratory tests (idempotent).

        Uses get_or_create so existing entries are not overwritten.
        Returns the count of newly created entries.
        """
        from decimal import Decimal

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        organization = getattr(request, "organization", None) or getattr(
            facility, "organization", None
        )
        is_non_kenya_facility = bool(
            facility and str(getattr(facility, "country_code", "KE")).upper() != "KE"
        )

        if not facility:
            return Response(
                {"detail": "No active facility context resolved for seeding defaults."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        essential_tests = [
            {
                "code": "CBC",
                "name": "Complete Blood Count",
                "short_name": "CBC",
                "category": "HEMATOLOGY",
                "specimen_type": "BLOOD",
                "result_type": "PANEL",
                "cost": Decimal("800.00"),
                "available_in_house": True,
                "turnaround_hours": 2,
            },
            {
                "code": "HB",
                "name": "Hemoglobin",
                "short_name": "Hb",
                "category": "HEMATOLOGY",
                "specimen_type": "BLOOD",
                "result_type": "NUMERIC",
                "result_unit": "g/dL",
                "normal_range_male": "13.0-17.0",
                "normal_range_female": "12.0-15.0",
                "normal_range_child": "11.0-14.0",
                "cost": Decimal("200.00"),
                "available_in_house": True,
                "turnaround_hours": 1,
            },
            {
                "code": "ESR",
                "name": "Erythrocyte Sedimentation Rate",
                "short_name": "ESR",
                "category": "HEMATOLOGY",
                "specimen_type": "BLOOD",
                "result_type": "NUMERIC",
                "result_unit": "mm/hr",
                "normal_range_male": "0-15",
                "normal_range_female": "0-20",
                "cost": Decimal("300.00"),
                "available_in_house": True,
                "turnaround_hours": 1,
            },
            {
                "code": "BG",
                "name": "Blood Grouping & Rh",
                "short_name": "Blood Group",
                "category": "HEMATOLOGY",
                "specimen_type": "BLOOD",
                "result_type": "TEXT",
                "cost": Decimal("500.00"),
                "available_in_house": True,
                "turnaround_hours": 1,
            },
            {
                "code": "RBS",
                "name": "Random Blood Sugar",
                "short_name": "RBS",
                "category": "CHEMISTRY",
                "specimen_type": "BLOOD",
                "result_type": "NUMERIC",
                "result_unit": "mmol/L",
                "normal_range_male": "3.9-7.8",
                "normal_range_female": "3.9-7.8",
                "cost": Decimal("150.00"),
                "available_in_house": True,
                "turnaround_hours": 1,
            },
            {
                "code": "FBS",
                "name": "Fasting Blood Sugar",
                "short_name": "FBS",
                "category": "CHEMISTRY",
                "specimen_type": "BLOOD",
                "result_type": "NUMERIC",
                "result_unit": "mmol/L",
                "normal_range_male": "3.9-5.6",
                "normal_range_female": "3.9-5.6",
                "cost": Decimal("200.00"),
                "available_in_house": True,
                "requires_fasting": True,
                "turnaround_hours": 1,
            },
            {
                "code": "CREA",
                "name": "Creatinine",
                "short_name": "Creatinine",
                "category": "CHEMISTRY",
                "specimen_type": "SERUM",
                "result_type": "NUMERIC",
                "result_unit": "μmol/L",
                "normal_range_male": "62-106",
                "normal_range_female": "44-80",
                "cost": Decimal("400.00"),
                "available_in_house": True,
                "turnaround_hours": 4,
            },
            {
                "code": "HIV",
                "name": "HIV 1&2 Antibody",
                "short_name": "HIV Test",
                "category": "SEROLOGY",
                "specimen_type": "BLOOD",
                "result_type": "OPTIONS",
                "result_options": ["Negative", "Positive", "Indeterminate"],
                "cost": Decimal("500.00"),
                "available_in_house": True,
                "turnaround_hours": 1,
            },
            {
                "code": "HBSAG",
                "name": "Hepatitis B Surface Antigen",
                "short_name": "HBsAg",
                "category": "SEROLOGY",
                "specimen_type": "SERUM",
                "result_type": "OPTIONS",
                "result_options": ["Negative", "Positive"],
                "cost": Decimal("600.00"),
                "available_in_house": True,
                "turnaround_hours": 2,
            },
            {
                "code": "MPS",
                "name": "Malaria Parasites (Microscopy)",
                "short_name": "Malaria Test",
                "category": "PARASITOLOGY",
                "specimen_type": "BLOOD",
                "result_type": "TEXT",
                "cost": Decimal("300.00"),
                "available_in_house": True,
                "turnaround_hours": 1,
            },
            {
                "code": "MRDT",
                "name": "Malaria RDT",
                "short_name": "mRDT",
                "category": "PARASITOLOGY",
                "specimen_type": "BLOOD",
                "result_type": "OPTIONS",
                "result_options": ["Negative", "Positive"],
                "cost": Decimal("200.00"),
                "available_in_house": True,
                "turnaround_hours": 1,
            },
            {
                "code": "STOOL",
                "name": "Stool Examination",
                "short_name": "Stool Exam",
                "category": "PARASITOLOGY",
                "specimen_type": "STOOL",
                "result_type": "TEXT",
                "cost": Decimal("350.00"),
                "available_in_house": True,
                "turnaround_hours": 4,
            },
            {
                "code": "UA",
                "name": "Urinalysis",
                "short_name": "Urinalysis",
                "category": "URINALYSIS",
                "specimen_type": "URINE",
                "result_type": "TEXT",
                "cost": Decimal("250.00"),
                "available_in_house": True,
                "turnaround_hours": 1,
            },
            {
                "code": "UC",
                "name": "Urine Culture",
                "short_name": "Urine C/S",
                "category": "MICROBIOLOGY",
                "specimen_type": "URINE",
                "result_type": "TEXT",
                "cost": Decimal("800.00"),
                "available_in_house": True,
                "turnaround_hours": 48,
            },
            {
                "code": "CD4",
                "name": "CD4 Count",
                "short_name": "CD4",
                "category": "IMMUNOLOGY",
                "specimen_type": "BLOOD",
                "result_type": "NUMERIC",
                "result_unit": "cells/μL",
                "normal_range_male": "500-1500",
                "normal_range_female": "500-1500",
                "cost": Decimal("1500.00"),
                "available_in_house": False,
                "external_lab_partner": "KEMRI",
                "turnaround_hours": 72,
            },
            {
                "code": "VL",
                "name": "Viral Load",
                "short_name": "Viral Load",
                "category": "MOLECULAR",
                "specimen_type": "BLOOD",
                "result_type": "NUMERIC",
                "result_unit": "copies/mL",
                "cost": Decimal("2000.00"),
                "available_in_house": False,
                "external_lab_partner": "KEMRI",
                "turnaround_hours": 120,
            },
        ]

        created_count = 0
        for test_data in essential_tests:
            defaults = dict(test_data)
            if is_non_kenya_facility:
                defaults["cost"] = Decimal("0.00")
            _, created = TestCatalog.objects.get_or_create(
                code=test_data["code"],
                facility=facility,
                organization=organization,
                defaults=defaults,
            )
            if created:
                created_count += 1

        return Response(
            {"created": created_count, "total": len(essential_tests)},
            status=status.HTTP_200_OK,
        )


class LabOrderViewSet(AuditedMutationMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for lab orders.
    Provides full CRUD operations plus workflow actions.
    """

    tenant_scope = "facility"  # Lab orders are facility-scoped

    queryset = (
        LabOrder.objects.all()
        .select_related("patient", "billing_patient", "encounter", "ordered_by", "blood_bank_unit")
        .prefetch_related(
            "items__test",
            "items__result__entered_by",
            "items__result__verified_by",
            "items__result__validations__validated_by",
        )
    )
    audit_resource_type = "LabOrder"
    audit_action_prefix = "laboratory.order"
    audit_source = "laboratory_api"
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        requires_feature("laboratory"),
        ReadRequiresModelPermission,
    ]
    filter_backends = [filters.DjangoFilterBackend, SearchFilter]
    filterset_fields = [
        "patient",
        "billing_patient",
        "encounter",
        "status",
        "priority",
        "order_type",
    ]
    search_fields = [
        "order_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "items__test__name",
    ]
    lookup_field = "order_number"
    pagination_class = StandardPagination

    # Per-action role gating (additive to base permission_classes).
    _ACTION_PERMISSIONS = {
        "collect_specimen": LISCollectSamplePermission,
        "results": LISEnterResultsPermission,
    }

    def get_permissions(self):
        perms = [perm() for perm in self.permission_classes]
        extra = self._ACTION_PERMISSIONS.get(self.action)
        if extra is not None:
            perms.append(extra())
        return perms

    def get_serializer_class(self):
        if self.action == "create":
            return LabOrderCreateSerializer
        return LabOrderSerializer

    def create(self, request, *args, **kwargs):
        """Create a new lab order."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save(**self.get_tenant_save_kwargs())

        # Return the full order representation
        output_serializer = LabOrderSerializer(order)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve order — auto-expands legacy panel items without children."""
        order = self.get_object()
        self._auto_expand_legacy_panels(order)
        serializer = self.get_serializer(order)
        return Response(serializer.data)

    def _auto_expand_legacy_panels(self, order):
        """For orders created before panel explosion, expand panel items on first access."""
        panel_items = order.items.filter(test__is_panel=True)
        created = False
        for parent_item in panel_items:
            if parent_item.panel_children.exists():
                continue
            components = parent_item.test.panel_components.filter(is_active=True)
            for component_test in components:
                LabOrderItem.objects.create(
                    lab_order=order,
                    test=component_test,
                    unit_cost=component_test.cost,
                    panel_parent=parent_item,
                    special_instructions=parent_item.special_instructions,
                )
                created = True
        if created:
            order.calculate_total_cost()
            # Refresh prefetched relations
            order.refresh_from_db()
            order.items.all()  # Reset prefetch cache

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by date range
        date_from = self.request.query_params.get("date_from", None)
        date_to = self.request.query_params.get("date_to", None)
        if date_from:
            queryset = queryset.filter(ordered_at__gte=date_from)
        if date_to:
            queryset = queryset.filter(ordered_at__lte=date_to)

        # SearchFilter across items__test__name can produce duplicates
        return queryset.distinct()

    @action(detail=True, methods=["post"], url_path="expand-panels")
    def expand_panels(self, request, order_number=None):
        """
        Retroactively expand panel items into component items.

        For orders created before panel explosion was implemented:
        finds panel items without children and creates component items.
        """
        order = self.get_object()
        created_count = 0

        panel_items = order.items.filter(test__is_panel=True)
        for parent_item in panel_items:
            # Skip if already has children
            if parent_item.panel_children.exists():
                continue
            components = parent_item.test.panel_components.filter(is_active=True)
            for component_test in components:
                LabOrderItem.objects.create(
                    lab_order=order,
                    test=component_test,
                    unit_cost=component_test.cost,
                    panel_parent=parent_item,
                    special_instructions=parent_item.special_instructions,
                )
                created_count += 1

        if created_count > 0:
            order.calculate_total_cost()

        # Return the updated order
        order.refresh_from_db()
        serializer = self.get_serializer(order)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def submit(self, request, order_number=None):
        """Submit order for processing."""
        order = self.get_object()
        try:
            order = LabWorkflowService.submit_order(order, request.user)
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            logger.exception("Error submitting lab order %s", order.pk)
            return Response(
                {"error": "Unable to submit this lab order at this time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"], url_path="collect-specimen")
    def collect_specimen(self, request, order_number=None):
        """Record specimen collection."""
        order = self.get_object()
        try:
            order = LabWorkflowService.collect_specimen(order, request.user)
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except (ValidationError, DjangoValidationError) as e:
            message = e.message if hasattr(e, "message") else str(e)
            logger.warning(
                "Specimen collection validation failed for lab order %s: %s", order.pk, message
            )
            return Response(
                {"error": message},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            logger.exception("Error recording specimen collection for lab order %s", order.pk)
            return Response(
                {"error": "Unable to record specimen collection at this time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def cancel(self, request, order_number=None):
        """Cancel order."""
        order = self.get_object()
        reason = request.data.get("reason", "No reason provided")
        try:
            order = LabWorkflowService.cancel_order(order, request.user, reason)
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            logger.exception("Error cancelling lab order %s", order.pk)
            return Response(
                {"error": "Unable to cancel this lab order at this time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post", "get"], url_path="results")
    def handle_results(self, request, order_number=None):
        """Handle results: GET to list, POST to create."""
        order = self.get_object()

        if request.method == "GET":
            # List all results for this order
            results = LabResult.objects.filter(order_item__lab_order=order)
            serializer = LabResultSerializer(results, many=True)
            return Response(serializer.data)

        # POST - Create a new result
        serializer = LabResultCreateSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            result = serializer.save()
            return Response(LabResultSerializer(result).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="results/batch")
    def batch_results(self, request, order_number=None):
        """Create multiple results in a single atomic transaction.

        Accepts an array of results, validates all upfront, then creates
        them in bulk. Status cascade (item → order) runs once at the end.

        Request body: { "results": [ { order_item, numeric_value, ... }, ... ] }
        """
        order = self.get_object()
        results_data = request.data.get("results")

        if not results_data or not isinstance(results_data, list):
            return Response(
                {"detail": "Field 'results' is required and must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(results_data) > 100:
            return Response(
                {"detail": "Maximum 100 results per batch."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate all results upfront before creating any
        serializers_list = []
        errors = []
        for i, item_data in enumerate(results_data):
            serializer = LabResultCreateSerializer(data=item_data, context={"request": request})
            if serializer.is_valid():
                # Verify item belongs to this order
                order_item = serializer.validated_data["order_item"]
                if order_item.lab_order_id != order.pk:
                    errors.append(
                        {
                            "index": i,
                            "errors": {"order_item": ["Item does not belong to this order."]},
                        }
                    )
                elif order_item.has_result():
                    errors.append(
                        {"index": i, "errors": {"order_item": ["This item already has a result."]}}
                    )
                else:
                    serializers_list.append(serializer)
            else:
                errors.append({"index": i, "errors": serializer.errors})

        if errors:
            return Response(
                {"detail": "Validation failed for some results.", "errors": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # All valid — create in a single transaction
        created_results = []
        with transaction.atomic():
            entered_by = request.user
            for serializer in serializers_list:
                validated = serializer.validated_data
                result = LabResult.objects.create(entered_by=entered_by, **validated)

                # Attach specimen from queue if available
                if result.specimen is None:
                    queue_entry = getattr(order, "queue_entry", None)
                    if queue_entry and queue_entry.specimen:
                        result.specimen = queue_entry.specimen
                        result.save(update_fields=["specimen"])

                # Auto-flag numeric results
                if result.numeric_value is not None and not result.result_flag:
                    result.auto_flag_result()

                created_results.append(result)

            # Cascade status once for all affected items
            affected_items = LabOrderItem.objects.filter(
                pk__in=[r.order_item_id for r in created_results]
            )
            for item in affected_items:
                item.update_status_from_result()

        return Response(
            LabResultSerializer(created_results, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"])
    def requisition(self, request, order_number=None):
        """Generate PDF requisition for external lab."""
        from django.http import HttpResponse

        from .services.requisition import ExternalLabRequisition

        order = self.get_object()
        try:
            pdf_buffer = ExternalLabRequisition(order).generate_pdf()
            pdf_bytes = pdf_buffer.getvalue()
            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = (
                f'attachment; filename="lab_requisition_{order.order_number}.pdf"'
            )
            return response
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError, ImportError):
            logger.exception("Error generating requisition PDF for order %s", order.pk)
            return Response(
                {"error": "Unable to generate requisition PDF."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["get"])
    def critical_alerts(self, request, order_number=None):
        """Get critical result alerts for this order."""
        order = self.get_object()
        alerts = LabAlertService.check_critical_results(order)
        return Response({"alerts": alerts})

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="attachments",
        parser_classes=[MultiPartParser, FormParser],
    )
    def attachments(self, request, order_number=None):
        """List or upload attachments for this lab order."""
        order = self.get_object()

        if request.method == "GET":
            attachments = order.attachments.all()
            serializer = LabResultAttachmentSerializer(attachments, many=True)
            return Response(serializer.data)

        serializer = LabResultAttachmentCreateSerializer(
            data=request.data,
            context={"request": request, "lab_order": order},
        )
        serializer.is_valid(raise_exception=True)
        attachment = serializer.save()
        return Response(
            LabResultAttachmentSerializer(attachment).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get", "post"], url_path="items")
    def manage_items(self, request, order_number=None):
        """Manage order items: GET to list, POST to add."""
        order = self.get_object()

        if request.method == "GET":
            serializer = LabOrderItemSerializer(order.items.all(), many=True)
            return Response(serializer.data)

        # POST - Add a new item
        test_code = request.data.get("test_code")
        special_instructions = request.data.get("special_instructions", "")

        if not test_code:
            return Response(
                {"error": "test_code is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tests_qs = TestCatalog.objects.filter(code__iexact=test_code)
        if order.facility_id:
            scoped_qs = tests_qs.filter(facility=order.facility)
            tests_qs = scoped_qs if scoped_qs.exists() else tests_qs.filter(facility__isnull=True)
        elif order.organization_id:
            scoped_qs = tests_qs.filter(organization=order.organization)
            tests_qs = (
                scoped_qs if scoped_qs.exists() else tests_qs.filter(organization__isnull=True)
            )

        test = tests_qs.first()
        if test is None:
            return Response(
                {"error": f"Test with code '{test_code}' not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check for duplicate test
        if order.items.filter(test=test).exists():
            return Response(
                {"error": f"Test '{test_code}' is already in this order"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item = LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
            special_instructions=special_instructions,
        )
        order.calculate_total_cost()

        serializer = LabOrderItemSerializer(item)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"items/(?P<item_id>\d+)")
    def delete_item(self, request, order_number=None, item_id=None):
        """Remove an item from the order."""
        order = self.get_object()

        try:
            item = order.items.get(pk=item_id)
        except LabOrderItem.DoesNotExist:
            return Response(
                {"error": "Item not found in this order"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Only allow deletion if order is still in DRAFT status
        if order.status != "DRAFT":
            return Response(
                {"error": "Can only remove items from draft orders"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item.delete()
        order.calculate_total_cost()

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get", "post"], url_path="reports")
    def reports(self, request, order_number=None):
        """
        List or create diagnostic reports for a lab order.

        GET: List all reports for this order
        POST: Create a new report for this order
        """
        order = self.get_object()

        if request.method == "GET":
            reports = order.reports.all()
            serializer = DiagnosticReportSerializer(
                reports, many=True, context={"request": request}
            )
            return Response(serializer.data)

        # POST: Create new report
        existing = (
            order.reports.exclude(status=DiagnosticReport.Status.CANCELLED)
            .order_by("-created_at")
            .first()
        )
        if existing is not None and existing.superseding_reports.exists():
            existing = None
        if existing is not None:
            serializer = DiagnosticReportSerializer(existing, context={"request": request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        # Copy request data and add lab_order from URL
        data = request.data.copy()
        data["lab_order"] = order.id
        serializer = DiagnosticReportCreateSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        report = serializer.save()
        output = DiagnosticReportSerializer(report, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="specimens")
    def specimens(self, request, order_number=None):
        """
        List all specimens for a lab order.

        GET: List all specimens associated with this order.
        """
        order = self.get_object()
        specimens = order.specimens.select_related("collected_by", "received_by").all()
        serializer = SpecimenSerializer(specimens, many=True, context={"request": request})
        return Response(serializer.data)


class LabResultViewSet(AuditedMutationMixin, NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for lab results.
    Provides CRUD operations, verification, and search.
    """

    queryset = LabResult.objects.all().select_related(
        "order_item__test", "order_item__lab_order__patient", "entered_by"
    )
    audit_resource_type = "LabResult"
    audit_action_prefix = "laboratory.result"
    audit_source = "laboratory_api"
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        ReadRequiresModelPermission,
    ]
    filter_backends = [SearchFilter, filters.DjangoFilterBackend]
    search_fields = [
        "order_item__test__name",
        "order_item__test__code",
        "order_item__lab_order__order_number",
        "order_item__lab_order__patient__first_name",
        "order_item__lab_order__patient__last_name",
    ]
    tenant_facility_chain = "order_item__lab_order__facility"
    tenant_org_chain = "order_item__lab_order__organization"
    pagination_class = StandardPagination

    # Per-action role gating (additive to base permission_classes).
    # ``verify`` / ``add_validation`` are the two-stage validation entrypoints:
    # LAB_TECH can submit a TECHNICAL validation, PATHOLOGIST/LAB_SCIENTIST
    # supplies the CLINICAL sign-off. We gate at the lower (enter-results)
    # level here and let the serializer/model enforce stage-specific rules.
    # Final ``release`` requires verify-level privileges.
    _ACTION_PERMISSIONS = {
        "create": LISEnterResultsPermission,
        "update": LISEnterResultsPermission,
        "partial_update": LISEnterResultsPermission,
        "verify": LISEnterResultsPermission,
        "add_validation": LISEnterResultsPermission,
        "release": LISReleaseResultsPermission,
    }

    def get_permissions(self):
        perms = [perm() for perm in self.permission_classes]
        extra = self._ACTION_PERMISSIONS.get(self.action)
        if extra is not None:
            perms.append(extra())
        return perms

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return LabResultCreateSerializer
        return LabResultSerializer

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        """
        Verify or reject a result (two-stage validation support).

        Accepts:
        - approved: boolean
        - comments: optional string
        - validation_type: TECHNICAL (default) or CLINICAL

        For backward compatibility, approved=True creates an APPROVED validation,
        approved=False creates a REJECTED validation.
        """
        result = self.get_object()
        serializer = LabResultVerifySerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        approved = serializer.validated_data.get("approved", True)
        comments = serializer.validated_data.get("comments", "")
        validation_type = serializer.validated_data.get("validation_type", "TECHNICAL")

        if approved:
            result.verify(request.user, validation_type=validation_type, comment=comments)
        else:
            # Reject via the validation system
            result.add_validation(
                validation_type=validation_type,
                status="REJECTED",
                validated_by=request.user,
                comment=comments,
            )
            result._update_verification_status()
            # Add rejection reason to interpretation for backward compatibility
            if comments:
                result.interpretation = (
                    f"{result.interpretation}\n\nRejection reason: {comments}".strip()
                )
                result.save(update_fields=["interpretation"])

        serializer = self.get_serializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="validations")
    def validations(self, request, pk=None):
        """
        Get all validation records for a result.

        Returns the list of technical and clinical validations.
        """
        from .serializers import ResultValidationSerializer

        result = self.get_object()
        validations = result.validations.all()
        serializer = ResultValidationSerializer(validations, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="validate")
    def add_validation(self, request, pk=None):
        """
        Add a validation record (TECHNICAL or CLINICAL).

        Use this endpoint for explicit two-stage validation workflow.
        For simple approve/reject, use the /verify/ endpoint instead.

        Accepts:
        - validation_type: TECHNICAL or CLINICAL
        - status: APPROVED or REJECTED
        - comment: optional string
        """
        from .serializers import ResultValidationCreateSerializer, ResultValidationSerializer

        result = self.get_object()
        serializer = ResultValidationCreateSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validation_type = serializer.validated_data["validation_type"]
        status_value = serializer.validated_data["status"]
        comment = serializer.validated_data.get("comment", "")

        # Check if validation of this type already exists
        existing = result.validations.filter(validation_type=validation_type).first()
        if existing:
            return Response(
                {
                    "error": f"{validation_type} validation already exists for this result. "
                    "Delete it first to re-validate."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        validation = result.add_validation(
            validation_type=validation_type,
            status=status_value,
            validated_by=request.user,
            comment=comment,
        )
        result._update_verification_status()

        return Response(ResultValidationSerializer(validation).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="pending-verification")
    def pending_verification(self, request):
        """
        Get results pending verification.

        Query params:
        - validation_type: TECHNICAL or CLINICAL (optional)
          - TECHNICAL: Results without technical validation
          - CLINICAL: Results with technical approval but pending clinical sign-off

        Without validation_type, returns all unverified results.
        """

        validation_type = request.query_params.get("validation_type")
        results = self.get_queryset().filter(verification_status="UNVERIFIED")

        if validation_type == "TECHNICAL":
            # Results without any technical validation
            results = results.exclude(
                validations__validation_type="TECHNICAL", validations__status="APPROVED"
            )
        elif validation_type == "CLINICAL":
            # Results that have technical approval but need clinical sign-off
            results = results.filter(
                order_item__test__requires_clinical_signoff=True,
                validations__validation_type="TECHNICAL",
                validations__status="APPROVED",
            ).exclude(validations__validation_type="CLINICAL", validations__status="APPROVED")

        results = results.distinct()
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="pending-clinical-signoff")
    def pending_clinical_signoff(self, request):
        """
        Get results that have technical approval but are pending clinical sign-off.

        These are results where:
        - The test requires clinical sign-off
        - Technical validation is APPROVED
        - No clinical validation exists OR clinical validation is PENDING
        """
        results = (
            self.queryset.filter(
                order_item__test__requires_clinical_signoff=True,
                validations__validation_type="TECHNICAL",
                validations__status="APPROVED",
            )
            .exclude(validations__validation_type="CLINICAL", validations__status="APPROVED")
            .distinct()
        )
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["post"],
        url_path="attachment",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_attachment(self, request, pk=None):
        """Upload external result attachment.

        Backward-compatible endpoint:
        - Stores uploads in LabResultAttachment (canonical)
        - Links LabResult.external_result_attachment to the same stored file
        """
        result = self.get_object()

        if "file" not in request.FILES:
            return Response(
                {"error": "No file provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uploaded_file = request.FILES["file"]

        from .validators import validate_lab_attachment

        try:
            validate_lab_attachment(uploaded_file)
        except (
            ValidationError,
            DjangoValidationError,
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        attachment_type = (
            request.data.get("attachment_type")
            or LabResultAttachment.AttachmentType.EXTERNAL_REPORT
        )
        description = request.data.get("description") or ""

        attachment = LabResultAttachment.objects.create(
            lab_order=result.order_item.lab_order,
            file=uploaded_file,
            attachment_type=attachment_type,
            description=description,
            uploaded_by=request.user,
        )

        # Point legacy field to the same stored file (avoid double storage)
        result.external_result_attachment.name = attachment.file.name
        result.is_external_result = True
        result.save(update_fields=["external_result_attachment", "is_external_result"])

        serializer = self.get_serializer(result)
        return Response(serializer.data)

    tenant_scope = "facility"
