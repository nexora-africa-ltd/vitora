# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: certificate authority, user certificates, document signatures, and document sharing endpoints.
How to use: imported by `hmis.apps.core.views` compatibility module for API route wiring.
Supported inputs/args: Django REST Framework viewsets/api views for certificate and document security workflows.
"""

import logging

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
from .views_audit_reference import _get_client_ip

logger = logging.getLogger(__name__)


class CertificateViewSet(viewsets.GenericViewSet, ListModelMixin, RetrieveModelMixin):
    """
    ViewSet for certificate management.

    List and verify user certificates. Issue and revoke certificates (admin only).
    """

    queryset = UserCertificate.objects.select_related(
        "user",
        "organization",
        "certificate_authority",
        "certificate_authority__organization",
    ).all()
    serializer_class = UserCertificateSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filterset_fields = ["user", "is_revoked"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        resolve_request_tenant(self.request)
        org = getattr(self.request, "organization", None)

        if not self.request.user.is_superuser:
            if not org:
                return qs.none()
            qs = qs.filter(organization=org)

        if not (self.request.user.is_staff or self.request.user.is_superuser):
            qs = qs.filter(user=self.request.user)
        return qs

    @action(detail=False, methods=["get"])
    def ca(self, request):
        """List active Certificate Authorities (public info only)."""
        resolve_request_tenant(request)
        org = getattr(request, "organization", None)

        cas = CertificateAuthority.objects.filter(is_active=True)
        if not request.user.is_superuser:
            if not org:
                cas = cas.none()
            else:
                cas = cas.filter(
                    models.Q(is_root=True, organization__isnull=True) | models.Q(organization=org)
                )

        serializer = CertificateAuthoritySerializer(cas, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], permission_classes=[IsAdminUser])
    def issue(self, request):
        """Issue a new certificate for a user (admin only)."""
        from .services.pki_service import PKIService

        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"error": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth import get_user_model

        User = get_user_model()
        try:
            target_user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        resolve_request_tenant(request)
        tenant_org = getattr(request, "organization", None)
        target_profile = getattr(target_user, "staff_profile", None)
        target_org = getattr(target_profile, "organization", None) or tenant_org

        if not request.user.is_superuser and not target_org:
            return Response(
                {"error": "Target user is not assigned to an organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            not request.user.is_superuser
            and tenant_org is not None
            and target_org is not None
            and target_org.id != tenant_org.id
        ):
            return Response(
                {"error": "Cannot issue certificates across organizations."},
                status=status.HTTP_403_FORBIDDEN,
            )

        service = PKIService()
        try:
            cert = service.issue_user_certificate(
                user=target_user,
                organization=target_org,
                validity_years=int(request.data.get("validity_years", 2)),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            UserCertificateSerializer(cert).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], permission_classes=[IsAdminUser])
    def revoke(self, request, pk=None):
        """Revoke a user certificate (admin only)."""
        from .services.pki_service import PKIService

        cert = self.get_object()
        serializer = RevokeCertificateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if cert.is_revoked:
            return Response(
                {"error": "Certificate is already revoked"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = PKIService()
        service.revoke_certificate(
            cert=cert,
            reason=serializer.validated_data["reason"],
            user=request.user,
        )
        return Response(UserCertificateSerializer(cert).data)

    @action(detail=True, methods=["get"])
    def verify(self, request, pk=None):
        """Verify a certificate's validity."""
        from .services.pki_service import PKIService

        cert = self.get_object()
        service = PKIService()
        result = service.verify_certificate(cert)
        return Response(
            {
                "valid": result.valid,
                "subject": result.subject,
                "issuer": result.issuer,
                "serial_number": result.serial_number,
                "valid_from": result.valid_from.isoformat() if result.valid_from else None,
                "valid_to": result.valid_to.isoformat() if result.valid_to else None,
                "is_expired": result.is_expired,
                "is_revoked": result.is_revoked,
                "ca_active": result.ca_active,
                "errors": result.errors,
                "chain": result.chain,
            }
        )

    @action(detail=False, methods=["post"], permission_classes=[IsAdminUser])
    def create_intermediate(self, request):
        """Create an intermediate CA signed by the root CA (admin only)."""
        from .services.pki_service import PKIService

        name = request.data.get("name", "Facility Intermediate CA")
        org = request.data.get("org", "Health Facility")
        country = request.data.get("country", "KE")
        key_size = int(request.data.get("key_size", 2048))
        validity_years = int(request.data.get("validity_years", 5))
        parent_ca_id = request.data.get("parent_ca_id")

        resolve_request_tenant(request)
        tenant_org = getattr(request, "organization", None)

        organization_id = request.data.get("organization_id")
        organization = None
        if organization_id:
            try:
                organization = Organization.objects.get(pk=organization_id, is_active=True)
            except Organization.DoesNotExist:
                return Response(
                    {"error": "Specified organization not found or inactive"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            organization = tenant_org

        if (
            not request.user.is_superuser
            and tenant_org is not None
            and organization is not None
            and organization.id != tenant_org.id
        ):
            return Response(
                {"error": "Cannot create intermediate CA for another organization."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if parent_ca_id:
            try:
                parent_ca = CertificateAuthority.objects.get(pk=parent_ca_id, is_active=True)
            except CertificateAuthority.DoesNotExist:
                return Response(
                    {"error": "Specified parent CA not found or inactive"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            parent_ca = CertificateAuthority.objects.filter(is_root=True, is_active=True).first()
            if parent_ca is None:
                return Response(
                    {"error": "No active root CA found. Initialize one first."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        service = PKIService()
        try:
            ca = service.create_intermediate_ca(
                parent_ca=parent_ca,
                name=name,
                org=org,
                organization=organization,
                country=country,
                key_size=key_size,
                validity_years=validity_years,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            CertificateAuthoritySerializer(ca).data,
            status=status.HTTP_201_CREATED,
        )


class DocumentSignatureViewSet(viewsets.GenericViewSet, ListModelMixin, RetrieveModelMixin):
    """
    ViewSet for document signatures.

    Sign and verify clinical documents.
    """

    queryset = DocumentSignature.objects.select_related("signer", "certificate").all()
    serializer_class = DocumentSignatureSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filterset_fields = ["document_type", "signer"]
    ordering = ["-signed_at"]

    @action(detail=False, methods=["post"])
    def sign(self, request):
        """Sign a clinical document."""
        from .services.signing_service import DocumentSigningService

        serializer = SignDocumentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = DocumentSigningService()
        try:
            sig = service.sign_document(
                document_type=serializer.validated_data["document_type"],
                document_id=serializer.validated_data["document_id"],
                user=request.user,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            DocumentSignatureSerializer(sig).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"])
    def verify(self, request):
        """Verify a document signature."""
        from .services.signing_service import DocumentSigningService

        serializer = VerifySignatureRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        if data.get("signature_id"):
            try:
                sig = DocumentSignature.objects.get(pk=data["signature_id"])
            except DocumentSignature.DoesNotExist:
                return Response(
                    {"error": "Signature not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            sig = (
                DocumentSignature.objects.filter(
                    document_type=data["document_type"],
                    document_id=data["document_id"],
                )
                .order_by("-signed_at")
                .first()
            )
            if sig is None:
                return Response(
                    {"error": "No signature found for this document"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        service = DocumentSigningService()
        result = service.verify_signature(sig)
        return Response(
            {
                "valid": result.valid,
                "document_type": result.document_type,
                "document_id": result.document_id,
                "signer_username": result.signer_username,
                "signer_name": result.signer_name,
                "signed_at": result.signed_at,
                "certificate_serial": result.certificate_serial,
                "certificate_valid": result.certificate_valid,
                "content_matches": result.content_matches,
                "signature_valid": result.signature_valid,
                "errors": result.errors,
            }
        )

    @action(detail=False, methods=["get"])
    def for_document(self, request):
        """Get all signatures for a specific document."""
        doc_type = request.query_params.get("type")
        doc_id = request.query_params.get("id")
        if not doc_type or not doc_id:
            return Response(
                {"error": "Both 'type' and 'id' query parameters are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sigs = DocumentSignature.objects.filter(
            document_type=doc_type, document_id=doc_id
        ).order_by("-signed_at")
        return Response(DocumentSignatureSerializer(sigs, many=True).data)


DOCUMENT_HUB_CONFIG: dict[str, dict[str, str]] = {
    "LabResult": {
        "app": "laboratory",
        "model": "LabResult",
        "owner_field": "entered_by",
        "number_field": "id",
    },
    "Prescription": {
        "app": "pharmacy",
        "model": "Prescription",
        "owner_field": "prescribed_by",
        "number_field": "prescription_number",
    },
    "Discharge": {
        "app": "inpatient",
        "model": "Discharge",
        "owner_field": "discharged_by",
        "number_field": "id",
    },
    "RadiologyReport": {
        "app": "imaging",
        "model": "RadiologyReport",
        "owner_field": "reported_by",
        "number_field": "report_number",
    },
    "DiagnosticReport": {
        "app": "laboratory",
        "model": "DiagnosticReport",
        "owner_field": "issued_by",
        "number_field": "report_number",
    },
    "SickNote": {
        "app": "sick_notes",
        "model": "SickNote",
        "owner_field": "issued_by",
        "number_field": "note_number",
    },
    "ClinicalReferral": {
        "app": "referrals",
        "model": "ClinicalReferral",
        "owner_field": "referred_by",
        "number_field": "referral_number",
    },
    "Invoice": {
        "app": "billing",
        "model": "Invoice",
        "owner_field": "created_by",
        "number_field": "invoice_number",
    },
    "SHAClaim": {
        "app": "billing",
        "model": "SHAClaim",
        "owner_field": "created_by",
        "number_field": "claim_number",
    },
    "SHAPreauth": {
        "app": "billing",
        "model": "SHAPreauth",
        "owner_field": "requested_by",
        "number_field": "id",
    },
    "SHAClaimAttachment": {
        "app": "billing",
        "model": "SHAClaimAttachment",
        "owner_field": "uploaded_by",
        "number_field": "id",
    },
    "CreditNote": {
        "app": "billing",
        "model": "CreditNote",
        "owner_field": "requested_by",
        "number_field": "credit_note_number",
    },
    "Receipt": {
        "app": "billing",
        "model": "Receipt",
        "owner_field": "issued_by",
        "number_field": "receipt_number",
    },
    "Payment": {
        "app": "billing",
        "model": "Payment",
        "owner_field": "received_by",
        "number_field": "payment_reference",
    },
}


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


def _build_hub_item(document_type: str, document, user, share: DocumentShare | None = None) -> dict:
    from .services.signing_service import SIGNABLE_DOCUMENT_TYPES

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


class DocumentShareViewSet(viewsets.GenericViewSet, ListModelMixin):
    """User-to-user share management for signable documents."""

    queryset = DocumentShare.objects.select_related("shared_by", "shared_with", "revoked_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def get_serializer_class(self):
        if self.action == "create":
            return DocumentShareCreateSerializer
        return DocumentShareSerializer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(models.Q(shared_by=self.request.user) | models.Q(shared_with=self.request.user))
            .order_by("-created_at")
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        document = _resolve_document_instance(data["document_type"], data["document_id"])
        if document is None:
            return Response({"error": "Document not found."}, status=status.HTTP_400_BAD_REQUEST)

        owner_field = DOCUMENT_HUB_CONFIG[data["document_type"]]["owner_field"]
        owner = getattr(document, owner_field, None)
        if (owner is None or owner.pk != request.user.pk) and not request.user.is_superuser:
            return Response(
                {"error": "You do not have permission to share this document."},
                status=status.HTTP_403_FORBIDDEN,
            )

        share, created = DocumentShare.objects.update_or_create(
            document_type=data["document_type"],
            document_id=data["document_id"],
            shared_with=data["shared_with"],
            defaults={
                "shared_by": request.user,
                "permission": data.get("permission", DocumentShare.Permission.VIEW),
                "note": data.get("note", ""),
                "expires_at": data.get("expires_at"),
                "revoked_at": None,
                "revoked_by": None,
            },
        )

        AuditLog.log(
            action="document_share_create",
            user=request.user,
            resource_type=data["document_type"],
            resource_id=data["document_id"],
            ip_address=_get_client_ip(request),
            details={
                "share_id": share.id,
                "shared_with": share.shared_with_id,
                "permission": share.permission,
                "created": created,
            },
        )

        output = DocumentShareSerializer(share)
        return Response(
            output.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        share = self.get_object()
        if share.shared_by_id != request.user.id and not request.user.is_superuser:
            return Response({"error": "Only the sharer can revoke this share."}, status=403)

        if share.revoked_at is None:
            share.revoked_at = timezone.now()
            share.revoked_by = request.user
            share.save(update_fields=["revoked_at", "revoked_by", "updated_at"])

            AuditLog.log(
                action="document_share_revoke",
                user=request.user,
                resource_type=share.document_type,
                resource_id=share.document_id,
                ip_address=_get_client_ip(request),
                details={"share_id": share.id},
            )

        return Response(DocumentShareSerializer(share).data)
