"""
What this file is for: consent and visit endpoints extracted from sha_views for modular SHA billing APIs.
How to use: imported by hmis.apps.billing.sha_views and wired through existing SHA URL routes.
Supported inputs/args: DRF APIView requests for OTP consent, visit start, biometric flow, and consent queries.
"""

import contextlib
import logging
import os
from datetime import date

from django.db.models import Q
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.facility_identifiers import resolve_fr_code
from hmis.apps.billing.models import SHAMember
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission

logger = logging.getLogger(__name__)


class ConsentSendOTPView(APIView):
    """
    Send OTP to patient for DHA visit consent via ILM middleware.

    POST /api/sha/consent/send-otp/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    throttle_scope = "otp"

    DEFAULT_INTERVENTION = "SHA-01-001"
    INPATIENT_CODE_PREFIXES = (
        "SHA-03-",
        "SHA-07-",
        "SHA-13-",
        "SHA-19-",
        "SHA-20-",
    )

    def _get_facility(self, request):
        """Resolve and return the request facility, or raise 403."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            return None
        return facility

    @staticmethod
    def _sha_number_to_cr_id(sha_number: str) -> str:
        """Convert internal SHA format to DHA Client Registry format."""
        if sha_number.startswith("SHA-"):
            return f"CR{sha_number[4:]}"
        if sha_number.startswith("CR"):
            return sha_number
        return sha_number

    @classmethod
    def _derive_access_point(cls, intervention_codes: list[str]) -> str:
        normalized_codes = [str(code or "").strip().upper() for code in intervention_codes]
        if any(code.startswith(cls.INPATIENT_CODE_PREFIXES) for code in normalized_codes):
            return "IP"
        return "OP"

    @extend_schema(
        request=inline_serializer(
            name="ConsentSendOTPRequest",
            fields={
                "sha_member_id": serializers.IntegerField(),
                "intervention_codes": serializers.ListField(
                    child=serializers.CharField(), required=False
                ),
            },
        ),
        responses={
            201: inline_serializer(
                name="ConsentSendOTPResponse",
                fields={
                    "consent_id": serializers.IntegerField(),
                    "otp_reference": serializers.CharField(),
                    "status": serializers.CharField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Send OTP to patient for consent verification via ILM middleware."""
        from hmis.apps.billing.models import ConsentToken
        from hmis.apps.billing.services.ilm_lifecycle_service import (
            IlmLifecycleService,
            VisitOtpParams,
        )
        from hmis.apps.billing.sha_serializers import SendOTPSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        sha_member_id = serializer.validated_data["sha_member_id"]
        raw_codes = serializer.validated_data.get("intervention_codes") or []
        intervention_codes = [str(code).strip().upper() for code in raw_codes if str(code).strip()]
        if not intervention_codes:
            intervention_codes = [self.DEFAULT_INTERVENTION]

        try:
            sha_member = SHAMember.objects.select_related("patient").get(
                id=sha_member_id, patient__organization=facility.organization
            )
        except SHAMember.DoesNotExist:
            return Response(
                {"error": "SHA member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if sha_member.patient.is_deceased:
            return Response(
                {
                    "error": "Cannot initiate consent for a deceased patient.",
                    "code": "patient_deceased",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if getattr(facility, "biometrics_enforced", False):
            return Response(
                {
                    "error": "This facility requires biometric consent. OTP is not available.",
                    "code": "biometrics_enforced",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        derived_access_point = self._derive_access_point(intervention_codes)
        now = timezone.now()
        existing_active = (
            ConsentToken.objects.filter(
                patient=sha_member.patient,
                facility=facility,
                access_point=derived_access_point,
                status=ConsentToken.ConsentStatus.VALIDATED,
                created_at__date=date.today(),
            )
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .exists()
        )
        if existing_active:
            existing = (
                ConsentToken.objects.filter(
                    patient=sha_member.patient,
                    facility=facility,
                    access_point=derived_access_point,
                    status=ConsentToken.ConsentStatus.VALIDATED,
                    created_at__date=date.today(),
                )
                .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
                .order_by("-created_at")
                .first()
            )
            if existing:
                response_data = {
                    "consent_id": existing.id,
                    "otp_reference": existing.otp_reference or "",
                    "status": existing.status,
                    "message": "Existing active consent for today reused",
                }
                return Response(response_data, status=status.HTTP_200_OK)

        patient_cr_id = self._sha_number_to_cr_id(sha_member.sha_number)
        if not patient_cr_id:
            return Response(
                {"error": "Cannot determine Client Registry ID for this member"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        facility_fr_code = resolve_fr_code(facility).value
        if not facility_fr_code:
            return Response(
                {
                    "error": (
                        "Facility does not have a DHA Facility Registry (FR) code configured. "
                        "Set it via Admin > Facilities or the SHA_FACILITY_FR_CODE environment variable."
                    ),
                    "code": "missing_fr_code",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        beneficiary_contact_id = serializer.validated_data.get("beneficiary_contact_id") or ""
        params = VisitOtpParams(
            intervention_codes=intervention_codes,
            patient_id=patient_cr_id,
            beneficiary_contact_id=beneficiary_contact_id,
        )

        try:
            service = IlmLifecycleService(facility=facility)
            result = service.send_visit_otp(
                params=params,
                patient=sha_member.patient,
                sha_member=sha_member,
                facility=facility,
                user=request.user,
            )

            payload = result.payload if isinstance(result.payload, dict) else {}
            otp_reference = payload.get("otp_reference") or payload.get("otpReference") or ""

            sandbox_otp = ""
            if os.getenv("DJANGO_ENV", "development") != "production":
                import re

                msg = payload.get("message", "")
                match = re.search(r"\b(\d{4,6})\b", msg)
                if match:
                    sandbox_otp = match.group(1)

            consent = ConsentToken.objects.create(
                patient=sha_member.patient,
                sha_member=sha_member,
                facility=facility,
                organization=facility.organization,
                consent_method=ConsentToken.ConsentMethod.OTP,
                otp_reference=otp_reference,
                identification_type="CR Number",
                identification_number=patient_cr_id,
                intervention_codes=intervention_codes,
                access_point=derived_access_point,
                status=ConsentToken.ConsentStatus.PENDING,
                created_by=request.user,
            )

            response_data = {
                "consent_id": consent.id,
                "otp_reference": otp_reference,
                "status": "PENDING",
                "message": "OTP sent successfully",
            }
            if sandbox_otp:
                response_data["sandbox_otp"] = sandbox_otp

            return Response(response_data, status=status.HTTP_201_CREATED)
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
            logger.warning("Failed to send OTP: %s", str(e))
            return Response(
                {"error": str(e), "code": "ilm_error", "details": {}},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class ConsentValidateOTPView(APIView):
    """
    Validate OTP and obtain consent token from DHA.

    POST /api/sha/consent/validate-otp/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    throttle_scope = "otp"

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        request=inline_serializer(
            name="ConsentValidateOTPRequest",
            fields={
                "consent_id": serializers.IntegerField(),
                "otp_code": serializers.CharField(),
                "encrypted_pin": serializers.CharField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="ConsentValidateOTPResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "status": serializers.CharField(),
                    "consent_token": serializers.CharField(),
                    "expires_at": serializers.DateTimeField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Validate OTP and receive consent token."""
        from hmis.apps.billing.models import ConsentToken
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService
        from hmis.apps.billing.sha_serializers import ValidateOTPSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ValidateOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        consent_id = serializer.validated_data["consent_id"]
        otp_code = serializer.validated_data["otp_code"]
        encrypted_pin = serializer.validated_data.get("encrypted_pin", "")

        try:
            consent = ConsentToken.objects.get(id=consent_id, facility=facility)
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            service = SHAConsentService(facility=facility)
            consent = service.validate_otp(
                consent=consent,
                otp_code=otp_code,
                encrypted_pin=encrypted_pin,
            )

            return Response(
                {
                    "id": consent.id,
                    "status": consent.status,
                    "consent_token": consent.consent_token,
                    "expires_at": consent.expires_at,
                    "message": "Consent validated successfully",
                },
                status=status.HTTP_200_OK,
            )
        except SHAConsentError as e:
            logger.warning("Failed to validate OTP: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ConsentDetailView(APIView):
    """
    Get consent token status.

    GET /api/sha/consent/{id}/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        responses={
            200: inline_serializer(
                name="ConsentDetailResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "patient": serializers.IntegerField(),
                    "sha_member": serializers.IntegerField(),
                    "consent_method": serializers.CharField(),
                    "status": serializers.CharField(),
                    "consent_token": serializers.CharField(),
                    "is_valid": serializers.BooleanField(),
                    "created_at": serializers.DateTimeField(),
                    "validated_at": serializers.DateTimeField(),
                    "expires_at": serializers.DateTimeField(),
                },
            )
        },
    )
    def get(self, request, pk):
        """Retrieve consent token details."""
        from hmis.apps.billing.models import ConsentToken
        from hmis.apps.billing.sha_serializers import ConsentTokenSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            consent = ConsentToken.objects.select_related("patient", "sha_member").get(
                id=pk, facility=facility
            )
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ConsentTokenSerializer(consent)
        return Response(serializer.data)


class SHASchemaSerializer(serializers.Serializer):
    """Named fallback serializer used only for OpenAPI introspection."""

    payload = serializers.JSONField(required=False)


class SHASchemaMixin:
    """Schema fallback helpers for APIViews used by drf-spectacular."""

    serializer_class = SHASchemaSerializer

    def get_serializer_class(self):
        return self.serializer_class

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": self.request, "format": self.format_kwarg, "view": self}


class ConsentLatestView(SHASchemaMixin, APIView):
    """
    Get the latest consent token for an SHA member.

    GET /api/sha/consent/latest/?sha_member_id=123
    GET /api/sha/consent/latest/?sha_member_id=123&claim_pk=456
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def get(self, request):
        from hmis.apps.billing.models import ConsentToken, SHAClaim
        from hmis.apps.billing.services.consent_token_resolver import (
            ConsentTokenExpiredError,
            ConsentTokenNotFoundError,
            resolve_for_claim,
        )
        from hmis.apps.billing.sha_serializers import ConsentTokenSerializer
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context."},
                status=status.HTTP_403_FORBIDDEN,
            )

        sha_member_id = request.query_params.get("sha_member_id")
        encounter_id = request.query_params.get("encounter_id")
        claim_id = request.query_params.get("claim_pk")
        intervention_code = str(request.query_params.get("intervention_code") or "").strip()
        encounter_pk = None
        claim_pk = None
        if encounter_id not in (None, ""):
            try:
                encounter_pk = int(encounter_id)
            except (TypeError, ValueError):
                return Response(
                    {"error": "encounter_id must be an integer"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if claim_id not in (None, ""):
            try:
                claim_pk = int(claim_id)
            except (TypeError, ValueError):
                return Response(
                    {"error": "claim_pk must be an integer"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if sha_member_id in (None, "") and claim_pk is None:
            return Response(
                {"error": "sha_member_id query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if claim_pk is not None:
            claim_lookup: dict[str, object] = {
                "pk": claim_pk,
                "facility": facility,
            }
            if sha_member_id not in (None, ""):
                claim_lookup["sha_member_id"] = sha_member_id
            try:
                claim = SHAClaim.objects.get(**claim_lookup)
            except SHAClaim.DoesNotExist:
                return Response(
                    {"error": "Claim not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            try:
                resolved = resolve_for_claim(claim)
            except ConsentTokenExpiredError as exc:
                return Response(
                    {
                        "exists": False,
                        "code": "claim_consent_expired",
                        "message": str(exc) or "Claim-linked consent token expired",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
            except ConsentTokenNotFoundError:
                return Response(
                    {
                        "exists": False,
                        "code": "consent_token_not_found",
                        "message": "No validated consent token for this claim",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
            consent = ConsentToken.objects.get(pk=resolved.consent_id)
            serializer = ConsentTokenSerializer(consent)
            return Response({**serializer.data, "exists": True})

        now = timezone.now()

        scope_qs = ConsentToken.objects.filter(
            sha_member_id=sha_member_id,
            facility=facility,
        )

        if encounter_pk is not None:
            scope_qs = scope_qs.filter(encounter_id=encounter_pk)

        if intervention_code:
            scope_qs = scope_qs.filter(intervention_codes__contains=[intervention_code])

        valid_qs = (
            scope_qs.filter(status=ConsentToken.ConsentStatus.VALIDATED)
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .order_by("-validated_at", "-created_at")
        )
        pending_qs = scope_qs.filter(status=ConsentToken.ConsentStatus.PENDING).order_by(
            "-created_at"
        )

        consent = valid_qs.first() or pending_qs.first()

        if not consent:
            expired = (
                scope_qs.filter(status=ConsentToken.ConsentStatus.VALIDATED)
                .filter(expires_at__isnull=False, expires_at__lte=now)
                .order_by("-expires_at", "-validated_at", "-created_at")
                .first()
            )
            if expired:
                return Response(
                    {
                        "exists": False,
                        "code": "consent_token_expired",
                        "message": "Latest validated consent token has expired",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )
            return Response(
                {
                    "exists": False,
                    "code": "consent_token_not_found",
                    "message": "No validated consent token found",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ConsentTokenSerializer(consent)
        return Response({**serializer.data, "exists": True})


class ConsentAdmissionConflictView(SHASchemaMixin, APIView):
    """Check if patient has an active admission in any facility in org."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def get(self, request):
        from hmis.apps.core.mixins import resolve_request_tenant
        from hmis.apps.inpatient.models import Admission

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        organization = getattr(request, "organization", None)
        if organization is None and facility is not None:
            organization = getattr(facility, "organization", None)

        if organization is None:
            return Response({"error": "Organization context is required"}, status=403)

        patient_id = request.query_params.get("patient_id")
        if not patient_id:
            return Response({"error": "patient_id query parameter is required"}, status=400)

        try:
            patient_pk = int(patient_id)
        except (TypeError, ValueError):
            return Response({"error": "patient_id must be an integer"}, status=400)

        active = (
            Admission.objects.select_related("facility", "ward", "bed")
            .filter(
                organization=organization,
                patient_id=patient_pk,
                admission_status="ACTIVE",
            )
            .order_by("-admission_date")
            .first()
        )

        if not active:
            return Response({"has_active_admission": False}, status=200)

        return Response(
            {
                "has_active_admission": True,
                "admission": {
                    "id": active.id,
                    "admission_number": active.admission_number,
                    "admission_date": active.admission_date,
                    "facility_id": active.facility_id,
                    "facility_name": getattr(active.facility, "name", ""),
                    "ward_id": active.ward_id,
                    "ward_name": getattr(active.ward, "name", ""),
                    "bed_id": active.bed_id,
                    "bed_number": getattr(active.bed, "bed_number", ""),
                },
            },
            status=200,
        )


def _persist_consent_interventions(*, patient, facility, intervention_codes: list[str]) -> None:
    """Persist interventions from consent flow to the patient's draft claim."""
    if not intervention_codes or not patient:
        return

    from hmis.apps.billing.models import SHAClaim, SHAClaimIntervention

    claim = (
        SHAClaim.objects.filter(
            patient=patient,
            facility=facility,
            service_date=date.today(),
            status=SHAClaim.ClaimStatus.DRAFT,
        )
        .order_by("-created_at")
        .first()
    )
    if not claim:
        return

    for code in intervention_codes:
        intervention, _ = SHAClaimIntervention.objects.get_or_create(
            claim=claim,
            intervention_code=code,
            defaults={"status": "active"},
        )
        if intervention.status != SHAClaimIntervention.InterventionStatus.ACTIVE:
            intervention.status = SHAClaimIntervention.InterventionStatus.ACTIVE
            intervention.save(update_fields=["status", "updated_at"])

    if not claim.dha_visit_started_at:
        claim.dha_visit_started_at = timezone.now()
        claim.save(update_fields=["dha_visit_started_at"])


class StartVisitView(APIView):
    """
    Start a visit with DHA (combined OTP validation + visit start).

    POST /api/sha/consent/start-visit/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        request=inline_serializer(
            name="StartVisitRequest",
            fields={
                "consent_id": serializers.IntegerField(
                    help_text="ConsentToken ID (from send-otp step)"
                ),
                "otp_code": serializers.CharField(help_text="OTP code entered by patient"),
                "intervention_codes": serializers.ListField(
                    child=serializers.CharField(),
                    required=False,
                    help_text="SHA intervention codes for this visit",
                ),
                "service_type": serializers.CharField(
                    required=False,
                    help_text="outpatient, inpatient, or emergency",
                ),
                "admission_date": serializers.CharField(
                    required=False, help_text="ISO date (defaults to today)"
                ),
                "estimated_days_of_admission": serializers.IntegerField(
                    required=False, help_text="Expected length of stay in days"
                ),
                "encounter_id": serializers.IntegerField(
                    required=False,
                    help_text="Encounter ID to link consent token to (from check-in)",
                ),
            },
        ),
        responses={
            200: inline_serializer(
                name="StartVisitResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "status": serializers.CharField(),
                    "consent_token": serializers.CharField(),
                    "expires_at": serializers.DateTimeField(allow_null=True),
                    "visit_data": serializers.DictField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Start a visit by validating OTP or biometric auth_guid + creating visit session with DHA."""
        from hmis.apps.billing.models import ConsentToken, SHAClaim
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        consent_id = request.data.get("consent_id")
        otp_code = request.data.get("otp_code", "")
        auth_guid = request.data.get("auth_guid", "")
        intervention_codes = request.data.get("intervention_codes") or []
        service_type = request.data.get("service_type", "outpatient") or "outpatient"
        admission_date = request.data.get("admission_date", "")
        estimated_days = request.data.get("estimated_days_of_admission", 0)
        encounter_id = request.data.get("encounter_id")

        if not consent_id:
            return Response(
                {"error": "consent_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not otp_code and not auth_guid:
            return Response(
                {"error": "Either otp_code or auth_guid is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if otp_code and auth_guid:
            return Response(
                {"error": "Provide either otp_code or auth_guid, not both"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            consent = ConsentToken.objects.get(id=consent_id, facility=facility)
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not intervention_codes and consent.intervention_codes:
            intervention_codes = consent.intervention_codes

        if consent.patient and consent.patient.is_deceased:
            return Response(
                {"error": "Cannot start visit for a deceased patient.", "code": "patient_deceased"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_capitation_today = (
            SHAClaim.objects.filter(
                patient=consent.patient,
                facility=facility,
                service_date=date.today(),
                claim_flow=SHAClaim.ClaimFlow.PHC,
            )
            .exclude(
                status__in=["cancelled", "written_off"],
            )
            .exists()
        )
        if existing_capitation_today:
            return Response(
                {
                    "error": "This patient already has a capitation claim today at this facility. Only one per day is allowed.",
                    "code": "duplicate_capitation_claim",
                },
                status=status.HTTP_409_CONFLICT,
            )

        if service_type.upper() == "INPATIENT":
            from hmis.apps.inpatient.models import Ward

            wards_with_beds = Ward.objects.filter(facility=facility, is_active=True)
            total_available = sum(w.available_beds for w in wards_with_beds)
            if total_available == 0:
                return Response(
                    {
                        "error": "No beds available at this facility for inpatient admission.",
                        "code": "no_beds_available",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        if service_type.upper() == "INPATIENT" and consent.patient:
            from hmis.apps.inpatient.models import Admission

            active_admission = Admission.objects.filter(
                patient=consent.patient,
                admission_status="ACTIVE",
            ).exists()
            if active_admission:
                return Response(
                    {
                        "error": "Patient already has an active inpatient admission. Discharge or transfer first.",
                        "code": "active_admission_exists",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        encounter = None
        if encounter_id:
            from hmis.apps.encounters.models import Encounter

            with contextlib.suppress(Encounter.DoesNotExist):
                encounter = Encounter.objects.get(id=encounter_id, facility=facility)

        try:
            service = SHAConsentService(facility=facility)
            visit_data = service.start_visit(
                consent=consent,
                otp_code=otp_code,
                auth_guid=auth_guid,
                intervention_codes=intervention_codes,
                service_type=service_type,
                admission_date=admission_date,
                estimated_days_of_admission=int(estimated_days),
                encounter=encounter,
            )

            consent.refresh_from_db()

            if intervention_codes:
                _persist_consent_interventions(
                    patient=consent.patient,
                    facility=facility,
                    intervention_codes=intervention_codes,
                )

            return Response(
                {
                    "id": consent.id,
                    "status": consent.status,
                    "consent_token": consent.consent_token,
                    "expires_at": consent.expires_at,
                    "visit_data": visit_data,
                    "message": "Visit started successfully",
                },
                status=status.HTTP_200_OK,
            )
        except SHAConsentError as e:
            logger.warning("Failed to start visit: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_400_BAD_REQUEST,
            )


class BiometricAuthorizeView(APIView):
    """
    Initiate biometric fingerprint authorization via DHA HIE.

    POST /api/sha/consent/authorize/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        request=inline_serializer(
            name="BiometricAuthorizeRequest",
            fields={
                "sha_member_id": serializers.IntegerField(help_text="SHA Member ID to authorize"),
                "workstation_id": serializers.CharField(
                    help_text="Hardware Server workstation identifier"
                ),
                "agent_national_id": serializers.CharField(
                    help_text="National ID of the biometrics agent (staff)"
                ),
            },
        ),
        responses={
            200: inline_serializer(
                name="BiometricAuthorizeResponse",
                fields={
                    "consent_id": serializers.IntegerField(),
                    "auth_guid": serializers.CharField(),
                    "iframe_url": serializers.CharField(),
                    "status": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Initiate biometric authorization for patient consent."""
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        sha_member_id = request.data.get("sha_member_id")
        workstation_id = request.data.get("workstation_id", "")
        agent_national_id = request.data.get("agent_national_id", "")

        if not agent_national_id:
            agent_national_id = getattr(facility, "biometrics_agent_national_id", "") or ""
            if not agent_national_id and facility.biometrics_agent_national_id_encrypted:
                logger.error(
                    "PII decryption failure for Facility %s (pk=%s) - "
                    "biometrics_agent_national_id_encrypted has data but property returned empty. "
                    "Check ENCRYPTION_KEY consistency.",
                    facility.name,
                    facility.pk,
                    extra={
                        "facility_id": facility.pk,
                        "facility_name": facility.name,
                        "pii_field": "biometrics_agent_national_id",
                    },
                )
                return Response(
                    {
                        "error": (
                            "Facility biometrics configuration error: stored data cannot be "
                            "decrypted. Contact system administrator to verify the encryption key."
                        ),
                        "code": "pii_decryption_failed",
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        if not agent_national_id and os.getenv("DJANGO_ENV", "development") != "production":
            agent_national_id = "12345678"

        if not sha_member_id:
            return Response(
                {"error": "sha_member_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not workstation_id:
            return Response(
                {"error": "workstation_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not agent_national_id:
            return Response(
                {"error": "agent_national_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            sha_member = SHAMember.objects.get(id=sha_member_id)
        except SHAMember.DoesNotExist:
            return Response(
                {"error": "SHA member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            service = SHAConsentService(facility=facility)
            result = service.authorize_biometric(
                sha_member=sha_member,
                workstation_id=workstation_id,
                agent_national_id=agent_national_id,
                user=request.user,
                facility=facility,
            )
            return Response(result, status=status.HTTP_200_OK)
        except SHAConsentError as e:
            logger.warning("Biometric authorization failed: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_400_BAD_REQUEST,
            )


class BiometricAuthorizeStatusView(APIView):
    """
    Poll biometric authorization status.

    GET /api/sha/consent/authorize/{auth_guid}/status/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="BiometricAuthorizeStatusResponse",
                fields={
                    "auth_guid": serializers.CharField(),
                    "status": serializers.CharField(),
                    "consent_token": serializers.CharField(),
                },
            )
        },
    )
    def get(self, request, auth_guid):
        """Check biometric authorization status."""
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)

        try:
            service = SHAConsentService(facility=facility)
            result = service.get_authorization_status(auth_guid)
            return Response(result, status=status.HTTP_200_OK)
        except SHAConsentError as e:
            logger.warning("Biometric status check failed: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST,
            )


class BiometricCancelView(SHASchemaMixin, APIView):
    """
    Cancel a pending biometric authorization.

    POST /api/sha/consent/authorize/{auth_guid}/cancel/
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="BiometricCancelResponse",
                fields={
                    "auth_guid": serializers.CharField(),
                    "status": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request, auth_guid):
        """Cancel a pending biometric authorization."""
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)

        try:
            service = SHAConsentService(facility=facility)
            result = service.cancel_authorization(auth_guid)
            return Response(result, status=status.HTTP_200_OK)
        except SHAConsentError as e:
            logger.warning("Biometric cancel failed: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST,
            )


class BeneficiaryContactsView(APIView):
    """
    Retrieve masked beneficiary contacts from DHA HIE.

    GET /api/sha/consent/contacts/?beneficiary_cr_id=...
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="beneficiary_cr_id",
                location=OpenApiParameter.QUERY,
                required=True,
                type=OpenApiTypes.STR,
                description="Patient's Client Registry ID",
            )
        ],
        responses={
            200: inline_serializer(
                name="BeneficiaryContactsResponse",
                fields={
                    "contacts": serializers.ListField(
                        child=serializers.DictField(),
                        help_text="List of contacts with masked values and IDs",
                    ),
                },
            )
        },
    )
    def get(self, request):
        """Retrieve beneficiary contacts for OTP target selection."""
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)

        beneficiary_cr_id = request.query_params.get("beneficiary_cr_id", "")
        if not beneficiary_cr_id:
            return Response(
                {"error": "beneficiary_cr_id query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = SHAConsentService(facility=facility)
            contacts = service.get_beneficiary_contacts(beneficiary_cr_id)
            return Response({"contacts": contacts}, status=status.HTTP_200_OK)
        except SHAConsentError as e:
            logger.warning("Failed to fetch beneficiary contacts: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code},
                status=status.HTTP_400_BAD_REQUEST,
            )
