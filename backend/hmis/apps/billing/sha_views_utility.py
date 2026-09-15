"""
What this file is for: utility SHA API views (terminology, registries, facility/practitioner search, webhook, validate, health).
How to use: imported and re-exported by hmis.apps.billing.sha_views to preserve existing URL imports.
Supported inputs/args: DRF APIView requests for utility SHA endpoints and webhook payload callbacks.
"""

import hashlib
import hmac
import logging
from datetime import date

from django.conf import settings
from django.conf import settings as django_settings
from django.db import DatabaseError, models
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.models import FacilityBillingConfig, SHAClaim
from hmis.apps.billing.services.client_registry import (
    ClientNotFoundError,
    ClientRegistryError,
    ClientRegistryService,
)
from hmis.apps.billing.services.dha_search import DHASearchService, SearchError
from hmis.apps.billing.services.terminology import TerminologyError, TerminologyService
from hmis.apps.core.api_errors import safe_error_response
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission

logger = logging.getLogger(__name__)


def _sha_utility_handled_exceptions() -> tuple[type[Exception], ...]:
    return (
        DatabaseError,
        AttributeError,
        LookupError,
        TypeError,
        ValueError,
        RuntimeError,
        ImportError,
        OSError,
        ConnectionError,
    )


def _legacy_sha_views_module():
    """Get legacy sha_views module for backward-compatible test patch points."""
    from hmis.apps.billing import sha_views

    return sha_views


def _stringify_error(exc: Exception) -> str:
    """Convert exception details to a safe string for API responses."""
    detail = getattr(exc, "detail", None)
    if detail is not None:
        try:
            text = str(detail).strip()
            if text:
                return text[:300]
        except (TypeError, ValueError, RuntimeError):
            pass
    return "Request could not be processed."


def _sanitize_log_value(value: object, *, max_len: int = 80) -> str:
    """Normalize dynamic values before writing to logs."""
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    return text[:max_len]


class TerminologySearchView(APIView):
    """
    API view for searching medical terminologies.

    Supports ICD-11, LOINC, ICHI, Interventions, and Drug Products.

    For ICD-11, uses local WHO ICD-11 API container by default (ICD11_USE_LOCAL=true).
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "search", OpenApiTypes.STR, description="Search query (min 2 characters)"
            ),
            OpenApiParameter("limit", OpenApiTypes.INT, description="Max results (default 50)"),
        ],
        responses={
            200: inline_serializer(
                name="TerminologySearchResponse",
                fields={
                    "results": serializers.ListField(child=serializers.DictField()),
                    "count": serializers.IntegerField(),
                    "source": serializers.CharField(),
                },
            )
        },
    )
    def get(self, request, terminology_type):
        """Search terminology codes."""
        search = request.query_params.get("search", "")
        code = str(request.query_params.get("code", "") or "").strip()
        limit = int(request.query_params.get("limit", 50))

        if len(search) < 2 and not (
            terminology_type == "interventions"
            and (
                code
                or request.query_params.get("facility_level")
                or request.query_params.get("payment_mechanism")
            )
        ):
            return Response(
                {"results": [], "message": "Search query must be at least 2 characters"}
            )

        try:
            if terminology_type == "icd11":
                return self._search_icd11_with_fallback(search, limit)

            service = _legacy_sha_views_module().TerminologyService()

            if terminology_type == "icd11":
                results = service.search_icd11(search, limit=limit)
            elif terminology_type == "loinc":
                results = service.search_loinc(search, limit=limit)
            elif terminology_type == "ichi":
                results = service.search_ichi(search, limit=limit)
            elif terminology_type == "interventions":
                facility_level = request.query_params.get("facility_level")
                offset = int(request.query_params.get("offset", 0))
                payment_mechanism = request.query_params.get("payment_mechanism")
                if code:
                    intervention = _legacy_sha_views_module().get_local_intervention(
                        code,
                        facility_level=int(facility_level) if facility_level else None,
                    )
                    if intervention is None:
                        return Response({"results": [], "count": 0})
                    return Response({"results": [intervention], "count": 1})

                excluded_payment_mechanisms: list[str] = []
                if not payment_mechanism:
                    request_facility = getattr(request, "facility", None)
                    if request_facility is None:
                        profile = getattr(request.user, "staff_profile", None)
                        request_facility = getattr(profile, "primary_facility", None)
                    if request_facility:
                        hide_capitation = (
                            FacilityBillingConfig.objects.filter(facility=request_facility)
                            .values_list("hide_capitation_interventions", flat=True)
                            .first()
                        )
                        if hide_capitation:
                            excluded_payment_mechanisms.append("CAPITATION")
                access_point = request.query_params.get("access_point")
                patient_gender = request.query_params.get("patient_gender")
                active_only = request.query_params.get("active_only", "").lower() in (
                    "1",
                    "true",
                    "yes",
                )
                results_list, total_count = _legacy_sha_views_module().search_local_interventions(
                    query=search,
                    facility_level=int(facility_level) if facility_level else None,
                    limit=limit,
                    offset=offset,
                    payment_mechanism=payment_mechanism or None,
                    exclude_payment_mechanisms=excluded_payment_mechanisms,
                    active_only=active_only,
                    access_point=access_point or None,
                    patient_gender=patient_gender or None,
                )
                return Response({"results": results_list, "count": total_count})
            elif terminology_type == "drugs":
                results = service.search_drug_products(search, limit=limit)
            elif terminology_type == "active-components":
                results = service.search_active_components(search, limit=limit)
            else:
                return Response(
                    {"error": f"Unknown terminology type: {terminology_type}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            data = []
            for item in results:
                if hasattr(item, "__dict__"):
                    item_dict = {k: v for k, v in item.__dict__.items() if not k.startswith("_")}
                    data.append(item_dict)
                else:
                    data.append(item)

            return Response({"results": data, "count": len(data)})

        except TerminologyError as exc:
            return Response(
                {
                    "error": "Terminology service is currently unavailable.",
                    "status_code": exc.status_code,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except _sha_utility_handled_exceptions() as exc:
            logger.exception("ICD terminology search failed")
            return Response(
                {"error": _stringify_error(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _search_icd11_with_fallback(self, search: str, limit: int):
        """Search ICD-11 with fallback: DHA API, then local container, then local DB."""
        use_local_only = getattr(django_settings, "ICD11_USE_LOCAL", False)

        if use_local_only:
            logger.debug("ICD11_USE_LOCAL=True, using local container only")
            return self._search_icd11_local(search, limit)

        sha_base = getattr(django_settings, "SHA_API_BASE_URL", "")
        if not sha_base or sha_base == "https://example.com":
            logger.debug("SHA_API_BASE_URL not configured, using local fallback")
            return self._search_icd11_local(search, limit, "DHA API not configured")

        try:
            logger.debug("Attempting DHA Terminology API for ICD-11 search")
            service = _legacy_sha_views_module().TerminologyService(use_local_fallback=False)
            results = service.search_icd11(search, limit=limit)

            if results:
                data = []
                for item in results:
                    if hasattr(item, "__dict__"):
                        item_dict = {
                            k: v for k, v in item.__dict__.items() if not k.startswith("_")
                        }
                        data.append(item_dict)
                    else:
                        data.append(item)

                return Response(
                    {
                        "results": data,
                        "count": len(data),
                        "source": "dha_terminology_api",
                    }
                )

            logger.info("DHA API returned empty results, trying local container")
            raise TerminologyError("Empty results from DHA API", status_code=503)

        except TerminologyError as dha_error:
            logger.warning("DHA Terminology API failed, falling back to local: %s", dha_error)
            return self._search_icd11_local(search, limit, str(dha_error))
        except _sha_utility_handled_exceptions() as dha_error:
            logger.warning("DHA Terminology API failed, falling back to local: %s", dha_error)
            return self._search_icd11_local(search, limit, str(dha_error))

    def _search_icd11_local(self, search: str, limit: int, fallback_reason: str = ""):
        """Search ICD-11 using local WHO ICD-11 container first, then local DB."""
        try:
            service = _legacy_sha_views_module().ICD11LocalService()
            if not service.is_available():
                return self._search_icd11_database_fallback(
                    search,
                    limit,
                    fallback_reason or "Local ICD-11 API unavailable",
                )

            results = service.search(search, limit=limit)
            data = [code.to_dict() for code in results]
            if not data:
                logger.info("Local ICD-11 container returned empty results, trying database")
                return self._search_icd11_database_fallback(
                    search,
                    limit,
                    fallback_reason or "Local ICD-11 container returned no results",
                )

            return Response(
                {
                    "results": data,
                    "count": len(data),
                    "source": "local_who_icd11",
                    "fallback": bool(fallback_reason),
                    "fallback_reason": fallback_reason,
                }
            )

        except _sha_utility_handled_exceptions():
            logger.exception("ICD-11 local container search failed")
            return self._search_icd11_database_fallback(
                search,
                limit,
                fallback_reason or "ICD-11 local container search failed",
            )

    def _search_icd11_database_fallback(self, search: str, limit: int, original_error: str = ""):
        """Fallback to local ICD-11 DB when network/container sources fail."""
        from hmis.apps.billing.models import ICD11CodeReference

        try:
            codes = ICD11CodeReference.objects.filter(
                models.Q(code__icontains=search)
                | models.Q(title__icontains=search)
                | models.Q(description__icontains=search),
                is_active=True,
            ).order_by("code")[:limit]

            data = [
                {
                    "id": code.pk,
                    "code": code.code,
                    "title": code.title,
                    "chapter": code.chapter or code.chapter_no,
                    "chapter_no": code.chapter_no,
                    "is_leaf": code.is_leaf,
                    "is_active": code.is_active,
                    "class_kind": code.class_kind,
                    "entity_id": code.entity_id,
                }
                for code in codes
            ]

            return Response(
                {
                    "results": data,
                    "count": len(data),
                    "source": "local_icd11_database",
                    "fallback": True,
                    "fallback_reason": original_error or "ICD-11 services unavailable",
                }
            )
        except _sha_utility_handled_exceptions() as exc:
            logger.error("ICD-11 database fallback failed: %s", exc)
            return Response(
                {"error": "All ICD-11 services unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


@extend_schema_view()
class ClientRegistryView(APIView):
    """API view for Kenya Client Registry operations."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "national_id", OpenApiTypes.STR, description="Kenya National ID number"
            ),
            OpenApiParameter("client_number", OpenApiTypes.STR, description="CR client number"),
            OpenApiParameter("huduma_number", OpenApiTypes.STR, description="Huduma Namba"),
            OpenApiParameter("passport_number", OpenApiTypes.STR, description="Passport number"),
            OpenApiParameter(
                "identification_type", OpenApiTypes.STR, description="Generic ID type"
            ),
            OpenApiParameter("identification_number", OpenApiTypes.STR, description="ID value"),
        ],
        responses={
            200: inline_serializer(
                name="ClientRegistryResponse",
                fields={
                    "found": serializers.BooleanField(),
                    "client": serializers.DictField(),
                },
            )
        },
    )
    def get(self, request):
        """Fetch client from Client Registry."""
        national_id = request.query_params.get("national_id")
        client_number = request.query_params.get("client_number")
        huduma_number = request.query_params.get("huduma_number")
        passport_number = request.query_params.get("passport_number")
        identification_type = request.query_params.get("identification_type")
        identification_number = request.query_params.get("identification_number")

        if not any(
            [
                national_id,
                client_number,
                huduma_number,
                passport_number,
                (identification_type and identification_number),
            ]
        ):
            return Response(
                {
                    "error": "At least one identifier is required (national_id, client_number, huduma_number, passport_number, or identification_type+identification_number)"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = _legacy_sha_views_module().ClientRegistryService()
            client = service.fetch_client(
                national_id=national_id,
                client_number=client_number,
                huduma_number=huduma_number,
                passport_number=passport_number,
                identification_type=identification_type,
                identification_number=identification_number,
            )

            if client:
                raw = client.raw_data or {}
                return Response(
                    {
                        "found": True,
                        "client": {
                            "client_number": client.client_number,
                            "first_name": client.first_name,
                            "last_name": client.last_name,
                            "middle_name": client.middle_name,
                            "date_of_birth": (
                                str(client.date_of_birth) if client.date_of_birth else None
                            ),
                            "gender": client.gender,
                            "national_id": client.national_id,
                            "huduma_number": client.huduma_number,
                            "phone_number": client.phone_number,
                            "email": client.email,
                            "county": client.county_of_residence,
                            "sub_county": client.sub_county_of_residence,
                            "ward": client.ward_of_residence,
                            "place_of_birth": raw.get("place_of_birth"),
                            "citizenship": raw.get("citizenship"),
                            "civil_status": raw.get("civil_status"),
                            "employment_type": raw.get("employment_type"),
                            "address": raw.get("postal_address") or raw.get("address"),
                            "village_estate": raw.get("village_estate"),
                            "country": raw.get("country"),
                            "zip_code": raw.get("zip_code"),
                            "id_serial": raw.get("id_serial"),
                            "other_identifications": raw.get("other_identifications"),
                            "dependants": raw.get("dependants"),
                        },
                    }
                )
            return Response({"found": False})

        except ClientNotFoundError:
            return Response({"found": False})
        except ClientRegistryError:
            return Response(
                {"error": "Client Registry service is currently unavailable.", "found": False},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except _sha_utility_handled_exceptions() as exc:
            logger.exception("Client Registry lookup failed")
            return Response(
                {"error": _stringify_error(exc), "found": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @extend_schema(
        request=inline_serializer(
            name="ClientRegistryRegisterRequest",
            fields={
                "patient_id": serializers.IntegerField(required=False),
                "first_name": serializers.CharField(required=False),
                "last_name": serializers.CharField(required=False),
                "middle_name": serializers.CharField(required=False),
                "date_of_birth": serializers.DateField(required=False),
                "gender": serializers.CharField(required=False),
                "national_id": serializers.CharField(required=False),
                "huduma_number": serializers.CharField(required=False),
                "passport_number": serializers.CharField(required=False),
                "phone_number": serializers.CharField(required=False),
                "email": serializers.EmailField(required=False),
            },
        ),
        responses={
            201: inline_serializer(
                name="ClientRegistryRegisterResponse",
                fields={
                    "success": serializers.BooleanField(),
                    "client_number": serializers.CharField(required=False),
                    "message": serializers.CharField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """Register a new client in Client Registry."""
        from hmis.apps.patients.models import Patient

        data = request.data
        patient_id = data.get("patient_id")

        if patient_id:
            try:
                patient = Patient.objects.get(id=patient_id)
                first_name = patient.first_name
                last_name = patient.last_name
                date_of_birth = str(patient.date_of_birth)
                gender = patient.gender
                national_id = (
                    patient.identification_number
                    if patient.identification_type == "national_id"
                    else patient.national_id
                )
                middle_name = patient.middle_name
                phone_number = patient.phone_number
                email = patient.email
                huduma_number = None
                passport_number = None
                if patient.identification_type == "passport":
                    passport_number = patient.identification_number
            except Patient.DoesNotExist:
                return Response(
                    {"error": f"Patient with id {patient_id} not found", "success": False},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            required_fields = ["first_name", "last_name", "date_of_birth", "gender"]
            missing = [f for f in required_fields if not data.get(f)]
            if missing:
                return Response(
                    {"error": f"Missing required fields: {', '.join(missing)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            first_name = data["first_name"]
            last_name = data["last_name"]
            date_of_birth = data["date_of_birth"]
            gender = data["gender"]
            national_id = data.get("national_id")
            middle_name = data.get("middle_name")
            huduma_number = data.get("huduma_number")
            passport_number = data.get("passport_number")
            phone_number = data.get("phone_number")
            email = data.get("email")

        try:
            service = _legacy_sha_views_module().ClientRegistryService()
            client = service.register_client(
                first_name=first_name,
                last_name=last_name,
                date_of_birth=date_of_birth,
                gender=gender,
                national_id=national_id,
                middle_name=middle_name,
                huduma_number=huduma_number,
                passport_number=passport_number,
                phone_number=phone_number,
                email=email,
            )

            if patient_id and client.client_number:
                patient.cr_number = client.client_number
                patient.save(update_fields=["cr_number"])

            return Response(
                {
                    "success": True,
                    "client_number": client.client_number,
                    "message": "Client registered successfully",
                },
                status=status.HTTP_201_CREATED,
            )

        except ClientRegistryError as e:
            return safe_error_response(
                action="billing.client_registry_register",
                exc=e,
                logger=logger,
                expose_message_for=(ClientRegistryError,),
                extra_payload={"success": False},
            )
        except _sha_utility_handled_exceptions() as exc:
            logger.exception("Client Registry registration failed")
            return Response(
                {"error": _stringify_error(exc), "success": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @extend_schema(
        request=inline_serializer(
            name="ClientRegistryUpdateRequest",
            fields={
                "client_number": serializers.CharField(),
                "phone_number": serializers.CharField(required=False),
                "email": serializers.EmailField(required=False),
                "county": serializers.CharField(required=False),
                "sub_county": serializers.CharField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="ClientRegistryUpdateResponse",
                fields={
                    "success": serializers.BooleanField(),
                    "client": serializers.DictField(required=False),
                    "message": serializers.CharField(required=False),
                },
            )
        },
    )
    def put(self, request):
        """Update an existing client in Client Registry."""
        data = request.data
        client_number = data.get("client_number")
        if not client_number:
            return Response(
                {"error": "client_number is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        update_fields = {}
        if "phone_number" in data:
            update_fields["phone_number"] = data["phone_number"]
        if "email" in data:
            update_fields["email"] = data["email"]
        if "county" in data:
            update_fields["county_of_residence"] = data["county"]
        if "sub_county" in data:
            update_fields["sub_county_of_residence"] = data["sub_county"]

        if not update_fields:
            return Response(
                {
                    "error": "At least one field to update is required (phone_number, email, county, sub_county)"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = _legacy_sha_views_module().ClientRegistryService()
            client = service.update_client(client_number=client_number, **update_fields)

            return Response(
                {
                    "success": True,
                    "client": {
                        "client_number": client.client_number,
                        "first_name": client.first_name,
                        "last_name": client.last_name,
                        "phone_number": client.phone_number,
                        "email": client.email,
                        "county": client.county_of_residence,
                        "sub_county": client.sub_county_of_residence,
                    },
                    "message": "Client updated successfully",
                }
            )

        except ClientNotFoundError as e:
            return safe_error_response(
                action="billing.client_registry_update",
                exc=e,
                logger=logger,
                default_status=status.HTTP_404_NOT_FOUND,
                expose_message_for=(ClientNotFoundError,),
                extra_payload={"success": False},
            )
        except ClientRegistryError as e:
            return safe_error_response(
                action="billing.client_registry_update",
                exc=e,
                logger=logger,
                expose_message_for=(ClientRegistryError,),
                extra_payload={"success": False},
            )
        except _sha_utility_handled_exceptions() as exc:
            logger.exception("Client Registry update failed")
            return Response(
                {"error": _stringify_error(exc), "success": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class FacilitySearchView(APIView):
    """API view for facility validation via MFL."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        parameters=[
            OpenApiParameter("facility_code", OpenApiTypes.STR, description="Facility code"),
            OpenApiParameter("fid", OpenApiTypes.STR, description="Facility ID"),
        ],
        responses={
            200: inline_serializer(
                name="FacilitySearchResponse",
                fields={
                    "found": serializers.BooleanField(),
                    "facility": serializers.DictField(required=False),
                },
            )
        },
    )
    def get(self, request):
        """Search/validate facility in Master Facility List."""
        facility_code = request.query_params.get("facility_code")
        fid = request.query_params.get("fid")

        if not facility_code and not fid:
            return Response(
                {"error": "facility_code or fid is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from hmis.apps.billing.services.ilm_registries_service import IlmRegistriesService

            ilm_result = None
            try:
                identifier = facility_code or fid or ""
                identifier_type = "fr-code" if facility_code else "fid"
                ilm_svc = IlmRegistriesService()
                ilm_result = ilm_svc.search_facility(
                    identifier=identifier,
                    identifier_type=identifier_type,
                    facility=getattr(request, "facility", None),
                    user=request.user,
                )
            except _sha_utility_handled_exceptions():
                logger.debug("ILM facility search unavailable, falling back to legacy")

            if ilm_result and ilm_result.status_code == 200 and ilm_result.payload:
                ilm_data = ilm_result.payload
                fac_data = (
                    ilm_data[0]
                    if isinstance(ilm_data, list) and len(ilm_data) > 0
                    else (
                        ilm_data
                        if isinstance(ilm_data, dict)
                        and (ilm_data.get("officialName") or ilm_data.get("name"))
                        else None
                    )
                )
                if fac_data:
                    dha_level = (
                        fac_data.get("kephLevel")
                        or fac_data.get("keph_level")
                        or fac_data.get("level")
                        or ""
                    )

                    level_corrected = False
                    local_facility = getattr(request, "facility", None)
                    if dha_level and local_facility and hasattr(local_facility, "level"):
                        from hmis.apps.core.models import Facility as FacilityModel

                        normalized_level = str(dha_level).upper().replace("LEVEL", "").strip()[:1]
                        if normalized_level.isdigit() and normalized_level != local_facility.level:
                            old_level = local_facility.level
                            FacilityModel.objects.filter(pk=local_facility.pk).update(
                                level=normalized_level
                            )
                            level_corrected = True
                            logger.info(
                                "Auto-corrected facility %s level from %s to %s (per DHA ILM)",
                                getattr(local_facility, "mfl_code", ""),
                                old_level,
                                normalized_level,
                            )

                    return Response(
                        {
                            "found": True,
                            "facility": {
                                "facility_code": fac_data.get("frCode")
                                or fac_data.get("facility_code")
                                or identifier,
                                "name": fac_data.get("officialName") or fac_data.get("name", ""),
                                "level": dha_level,
                                "county": fac_data.get("county", ""),
                                "sub_county": fac_data.get("sub_county", ""),
                                "ward": fac_data.get("ward", ""),
                                "ownership": fac_data.get("ownership", ""),
                                "facility_type": fac_data.get("facility_type", ""),
                                "operational_status": fac_data.get("operational_status", ""),
                                "license_expiry": fac_data.get("license_expiry"),
                                "is_sha_contracted": fac_data.get("approved")
                                or fac_data.get("sha_contracted", False),
                            },
                            "level_corrected": level_corrected,
                        }
                    )

            service = DHASearchService()
            facility = service.search_facility(facility_code=facility_code, fid=fid)

            if facility and facility.found:
                level_corrected = False
                dha_level = facility.level
                if dha_level and request.user.is_authenticated:
                    from hmis.apps.core.models import Facility as FacilityModel

                    local_facility = getattr(request, "facility", None)
                    if local_facility and hasattr(local_facility, "level"):
                        normalized_level = str(dha_level).replace("Level ", "").strip()[:1]
                        if (
                            normalized_level
                            and normalized_level.isdigit()
                            and normalized_level != local_facility.level
                        ):
                            old_level = local_facility.level
                            FacilityModel.objects.filter(pk=local_facility.pk).update(
                                level=normalized_level
                            )
                            level_corrected = True
                            logger.info(
                                "Auto-corrected facility %s level from %s to %s (per DHA registry)",
                                local_facility.mfl_code,
                                old_level,
                                normalized_level,
                            )

                return Response(
                    {
                        "found": True,
                        "facility": {
                            "facility_code": facility.facility_code,
                            "name": facility.name,
                            "level": facility.level,
                            "county": facility.county,
                            "sub_county": facility.sub_county,
                            "ward": facility.ward,
                            "ownership": facility.ownership,
                            "facility_type": facility.facility_type,
                            "operational_status": facility.operational_status,
                            "license_expiry": (
                                str(facility.license_expiry) if facility.license_expiry else None
                            ),
                            "is_sha_contracted": facility.approved,
                        },
                        "level_corrected": level_corrected,
                    }
                )
            return Response({"found": False})

        except SearchError:
            return Response(
                {"error": "Facility search service is currently unavailable.", "found": False},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except _sha_utility_handled_exceptions() as exc:
            logger.exception("Facility search failed")
            return Response(
                {"error": _stringify_error(exc), "found": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PractitionerSearchView(APIView):
    """API view for practitioner search via DHA Health Worker Registry."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    _REGULATORS = ("KMPDC", "COC", "PPB", "NCK")

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "identification_number",
                OpenApiTypes.STR,
                description="National ID or Passport number",
            ),
            OpenApiParameter(
                "identification_type", OpenApiTypes.STR, description="'National ID' or 'passport'"
            ),
            OpenApiParameter(
                "regulator",
                OpenApiTypes.STR,
                description="Regulator code: KMPDC, COC, PPB, NCK (optional - tries all if omitted)",
            ),
        ],
        responses={
            200: inline_serializer(
                name="PractitionerSearchResponse",
                fields={"message": serializers.DictField()},
            )
        },
    )
    def get(self, request):
        """Search practitioner in Health Worker Registry via ILM middleware."""
        from hmis.apps.billing.services.dha_errors import (
            DHAError,
            DHANotFoundError,
            DHAValidationError,
        )
        from hmis.apps.billing.services.ilm_registries_service import IlmRegistriesService

        identification_number = request.query_params.get("identification_number")
        identification_type = request.query_params.get("identification_type", "National ID")
        regulator = request.query_params.get("regulator")

        if not identification_number:
            return Response(
                {"error": "identification_number is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        regulators = [regulator] if regulator else list(self._REGULATORS)
        facility = getattr(request.user, "primary_facility", None)
        service = IlmRegistriesService()
        last_error: Exception | None = None

        for reg in regulators:
            try:
                result = service.search_professional(
                    identification_number=identification_number,
                    identification_type=identification_type,
                    regulator=reg,
                    facility=facility,
                    user=request.user,
                )
                raw = result.payload
                if raw and isinstance(raw, dict):
                    msg = raw.get("message") or raw
                    membership = msg.get("membership", {})
                    return Response(
                        {
                            "message": {
                                "membership": {
                                    "id": membership.get("id", ""),
                                    "status": membership.get("status", ""),
                                    "salutation": membership.get("salutation", ""),
                                    "full_name": membership.get("full_name", ""),
                                    "gender": membership.get("gender", ""),
                                    "first_name": membership.get("first_name", ""),
                                    "middle_name": membership.get("middle_name", ""),
                                    "last_name": membership.get("last_name", ""),
                                    "registration_id": membership.get("registration_id", ""),
                                    "external_reference_id": membership.get(
                                        "external_reference_id", ""
                                    ),
                                    "licensing_body": membership.get("licensing_body", ""),
                                    "specialty": membership.get("specialty", ""),
                                    "is_active": membership.get("is_active", 0),
                                    "is_withdrawn": membership.get("is_withdrawn", 0),
                                    "withdrawal_reason": membership.get("withdrawal_reason", ""),
                                    "withdrawal_date": membership.get("withdrawal_date", ""),
                                    "license_expires_in_days": _compute_license_days(
                                        msg.get("licenses", [])
                                    ),
                                },
                                "licenses": [
                                    {
                                        "id": lic.get("id", ""),
                                        "external_reference_id": lic.get(
                                            "external_reference_id", ""
                                        ),
                                        "license_type": lic.get("license_type", ""),
                                        "license_start": lic.get("license_start", ""),
                                        "license_end": lic.get("license_end", ""),
                                    }
                                    for lic in msg.get("licenses", [])
                                ],
                                "professional_details": {
                                    "professional_cadre": msg.get("professional_details", {}).get(
                                        "professional_cadre", ""
                                    ),
                                    "practice_type": msg.get("professional_details", {}).get(
                                        "practice_type", ""
                                    ),
                                    "specialty": msg.get("professional_details", {}).get(
                                        "specialty", ""
                                    ),
                                    "subspecialty": msg.get("professional_details", {}).get(
                                        "subspecialty", ""
                                    ),
                                    "discipline_name": msg.get("professional_details", {}).get(
                                        "discipline_name", ""
                                    ),
                                    "educational_qualifications": msg.get(
                                        "professional_details", {}
                                    ).get("educational_qualifications", ""),
                                },
                                "contacts": {
                                    "phone": msg.get("contacts", {}).get("phone", ""),
                                    "email": msg.get("contacts", {}).get("email", ""),
                                    "postal_address": msg.get("contacts", {}).get(
                                        "postal_address", ""
                                    ),
                                },
                                "identifiers": {
                                    "identification_type": msg.get("identifiers", {}).get(
                                        "identification_type", ""
                                    ),
                                    "identification_number": msg.get("identifiers", {}).get(
                                        "identification_number", ""
                                    ),
                                    "client_registry_id": msg.get("identifiers", {}).get(
                                        "client_registry_id", ""
                                    ),
                                    "student_id": msg.get("identifiers", {}).get("student_id", ""),
                                },
                            }
                        }
                    )
            except DHANotFoundError:
                last_error = None
                continue
            except DHAValidationError as exc:
                if "no practitioner" in str(exc).lower():
                    continue
                last_error = exc
                continue
            except DHAError as exc:
                last_error = exc
                continue
            except _sha_utility_handled_exceptions() as exc:
                last_error = exc
                continue

        if last_error:
            logger.exception("Practitioner search failed via ILM")
            return Response(
                {"error": "Practitioner search failed.", "message": None},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "error": "No practitioner found with the provided identification",
                "message": None,
            },
            status=status.HTTP_404_NOT_FOUND,
        )


def _compute_license_days(licenses: list[dict]) -> int:
    """Compute days until the latest license expires."""
    from datetime import datetime

    best = -999
    for lic in licenses:
        end_str = lic.get("license_end") or ""
        if not end_str or end_str == "None":
            continue
        try:
            end_date = datetime.strptime(end_str, "%Y-%m-%d").date()
            days = (end_date - date.today()).days
            if days > best:
                best = days
        except (ValueError, TypeError):
            continue
    return best if best > -999 else 0


class SHAWebhookView(APIView):
    """Webhook endpoint for receiving DHA/SHA claim responses."""

    permission_classes = []

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={
            200: inline_serializer(
                name="WebhookResponse",
                fields={
                    "status": serializers.CharField(),
                    "message": serializers.CharField(),
                    "claim_reference": serializers.CharField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """Receive ClaimResponse from DHA."""
        webhook_logger = logging.getLogger("hmis.sha.webhook")

        try:
            payload = request.data
            payload_keys = sorted(payload.keys()) if isinstance(payload, dict) else []
            webhook_logger.info("SHA Webhook received: keys=%s", payload_keys)

            signature = request.headers.get("X-SHA-Signature")
            if signature and not self._verify_signature(request.body, signature):
                webhook_logger.warning("Invalid webhook signature")
                return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

            if payload.get("resourceType") == "ClaimResponse":
                return self._handle_fhir_claim_response(payload)

            if "claim_reference" in payload:
                return self._handle_simple_notification(payload)

            webhook_logger.warning("Unknown webhook payload format: keys=%s", payload_keys)
            return Response({"status": "received", "warning": "Unknown format"})

        except _sha_utility_handled_exceptions():
            webhook_logger.exception("Error processing SHA webhook")
            return Response(
                {"error": "Processing error"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _verify_signature(self, body: bytes, signature: str) -> bool:
        """Verify HMAC signature from DHA."""
        secret = getattr(settings, "SHA_WEBHOOK_SECRET", None)
        if not secret:
            return True

        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def _handle_fhir_claim_response(self, payload: dict) -> Response:
        """Process FHIR ClaimResponse resource."""
        webhook_logger = logging.getLogger("hmis.sha.webhook")
        request_ref = payload.get("request", {}).get("reference", "")
        claim_id = request_ref.replace("Claim/", "") if request_ref else None

        outcome = payload.get("outcome", "")
        disposition = payload.get("disposition", "")
        status_map = {
            "complete": "approved",
            "queued": "pending_verification",
            "error": "rejected",
            "partial": "partially_approved",
        }
        new_status = status_map.get(outcome, "pending_verification")
        total = payload.get("total", {})
        approved_amount = total.get("value", 0)

        if claim_id:
            updated = self._update_claim_status(
                claim_reference=claim_id,
                new_status=new_status,
                disposition=disposition,
                approved_amount=approved_amount,
                response_payload=payload,
            )
            if updated:
                webhook_logger.info(
                    "Updated claim %s to status %s",
                    _sanitize_log_value(claim_id),
                    _sanitize_log_value(new_status),
                )
            else:
                webhook_logger.warning(
                    "Could not find claim with reference %s",
                    _sanitize_log_value(claim_id),
                )

        return Response(
            {
                "status": "processed",
                "claim_reference": claim_id,
                "outcome": outcome,
                "new_status": new_status,
            }
        )

    def _handle_simple_notification(self, payload: dict) -> Response:
        """Process simple notification format."""
        webhook_logger = logging.getLogger("hmis.sha.webhook")

        claim_reference = payload.get("claim_reference")
        new_status = payload.get("status", "pending_verification")
        disposition = payload.get("disposition", "")
        approved_amount = payload.get("approved_amount", 0)

        updated = self._update_claim_status(
            claim_reference=claim_reference,
            new_status=new_status,
            disposition=disposition,
            approved_amount=approved_amount,
            response_payload=payload,
        )

        if updated:
            webhook_logger.info(
                "Updated claim %s to status %s",
                _sanitize_log_value(claim_reference),
                _sanitize_log_value(new_status),
            )
        else:
            webhook_logger.warning(
                "Could not find claim with reference %s",
                _sanitize_log_value(claim_reference),
            )

        return Response(
            {"status": "processed", "claim_reference": claim_reference, "updated": updated}
        )

    def _update_claim_status(
        self,
        claim_reference: str,
        new_status: str,
        disposition: str,
        approved_amount: float,
        response_payload: dict,
    ) -> bool:
        """Update claim status in database and notify billing staff."""
        from hmis.apps.billing.agent import BillingAgentService

        claim = SHAClaim.objects.filter(sha_claim_reference=claim_reference).first()
        if not claim:
            claim = SHAClaim.objects.filter(claim_number=claim_reference).first()
        if not claim:
            return False

        old_status = claim.status
        api_response = dict(response_payload)
        if disposition:
            api_response.setdefault("disposition", disposition)
        if approved_amount:
            api_response.setdefault("approved_amount", approved_amount)

        BillingAgentService._apply_status_update(claim, new_status, api_response)
        if new_status != old_status:
            BillingAgentService._notify_claim_status_change(claim, old_status, new_status)
        return True


class SHAValidateView(APIView):
    """Validation endpoint for DHA to verify system reachability."""

    permission_classes = []

    @extend_schema(
        responses={
            200: inline_serializer(
                name="SHAValidateGetResponse",
                fields={
                    "status": serializers.CharField(),
                    "system": serializers.CharField(),
                    "version": serializers.CharField(),
                    "sha_integration": serializers.DictField(),
                    "timestamp": serializers.CharField(),
                    "ready": serializers.BooleanField(),
                },
            )
        },
    )
    def get(self, _request):
        """Health check endpoint for DHA validation."""
        from django.conf import settings

        return Response(
            {
                "status": "active",
                "system": "Vitora HMIS",
                "version": getattr(settings, "VERSION", "1.0.0"),
                "sha_integration": {
                    "enabled": True,
                    "api_version": "v3",
                    "fhir_version": "R4",
                },
                "timestamp": timezone.now().isoformat(),
                "ready": True,
            }
        )

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={
            200: inline_serializer(
                name="SHAValidatePostResponse",
                fields={
                    "status": serializers.CharField(),
                    "result": serializers.DictField(),
                    "timestamp": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Validate a test payload from DHA."""
        payload = request.data
        validation_result = {"valid": True, "errors": [], "warnings": []}

        if payload.get("resourceType") == "Bundle":
            if "type" not in payload:
                validation_result["errors"].append("Bundle missing type field")
                validation_result["valid"] = False
            if "entry" not in payload:
                validation_result["warnings"].append("Bundle has no entries")

        return Response(
            {
                "status": "validated",
                "result": validation_result,
                "timestamp": timezone.now().isoformat(),
            }
        )


class SHAHealthCheckView(APIView):
    """Health check endpoint for DHA HIE authentication and connectivity."""

    @extend_schema(
        responses={
            200: inline_serializer(
                name="SHAHealthCheckResponse",
                fields={
                    "configured": serializers.BooleanField(),
                    "auth_mode": serializers.CharField(),
                    "token_valid": serializers.BooleanField(),
                    "token_error": serializers.CharField(allow_null=True),
                    "services": serializers.DictField(),
                    "timestamp": serializers.CharField(),
                },
            )
        },
        description="Check DHA HIE authentication and connectivity status.",
    )
    def get(self, _request):
        """Check DHA HIE authentication health."""
        from hmis.apps.billing.services.sha_auth import SHAAuthError, SHAAuthService

        auth_service = SHAAuthService()
        configured = auth_service.is_configured()
        auth_mode = auth_service.auth_mode
        token_valid = False
        token_error = None

        if configured:
            try:
                auth_service.get_token(force_refresh=True)
                token_valid = True
            except SHAAuthError:
                token_error = "Auth check failed"  # noqa: S105 - operational status text
            except _sha_utility_handled_exceptions() as exc:
                token_error = f"Unexpected error: {type(exc).__name__}"

        services = {}
        try:
            cr_service = ClientRegistryService()
            services["client_registry"] = cr_service.is_configured()
        except _sha_utility_handled_exceptions():
            services["client_registry"] = False

        try:
            term_service = TerminologyService()
            services["terminology"] = term_service.is_configured()
        except _sha_utility_handled_exceptions():
            services["terminology"] = False

        services["claims_submission"] = configured and token_valid

        return Response(
            {
                "configured": configured,
                "auth_mode": auth_mode,
                "token_valid": token_valid,
                "token_error": token_error,
                "services": services,
                "timestamp": timezone.now().isoformat(),
            }
        )
