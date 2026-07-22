from __future__ import annotations

import hashlib
from dataclasses import dataclass
from io import BytesIO

from django.core.files.base import ContentFile
from django.db.models import Q

from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment
from hmis.apps.billing.services.document_context import append_standard_header

AUTO_CLAIM_FORM_MARKER = "AUTO_CLAIM_FORM_FROM_CLAIM"


@dataclass
class ClaimFormAttachmentResult:
    attachment_id: int | None
    created: bool
    updated: bool
    skipped_reason: str = ""


class ClaimFormAttachmentService:
    """Ensure a local CLAIM_FORM-style attachment exists for a claim."""

    @classmethod
    def ensure_for_claim(cls, *, claim: SHAClaim, user) -> ClaimFormAttachmentResult:
        uploader = user or getattr(claim, "created_by", None)
        if uploader is None:
            return ClaimFormAttachmentResult(None, False, False, "missing_uploader")

        content = cls._render_claim_form_text(claim)
        if not content:
            return ClaimFormAttachmentResult(None, False, False, "no_claim_form_data")

        pdf_bytes = cls._render_pdf_bytes(content)
        filename = f"claim_form_{claim.claim_number}.pdf"
        checksum = hashlib.sha256(pdf_bytes).hexdigest()

        manual_existing = (
            claim.attachments.filter(
                Q(name__icontains="claim form") | Q(original_filename__icontains="claim_form")
            )
            .exclude(description__icontains=AUTO_CLAIM_FORM_MARKER)
            .order_by("-created_at")
            .first()
        )
        if manual_existing:
            return ClaimFormAttachmentResult(
                attachment_id=manual_existing.id,
                created=False,
                updated=False,
                skipped_reason="manual_claim_form_exists",
            )

        attachment = (
            claim.attachments.filter(description__icontains=AUTO_CLAIM_FORM_MARKER)
            .order_by("-created_at")
            .first()
        )
        if attachment is None:
            created = SHAClaimAttachment.objects.create(
                claim=claim,
                attachment_type=SHAClaimAttachment.AttachmentType.OTHER,
                name=f"Claim Form - {claim.claim_number}",
                description=(
                    "Auto-generated claim form from local claim demographics, diagnoses, "
                    f"and billed items | System Tag: {AUTO_CLAIM_FORM_MARKER}"
                ),
                file=ContentFile(pdf_bytes, name=filename),
                file_size=len(pdf_bytes),
                mime_type="application/pdf",
                checksum=checksum,
                original_filename=filename,
                uploaded_by=uploader,
            )
            return ClaimFormAttachmentResult(created.id, True, False, "")

        attachment.file.save(filename, ContentFile(pdf_bytes), save=False)
        attachment.name = f"Claim Form - {claim.claim_number}"
        attachment.description = (
            "Auto-generated claim form from local claim demographics, diagnoses, "
            f"and billed items | System Tag: {AUTO_CLAIM_FORM_MARKER}"
        )
        attachment.file_size = len(pdf_bytes)
        attachment.mime_type = "application/pdf"
        attachment.checksum = checksum
        attachment.original_filename = filename
        attachment.save(
            update_fields=[
                "file",
                "name",
                "description",
                "file_size",
                "mime_type",
                "checksum",
                "original_filename",
            ]
        )
        return ClaimFormAttachmentResult(attachment.id, False, True, "")

    @staticmethod
    def _render_claim_form_text(claim: SHAClaim) -> str | None:
        claim_items = list(claim.items.select_related("tariff").all())
        invoice = getattr(claim, "invoice", None)

        if not claim_items and not invoice:
            return None

        lines: list[str] = []
        append_standard_header(lines, title="CLAIM FORM", claim=claim)
        lines.extend(
            [
                "Claim Details",
                "-------------",
                f"Claim Type: {getattr(claim, 'claim_type', '') or 'N/A'}",
                f"Service Date: {getattr(claim, 'service_date', '') or 'N/A'}",
                f"DHA Invoice Number: {getattr(claim, 'dha_invoice_number', '') or 'N/A'}",
                "",
            ]
        )

        if invoice:
            lines.append(f"Local Invoice Number: {invoice.invoice_number or ''}")
            lines.append(f"Invoice Date: {invoice.invoice_date or ''}")
            lines.append("")

        if claim.primary_diagnosis_code or claim.primary_diagnosis_description:
            lines.append(
                "Primary Diagnosis: "
                f"{claim.primary_diagnosis_code or ''} {claim.primary_diagnosis_description or ''}".strip()
            )
            lines.append("")

        total = 0.0
        lines.extend(["Claim Items", "-----------"])
        for item in claim_items:
            qty = item.quantity or 0
            unit = item.unit_price or 0
            line_total = item.claimed_amount or (qty * unit)
            total += float(line_total or 0)
            tariff_code = getattr(item.tariff, "code", "") or ""
            lines.append(
                f"- {item.description or 'Service'} | Code: {tariff_code} | "
                f"Qty: {qty} | Unit: {unit} | Total: {line_total}"
            )

        lines.extend(["", f"Claimed Total: {total:.2f}"])
        return "\n".join(lines)

    @staticmethod
    def _render_pdf_bytes(content: str) -> bytes:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas

        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        x = 40
        y = height - 40
        max_width = width - 80
        line_height = 14

        for raw_line in content.splitlines() or [""]:
            line = raw_line or " "
            while line:
                chunk = line
                while pdf.stringWidth(chunk, "Helvetica", 10) > max_width and len(chunk) > 1:
                    chunk = chunk[:-1]
                pdf.setFont("Helvetica", 10)
                pdf.drawString(x, y, chunk)
                y -= line_height
                line = line[len(chunk) :]
                if y < 50:
                    pdf.showPage()
                    y = height - 40

        pdf.save()
        return buffer.getvalue()
