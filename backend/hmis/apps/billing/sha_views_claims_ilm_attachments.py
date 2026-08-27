"""
What this file is for: ILM attachment upload/sync/removal actions for SHA claims.
How to use: mixed into SHAClaimViewSet via SHAClaimILMMixin composition.
Supported inputs/args: DRF multipart payloads for attachment operations and sync status retrieval.
"""

# ruff: noqa: ARG002

import hashlib
import logging
import os
from collections.abc import Mapping

from django.core.files.base import ContentFile
from rest_framework.decorators import action as drf_action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment
from hmis.apps.billing.sha_views_claims_helpers import (
    _build_attachment_sync_status,
    _stringify_error,
    _to_dha_document_type,
    _to_local_attachment_type,
)

logger = logging.getLogger(__name__)


class SHAClaimILMAttachmentsMixin:
    """ILM attachment upload/sync/removal actions for SHA claims."""

    @drf_action(
        detail=True,
        methods=["post"],
        url_path="ilm/attachments/add",
        parser_classes=[MultiPartParser, FormParser],
    )
    def ilm_add_attachment(self, request, pk=None):
        from hmis.apps.billing.services.multipart_builder import MultipartFile

        claim = self.get_object()
        files_in = request.FILES.getlist("files") or (
            [request.FILES["file"]] if "file" in request.FILES else []
        )
        if not files_in:
            return Response({"error": "files required"}, status=400)

        # Local pre-flight validation: size ≤ 2MB, type must be .jpg/.png/.pdf
        MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024  # 2MB per DHA spec
        ALLOWED_CONTENT_TYPES = {
            "application/pdf",
            "image/jpeg",
            "image/png",
        }
        ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
        for f in files_in:
            if f.size > MAX_ATTACHMENT_SIZE:
                return Response(
                    {
                        "error": (
                            f"File '{f.name}' exceeds maximum size of 2MB "
                            f"({f.size / (1024 * 1024):.1f}MB)."
                        ),
                        "code": "file_too_large",
                    },
                    status=400,
                )
            import os

            ext = os.path.splitext(f.name)[1].lower()
            content_type = (f.content_type or "").lower()
            if ext not in ALLOWED_EXTENSIONS:
                return Response(
                    {
                        "error": (
                            f"File '{f.name}' has unsupported extension '{ext}'. "
                            f"Allowed: .pdf, .jpg, .jpeg, .png"
                        ),
                        "code": "invalid_file_type",
                    },
                    status=400,
                )
            if content_type and content_type not in ALLOWED_CONTENT_TYPES:
                return Response(
                    {
                        "error": (
                            f"File '{f.name}' has unsupported content type '{content_type}'. "
                            f"Allowed: application/pdf, image/jpeg, image/png"
                        ),
                        "code": "invalid_file_type",
                    },
                    status=400,
                )

        # ECCIF 24h billing window guard
        if claim.is_emergency_claim and claim.is_time_barred:
            return Response(
                {
                    "error": "Emergency claim 24-hour billing window has expired.",
                    "code": "eccif_time_barred",
                },
                status=400,
            )

        prepared_uploads: list[dict[str, object]] = []
        multipart_files: list[MultipartFile] = []
        for file_obj in files_in:
            content = file_obj.read()
            prepared_uploads.append(
                {
                    "name": file_obj.name,
                    "content": content,
                    "content_type": file_obj.content_type or "application/octet-stream",
                }
            )
            multipart_files.append(
                MultipartFile(
                    field_name="file_blob",
                    filename=file_obj.name,
                    content=content,
                    content_type=file_obj.content_type or "application/octet-stream",
                )
            )
        extra = {k: v for k, v in request.data.items() if k not in ("files", "file")}
        if not extra.get("intervention_code"):
            extra["intervention_code"] = self._resolve_claim_intervention_code(claim)
        try:
            result = self._ilm_service(facility=claim.facility).add_attachment(
                claim,
                multipart_files,
                extra_fields=extra or None,
                user=request.user,
            )
        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError) as exc:
            return self._ilm_handle_error(exc)

        if result.status_code < 400:
            requested_doc_type = str(extra.get("document_type") or "").strip()
            local_attachment_type = _to_local_attachment_type(requested_doc_type)
            title_prefix = str(extra.get("document_title") or "").strip()
            description = str(extra.get("document_description") or "").strip()
            for entry in prepared_uploads:
                filename = str(entry["name"])
                content = entry["content"]
                content_type = str(entry["content_type"])
                if not isinstance(content, (bytes, bytearray)):
                    continue
                checksum = hashlib.sha256(content).hexdigest()
                attachment_name = title_prefix or filename
                local_attachment = SHAClaimAttachment(
                    claim=claim,
                    attachment_type=local_attachment_type,
                    name=attachment_name,
                    description=description,
                    file_size=len(content),
                    mime_type=content_type,
                    checksum=checksum,
                    original_filename=filename,
                    uploaded_by=request.user,
                )
                local_attachment.file.save(filename, ContentFile(content), save=False)
                local_attachment.save()
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/attachments/push-local")
    def ilm_push_local_attachments(self, request, pk=None):
        """Push existing local claim attachments to DHA ILM /claims/attachments."""
        from hmis.apps.billing.services.multipart_builder import MultipartFile

        claim = self.get_object()
        local_attachments = list(claim.attachments.all())
        if not local_attachments:
            return Response(
                {
                    "error": "No local attachments found on this claim.",
                    "local_count": 0,
                    "uploaded": 0,
                    "failed": 0,
                },
                status=400,
            )

        service = self._ilm_service(facility=claim.facility)

        sync_summary = None
        try:
            sync_summary = self._sync_missing_interventions_to_dha(
                claim,
                user=request.user,
                strict_preview=False,
            )
            if sync_summary and not bool(sync_summary.get("ok", True)):
                logger.warning(
                    "Intervention sync before push-local attachments not fully successful for claim %s: %s",
                    claim.id,
                    sync_summary,
                )
        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError) as exc:  # noqa: BLE001 - fail open for attachment push
            logger.warning(
                "Intervention sync before push-local attachments failed for claim %s: %s",
                claim.id,
                _stringify_error(exc),
            )

        intervention_codes = self._resolve_claim_intervention_codes(claim)
        if not intervention_codes:
            return Response(
                {
                    "error": "No active intervention found for this claim; cannot determine attachment intervention code.",
                    "code": "no_active_intervention",
                    "local_count": len(local_attachments),
                    "uploaded": 0,
                    "failed": len(local_attachments),
                },
                status=400,
            )

        uploaded = 0
        failed = 0
        errors: list[dict[str, str]] = []

        for attachment in local_attachments:
            try:
                if not attachment.file:
                    raise ValueError("Attachment file is missing")

                attachment.file.open("rb")
                try:
                    content = attachment.file.read()
                finally:
                    attachment.file.close()

                if not content:
                    raise ValueError("Attachment file is empty")

                filename = (
                    attachment.original_filename
                    or os.path.basename(getattr(attachment.file, "name", "") or "")
                    or f"attachment-{attachment.id}.bin"
                )

                multipart_file = MultipartFile(
                    field_name="file_blob",
                    filename=filename,
                    content=content,
                    content_type=attachment.mime_type or "application/octet-stream",
                )

                document_type = _to_dha_document_type(
                    attachment.attachment_type,
                    attachment_name=attachment.name,
                    original_filename=attachment.original_filename,
                )
                if document_type == "INVOICE" and claim.claim_type == SHAClaim.ClaimType.INPATIENT:
                    document_type = "FINAL_BILL"
                last_error = ""
                for intervention_code in intervention_codes:
                    extra_fields: dict[str, str] = {
                        "document_type": document_type,
                        "document_title": attachment.name,
                        "document_description": attachment.description or "",
                        "intervention_code": intervention_code,
                    }
                    result = service.add_attachment(
                        claim,
                        [multipart_file],
                        extra_fields=extra_fields,
                        user=request.user,
                    )
                    if int(getattr(result, "status_code", 500) or 500) < 400:
                        last_error = ""
                        break

                    payload = result.payload if isinstance(result.payload, Mapping) else {}
                    message = str(
                        payload.get("error")
                        or payload.get("message")
                        or payload.get("detail")
                        or "DHA rejected attachment upload"
                    )
                    last_error = f"intervention_code={intervention_code}: {message}"

                if last_error:
                    raise ValueError(last_error)
                uploaded += 1
            except (AttributeError, TypeError, RuntimeError, OSError, AssertionError) as exc:  # noqa: BLE001 - collect and continue
                failed += 1
                errors.append(
                    {
                        "attachment_id": str(attachment.id),
                        "attachment_name": attachment.name,
                        "error": _stringify_error(exc),
                    }
                )

        sync_status = _build_attachment_sync_status(claim)

        return Response(
            {
                "local_count": len(local_attachments),
                "uploaded": uploaded,
                "failed": failed,
                "errors": errors,
                "intervention_sync": sync_summary,
                "sync_status": sync_status,
            }
        )

    @drf_action(detail=True, methods=["get"], url_path="ilm/attachments/sync-status")
    def ilm_attachment_sync_status(self, request, pk=None):
        """Return strict local-vs-DHA attachment sync status for this claim."""
        claim = self.get_object()
        return Response(_build_attachment_sync_status(claim))

    @drf_action(detail=True, methods=["post"], url_path="ilm/attachments/remove")
    def ilm_remove_attachment(self, request, pk=None):
        claim = self.get_object()
        attachment_id = request.data.get("attachment_id")
        intervention_code = str(request.data.get("intervention_code") or "").strip()
        if not intervention_code:
            active_intervention = (
                claim.claim_interventions.filter(status="active").order_by("created_at").first()
            )
            intervention_code = (
                str(active_intervention.intervention_code).strip() if active_intervention else ""
            )
        if not attachment_id:
            return Response({"error": "attachment_id required"}, status=400)
        if not intervention_code:
            return Response({"error": "intervention_code required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).remove_attachment(
                claim,
                attachment_id=str(attachment_id),
                intervention_code=intervention_code,
                user=request.user,
            )
        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError) as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)
