# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Views for standalone LIS operations."""

import csv
import json
import logging
from io import StringIO

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.decorators import permission_classes as drf_permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.billing.models import Invoice, Payment, Receipt, SHARemittanceLine
from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin, resolve_request_tenant
from hmis.apps.core.models import AuditLog, ExternalCodeMapping
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    RequiresActiveShiftPermission,
    get_client_ip,
)
from hmis.apps.core.serializers_org_facility import FacilityDetailSerializer
from hmis.apps.laboratory.analyzers.models import InstrumentChannel
from hmis.apps.laboratory.models import Instrument, LabOrder, LabWorkflowSettings, TestCatalog
from hmis.apps.laboratory.permissions import LaboratoryModuleRequired, LISStandaloneRequired
from hmis.apps.laboratory.serializers import LabOrderSerializer

from .models import (
    ExternalOrderRequest,
    ExternalPatientIdentifierCrosswalk,
    InboundIngestionEvent,
    ResultDeliveryLog,
    WalkInPatient,
)
from .serializers import (
    ExternalOrderAcceptSerializer,
    ExternalOrderRejectSerializer,
    ExternalOrderRequestSerializer,
    ExternalPatientIdentifierCrosswalkSerializer,
    InboundIngestionEventSerializer,
    InboundOrderIngestSerializer,
    LISMessageMappingSerializer,
    LISMessageMappingUpsertSerializer,
    LISMessageMappingValidationSerializer,
    ResultDeliveryLogSerializer,
    ResultDeliveryRequestSerializer,
    StandaloneOrderCreateSerializer,
    WalkInPatientCreateSerializer,
    WalkInPatientSerializer,
)

logger = logging.getLogger(__name__)


class StandaloneFacilityDetailsSerializer(serializers.Serializer):
    """Limit standalone onboarding to the facility identity fields it owns."""

    name = serializers.CharField(max_length=255, required=False)
    laboratory_license_number = serializers.CharField(
        max_length=100, required=False, allow_blank=True
    )
    laboratory_license_issuer = serializers.CharField(
        max_length=100, required=False, allow_blank=True
    )
    laboratory_license_issue_date = serializers.DateField(required=False, allow_null=True)
    laboratory_license_expiry = serializers.DateField(required=False, allow_null=True)


def _build_csv_reader(decoded: str) -> csv.DictReader:
    """Build a DictReader that tolerates common CSV delimiters.

    Accepts comma, semicolon, or tab-delimited input to support spreadsheet
    exports that may vary by locale/editor.
    """

    sample = decoded[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return csv.DictReader(StringIO(decoded), dialect=dialect)


def _get_standalone_facility(request):
    """Resolve and validate standalone LIS facility context for onboarding endpoints."""
    resolve_request_tenant(request)
    profile = getattr(request.user, "staff_profile", None)
    facility = getattr(request, "facility", None)

    if not facility:
        primary_facility = getattr(profile, "primary_facility", None)
        if primary_facility and primary_facility.is_active:
            facility = primary_facility

    if not facility:
        return None, Response(
            {"detail": "No active facility is linked to your staff profile."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not facility.is_active:
        return None, Response(
            {"detail": "The selected facility is inactive. Activate it before LIS onboarding."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if facility.operating_mode != facility.OperatingMode.STANDALONE_LAB:
        return None, Response(
            {"detail": "This endpoint is only available in standalone lab mode."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return facility, None


@extend_schema(exclude=True)
@api_view(["GET", "POST"])
@drf_permission_classes([IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired])
def standalone_onboarding_status(request):
    """Get/complete LIS standalone onboarding checklist for the active facility."""
    facility, error_response = _get_standalone_facility(request)
    if error_response:
        return error_response

    steps = facility.get_lis_onboarding_checklist()
    missing_required = [step["key"] for step in steps if step["required"] and not step["done"]]

    if not missing_required and not facility.lis_onboarding_complete:
        facility.lis_onboarding_completed_at = timezone.now()
        facility.save(update_fields=["lis_onboarding_completed_at", "updated_at"])

        AuditLog.log(
            action="lis_onboarding_completed",
            user=request.user,
            resource_type="Facility",
            resource_id=facility.id,
            facility=facility,
            organization=facility.organization,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"operating_mode": str(facility.operating_mode), "source": "auto_inferred"},
            request=request,
        )

    if request.method == "GET":
        return Response(
            {
                "complete": facility.lis_onboarding_complete,
                "steps": steps,
                "completed_at": facility.lis_onboarding_completed_at.isoformat()
                if facility.lis_onboarding_completed_at
                else None,
            }
        )

    if facility.lis_onboarding_complete:
        return Response(
            {
                "complete": True,
                "steps": steps,
                "completed_at": facility.lis_onboarding_completed_at.isoformat()
                if facility.lis_onboarding_completed_at
                else None,
            }
        )

    if missing_required:
        return Response(
            {
                "detail": "Please complete all required LIS onboarding steps first.",
                "code": "lis_onboarding_incomplete",
                "missing_steps": missing_required,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    facility.lis_onboarding_completed_at = timezone.now()
    facility.save(update_fields=["lis_onboarding_completed_at", "updated_at"])

    AuditLog.log(
        action="lis_onboarding_completed",
        user=request.user,
        resource_type="Facility",
        resource_id=facility.id,
        facility=facility,
        organization=facility.organization,
        ip_address=get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
        details={"operating_mode": str(facility.operating_mode)},
        request=request,
    )

    return Response(
        {
            "complete": True,
            "steps": steps,
            "completed_at": facility.lis_onboarding_completed_at.isoformat()
            if facility.lis_onboarding_completed_at
            else None,
        }
    )


@extend_schema(exclude=True)
@api_view(["PATCH"])
@drf_permission_classes([IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired])
def standalone_onboarding_facility_details(request):
    """Update standalone lab identity without granting broad facility administration."""
    facility, error_response = _get_standalone_facility(request)
    if error_response:
        return error_response

    serializer = StandaloneFacilityDetailsSerializer(data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    changed_fields = list(serializer.validated_data)
    for field, value in serializer.validated_data.items():
        setattr(facility, field, value)
    if changed_fields:
        facility.save(update_fields=[*changed_fields, "updated_at"])
        AuditLog.log(
            action="lis_onboarding_facility_details_updated",
            user=request.user,
            resource_type="Facility",
            resource_id=facility.id,
            facility=facility,
            organization=facility.organization,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"fields": changed_fields, "source": "lis_standalone_onboarding"},
            request=request,
        )
    return Response(FacilityDetailSerializer(facility).data)


@extend_schema(exclude=True)
@api_view(["POST"])
@drf_permission_classes([IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired])
def standalone_onboarding_seed_defaults(request):
    """Seed default LIS onboarding data for a selected lab archetype."""
    facility, error_response = _get_standalone_facility(request)
    if error_response:
        return error_response

    archetype = str(request.data.get("archetype", "small")).strip().lower()
    if archetype not in {"small", "medium", "reference"}:
        return Response(
            {"detail": "archetype must be one of: small, medium, reference."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    catalogue_by_archetype = {
        "small": [
            ("CBC", "Complete Blood Count", "HEMATOLOGY", "BLOOD", 500),
            ("RBS", "Random Blood Sugar", "CHEMISTRY", "BLOOD", 250),
            ("URINALYSIS", "Urinalysis", "URINALYSIS", "URINE", 300),
        ],
        "medium": [
            ("CBC", "Complete Blood Count", "HEMATOLOGY", "BLOOD", 500),
            ("RBS", "Random Blood Sugar", "CHEMISTRY", "BLOOD", 250),
            ("LFT", "Liver Function Test", "CHEMISTRY", "SERUM", 1200),
            ("RFT", "Renal Function Test", "CHEMISTRY", "SERUM", 1200),
            ("MALARIA", "Malaria Parasite", "PARASITOLOGY", "BLOOD", 400),
            ("URINALYSIS", "Urinalysis", "URINALYSIS", "URINE", 300),
        ],
        "reference": [
            ("CBC", "Complete Blood Count", "HEMATOLOGY", "BLOOD", 500),
            ("ESR", "Erythrocyte Sedimentation Rate", "HEMATOLOGY", "BLOOD", 350),
            ("LFT", "Liver Function Test", "CHEMISTRY", "SERUM", 1200),
            ("RFT", "Renal Function Test", "CHEMISTRY", "SERUM", 1200),
            ("LIPID", "Lipid Profile", "CHEMISTRY", "SERUM", 1500),
            ("TSH", "Thyroid Stimulating Hormone", "CHEMISTRY", "SERUM", 1800),
            ("HBA1C", "HbA1c", "CHEMISTRY", "BLOOD", 900),
            ("HIV", "HIV 1/2 Antibody", "SEROLOGY", "SERUM", 600),
            ("HB", "Hepatitis B Surface Antigen", "SEROLOGY", "SERUM", 700),
            ("MALARIA", "Malaria Parasite", "PARASITOLOGY", "BLOOD", 400),
        ],
    }

    is_non_kenya_facility = str(getattr(facility, "country_code", "KE")).upper() != "KE"

    created_tests = 0
    reactivated_tests = 0
    created_instruments = 0
    created_channels = 0

    LabWorkflowSettings.objects.get_or_create(
        facility=facility,
        organization=facility.organization,
    )

    for code, name, category, specimen, cost in catalogue_by_archetype[archetype]:
        seeded_cost = 0 if is_non_kenya_facility else cost
        test, created = TestCatalog.objects.get_or_create(
            facility=facility,
            organization=facility.organization,
            code=code,
            defaults={
                "name": name,
                "short_name": code,
                "category": category,
                "specimen_type": specimen,
                "cost": seeded_cost,
                "result_type": "NUMERIC",
                "is_active": True,
            },
        )
        if created:
            created_tests += 1
        elif not test.is_active:
            test.is_active = True
            test.save(update_fields=["is_active", "updated_at"])
            reactivated_tests += 1

    instrument_code = f"AUTO-{archetype.upper()}-01"
    instrument, inst_created = Instrument.objects.get_or_create(
        facility=facility,
        organization=facility.organization,
        code=instrument_code,
        defaults={
            "name": f"{archetype.title()} Lab Analyzer",
            "manufacturer": "Generic",
            "model": "LIS Seed",
            "department": "Laboratory",
            "interface_type": Instrument.InterfaceType.MANUAL,
            "is_active": True,
        },
    )
    if inst_created:
        created_instruments += 1

    _, ch_created = InstrumentChannel.objects.get_or_create(
        facility=facility,
        organization=facility.organization,
        instrument=instrument,
        name="Primary Channel",
        defaults={
            "protocol": InstrumentChannel.Protocol.TCP,
            "direction": InstrumentChannel.Direction.BIDIRECTIONAL,
            "host": "127.0.0.1",
            "port": 5000,
            "encoding": "ascii",
            "is_active": True,
        },
    )
    if ch_created:
        created_channels += 1

    return Response(
        {
            "archetype": archetype,
            "created_tests": created_tests,
            "reactivated_tests": reactivated_tests,
            "created_instruments": created_instruments,
            "created_channels": created_channels,
        },
        status=status.HTTP_200_OK,
    )


@extend_schema(exclude=True)
@api_view(["GET"])
@drf_permission_classes([IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired])
def standalone_onboarding_template_download(request, template_name: str):
    """Return CSV template content for LIS onboarding imports."""
    facility, error_response = _get_standalone_facility(request)
    if error_response:
        return error_response

    _ = facility
    templates = {
        "test-catalog": (
            "code,name,short_name,category,specimen_type,turnaround_hours,cost,result_type,is_active\n"
            "CBC,Complete Blood Count,CBC,HEMATOLOGY,BLOOD,6,0,NUMERIC,true\n"
        ),
        "specimen-workflow": (
            "workflow_key,enabled,value\n"
            "require_specimen_receipt,true,true\n"
            "auto_print_labels_on_collect,true,true\n"
            "tat_warning_threshold_percent,true,75\n"
        ),
        "analyzer-channel": (
            "instrument_code,instrument_name,manufacturer,protocol,host,port,encoding,channel_name,is_active\n"
            "AUTO-01,Main Analyzer,Generic,TCP,127.0.0.1,5000,ascii,Primary Channel,true\n"
        ),
        "reference-ranges": (
            "test_code,gender,age_band,normal_range,critical_low,critical_high,unit\n"
            "CBC,F,adult,4.0-10.0,2.0,25.0,x10^9/L\n"
        ),
    }

    content = templates.get(template_name)
    if not content:
        return Response(
            {
                "detail": (
                    "Unknown template. Use one of: test-catalog, specimen-workflow, "
                    "analyzer-channel, reference-ranges."
                )
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    response = HttpResponse(content, content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{template_name}.csv"'
    return response


@extend_schema(exclude=True)
@api_view(["POST"])
@drf_permission_classes([IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired])
def standalone_onboarding_import_test_catalog(request):
    """Import TestCatalog entries from CSV for LIS onboarding."""
    facility, error_response = _get_standalone_facility(request)
    if error_response:
        return error_response

    upload = request.FILES.get("file")
    if upload is None:
        return Response({"detail": "CSV file is required under 'file'."}, status=400)

    try:
        decoded = upload.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return Response({"detail": "CSV file must be UTF-8 encoded."}, status=400)

    reader = _build_csv_reader(decoded)
    required_columns = {
        "code",
        "name",
        "short_name",
        "category",
        "specimen_type",
        "turnaround_hours",
        "cost",
        "result_type",
    }
    missing = sorted(required_columns - set(reader.fieldnames or []))
    if missing:
        return Response(
            {"detail": "Missing required CSV columns.", "missing_columns": missing},
            status=400,
        )

    allowed_categories = {choice[0] for choice in TestCatalog.TEST_CATEGORIES}
    allowed_specimen_types = {choice[0] for choice in TestCatalog.SPECIMEN_TYPES}
    allowed_result_types = {choice[0] for choice in TestCatalog.RESULT_TYPES}

    created = 0
    updated = 0
    errors = []

    for index, row in enumerate(reader, start=2):
        code = str(row.get("code", "")).strip().upper()
        name = str(row.get("name", "")).strip()
        short_name = str(row.get("short_name", "")).strip()
        category = str(row.get("category", "")).strip().upper()
        specimen_type = str(row.get("specimen_type", "")).strip().upper()
        result_type = str(row.get("result_type", "")).strip().upper()
        is_active = str(row.get("is_active", "true")).strip().lower() not in {
            "false",
            "0",
            "no",
        }

        try:
            turnaround_hours = int(str(row.get("turnaround_hours", "24")).strip())
            cost = float(str(row.get("cost", "0")).strip())
        except ValueError:
            errors.append(
                {
                    "row": index,
                    "error": "turnaround_hours and cost must be numeric values.",
                }
            )
            continue

        row_errors = []
        if not code:
            row_errors.append("code is required")
        if not name:
            row_errors.append("name is required")
        if not short_name:
            row_errors.append("short_name is required")
        if category not in allowed_categories:
            row_errors.append(f"category must be one of: {', '.join(sorted(allowed_categories))}")
        if specimen_type not in allowed_specimen_types:
            row_errors.append(
                f"specimen_type must be one of: {', '.join(sorted(allowed_specimen_types))}"
            )
        if result_type not in allowed_result_types:
            row_errors.append(
                f"result_type must be one of: {', '.join(sorted(allowed_result_types))}"
            )

        if row_errors:
            errors.append({"row": index, "error": "; ".join(row_errors)})
            continue

        _, was_created = TestCatalog.objects.update_or_create(
            facility=facility,
            organization=facility.organization,
            code=code,
            defaults={
                "name": name,
                "short_name": short_name,
                "category": category,
                "specimen_type": specimen_type,
                "turnaround_hours": turnaround_hours,
                "cost": cost,
                "result_type": result_type,
                "is_active": is_active,
            },
        )

        if was_created:
            created += 1
        else:
            updated += 1

    return Response(
        {
            "created": created,
            "updated": updated,
            "errors": errors,
            "error_count": len(errors),
        },
        status=status.HTTP_200_OK,
    )


@extend_schema(exclude=True)
@api_view(["POST"])
@drf_permission_classes([IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired])
def standalone_onboarding_import_specimen_workflow(request):
    """Import LabWorkflowSettings key/value pairs from CSV."""
    facility, error_response = _get_standalone_facility(request)
    if error_response:
        return error_response

    upload = request.FILES.get("file")
    if upload is None:
        return Response({"detail": "CSV file is required under 'file'."}, status=400)

    try:
        decoded = upload.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return Response({"detail": "CSV file must be UTF-8 encoded."}, status=400)

    reader = _build_csv_reader(decoded)
    required_columns = {"workflow_key", "enabled", "value"}
    missing = sorted(required_columns - set(reader.fieldnames or []))
    if missing:
        return Response(
            {"detail": "Missing required CSV columns.", "missing_columns": missing},
            status=400,
        )

    workflow, _ = LabWorkflowSettings.objects.get_or_create(
        facility=facility,
        organization=facility.organization,
    )

    bool_fields = {
        "auto_release_normal_results",
        "require_double_verification_critical",
        "auto_print_on_verify",
        "auto_print_labels_on_collect",
        "notify_clinician_on_critical",
        "notify_clinician_on_complete",
        "require_specimen_receipt",
        "specimen_rejection_requires_supervisor",
        "allow_duplicate_orders",
        "require_clinical_notes",
    }
    int_fields = {"tat_warning_threshold_percent"}

    updated_fields = set()
    errors = []

    for index, row in enumerate(reader, start=2):
        key = str(row.get("workflow_key", "")).strip()
        enabled = str(row.get("enabled", "true")).strip().lower()
        value = str(row.get("value", "")).strip()

        if enabled in {"false", "0", "no"}:
            continue

        if key in bool_fields:
            normalized = value.lower()
            if normalized in {"true", "1", "yes"}:
                setattr(workflow, key, True)
                updated_fields.add(key)
            elif normalized in {"false", "0", "no"}:
                setattr(workflow, key, False)
                updated_fields.add(key)
            else:
                errors.append({"row": index, "error": f"Invalid boolean value for {key}."})
        elif key in int_fields:
            try:
                setattr(workflow, key, int(value))
                updated_fields.add(key)
            except ValueError:
                errors.append({"row": index, "error": f"Invalid integer value for {key}."})
        else:
            errors.append({"row": index, "error": f"Unknown workflow_key '{key}'."})

    if updated_fields:
        workflow.save(update_fields=sorted(updated_fields))

    return Response(
        {
            "updated": len(updated_fields),
            "errors": errors,
            "error_count": len(errors),
        },
        status=status.HTTP_200_OK,
    )


@extend_schema(exclude=True)
@api_view(["POST"])
@drf_permission_classes([IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired])
def standalone_onboarding_import_analyzer_channel(request):
    """Import instrument + channel configuration rows from CSV."""
    facility, error_response = _get_standalone_facility(request)
    if error_response:
        return error_response

    upload = request.FILES.get("file")
    if upload is None:
        return Response({"detail": "CSV file is required under 'file'."}, status=400)

    try:
        decoded = upload.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return Response({"detail": "CSV file must be UTF-8 encoded."}, status=400)

    reader = _build_csv_reader(decoded)
    required_columns = {
        "instrument_code",
        "instrument_name",
        "manufacturer",
        "protocol",
        "host",
        "port",
        "encoding",
        "channel_name",
        "is_active",
    }
    missing = sorted(required_columns - set(reader.fieldnames or []))
    if missing:
        return Response(
            {"detail": "Missing required CSV columns.", "missing_columns": missing},
            status=400,
        )

    valid_protocols = {choice[0] for choice in InstrumentChannel.Protocol.choices}
    created_instruments = 0
    created_channels = 0
    updated_channels = 0
    errors = []

    for index, row in enumerate(reader, start=2):
        instrument_code = str(row.get("instrument_code", "")).strip().upper()
        instrument_name = str(row.get("instrument_name", "")).strip()
        manufacturer = str(row.get("manufacturer", "")).strip()
        protocol = str(row.get("protocol", "")).strip().upper()
        host = str(row.get("host", "")).strip()
        channel_name = str(row.get("channel_name", "")).strip()
        encoding = str(row.get("encoding", "ascii")).strip() or "ascii"
        is_active = str(row.get("is_active", "true")).strip().lower() not in {
            "false",
            "0",
            "no",
        }

        try:
            port = int(str(row.get("port", "")).strip())
        except ValueError:
            errors.append({"row": index, "error": "port must be an integer."})
            continue

        if not instrument_code or not instrument_name or not channel_name or not host:
            errors.append(
                {
                    "row": index,
                    "error": "instrument_code, instrument_name, channel_name, and host are required.",
                }
            )
            continue

        if protocol not in valid_protocols:
            errors.append(
                {
                    "row": index,
                    "error": f"protocol must be one of: {', '.join(sorted(valid_protocols))}",
                }
            )
            continue

        instrument, was_created = Instrument.objects.get_or_create(
            facility=facility,
            organization=facility.organization,
            code=instrument_code,
            defaults={
                "name": instrument_name,
                "manufacturer": manufacturer,
                "interface_type": Instrument.InterfaceType.MANUAL,
                "is_active": True,
            },
        )
        if was_created:
            created_instruments += 1

        _, channel_created = InstrumentChannel.objects.update_or_create(
            facility=facility,
            organization=facility.organization,
            instrument=instrument,
            name=channel_name,
            defaults={
                "protocol": protocol,
                "direction": InstrumentChannel.Direction.BIDIRECTIONAL,
                "host": host,
                "port": port,
                "encoding": encoding,
                "is_active": is_active,
            },
        )
        if channel_created:
            created_channels += 1
        else:
            updated_channels += 1

    return Response(
        {
            "created_instruments": created_instruments,
            "created_channels": created_channels,
            "updated_channels": updated_channels,
            "errors": errors,
            "error_count": len(errors),
        },
        status=status.HTTP_200_OK,
    )


@extend_schema(exclude=True)
@api_view(["POST"])
@drf_permission_classes([IsAuthenticated, LaboratoryModuleRequired, LISStandaloneRequired])
def standalone_onboarding_import_reference_ranges(request):
    """Import reference ranges for tests from CSV."""
    facility, error_response = _get_standalone_facility(request)
    if error_response:
        return error_response

    upload = request.FILES.get("file")
    if upload is None:
        return Response({"detail": "CSV file is required under 'file'."}, status=400)

    try:
        decoded = upload.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return Response({"detail": "CSV file must be UTF-8 encoded."}, status=400)

    reader = _build_csv_reader(decoded)
    required_columns = {"test_code", "gender", "age_band", "normal_range", "unit"}
    missing = sorted(required_columns - set(reader.fieldnames or []))
    if missing:
        return Response(
            {"detail": "Missing required CSV columns.", "missing_columns": missing},
            status=400,
        )

    updated = 0
    errors = []

    for index, row in enumerate(reader, start=2):
        code = str(row.get("test_code", "")).strip().upper()
        gender = str(row.get("gender", "")).strip().upper()
        age_band = str(row.get("age_band", "")).strip().lower()
        normal_range = str(row.get("normal_range", "")).strip()
        unit = str(row.get("unit", "")).strip()

        if not code or not normal_range:
            errors.append({"row": index, "error": "test_code and normal_range are required."})
            continue

        test = TestCatalog.objects.filter(
            facility=facility,
            organization=facility.organization,
            code=code,
        ).first()
        if not test:
            errors.append({"row": index, "error": f"Test '{code}' not found."})
            continue

        fields_to_update = []
        if age_band == "child":
            test.normal_range_child = normal_range
            fields_to_update.append("normal_range_child")
        elif gender == "F":
            test.normal_range_female = normal_range
            fields_to_update.append("normal_range_female")
        else:
            test.normal_range_male = normal_range
            fields_to_update.append("normal_range_male")

        if unit:
            test.result_unit = unit
            fields_to_update.append("result_unit")

        test.save(update_fields=fields_to_update + ["updated_at"])
        updated += 1

    return Response(
        {
            "updated": updated,
            "errors": errors,
            "error_count": len(errors),
        },
        status=status.HTTP_200_OK,
    )


class WalkInPatientViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD for walk-in patient registrations.

    Walk-in patients are lightweight records for labs operating independently
    of the full HMIS patient module.
    """

    tenant_scope = "facility"
    queryset = WalkInPatient.objects.all().select_related("linked_patient")
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]
    filter_backends = [filters.SearchFilter]
    search_fields = [
        "first_name",
        "last_name",
        "registration_number",
    ]

    def get_serializer_class(self):
        if self.action == "create":
            return WalkInPatientCreateSerializer
        return WalkInPatientSerializer

    def perform_create(self, serializer):
        serializer.save(
            registered_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )

    @action(detail=True, methods=["post"], url_path="link-patient")
    def link_patient(self, request, pk=None):
        """Link a walk-in patient to a full HMIS patient record."""
        walkin = self.get_object()
        patient_id = request.data.get("patient_id")

        if not patient_id:
            return Response(
                {"error": "patient_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        from hmis.apps.patients.models import Patient

        try:
            patient = Patient.objects.get(id=patient_id)
        except Patient.DoesNotExist:
            return Response({"error": "Patient not found."}, status=status.HTTP_404_NOT_FOUND)

        walkin.linked_patient = patient
        walkin.save(update_fields=["linked_patient", "updated_at"])

        serializer = WalkInPatientSerializer(walkin)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="promote")
    def promote(self, request, pk=None):
        """
        Promote a walk-in patient into a full HMIS ``Patient`` record.

        Optional request payload:
            county: int, sub_county: int, ward: int, date_of_birth: ISO date,
            identification_type: str, plus any other ``Patient`` field overrides.

        Idempotent — returns the existing linked patient if already promoted.
        """
        walkin = self.get_object()
        data = request.data or {}
        was_linked = bool(walkin.linked_patient_id)

        try:
            patient = walkin.promote_to_patient(
                user=request.user,
                county_id=data.get("county"),
                sub_county_id=data.get("sub_county"),
                ward_id=data.get("ward"),
                **{
                    k: v
                    for k, v in data.items()
                    if k
                    in {
                        "date_of_birth",
                        "identification_type",
                        "title",
                        "middle_name",
                        "phone_number",
                        "email",
                        "village",
                    }
                },
            )
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as exc:  # noqa: BLE001
            logger.exception("Walk-in promotion failed for id=%s", walkin.pk)
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not was_linked:
            AuditLog.log(
                action="patient_create",
                user=request.user,
                resource_type="Patient",
                resource_id=patient.id,
                patient_id=patient.id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                details={
                    "source": "walkin_promote",
                    "patient_mrn": patient.mrn,
                    "walkin_patient_id": walkin.id,
                    "registered_by": request.user.username,
                },
                request=request,
            )

        serializer = WalkInPatientSerializer(walkin)
        return Response(
            {"walkin": serializer.data, "patient_id": patient.pk, "mrn": patient.mrn},
            status=status.HTTP_200_OK,
        )


class StandaloneOrderViewSet(TenantScopedViewMixin, viewsets.GenericViewSet):
    """
    Standalone lab order creation (no encounter required).

    Supports walk-in patients and external referrals.
    """

    tenant_scope = "facility"
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]

    def get_serializer_class(self):
        return StandaloneOrderCreateSerializer

    def create(self, request, *args, **kwargs):
        """Create a standalone lab order."""
        serializer = StandaloneOrderCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "tenant_kwargs": self.get_tenant_save_kwargs(),
            },
        )
        serializer.is_valid(raise_exception=True)
        order = serializer.save()

        output_serializer = LabOrderSerializer(order)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class StandaloneBillingViewSet(TenantScopedViewMixin, viewsets.GenericViewSet):
    """Standalone lab billing and reconciliation endpoints."""

    tenant_scope = "facility"
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]

    @action(detail=False, methods=["get"], url_path="reconciliation")
    def reconciliation(self, request):
        tenant = self.get_tenant_save_kwargs()
        facility = tenant.get("facility")

        released_orders = LabOrder.objects.filter(
            facility=facility,
            status="COMPLETED",
            is_walkin=True,
        )
        released_count = released_orders.count()
        released_amount = released_orders.aggregate(total=Sum("total_cost")).get("total") or 0

        invoices = Invoice.objects.filter(
            facility=facility,
            items__lab_order__in=released_orders,
        ).distinct()
        invoice_count = invoices.count()
        invoice_total = invoices.aggregate(total=Sum("total_amount")).get("total") or 0

        payments = Payment.objects.filter(
            invoice__in=invoices,
            status=Payment.Status.COMPLETED,
        )
        payment_count = payments.count()
        collected_total = payments.aggregate(total=Sum("amount")).get("total") or 0

        outstanding = invoice_total - collected_total

        return Response(
            {
                "released_orders": released_count,
                "released_amount": str(released_amount),
                "invoices": invoice_count,
                "invoiced_amount": str(invoice_total),
                "payments": payment_count,
                "collected_amount": str(collected_total),
                "outstanding_amount": str(outstanding),
            }
        )

    @action(detail=False, methods=["get"], url_path="invoices")
    def invoices(self, request):
        tenant = self.get_tenant_save_kwargs()
        facility = tenant.get("facility")
        qs = (
            Invoice.objects.filter(facility=facility, items__lab_order__is_walkin=True)
            .select_related("patient")
            .prefetch_related("items")
            .distinct()
            .order_by("-created_at")[:100]
        )
        payload = [
            {
                "id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "patient_name": str(invoice.patient),
                "invoice_date": invoice.invoice_date.isoformat(),
                "status": invoice.status,
                "payer_type": invoice.payer_type,
                "total_amount": str(invoice.total_amount),
                "amount_paid": str(invoice.amount_paid),
                "balance_due": str(invoice.balance_due),
            }
            for invoice in qs
        ]
        return Response(payload)

    @action(detail=False, methods=["get"], url_path="payments")
    def payments(self, request):
        tenant = self.get_tenant_save_kwargs()
        facility = tenant.get("facility")
        qs = (
            Payment.objects.filter(
                invoice__facility=facility,
                invoice__items__lab_order__is_walkin=True,
            )
            .select_related("invoice")
            .order_by("-payment_date")
            .distinct()[:200]
        )
        receipt_numbers = {
            r["payment_id"]: r["receipt_number"]
            for r in Receipt.objects.filter(payment__in=qs)
            .values("payment_id", "receipt_number")
            .iterator()
        }
        payload = [
            {
                "id": payment.id,
                "payment_reference": payment.payment_reference,
                "invoice_id": payment.invoice_id,
                "invoice_number": payment.invoice.invoice_number,
                "status": payment.status,
                "method": payment.method,
                "amount": str(payment.amount),
                "payment_date": payment.payment_date.isoformat(),
                "receipt_number": receipt_numbers.get(payment.id, ""),
            }
            for payment in qs
        ]
        return Response(payload)

    @action(detail=False, methods=["get"], url_path="remittance-lines")
    def remittance_lines(self, request):
        tenant = self.get_tenant_save_kwargs()
        facility = tenant.get("facility")
        qs = (
            SHARemittanceLine.objects.filter(
                claim__invoice__facility=facility,
                claim__invoice__items__lab_order__is_walkin=True,
            )
            .select_related("remittance", "claim")
            .order_by("-remittance__payment_date", "-id")
            .distinct()[:200]
        )
        payload = [
            {
                "id": line.id,
                "bank_reference": line.remittance.bank_reference,
                "remittance_date": line.remittance.payment_date.isoformat(),
                "remittance_status": line.remittance.status,
                "dha_claim_id": line.dha_claim_id,
                "claim_id": line.claim_id,
                "claim_number": getattr(line.claim, "claim_number", ""),
                "paid_amount": str(line.paid_amount),
                "payment_status": line.payment_status,
                "is_reconciled": line.is_reconciled,
            }
            for line in qs
        ]
        return Response(payload)

    @action(detail=False, methods=["get"], url_path=r"invoices/(?P<invoice_id>[^/.]+)/pdf")
    def invoice_pdf(self, request, invoice_id=None):
        tenant = self.get_tenant_save_kwargs()
        facility = tenant.get("facility")
        invoice = Invoice.objects.filter(
            id=invoice_id,
            facility=facility,
            items__lab_order__is_walkin=True,
        ).first()
        if invoice is None:
            return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)

        from .services import generate_invoice_pdf_bytes

        pdf_bytes = generate_invoice_pdf_bytes(invoice)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="standalone-invoice-{invoice.invoice_number}.pdf"'
        )
        return response

    @action(detail=False, methods=["get"], url_path=r"payments/(?P<payment_id>[^/.]+)/receipt-pdf")
    def payment_receipt_pdf(self, request, payment_id=None):
        tenant = self.get_tenant_save_kwargs()
        facility = tenant.get("facility")
        payment = Payment.objects.filter(
            id=payment_id,
            invoice__facility=facility,
            invoice__items__lab_order__is_walkin=True,
        ).first()
        if payment is None:
            return Response({"detail": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)

        receipt = Receipt.objects.filter(payment=payment).first()
        if receipt is None:
            receipt = Receipt.objects.create(
                payment=payment,
                invoice=payment.invoice,
                patient=payment.invoice.patient,
                amount=payment.amount,
                payment_method=payment.method,
                issued_by=request.user,
            )

        response = HttpResponse(receipt.generate_pdf(), content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="receipt-{receipt.receipt_number}.pdf"'
        )
        return response


class InteropInboundViewSet(TenantScopedViewMixin, viewsets.GenericViewSet):
    """Inbound interop intake with idempotency and dead-letter tracking."""

    tenant_scope = "facility"
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]

    def create(self, request, *args, **kwargs):
        serializer = InboundOrderIngestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        idempotency_key = request.META.get("HTTP_X_IDEMPOTENCY_KEY", "").strip()
        source_system = serializer.validated_data["source_system"].strip()
        message_format = serializer.validated_data["message_format"]
        tenant_kwargs = self.get_tenant_save_kwargs()

        if idempotency_key:
            existing = ExternalOrderRequest.objects.filter(
                facility=tenant_kwargs.get("facility"),
                idempotency_key=idempotency_key,
            ).first()
            if existing:
                return Response(
                    {
                        "trace_id": str(existing.trace_id),
                        "status": "idempotent_replay",
                        "external_order": ExternalOrderRequestSerializer(existing).data,
                    },
                    status=status.HTTP_200_OK,
                )

        raw_payload = (
            serializer.validated_data.get("hl7_message", "")
            if message_format == "HL7"
            else json.dumps(serializer.validated_data.get("payload") or {})
        )
        event = InboundIngestionEvent.objects.create(
            source_system=source_system,
            channel=serializer.validated_data.get("channel", "API"),
            idempotency_key=idempotency_key,
            raw_payload=raw_payload,
            status=InboundIngestionEvent.Status.RECEIVED,
            **tenant_kwargs,
        )

        from .services import ingest_hl7_orm, ingest_structured_order_payload

        try:
            if message_format == "HL7":
                ext_order = ingest_hl7_orm(
                    raw_payload,
                    facility=tenant_kwargs.get("facility"),
                    organization=tenant_kwargs.get("organization"),
                    idempotency_key=idempotency_key,
                )
            else:
                ext_order = ingest_structured_order_payload(
                    payload=serializer.validated_data.get("payload") or {},
                    source_system=source_system,
                    facility=tenant_kwargs.get("facility"),
                    organization=tenant_kwargs.get("organization"),
                    idempotency_key=idempotency_key,
                )

            event.external_order = ext_order
            event.trace_id = ext_order.trace_id
            event.status = InboundIngestionEvent.Status.MAPPED
            event.error_message = ""
            event.processed_at = timezone.now()
            event.save(
                update_fields=[
                    "external_order",
                    "trace_id",
                    "status",
                    "error_message",
                    "processed_at",
                    "updated_at",
                ]
            )

            from .services import create_or_update_crosswalk

            create_or_update_crosswalk(
                source_system=source_system,
                external_patient_id=ext_order.external_patient_id,
                patient_name=ext_order.patient_name,
                facility=tenant_kwargs.get("facility"),
                organization=tenant_kwargs.get("organization"),
            )

            return Response(
                {
                    "trace_id": str(ext_order.trace_id),
                    "event_id": event.id,
                    "external_order": ExternalOrderRequestSerializer(ext_order).data,
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as exc:  # noqa: BLE001 - dead-letter entry must be preserved with diagnostics
            logger.exception("Standalone LIS inbound ingest failed")
            event.status = InboundIngestionEvent.Status.FAILED
            event.error_message = str(exc)
            event.processed_at = timezone.now()
            event.save(update_fields=["status", "error_message", "processed_at", "updated_at"])
            return Response(
                {
                    "detail": "Inbound ingestion failed and was added to dead-letter queue.",
                    "event_id": event.id,
                    "trace_id": str(event.trace_id),
                    "error": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


class InboundIngestionEventViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read/replay API for inbound ingestion events and dead-letter queue."""

    tenant_scope = "facility"
    queryset = InboundIngestionEvent.objects.select_related("external_order")
    serializer_class = InboundIngestionEventSerializer
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]

    @action(detail=True, methods=["post"])
    def replay(self, request, pk=None):
        event = self.get_object()
        if event.status != InboundIngestionEvent.Status.FAILED:
            return Response(
                {"detail": "Only FAILED ingestion events can be replayed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .services import replay_inbound_event

        try:
            ext_order = replay_inbound_event(
                event,
                facility=getattr(request, "_facility", None) or event.facility,
                organization=getattr(request, "_organization", None) or event.organization,
            )
            return Response(
                {
                    "status": "replayed",
                    "trace_id": str(ext_order.trace_id),
                    "external_order": ExternalOrderRequestSerializer(ext_order).data,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as exc:  # noqa: BLE001 - propagate dead-letter diagnostics
            return Response(
                {"detail": "Replay failed.", "error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ResultDeliveryLogViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read/download API for outbound result delivery logs."""

    tenant_scope = "facility"
    queryset = ResultDeliveryLog.objects.select_related(
        "lab_order", "external_order", "requested_by"
    )
    serializer_class = ResultDeliveryLogSerializer
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]

    @action(detail=True, methods=["get"], url_path="download-pdf")
    def download_pdf(self, request, pk=None):
        delivery = self.get_object()
        if not delivery.pdf_package:
            return Response(
                {"detail": "No PDF package is available for this delivery log."},
                status=status.HTTP_404_NOT_FOUND,
            )

        response = HttpResponse(bytes(delivery.pdf_package), content_type="application/pdf")
        filename = delivery.pdf_filename or f"lab-result-{delivery.lab_order.order_number}.pdf"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class ExternalPatientIdentifierCrosswalkViewSet(
    TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet
):
    """Read-only API for external patient identifier crosswalk entries."""

    tenant_scope = "facility"
    queryset = ExternalPatientIdentifierCrosswalk.objects.select_related(
        "walkin_patient", "patient"
    )
    serializer_class = ExternalPatientIdentifierCrosswalkSerializer
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]


class LISMessageMappingViewSet(TenantScopedViewMixin, viewsets.GenericViewSet):
    """Manage and validate standalone LIS inbound message mapping configuration."""

    tenant_scope = "facility"
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]

    def _test_queryset(self):
        tenant = self.get_tenant_save_kwargs()
        facility = tenant.get("facility")
        organization = tenant.get("organization")
        return TestCatalog.objects.filter(
            Q(facility=facility) | Q(facility__isnull=True),
            Q(organization=organization) | Q(organization__isnull=True),
        )

    def _mapping_queryset(self):
        test_ids = list(self._test_queryset().values_list("id", flat=True))
        if not test_ids:
            return ExternalCodeMapping.objects.none()
        test_ct = ContentType.objects.get_for_model(TestCatalog)
        return ExternalCodeMapping.objects.filter(content_type=test_ct, object_id__in=test_ids)

    def list(self, request, *args, **kwargs):
        code_system = str(request.query_params.get("code_system", "")).strip()
        qs = self._mapping_queryset()
        if code_system:
            qs = qs.filter(code_system=code_system)
        serializer = LISMessageMappingSerializer(
            qs.order_by("code_system", "external_code"), many=True
        )
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = LISMessageMappingUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        test = self._test_queryset().filter(code=str(data["test_code"]).strip().upper()).first()
        if test is None:
            return Response(
                {"detail": "test_code not found in this facility test catalog."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        test_ct = ContentType.objects.get_for_model(TestCatalog)
        mapping, _ = ExternalCodeMapping.objects.update_or_create(
            code_system=data["code_system"].strip(),
            external_code=data["external_code"].strip(),
            defaults={
                "external_display": data.get("external_display", ""),
                "content_type": test_ct,
                "object_id": test.id,
                "relationship": data["relationship"],
                "is_active": data["is_active"],
                "notes": data.get("notes", ""),
            },
        )
        return Response(LISMessageMappingSerializer(mapping).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None, *args, **kwargs):
        if not request.user.has_perm("core.delete_externalcodemapping"):
            return Response(
                {"detail": "You do not have permission to delete this resource."},
                status=status.HTTP_403_FORBIDDEN,
            )

        mapping = self._mapping_queryset().filter(pk=pk).first()
        if mapping is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        mapping.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="validate")
    def validate_mappings(self, request):
        serializer = LISMessageMappingValidationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from .services import extract_test_codes_for_validation, validate_message_mappings

        payload = serializer.validated_data
        test_codes = extract_test_codes_for_validation(
            message_format=payload["message_format"],
            hl7_message=payload.get("hl7_message", ""),
            payload=payload.get("payload"),
        )
        result = validate_message_mappings(
            source_system=payload["source_system"],
            test_codes=test_codes,
            facility=getattr(request, "_facility", None),
        )
        return Response(result)


class ExternalOrderRequestViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    View and process external order requests (from HL7 ORM^O01 messages).

    External systems send orders via the HL7 ingest endpoint. These appear
    here for lab staff to accept/reject.
    """

    tenant_scope = "facility"
    queryset = ExternalOrderRequest.objects.all().select_related("walkin_patient", "lab_order")
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        RequiresActiveShiftPermission,
        LISStandaloneRequired,
        ReadRequiresModelPermission,
    ]
    http_method_names = ["get", "post", "head", "options"]  # Read + accept/reject actions

    def get_serializer_class(self):
        return ExternalOrderRequestSerializer

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """Accept an external order and create a lab order from it."""
        ext_order = self.get_object()

        if ext_order.status != ExternalOrderRequest.Status.RECEIVED:
            return Response(
                {"error": f"Cannot accept order in {ext_order.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ExternalOrderAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from .services import create_or_update_crosswalk, process_external_order

        try:
            lab_order = process_external_order(
                ext_order,
                user=request.user,
                auto_create_walkin=serializer.validated_data.get("auto_create_walkin", True),
                enable_billing=serializer.validated_data.get("enable_billing", True),
                payer_type=serializer.validated_data.get("payer_type", Invoice.PayerType.CASH),
                diagnostic_package=serializer.validated_data.get("diagnostic_package", ""),
                facility=getattr(request, "_facility", None) or ext_order.facility,
                organization=getattr(request, "_organization", None) or ext_order.organization,
            )
            ext_order.accept(request.user)
            ext_order.lab_order = lab_order
            ext_order.save(update_fields=["lab_order", "updated_at"])

            create_or_update_crosswalk(
                source_system=ext_order.sending_application or "EXTERNAL",
                external_patient_id=ext_order.external_patient_id,
                patient_name=ext_order.patient_name,
                facility=getattr(request, "_facility", None) or ext_order.facility,
                organization=getattr(request, "_organization", None) or ext_order.organization,
                walkin_patient=ext_order.walkin_patient,
            )

            return Response(
                {
                    "status": "accepted",
                    "lab_order": LabOrderSerializer(lab_order).data,
                },
                status=status.HTTP_201_CREATED,
            )
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
            logger.exception("Error processing external order %s", ext_order.id)
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject an external order request."""
        ext_order = self.get_object()

        if ext_order.status != ExternalOrderRequest.Status.RECEIVED:
            return Response(
                {"error": f"Cannot reject order in {ext_order.status} status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ExternalOrderRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ext_order.reject(request.user, serializer.validated_data["reason"])

        return Response(ExternalOrderRequestSerializer(ext_order).data)

    @action(detail=True, methods=["post"], url_path="deliver-result")
    def deliver_result(self, request, pk=None):
        """Deliver released results to configured outbound channels."""
        ext_order = self.get_object()
        if not ext_order.lab_order_id:
            return Response(
                {"detail": "External order has no linked lab order yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lab_order = ext_order.lab_order
        if lab_order.status != "COMPLETED":
            return Response(
                {"detail": "Lab order is not completed/released for outbound delivery."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ResultDeliveryRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        channel = serializer.validated_data["channel"]
        destination = serializer.validated_data.get("destination", "")

        delivery = ResultDeliveryLog.objects.create(
            channel=channel,
            destination=destination,
            external_order=ext_order,
            lab_order=lab_order,
            requested_by=request.user,
            status=ResultDeliveryLog.Status.PENDING,
            **self.get_tenant_save_kwargs(),
        )

        from .services import deliver_result

        delivery = deliver_result(delivery, destination=destination)

        AuditLog.log(
            action="laboratory_result_delivery",
            user=request.user,
            resource_type="ResultDeliveryLog",
            resource_id=delivery.id,
            facility=delivery.facility,
            organization=delivery.organization,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "trace_id": str(delivery.trace_id),
                "channel": delivery.channel,
                "status": delivery.status,
                "destination": destination,
                "external_order_id": ext_order.id,
                "lab_order_id": lab_order.id,
            },
            request=request,
        )

        return Response(ResultDeliveryLogSerializer(delivery).data, status=status.HTTP_201_CREATED)
