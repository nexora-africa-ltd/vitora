# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Ai views ecg for Vitora HMIS.

What this file is for:
- Implement views ecg logic for the ai domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

from django.http import HttpResponse
from rest_framework import permissions, serializers, status
from rest_framework.parsers import MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import ReadRequiresModelPermission

from .client import TibaBotError, TibaBotUnavailableError, get_tibabot_client
from .feature_flags import AIFeatureGatedMixin

logger = logging.getLogger(__name__)


def _get_client_ip(request: Request) -> str:
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


# =============================================================================
# Request Serializers
# =============================================================================


class ECGInterpretRequestSerializer(serializers.Serializer):
    """Validates input for ECG interpretation."""

    heart_rate = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=400
    )
    rhythm = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    axis = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    pr_interval = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=1000
    )
    qrs_duration = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=500
    )
    qtc_interval = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=1000
    )
    p_wave = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    st_segment = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    t_wave = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    q_waves = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    bundle_branch = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    raw_findings = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    clinical_context = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    medications = serializers.ListField(
        child=serializers.CharField(), required=False, allow_empty=True
    )
    age = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=150)
    sex = serializers.ChoiceField(choices=["male", "female"], required=False, allow_null=True)
    include_fhir = serializers.BooleanField(required=False, default=False)
    verbosity = serializers.ChoiceField(
        choices=["concise", "standard", "detailed"], required=False, default="standard"
    )
    provider_role = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    facility_level = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ECGCompareRequestSerializer(serializers.Serializer):
    """Validates input for ECG serial comparison."""

    baseline = serializers.DictField(required=True)
    current = serializers.DictField(required=True)
    interval_hours = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    clinical_context = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ECGReportRequestSerializer(serializers.Serializer):
    """Validates input for ECG PDF report generation."""

    interpretation = serializers.DictField(required=True)
    patient_context = serializers.DictField(required=False, allow_null=True)
    facility_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    provider_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class CHA2DS2VAScRequestSerializer(serializers.Serializer):
    """Validates input for CHA₂DS₂-VASc score calculation."""

    age = serializers.IntegerField(required=True, min_value=0, max_value=150)
    sex = serializers.ChoiceField(choices=["male", "female"], required=True)
    congestive_heart_failure = serializers.BooleanField(required=False, default=False)
    hypertension = serializers.BooleanField(required=False, default=False)
    stroke_tia_thromboembolism = serializers.BooleanField(required=False, default=False)
    vascular_disease = serializers.BooleanField(required=False, default=False)
    diabetes = serializers.BooleanField(required=False, default=False)


class HASBLEDRequestSerializer(serializers.Serializer):
    """Validates input for HAS-BLED score calculation."""

    hypertension_uncontrolled = serializers.BooleanField(required=False, default=False)
    renal_disease = serializers.BooleanField(required=False, default=False)
    liver_disease = serializers.BooleanField(required=False, default=False)
    stroke_history = serializers.BooleanField(required=False, default=False)
    bleeding_history = serializers.BooleanField(required=False, default=False)
    labile_inr = serializers.BooleanField(required=False, default=False)
    age_over_65 = serializers.BooleanField(required=False, default=False)
    drugs_predisposing = serializers.BooleanField(required=False, default=False)
    alcohol_excess = serializers.BooleanField(required=False, default=False)


# =============================================================================
# Views
# =============================================================================


class ECGInterpretView(AIFeatureGatedMixin, APIView):
    """
    Interpret ECG findings (structured parameters or free-text).

    POST /api/ai/ecg/interpret/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = ECGInterpretRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_ecg_interpret",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "heart_rate": data.get("heart_rate"),
                "rhythm": data.get("rhythm"),
                "has_raw_findings": bool(data.get("raw_findings")),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.ecg_interpret(data)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot AI service is currently unavailable.", "mode": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError:
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


class ECGCompareView(AIFeatureGatedMixin, APIView):
    """
    Compare two ECGs for serial change detection.

    POST /api/ai/ecg/compare/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = ECGCompareRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_ecg_compare",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={"interval_hours": data.get("interval_hours")},
        )

        try:
            client = get_tibabot_client()
            result = client.ecg_compare(data)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot AI service is currently unavailable.", "mode": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError:
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


class ECGUploadView(AIFeatureGatedMixin, APIView):
    """
    Upload ECG image/file for auto-interpretation.

    POST /api/ai/ecg/upload/
    Content-Type: multipart/form-data

    Supported: JPEG, PNG, TIFF, BMP, DICOM, GE MUSE XML, HL7 aECG, SCP-ECG.
    Max file size: 10 MB.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    parser_classes = [MultiPartParser]

    ALLOWED_EXTENSIONS = {
        ".jpg",
        ".jpeg",
        ".png",
        ".tiff",
        ".tif",
        ".bmp",
        ".dcm",
        ".xml",
        ".scp",
    }
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

    def post(self, request: Request) -> Response:
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"error": "No file provided. Include a 'file' field."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate file size
        if file.size and file.size > self.MAX_FILE_SIZE:
            return Response(
                {"error": "File exceeds 10 MB limit."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        # Validate extension
        import os

        _, ext = os.path.splitext(file.name or "")
        if ext.lower() not in self.ALLOWED_EXTENSIONS:
            return Response(
                {
                    "error": f"Unsupported file format '{ext}'. "
                    f"Supported: {', '.join(sorted(self.ALLOWED_EXTENSIONS))}"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        AuditLog.log(
            action="ai_ecg_upload",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={"filename": file.name, "size": file.size, "content_type": file.content_type},
        )

        try:
            client = get_tibabot_client()
            file_data = file.read()
            result = client.ecg_upload(
                file_data, file.name or "ecg_file", file.content_type or "application/octet-stream"
            )
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot AI service is currently unavailable.", "mode": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError:
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


class ECGReportView(AIFeatureGatedMixin, APIView):
    """
    Generate downloadable PDF report from ECG interpretation.

    POST /api/ai/ecg/report/
    Returns: application/pdf
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> HttpResponse:
        serializer = ECGReportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_ecg_report",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={"has_patient_context": bool(data.get("patient_context"))},
        )

        try:
            client = get_tibabot_client()
            pdf_bytes = client.ecg_report(data)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot AI service is currently unavailable.", "mode": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError:
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = 'attachment; filename="ecg_report.pdf"'
        return response


class ECGScoreCHA2DS2VAScView(AIFeatureGatedMixin, APIView):
    """
    Calculate CHA₂DS₂-VASc stroke risk score.

    POST /api/ai/ecg/scores/cha2ds2-vasc/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = CHA2DS2VAScRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_ecg_cha2ds2_vasc",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={"age": data["age"], "sex": data["sex"]},
        )

        try:
            client = get_tibabot_client()
            result = client.ecg_score_cha2ds2_vasc(data)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot AI service is currently unavailable.", "mode": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError:
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


class ECGScoreHASBLEDView(AIFeatureGatedMixin, APIView):
    """
    Calculate HAS-BLED bleeding risk score.

    POST /api/ai/ecg/scores/has-bled/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = HASBLEDRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_ecg_has_bled",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={},
        )

        try:
            client = get_tibabot_client()
            result = client.ecg_score_has_bled(data)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot AI service is currently unavailable.", "mode": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError:
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


class ECGPatternsView(AIFeatureGatedMixin, APIView):
    """
    List all supported ECG patterns/diagnoses.

    GET /api/ai/ecg/patterns/
    No authentication required (public reference endpoint).
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request: Request) -> Response:  # noqa: ARG002
        try:
            client = get_tibabot_client()
            result = client.ecg_patterns()
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot AI service is currently unavailable.", "mode": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError:
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)
