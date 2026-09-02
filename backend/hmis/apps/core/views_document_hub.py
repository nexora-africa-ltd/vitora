# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F401, F811
"""Core views document hub for Vitora HMIS.

What this file is for:
- Implement views document hub logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from collections import defaultdict

from django.apps import apps
from django.conf import settings as django_settings
from django.contrib.auth.models import Permission
from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.db import models
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

from .mixins import ReadOnCreateMixin, TenantScopedViewMixin, resolve_request_tenant
from .models import (
    AuditLog,
    CertificateAuthority,
    CodeSystem,
    County,
    Department,
    DHIS2Config,
    DocumentShare,
    DocumentSignature,
    Facility,
    FeatureFlag,
    FrontendEvent,
    Notification,
    Organization,
    OrgMembership,
    PasswordResetToken,
    PushSubscription,
    Role,
    StaffProfile,
    SubCounty,
    SubscriptionPlan,
    UserCertificate,
    Ward,
)
from .openapi import SchemaFallbackSerializer
from .permissions import (
    AuditLogPermission,
    FacilityAdminPermission,
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
)
from .role_permissions_sync import sync_role_group_permissions
from .serializers import (
    AuditLogSerializer,
    CertificateAuthoritySerializer,
    CodeSystemSerializer,
    CountySerializer,
    DepartmentSerializer,
    DHIS2ConfigCreateSerializer,
    DHIS2ConfigDetailSerializer,
    DHIS2ConfigListSerializer,
    DHIS2ConfigUpdateSerializer,
    DocumentHubItemSerializer,
    DocumentShareCreateSerializer,
    DocumentShareSerializer,
    DocumentSignatureSerializer,
    FacilityCreateSerializer,
    FacilityDetailSerializer,
    FacilityListSerializer,
    FeatureFlagSerializer,
    FrontendEventBatchSerializer,
    FrontendEventSerializer,
    NotificationSerializer,
    OrganizationDetailSerializer,
    OrganizationListSerializer,
    OrgChartPayloadSerializer,
    OrgMembershipCreateSerializer,
    OrgMembershipSerializer,
    PermissionSerializer,
    PushSubscriptionSerializer,
    RevokeCertificateRequestSerializer,
    RoleSerializer,
    SignDocumentRequestSerializer,
    StaffProfileSerializer,
    StaffProfileUpdateSerializer,
    SubCountySerializer,
    SubscriptionPlanCreateSerializer,
    SubscriptionPlanDetailSerializer,
    SubscriptionPlanListSerializer,
    UserCertificateSerializer,
    UsernameCheckResponseSerializer,
    UsernameSuggestionRequestSerializer,
    UsernameSuggestionResponseSerializer,
    UserPermissionsSerializer,
    VerifySignatureRequestSerializer,
    WardSerializer,
)
from .views_security_documents import DOCUMENT_HUB_CONFIG

logger = logging.getLogger(__name__)

_SIGNATURE_NOT_LOADED = object()


def _full_name_or_username(user) -> str:
    if not user:
        return ""
    return user.get_full_name().strip() or user.username


def _get_patient_name(document) -> str:
    patient = None
    if hasattr(document, "patient"):
        patient = getattr(document, "patient", None)
    elif hasattr(document, "imaging_order") and getattr(document, "imaging_order", None):
        patient = getattr(document.imaging_order, "patient", None)
    elif hasattr(document, "lab_order") and getattr(document, "lab_order", None):
        patient = getattr(document.lab_order, "patient", None)
    elif hasattr(document, "admission") and getattr(document, "admission", None):
        patient = getattr(document.admission, "patient", None)
    elif hasattr(document, "order_item") and getattr(document, "order_item", None):
        order = getattr(document.order_item, "order", None)
        patient = getattr(order, "patient", None)
    elif hasattr(document, "invoice") and getattr(document, "invoice", None):
        patient = getattr(document.invoice, "patient", None)

    if not patient:
        return ""
    return f"{patient.first_name} {patient.last_name}".strip()


def _can_sign_by_state(document_type: str, document) -> bool:
    if document_type == "LabResult":
        return getattr(document, "verification_status", "") == "VERIFIED"
    if document_type == "RadiologyReport":
        return getattr(document, "status", "") in ("FINAL", "AMENDED")
    if document_type == "DiagnosticReport":
        return bool(getattr(document, "is_finalized", False)) or getattr(
            document, "status", ""
        ) in (
            "FINAL",
            "AMENDED",
        )
    if document_type == "SickNote":
        return getattr(document, "status", "") == "ISSUED"
    if document_type == "ClinicalReferral":
        return getattr(document, "status", "") in ("ACCEPTED", "IN_PROGRESS")
    return document_type not in (
        "Invoice",
        "SHAClaim",
        "SHAPreauth",
        "CreditNote",
        "Receipt",
        "Payment",
    )


def _resolve_document_instance(document_type: str, document_id: int):
    cfg = DOCUMENT_HUB_CONFIG.get(document_type)
    if cfg is None:
        return None
    model = apps.get_model(cfg["app"], cfg["model"])
    return model.objects.filter(pk=document_id).first()


def _get_latest_signature_map(
    document_type: str, document_ids: list[int]
) -> dict[int, DocumentSignature]:
    """Return latest signatures keyed by document id for a document type."""
    if not document_ids:
        return {}

    signatures: dict[int, DocumentSignature] = {}
    queryset = (
        DocumentSignature.objects.filter(
            document_type=document_type,
            document_id__in=document_ids,
        )
        .order_by("document_id", "-signed_at")
        .only("document_id", "signed_at")
    )
    for signature in queryset:
        signatures.setdefault(signature.document_id, signature)
    return signatures


def _build_hub_item(
    document_type: str,
    document,
    user,
    share: DocumentShare | None = None,
    latest_signature: DocumentSignature | None | object = _SIGNATURE_NOT_LOADED,
) -> dict:
    from .services.signing_service import SIGNABLE_DOCUMENT_TYPES

    if latest_signature is _SIGNATURE_NOT_LOADED:
        latest_signature = (
            DocumentSignature.objects.filter(document_type=document_type, document_id=document.pk)
            .order_by("-signed_at")
            .first()
        )
    owner_field = DOCUMENT_HUB_CONFIG[document_type]["owner_field"]
    owner = getattr(document, owner_field, None)
    number_field = DOCUMENT_HUB_CONFIG[document_type]["number_field"]
    number_value = getattr(document, number_field, None) or document.pk

    has_sign_share = share is not None and share.permission == DocumentShare.Permission.SIGN
    is_owner = bool(owner and owner.pk == user.pk)
    signable_type = document_type in SIGNABLE_DOCUMENT_TYPES
    can_sign = (
        signable_type
        and (is_owner or has_sign_share)
        and _can_sign_by_state(document_type, document)
    )

    title_value = f"{document_type} {number_value}"
    if document_type == "SHAClaimAttachment":
        title_value = getattr(document, "name", "") or title_value
    elif document_type == "SHAPreauth":
        title_value = f"Preauth {number_value}"

    return {
        "document_type": document_type,
        "document_id": document.pk,
        "document_number": str(number_value),
        "title": title_value,
        "patient_name": _get_patient_name(document),
        "status": getattr(document, "status", "") or getattr(document, "verification_status", ""),
        "owner_name": _full_name_or_username(owner),
        "is_signed": latest_signature is not None,
        "signed_at": latest_signature.signed_at if latest_signature else None,
        "can_sign": can_sign and latest_signature is None,
        "is_shared_with_me": share is not None,
        "share_permission": share.permission if share else None,
        "shared_by_name": _full_name_or_username(share.shared_by) if share else None,
        "shared_at": share.created_at if share else None,
        "_sort": getattr(document, "updated_at", None) or getattr(document, "created_at", None),
    }


class DocumentHubViewSet(viewsets.ViewSet):
    """Unified document listing for owned and shared clinical documents."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    serializer_class = SchemaFallbackSerializer

    def get_serializer_class(self):
        return self.serializer_class

    @action(
        detail=False,
        methods=["get"],
        url_path=r"sha-attachments/(?P<attachment_id>[^/.]+)",
    )
    def sha_attachment_preview(self, request, attachment_id=None):
        """Read-only preview payload for SHA claim attachments shown in Document Hub."""
        from hmis.apps.billing.models import SHAClaimAttachment

        attachment = (
            SHAClaimAttachment.objects.select_related("claim", "uploaded_by")
            .filter(pk=attachment_id)
            .first()
        )
        if attachment is None:
            return Response({"error": "Attachment not found."}, status=status.HTTP_404_NOT_FOUND)

        has_active_share = (
            DocumentShare.objects.filter(
                document_type="SHAClaimAttachment",
                document_id=attachment.pk,
                shared_with=request.user,
                revoked_at__isnull=True,
            )
            .filter(models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=timezone.now()))
            .exists()
        )

        is_owner = attachment.uploaded_by_id == request.user.id
        if not (request.user.is_superuser or is_owner or has_active_share):
            return Response(
                {"error": "You do not have permission to view this attachment preview."},
                status=status.HTTP_403_FORBIDDEN,
            )

        file_url = None
        if getattr(attachment, "file", None) and attachment.file.name:
            file_url = request.build_absolute_uri(attachment.file.url)

        data = {
            "id": attachment.pk,
            "claim_id": attachment.claim_id,
            "claim_number": getattr(attachment.claim, "claim_number", ""),
            "attachment_type": attachment.attachment_type,
            "attachment_type_display": attachment.get_attachment_type_display(),
            "name": attachment.name,
            "description": attachment.description,
            "mime_type": attachment.mime_type,
            "file_size": attachment.file_size,
            "checksum": attachment.checksum,
            "original_filename": attachment.original_filename,
            "uploaded_by_id": attachment.uploaded_by_id,
            "uploaded_by_name": _full_name_or_username(attachment.uploaded_by),
            "created_at": attachment.created_at,
            "file_url": file_url,
        }
        return Response(data)

    def list(self, request):
        tab = request.query_params.get("tab", "mine").lower()
        items: list[dict] = []

        if tab in ("mine", "signed", "pending"):
            for document_type, cfg in DOCUMENT_HUB_CONFIG.items():
                model = apps.get_model(cfg["app"], cfg["model"])
                owner_field = cfg["owner_field"]
                documents = list(
                    model.objects.filter(**{f"{owner_field}_id": request.user.id}).order_by("-id")[
                        :200
                    ]
                )
                if not documents:
                    continue

                signature_map = _get_latest_signature_map(
                    document_type,
                    [document.pk for document in documents],
                )
                for document in documents:
                    items.append(
                        _build_hub_item(
                            document_type,
                            document,
                            request.user,
                            latest_signature=signature_map.get(document.pk),
                        )
                    )

        if tab in ("shared", "signed", "pending"):
            shares = list(
                DocumentShare.objects.filter(
                    shared_with=request.user,
                    revoked_at__isnull=True,
                )
                .filter(models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=timezone.now()))
                .select_related("shared_by")[:200]
            )
            share_ids_by_type: dict[str, set[int]] = defaultdict(set)
            for share in shares:
                cfg = DOCUMENT_HUB_CONFIG.get(share.document_type)
                if cfg is None:
                    continue
                share_ids_by_type[share.document_type].add(share.document_id)

            shared_documents_by_type: dict[str, dict[int, object]] = {}
            shared_signatures_by_type: dict[str, dict[int, DocumentSignature]] = {}
            for document_type, ids in share_ids_by_type.items():
                cfg = DOCUMENT_HUB_CONFIG.get(document_type)
                if cfg is None:
                    continue
                model = apps.get_model(cfg["app"], cfg["model"])
                documents = list(model.objects.filter(pk__in=list(ids)))
                shared_documents_by_type[document_type] = {
                    document.pk: document for document in documents
                }
                shared_signatures_by_type[document_type] = _get_latest_signature_map(
                    document_type,
                    [document.pk for document in documents],
                )

            for share in shares:
                document = shared_documents_by_type.get(share.document_type, {}).get(
                    share.document_id
                )
                if document is None:
                    continue
                items.append(
                    _build_hub_item(
                        share.document_type,
                        document,
                        request.user,
                        share=share,
                        latest_signature=shared_signatures_by_type.get(share.document_type, {}).get(
                            document.pk
                        ),
                    )
                )

        if tab == "signed":
            items = [item for item in items if item["is_signed"]]
        elif tab == "pending":
            items = [item for item in items if not item["is_signed"] and item["can_sign"]]
        elif tab == "shared":
            items = [item for item in items if item["is_shared_with_me"]]
        else:
            items = [item for item in items if not item["is_shared_with_me"]]

        q = (request.query_params.get("q") or "").strip().lower()
        if q:
            items = [
                item
                for item in items
                if q in item["document_number"].lower()
                or q in item["title"].lower()
                or q in item["patient_name"].lower()
                or q in item["owner_name"].lower()
            ]

        document_type_filter = request.query_params.get("document_type")
        if document_type_filter:
            items = [item for item in items if item["document_type"] == document_type_filter]

        items.sort(key=lambda item: item.get("_sort") or timezone.now(), reverse=True)
        for item in items:
            item.pop("_sort", None)

        page = self.paginate_queryset(items)
        if page is not None:
            serializer = DocumentHubItemSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = DocumentHubItemSerializer(items, many=True)
        return Response(serializer.data)

    def paginate_queryset(self, queryset):
        paginator = getattr(self, "paginator", None)
        if paginator is None:
            from rest_framework.pagination import PageNumberPagination

            paginator = PageNumberPagination()
            self.paginator = paginator
        return paginator.paginate_queryset(queryset, self.request, view=self)

    def get_paginated_response(self, data):
        return self.paginator.get_paginated_response(data)
