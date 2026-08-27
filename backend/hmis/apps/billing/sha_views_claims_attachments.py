"""
What this file is for: claim item and attachment endpoint mixin for SHA claims.
How to use: mixed into SHAClaimViewSet to provide item allocation and attachment CRUD actions.
Supported inputs/args: DRF item and attachment action payloads, including multipart uploads.
"""

# ruff: noqa: ARG002

import hashlib
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action as drf_action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from hmis.apps.billing.models import SHAClaimAttachment, SHAClaimItem, SHATariff
from hmis.apps.billing.sha_serializers import SHAClaimAttachmentSerializer, SHAClaimItemSerializer
from hmis.apps.billing.sha_views_claims_helpers import _parse_money, _stringify_error
from hmis.apps.core.models import AuditLog


class SHAClaimAttachmentsMixin:
    """Item and attachment actions for SHAClaimViewSet."""

    @drf_action(detail=True, methods=["get", "post"], url_path="items")
    def items(self, request, pk=None):
        """
        List or add items to a claim.

        GET /api/sha/claims/{id}/items/
        POST /api/sha/claims/{id}/items/
        """
        claim = self.get_object()

        if request.method == "GET":
            serializer = SHAClaimItemSerializer(claim.items.all(), many=True)
            return Response(serializer.data)

        elif request.method == "POST":
            serializer = SHAClaimItemSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            # Check tariff max quantity if tariff is provided
            tariff_id = request.data.get("tariff")
            quantity = Decimal(request.data.get("quantity", "1"))

            if tariff_id:
                tariff = get_object_or_404(SHATariff, pk=tariff_id)
                if quantity > tariff.max_quantity_per_claim:
                    return Response(
                        {
                            "quantity": f"Exceeds maximum quantity ({tariff.max_quantity_per_claim}) for this tariff"
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            item = SHAClaimItem.objects.create(claim=claim, **serializer.validated_data)

            return Response(SHAClaimItemSerializer(item).data, status=status.HTTP_201_CREATED)

    @drf_action(detail=True, methods=["post"], url_path=r"items/(?P<item_id>[^/.]+)/allocation")
    def item_allocation(self, request, pk=None, item_id=None):
        """Update SHA/patient/discount allocation for a claim line item."""
        claim = self.get_object()
        item = get_object_or_404(claim.items.all(), pk=item_id)

        sha_covered_amount = _parse_money(
            request.data.get("sha_covered_amount", item.sha_covered_amount),
            "sha_covered_amount",
        )
        patient_payable_amount = _parse_money(
            request.data.get("patient_payable_amount", item.patient_payable_amount),
            "patient_payable_amount",
        )
        discount_amount = _parse_money(
            request.data.get("discount_amount", item.discount_amount),
            "discount_amount",
        )
        discount_reason = str(
            request.data.get("discount_reason", item.discount_reason or "")
        ).strip()

        if discount_amount > 0 and not discount_reason:
            return Response(
                {"error": "Discount/waiver reason is required for audit."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item.sha_covered_amount = sha_covered_amount
        item.patient_payable_amount = patient_payable_amount
        item.discount_amount = discount_amount
        item.discount_reason = discount_reason
        item.allocation_status = SHAClaimItem.AllocationStatus.RESOLVED
        if discount_amount > 0:
            item.discount_applied_by = request.user
            item.discount_applied_at = timezone.now()
        else:
            item.discount_applied_by = None
            item.discount_applied_at = None

        try:
            item.save()
        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError) as exc:
            return Response({"error": _stringify_error(exc)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="sha_claim_item_allocation_updated",
            user=request.user,
            resource_type="SHAClaimItem",
            resource_id=item.id,
            details={
                "claim_id": claim.id,
                "sha_covered_amount": str(item.sha_covered_amount),
                "patient_payable_amount": str(item.patient_payable_amount),
                "discount_amount": str(item.discount_amount),
                "discount_reason": item.discount_reason,
                "allocation_status": item.allocation_status,
            },
        )

        claim.refresh_from_db(fields=["claimed_amount"])
        return Response(
            {
                "success": True,
                "item": SHAClaimItemSerializer(item).data,
                "claim_claimed_amount": str(claim.claimed_amount),
            }
        )

    @drf_action(detail=True, methods=["get", "post"], url_path="attachments")
    def attachments(self, request, pk=None):
        """
        List or upload attachments for a claim.

        GET /api/sha/claims/{id}/attachments/
        POST /api/sha/claims/{id}/attachments/
        """
        claim = self.get_object()

        if request.method == "GET":
            serializer = SHAClaimAttachmentSerializer(claim.attachments.all(), many=True)
            return Response(serializer.data)

        elif request.method == "POST":
            file = request.FILES.get("file")
            if not file:
                return Response({"file": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

            # Validate file size
            max_size = 10 * 1024 * 1024  # 10MB
            if file.size > max_size:
                return Response(
                    {"file": "File size exceeds maximum of 10MB"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Validate file type
            allowed_types = [
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/tiff",
            ]
            if file.content_type not in allowed_types:
                return Response(
                    {"file": f"File type not allowed. Allowed: {', '.join(allowed_types)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Calculate checksum
            file_content = file.read()
            checksum = hashlib.sha256(file_content).hexdigest()
            file.seek(0)  # Reset file pointer

            attachment = SHAClaimAttachment.objects.create(
                claim=claim,
                attachment_type=request.data.get("attachment_type", "other"),
                name=request.data.get("name", file.name),
                description=request.data.get("description", ""),
                file=file,
                file_size=file.size,
                mime_type=file.content_type,
                checksum=checksum,
                original_filename=file.name,
                uploaded_by=request.user,
            )

            return Response(
                SHAClaimAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED
            )

    @drf_action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"attachments/(?P<attachment_id>[^/.]+)",
        parser_classes=[MultiPartParser, FormParser],
    )
    def attachment_detail(self, request, pk=None, attachment_id=None):
        """Update or delete a local claim attachment."""
        claim = self.get_object()
        attachment = get_object_or_404(claim.attachments, id=attachment_id)

        if request.method == "DELETE":
            attachment.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        allowed_types = {choice[0] for choice in SHAClaimAttachment.AttachmentType.choices}
        changed = False

        if "attachment_type" in request.data:
            attachment_type = str(request.data.get("attachment_type") or "").strip()
            if not attachment_type:
                return Response(
                    {"attachment_type": "attachment_type cannot be blank"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if attachment_type not in allowed_types:
                return Response(
                    {"attachment_type": "Invalid attachment_type"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            attachment.attachment_type = attachment_type
            changed = True

        if "name" in request.data:
            attachment.name = str(request.data.get("name") or "").strip()
            changed = True

        if "description" in request.data:
            attachment.description = str(request.data.get("description") or "").strip()
            changed = True

        file = request.FILES.get("file")
        if file:
            max_size = 10 * 1024 * 1024  # 10MB
            if file.size > max_size:
                return Response(
                    {"file": "File size exceeds maximum of 10MB"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            allowed_mime_types = {
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/tiff",
            }
            if file.content_type not in allowed_mime_types:
                return Response(
                    {
                        "file": (
                            "File type not allowed. Allowed: "
                            "application/pdf, image/jpeg, image/png, image/tiff"
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            file_content = file.read()
            checksum = hashlib.sha256(file_content).hexdigest()
            file.seek(0)

            attachment.file = file
            attachment.file_size = file.size
            attachment.mime_type = file.content_type
            attachment.checksum = checksum
            attachment.original_filename = file.name
            changed = True

        if not changed:
            return Response(SHAClaimAttachmentSerializer(attachment).data)

        attachment.save()
        return Response(SHAClaimAttachmentSerializer(attachment).data)
