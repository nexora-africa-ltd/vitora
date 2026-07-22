# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
SHA Claims Workflow Automation Service for Vitora HMIS.

Implements automated claim lifecycle management:
1. Auto-trigger consent at check-in (queue addition)
2. Auto-start visit on encounter creation for SHA-eligible patients
3. Auto-populate interventions from clinical actions (lab, pharmacy, procedures)
4. Auto-attach digital documents to claims
5. Automated remittance fetch and reconciliation
6. Smart query response workflow (assignment + escalation)
7. Batch validation and bulk submission
8. Eligibility pre-check and caching at registration
9. Auto-submit preauth for routine procedures
10. End-of-day claims digest generation
"""

import logging
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from hmis.apps.billing.facility_identifiers import resolve_fr_code
from hmis.apps.billing.services.document_context import append_standard_header

logger = logging.getLogger(__name__)


def _resolve_fr_code(facility):
    """Resolve the DHA Facility Registry (FR) code for a facility.

    Priority: billing_config.sha_facility_fr_code > facility.dha_fr_code > fallback.
    Returns an empty string if none can be resolved.
    """
    if facility is None:
        return ""
    return resolve_fr_code(facility, allow_settings_fallback=False).value


class SHAClaimAutomationService:
    """
    Centralized service for SHA claim workflow automation.

    All automation methods are classmethod-style to enable easy
    invocation from Celery tasks and signal handlers.
    """

    # -------------------------------------------------------------------------
    # 1. Auto-trigger consent at check-in
    # -------------------------------------------------------------------------

    @classmethod
    def auto_trigger_consent(cls, patient_id: int, facility_id: int) -> dict:
        """
        Automatically send OTP consent when a SHA-eligible patient is queued.

        Called by the clinic queue signal when a patient is added to the queue.
        Only triggers if the patient has active SHA membership and no valid
        consent token from today.

        Returns:
            Dict with status: 'sent', 'already_valid', 'not_eligible', or 'error'
        """
        from hmis.apps.billing.models import ConsentToken, SHAMember
        from hmis.apps.billing.services.sha_consent import SHAConsentService

        try:
            from hmis.apps.core.models import Facility

            facility = Facility.objects.filter(pk=facility_id).first()
            if not facility:
                return {"status": "error", "reason": f"Facility {facility_id} not found"}

            # Check SHA membership
            sha_member = SHAMember.objects.filter(
                patient_id=patient_id,
                status=SHAMember.MembershipStatus.ACTIVE,
            ).first()

            if not sha_member:
                return {"status": "not_eligible", "reason": "No active SHA membership"}

            # Check if consent already sent or validated today (avoid duplicate OTP)
            today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            existing_consent = ConsentToken.objects.filter(
                sha_member=sha_member,
                created_at__gte=today_start,
                status__in=[
                    ConsentToken.ConsentStatus.PENDING,
                    ConsentToken.ConsentStatus.VALIDATED,
                ],
            ).first()

            if existing_consent:
                status_label = (
                    "already_valid"
                    if existing_consent.status == ConsentToken.ConsentStatus.VALIDATED
                    else "already_sent"
                )
                return {
                    "status": status_label,
                    "reason": f"Consent token already {existing_consent.status} today",
                }

            # Auto-send OTP
            service = SHAConsentService(facility=facility)
            # Resolve DHA FR code for the agent payload
            agent_code = _resolve_fr_code(facility) or facility.mfl_code or ""
            result = service.send_otp(
                sha_member=sha_member,
                facility_code=agent_code,
                user=None,
                facility=facility,
            )

            from hmis.apps.core.events import BillingEvents, publish_event

            publish_event(
                event_type=BillingEvents.CONSENT_OTP_SENT,
                aggregate_type="SHAConsentToken",
                aggregate_id=sha_member.pk,
                payload={
                    "patient_id": patient_id,
                    "trigger": "auto_queue_checkin",
                    "facility_id": facility_id,
                },
                facility_id=facility_id,
            )

            return {"status": "sent", "result": result}

        except Exception as e:
            logger.warning(
                "Auto-consent trigger failed for patient %s: %s",
                patient_id,
                str(e),
            )
            return {"status": "error", "reason": str(e)}

    # -------------------------------------------------------------------------
    # 2. Auto-start visit on encounter creation
    # -------------------------------------------------------------------------

    @classmethod
    def auto_start_visit(cls, encounter_id: int) -> dict:
        """
        Automatically start a DHA visit when a SHA-eligible encounter is created.

        Requires valid consent token. If no consent, queues for retry.
        For OTP consent, auto-start is not possible (OTP code is not stored);
        the user must start the visit manually via the StartVisitView.

        Returns:
            Dict with status: 'started', 'no_consent', 'not_eligible',
            'already_started', 'needs_manual_start', 'error'
        """
        from hmis.apps.billing.models import ConsentToken, SHAClaim, SHAMember
        from hmis.apps.billing.services.ilm_claim_service import IlmClaimService
        from hmis.apps.encounters.models import Encounter

        try:
            encounter = Encounter.objects.select_related("patient", "facility").get(pk=encounter_id)

            # Check if this encounter already has a claim with visit started
            existing_claim = SHAClaim.objects.filter(
                encounter=encounter,
                dha_visit_started_at__isnull=False,
            ).exists()

            if existing_claim:
                return {"status": "already_started"}

            # Check SHA membership
            sha_member = SHAMember.objects.filter(
                patient=encounter.patient,
                status=SHAMember.MembershipStatus.ACTIVE,
            ).first()

            if not sha_member:
                return {"status": "not_eligible", "reason": "No active SHA membership"}

            # Find valid consent token
            today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            consent_token = ConsentToken.objects.filter(
                sha_member=sha_member,
                created_at__gte=today_start,
                status=ConsentToken.ConsentStatus.VALIDATED,
            ).first()

            if not consent_token:
                return {"status": "no_consent", "reason": "No valid consent token"}

            # Find or create the SHA claim for this encounter
            claim = SHAClaim.objects.filter(encounter=encounter).first()
            if not claim:
                return {"status": "no_claim", "reason": "No SHA claim for encounter"}

            # Auto-start only works for biometric consent (auth_guid is stored).
            # OTP code is not stored on ConsentToken for security — the user
            # must start the visit manually via StartVisitView.
            if not consent_token.auth_guid:
                return {
                    "status": "needs_manual_start",
                    "reason": "OTP consent requires manual visit start via StartVisitView",
                }

            # Start the visit
            facility = encounter.facility
            service = IlmClaimService(facility=facility)

            # Derive intervention codes from encounter clinical data,
            # falling back to codes sent with the OTP request
            from hmis.apps.billing.services.ilm_claim_service import StartVisitParams

            suggestions = cls.suggest_interventions_for_encounter(encounter_id)
            codes = [s["code"] for s in suggestions] or (consent_token.intervention_codes or [])

            service_type = "INPATIENT" if encounter.encounter_type == "IPD" else "OUTPATIENT"
            params = StartVisitParams(
                otp="",
                auth_guid=consent_token.auth_guid,
                patient_id=consent_token.identification_number,
                intervention_codes=codes,
                service_type=service_type,
            )

            result = service.start_visit(
                claim=claim,
                params=params,
                user=None,
            )

            if result and result.status_code < 400:
                claim.dha_visit_started_at = timezone.now()
                claim.save(update_fields=["dha_visit_started_at", "updated_at"])

                from hmis.apps.core.events import BillingEvents, publish_event

                publish_event(
                    event_type=BillingEvents.DHA_CLAIM_VISIT_STARTED,
                    aggregate_type="SHAClaim",
                    aggregate_id=claim.pk,
                    payload={
                        "claim_number": claim.claim_number,
                        "encounter_id": encounter_id,
                        "trigger": "auto_encounter_created",
                    },
                    facility_id=getattr(facility, "id", None),
                )

                return {"status": "started", "claim_id": claim.pk}

            return {"status": "error", "reason": "DHA visit start returned failure"}

        except Exception as e:
            logger.exception("Auto-start visit failed for encounter %s", encounter_id)
            return {"status": "error", "reason": str(e)}

    # -------------------------------------------------------------------------
    # 3. Auto-populate interventions from clinical actions
    # -------------------------------------------------------------------------

    @classmethod
    def suggest_interventions_for_encounter(cls, encounter_id: int) -> list[dict]:
        """
        Suggest SHA interventions based on clinical actions recorded on an encounter.

        Maps lab orders, prescriptions, and procedures to SHA intervention codes
        using the SHATariff catalog.

        NOTE: This performs LOCAL matching only (fast, offline-capable). It does NOT
        call DHA to verify entitlement or check utilization caps. The frontend
        should call `ilmBenefitInterventions` and `ilmUtilization` to verify that
        the patient is entitled to a suggested intervention before attaching it.
        Each suggestion includes a `needs_entitlement_check: true` flag to signal
        this to the frontend.

        Returns:
            List of suggested interventions with codes, names, and source references.
        """
        from hmis.apps.billing.models import SHAClaim, SHAClaimIntervention
        from hmis.apps.encounters.models import Encounter

        try:
            encounter = Encounter.objects.get(pk=encounter_id)
            suggestions = []

            # Get the claim for this encounter
            claim = SHAClaim.objects.filter(encounter=encounter).first()
            if not claim:
                return []

            # Already-attached intervention codes (avoid duplicates)
            existing_codes = set(
                SHAClaimIntervention.objects.filter(claim=claim).values_list(
                    "intervention_code", flat=True
                )
            )

            # --- Lab orders → SHA lab interventions ---
            lab_orders = encounter.lab_orders.all() if hasattr(encounter, "lab_orders") else []
            for order in lab_orders:
                matched = cls._match_intervention(
                    order.test_name if hasattr(order, "test_name") else str(order),
                    category="laboratory",
                )
                for intervention in matched:
                    if intervention["code"] not in existing_codes:
                        suggestions.append(
                            {
                                **intervention,
                                "source": "lab_order",
                                "source_id": order.pk,
                                "source_name": getattr(order, "test_name", str(order)),
                                "needs_entitlement_check": True,
                            }
                        )

            # --- Prescriptions → SHA pharmacy interventions ---
            prescriptions = (
                encounter.prescriptions.all() if hasattr(encounter, "prescriptions") else []
            )
            for rx in prescriptions:
                matched = cls._match_intervention(
                    rx.medication_name if hasattr(rx, "medication_name") else str(rx),
                    category="pharmacy",
                )
                for intervention in matched:
                    if intervention["code"] not in existing_codes:
                        suggestions.append(
                            {
                                **intervention,
                                "source": "prescription",
                                "source_id": rx.pk,
                                "source_name": getattr(rx, "medication_name", str(rx)),
                                "needs_entitlement_check": True,
                            }
                        )

            # --- Diagnoses → SHA consultation/management interventions ---
            diagnoses = encounter.diagnoses.all() if hasattr(encounter, "diagnoses") else []
            for dx in diagnoses:
                matched = cls._match_intervention(
                    dx.description if hasattr(dx, "description") else str(dx),
                    category="consultation",
                )
                for intervention in matched:
                    if intervention["code"] not in existing_codes:
                        suggestions.append(
                            {
                                **intervention,
                                "source": "diagnosis",
                                "source_id": dx.pk,
                                "source_name": getattr(dx, "description", str(dx)),
                                "needs_entitlement_check": True,
                            }
                        )

            return suggestions

        except Exception as e:
            logger.warning("Intervention suggestion failed for encounter %s: %s", encounter_id, e)
            return []

    @classmethod
    def _match_intervention(cls, search_term: str, category: str = "") -> list[dict]:
        """
        Match a clinical term to SHA tariff codes using keyword search.

        Uses the local SHATariff catalog (refreshed weekly from OCL).
        """
        from hmis.apps.billing.models import SHATariff

        if not search_term:
            return []

        queryset = SHATariff.objects.filter(is_active=True)

        # Category-based filtering
        if category == "laboratory":
            queryset = queryset.filter(category=SHATariff.TariffCategory.LABORATORY)
        elif category == "pharmacy":
            queryset = queryset.filter(category=SHATariff.TariffCategory.PHARMACY)
        elif category == "consultation":
            queryset = queryset.filter(category=SHATariff.TariffCategory.CONSULTATION)

        # Keyword search
        keywords = search_term.split()[:3]  # Use first 3 words
        q_filter = Q()
        for keyword in keywords:
            if len(keyword) > 2:  # Skip short words
                q_filter |= Q(name__icontains=keyword)

        if q_filter:
            queryset = queryset.filter(q_filter)

        results = []
        for tariff in queryset[:5]:  # Max 5 suggestions per term
            results.append(
                {
                    "code": tariff.code,
                    "name": tariff.name,
                    "tariff": str(tariff.amount) if hasattr(tariff, "amount") else None,
                    "benefit_package": tariff.category,
                }
            )

        return results

    @classmethod
    def auto_attach_interventions(cls, claim_id: int, interventions: list[dict]) -> dict:
        """
        Attach suggested interventions to a claim automatically.

        Only attaches if the claim is still in DRAFT status.

        Args:
            claim_id: SHAClaim primary key
            interventions: List of intervention dicts from suggest_interventions_for_encounter

        Returns:
            Dict with 'attached' count and 'skipped' count.
        """
        from hmis.apps.billing.models import SHAClaim, SHAClaimIntervention

        try:
            claim = SHAClaim.objects.get(pk=claim_id)
            if claim.status != SHAClaim.ClaimStatus.DRAFT:
                return {"attached": 0, "skipped": len(interventions), "reason": "not_draft"}

            attached = 0
            skipped = 0

            for intervention in interventions:
                # Check if already exists
                exists = SHAClaimIntervention.objects.filter(
                    claim=claim,
                    intervention_code=intervention["code"],
                ).exists()

                if exists:
                    skipped += 1
                    continue

                SHAClaimIntervention.objects.create(
                    claim=claim,
                    intervention_code=intervention["code"],
                    intervention_name=intervention.get("name", ""),
                    tariff_amount=(
                        Decimal(intervention["tariff"]) if intervention.get("tariff") else None
                    ),
                )
                attached += 1

            return {"attached": attached, "skipped": skipped}

        except Exception as e:
            logger.exception("Auto-attach interventions failed for claim %s", claim_id)
            return {"attached": 0, "skipped": 0, "error": str(e)}

    # -------------------------------------------------------------------------
    # 4. Auto-attach digital documents
    # -------------------------------------------------------------------------

    @classmethod
    def auto_attach_documents(cls, claim_id: int) -> dict:
        """
        Auto-generate and attach digital documents to a SHA claim.

        The DHA HIE attachment endpoint accepts multipart file uploads.
        This method renders clinical data (lab results, notes, prescriptions)
        to simple text/PDF-like content, saves to a Django FileField, and
        creates local SHAClaimAttachment records. On claim submission, the
        existing IlmClaimService.add_attachment() picks them up and POSTs
        to DHA's /api/v1/claims/attachments as multipart.

        Returns:
            Dict with 'attached' count, 'already_attached' count, and details.
        """
        from django.core.files.base import ContentFile

        from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment

        try:
            claim = SHAClaim.objects.select_related("encounter", "patient").get(pk=claim_id)
            encounter = claim.encounter
            if not encounter:
                return {"attached": 0, "error": "No encounter linked"}

            # Get existing attachment types for this claim
            existing_types = set(
                SHAClaimAttachment.objects.filter(claim=claim).values_list(
                    "attachment_type", flat=True
                )
            )

            attached = 0
            already_attached = 0

            # --- Lab results → lab_report ---
            if "lab_report" not in existing_types:
                lab_content = cls._render_lab_results_text(encounter, claim)
                if lab_content:
                    pdf_bytes = cls._render_text_pdf_bytes(lab_content)
                    file_obj = ContentFile(pdf_bytes, name=f"lab_results_{claim.claim_number}.pdf")
                    SHAClaimAttachment.objects.create(
                        claim=claim,
                        attachment_type="lab_report",
                        name=f"Lab Results - {claim.claim_number}",
                        description=(
                            "Auto-generated laboratory results report from verified encounter "
                            "lab results for claim support"
                        ),
                        file=file_obj,
                        file_size=len(pdf_bytes),
                        mime_type="application/pdf",
                        original_filename=f"lab_results_{claim.claim_number}.pdf",
                        uploaded_by=claim.created_by,
                    )
                    attached += 1
            else:
                already_attached += 1

            # --- Clinical notes → clinical_notes ---
            if "clinical_notes" not in existing_types:
                notes_content = cls._render_clinical_notes_text(encounter, claim.patient, claim)
                if notes_content:
                    pdf_bytes = cls._render_text_pdf_bytes(notes_content)
                    file_obj = ContentFile(
                        pdf_bytes,
                        name=f"clinical_notes_{claim.claim_number}.pdf",
                    )
                    SHAClaimAttachment.objects.create(
                        claim=claim,
                        attachment_type="clinical_notes",
                        name=f"Clinical Notes - {claim.claim_number}",
                        description=(
                            "Auto-generated clinical notes summary from encounter narrative, "
                            "structured vitals, and inpatient timeline"
                        ),
                        file=file_obj,
                        file_size=len(pdf_bytes),
                        mime_type="application/pdf",
                        original_filename=f"clinical_notes_{claim.claim_number}.pdf",
                        uploaded_by=claim.created_by,
                    )
                    attached += 1
            else:
                already_attached += 1

            # --- Invoice summary → invoice (required for submission validation) ---
            if "invoice" not in existing_types:
                invoice_content = cls._render_invoice_text(claim)
                if invoice_content:
                    pdf_bytes = cls._render_text_pdf_bytes(invoice_content)
                    file_obj = ContentFile(pdf_bytes, name=f"invoice_{claim.claim_number}.pdf")
                    SHAClaimAttachment.objects.create(
                        claim=claim,
                        attachment_type="invoice",
                        name=f"Invoice - {claim.claim_number}",
                        description=(
                            "Auto-generated invoice summary from linked invoice or claim line items"
                        ),
                        file=file_obj,
                        file_size=len(pdf_bytes),
                        mime_type="application/pdf",
                        original_filename=f"invoice_{claim.claim_number}.pdf",
                        uploaded_by=claim.created_by,
                    )
                    attached += 1
            else:
                already_attached += 1

            # --- Prescriptions → prescription ---
            if "prescription" not in existing_types:
                rx_content = cls._render_prescriptions_text(encounter, claim)
                if rx_content:
                    pdf_bytes = cls._render_text_pdf_bytes(rx_content)
                    file_obj = ContentFile(
                        pdf_bytes,
                        name=f"prescriptions_{claim.claim_number}.pdf",
                    )
                    SHAClaimAttachment.objects.create(
                        claim=claim,
                        attachment_type="prescription",
                        name=f"Prescriptions - {claim.claim_number}",
                        description=(
                            "Auto-generated prescription record from encounter medication orders"
                        ),
                        file=file_obj,
                        file_size=len(pdf_bytes),
                        mime_type="application/pdf",
                        original_filename=f"prescriptions_{claim.claim_number}.pdf",
                        uploaded_by=claim.created_by,
                    )
                    attached += 1
            else:
                already_attached += 1

            return {"attached": attached, "already_attached": already_attached}

        except Exception as e:
            logger.exception("Auto-attach documents failed for claim %s", claim_id)
            return {"attached": 0, "error": str(e)}

    @classmethod
    def _render_text_pdf_bytes(cls, content: str) -> bytes:
        """Render plain text into a simple PDF byte stream for SHA attachments."""
        from io import BytesIO

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

    @classmethod
    def _render_invoice_text(cls, claim) -> str | None:
        """Render invoice summary text for required invoice attachment.

        Preferred source: linked local invoice.
        Fallback source: SHA claim items + DHA invoice number.
        """
        invoice = getattr(claim, "invoice", None)
        if invoice:
            lines: list[str] = []
            append_standard_header(lines, title="INVOICE SUMMARY", claim=claim)
            lines.extend(
                [
                    "Invoice Context",
                    "---------------",
                    f"Invoice Number: {invoice.invoice_number or 'N/A'}",
                    f"Invoice Date: {invoice.invoice_date or 'N/A'}",
                    "",
                    "Invoice Lines",
                    "-------------",
                ]
            )

            items = list(invoice.items.all()) if hasattr(invoice, "items") else []
            if items:
                for item in items:
                    description = getattr(item, "description", "") or getattr(
                        item, "service_name", ""
                    )
                    quantity = getattr(item, "quantity", "")
                    unit_price = getattr(item, "unit_price", "")
                    line_total = getattr(item, "line_total", "")
                    lines.append(
                        f"- {description} | Qty: {quantity} | Unit: {unit_price} | Total: {line_total}"
                    )
            else:
                lines.append("No invoice line items found.")

            total_amount = getattr(invoice, "total_amount", None)
            if total_amount is not None:
                lines.extend(["", f"Invoice Total: {total_amount}"])

            return "\n".join(lines)

        # Fallback: render from claim items + DHA invoice number.
        claim_items = (
            list(claim.items.select_related("tariff").all()) if hasattr(claim, "items") else []
        )
        dha_invoice_number = getattr(claim, "dha_invoice_number", "") or ""

        if not claim_items and not dha_invoice_number:
            return None

        lines: list[str] = []
        append_standard_header(lines, title="INVOICE SUMMARY (AUTO-GENERATED)", claim=claim)
        lines.extend(
            [
                "Invoice Context",
                "---------------",
                f"DHA Invoice Number: {dha_invoice_number or 'N/A'}",
                f"Service Date: {getattr(claim, 'service_date', '') or 'N/A'}",
                "Source: SHA claim items (no linked local invoice)",
                "",
                "Claim Item Lines",
                "----------------",
            ]
        )

        if claim_items:
            for item in claim_items:
                tariff_code = getattr(getattr(item, "tariff", None), "code", "") or ""
                description = getattr(item, "description", "") or ""
                quantity = getattr(item, "quantity", "")
                unit_price = getattr(item, "unit_price", "")
                line_total = getattr(item, "claimed_amount", "")
                code_prefix = f"[{tariff_code}] " if tariff_code else ""
                lines.append(
                    f"- {code_prefix}{description} | Qty: {quantity} | Unit: {unit_price} | Total: {line_total}"
                )
        else:
            lines.append("No SHA claim items found.")

        claimed_total = getattr(claim, "claimed_amount", None)
        if claimed_total is not None:
            lines.extend(["", f"Claim Total: {claimed_total}"])

        return "\n".join(lines)

    @classmethod
    def _render_lab_results_text(cls, encounter, claim=None) -> str | None:
        """Render verified lab results as structured text for SHA attachment."""
        lab_results = cls._get_completed_lab_results(encounter)
        if not lab_results:
            return None

        lines: list[str] = []
        if claim is not None:
            append_standard_header(lines, title="LABORATORY RESULTS REPORT", claim=claim)
            lines.extend(
                [
                    "Encounter Context",
                    "-----------------",
                    f"Patient: {encounter.patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    "",
                    "Verified Results",
                    "----------------",
                ]
            )
        else:
            lines.extend(
                [
                    "LABORATORY RESULTS REPORT",
                    f"Patient: {encounter.patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M')}",
                    "-" * 50,
                    "",
                ]
            )

        for result in lab_results:
            test_name = getattr(result, "test_name", "") or getattr(result, "test", "")
            value = getattr(result, "value", "") or getattr(result, "result_value", "")
            unit = getattr(result, "unit", "") or ""
            ref_range = getattr(result, "reference_range", "") or ""
            status = getattr(result, "status", "")

            lines.append(f"Test: {test_name or 'Unnamed test'}")
            lines.append(f"  Result: {value} {unit}")
            if ref_range:
                lines.append(f"  Reference Range: {ref_range}")
            if status:
                lines.append(f"  Status: {status}")
            lines.append("")

        return "\n".join(lines)

    @classmethod
    def _render_clinical_notes_text(cls, encounter, patient, claim=None) -> str | None:
        """Render clinical notes as structured text for SHA attachment."""
        chief_complaint = encounter.chief_complaint or ""
        clinical_notes = getattr(encounter, "clinical_notes", "") or ""
        encounter_notes = getattr(encounter, "notes", "") or ""
        inpatient_summary = ""
        discharge_summary = ""

        if getattr(encounter, "encounter_type", "") == "IPD":
            try:
                from hmis.apps.inpatient.services.clinical_summary import (
                    compose_inpatient_clinical_summary_text,
                )

                inpatient_summary = compose_inpatient_clinical_summary_text(encounter)
            except Exception:  # noqa: S110 - best effort summary enrichment
                inpatient_summary = ""

            discharge = getattr(getattr(encounter, "admission", None), "discharge", None)
            if discharge is not None:
                discharge_lines = ["DISCHARGE SUMMARY", "-" * 50]
                discharge_date = getattr(discharge, "discharge_date", None)
                if discharge_date is not None:
                    discharge_lines.append(f"Discharge date: {discharge_date}")

                discharge_type = ""
                if hasattr(discharge, "get_discharge_type_display"):
                    discharge_type = discharge.get_discharge_type_display() or ""
                if discharge_type:
                    discharge_lines.append(f"Discharge type: {discharge_type}")

                final_dx = getattr(discharge, "final_diagnosis_text", "") or getattr(
                    discharge, "final_diagnosis", ""
                )
                if final_dx:
                    discharge_lines.append(f"Final diagnosis: {final_dx}")

                treatment_summary = getattr(discharge, "treatment_summary", "") or ""
                if treatment_summary:
                    discharge_lines.append("")
                    discharge_lines.append("Treatment summary:")
                    discharge_lines.append(treatment_summary)

                procedures = getattr(discharge, "procedures_performed", "") or ""
                if procedures:
                    discharge_lines.append("")
                    discharge_lines.append("Procedures performed:")
                    discharge_lines.append(procedures)

                discharge_meds = getattr(discharge, "discharge_medications", []) or []
                if isinstance(discharge_meds, list) and discharge_meds:
                    discharge_lines.append("")
                    discharge_lines.append("Discharge medications:")
                    for med in discharge_meds[:20]:
                        if not isinstance(med, dict):
                            continue
                        drug_name = str(med.get("drug_name") or "").strip()
                        dosage = str(med.get("dosage") or "").strip()
                        frequency = str(med.get("frequency") or "").strip()
                        duration = str(med.get("duration") or "").strip()
                        med_line = drug_name or "Medication"
                        details = ", ".join(x for x in [dosage, frequency, duration] if x)
                        if details:
                            med_line = f"{med_line} ({details})"
                        discharge_lines.append(f"- {med_line}")

                patient_instructions = getattr(discharge, "patient_instructions", "") or ""
                if patient_instructions:
                    discharge_lines.append("")
                    discharge_lines.append("Patient instructions:")
                    discharge_lines.append(patient_instructions)

                discharge_summary = "\n".join(discharge_lines).strip()

        if (
            not chief_complaint
            and not clinical_notes
            and not encounter_notes
            and not inpatient_summary
            and not discharge_summary
        ):
            return None

        lines: list[str] = []
        if claim is not None:
            append_standard_header(lines, title="CLINICAL NOTES", claim=claim)
            lines.extend(
                [
                    "Encounter Context",
                    "-----------------",
                    f"Patient: {patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    f"Encounter Type: {encounter.encounter_type}",
                    "",
                ]
            )
        else:
            lines.extend(
                [
                    "CLINICAL NOTES",
                    f"Patient: {patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    f"Encounter Type: {encounter.encounter_type}",
                    f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M')}",
                    "-" * 50,
                    "",
                ]
            )

        if chief_complaint:
            lines.append(f"Chief Complaint: {chief_complaint}")
            lines.append("")

        if clinical_notes:
            lines.append("Clinical Notes:")
            lines.append(clinical_notes)
            lines.append("")

        if encounter_notes:
            lines.append("Encounter Notes:")
            lines.append(encounter_notes)
            lines.append("")

        if inpatient_summary:
            lines.append(inpatient_summary)
            lines.append("")

        if discharge_summary:
            lines.append(discharge_summary)
            lines.append("")

        # Include diagnoses if available
        diagnoses = encounter.diagnoses.all() if hasattr(encounter, "diagnoses") else []
        if diagnoses:
            lines.append("Diagnoses:")
            for dx in diagnoses:
                code = (getattr(dx, "icd_code", "") or getattr(dx, "code", "") or "").strip()
                desc = (getattr(dx, "description", "") or "").strip()
                if not code and not desc:
                    fallback_code = str(getattr(claim, "primary_diagnosis_code", "") or "").strip()
                    fallback_desc = str(
                        getattr(claim, "primary_diagnosis_description", "") or ""
                    ).strip()
                    if fallback_code or fallback_desc:
                        lines.append(
                            f"  - {fallback_code or 'N/A'}: {fallback_desc or 'Primary diagnosis'}"
                        )
                    continue
                if code and desc:
                    lines.append(f"  - {code}: {desc}")
                elif code:
                    lines.append(f"  - {code}")
                else:
                    lines.append(f"  - {desc}")
            lines.append("")

        # Include vitals if available
        vitals = []
        if encounter.temperature:
            vitals.append(f"Temp: {encounter.temperature}°C")
        if encounter.pulse:
            vitals.append(f"Pulse: {encounter.pulse} bpm")
        if encounter.blood_pressure:
            vitals.append(f"BP: {encounter.blood_pressure}")
        if encounter.spo2:
            vitals.append(f"SpO2: {encounter.spo2}%")
        if vitals:
            lines.append(f"Vitals: {', '.join(vitals)}")
            lines.append("")

        return "\n".join(lines)

    @classmethod
    def _render_prescriptions_text(cls, encounter, claim=None) -> str | None:
        """Render prescriptions as structured text for SHA attachment."""
        prescriptions = cls._get_encounter_prescriptions(encounter)
        if not prescriptions:
            return None

        lines: list[str] = []
        if claim is not None:
            append_standard_header(lines, title="PRESCRIPTION RECORD", claim=claim)
            lines.extend(
                [
                    "Encounter Context",
                    "-----------------",
                    f"Patient: {encounter.patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    "",
                    "Prescription Lines",
                    "------------------",
                ]
            )
        else:
            lines.extend(
                [
                    "PRESCRIPTION RECORD",
                    f"Patient: {encounter.patient}",
                    f"Encounter Date: {encounter.encounter_date}",
                    f"Generated: {timezone.now().strftime('%Y-%m-%d %H:%M')}",
                    "-" * 50,
                    "",
                ]
            )

        for rx in prescriptions:
            med_name = getattr(rx, "medication_name", "") or getattr(rx, "drug_name", "") or str(rx)
            dosage = getattr(rx, "dosage", "") or ""
            frequency = getattr(rx, "frequency", "") or ""
            duration = getattr(rx, "duration", "") or ""

            lines.append(f"Medication: {med_name}")
            if dosage:
                lines.append(f"  Dosage: {dosage}")
            if frequency:
                lines.append(f"  Frequency: {frequency}")
            if duration:
                lines.append(f"  Duration: {duration}")
            lines.append("")

        return "\n".join(lines)

    @classmethod
    def _get_completed_lab_results(cls, encounter):
        """Get completed lab results for an encounter."""
        try:
            from hmis.apps.laboratory.models import LabResult

            return list(
                LabResult.objects.filter(
                    order__encounter=encounter,
                    status="VERIFIED",
                )
            )
        except Exception:
            return []

    @classmethod
    def _get_encounter_prescriptions(cls, encounter):
        """Get prescriptions linked to an encounter."""
        try:
            from hmis.apps.pharmacy.models import Prescription

            return list(Prescription.objects.filter(encounter=encounter))
        except Exception:
            return []

    # -------------------------------------------------------------------------
    # 5. Remittance fetch and reconciliation
    # -------------------------------------------------------------------------

    @classmethod
    def fetch_and_reconcile_remittances(cls, facility_id: int | None = None) -> dict:
        """
        Fetch remittances from DHA and reconcile against local claims.

        If facility_id is None, processes all facilities with SHA integration.

        Returns:
            Dict with 'facilities_processed', 'remittances_fetched', 'claims_reconciled'.
        """
        from hmis.apps.billing.services.sha_remittance import SHARemittanceService
        from hmis.apps.core.models import Facility

        result = {"facilities_processed": 0, "remittances_fetched": 0, "claims_reconciled": 0}

        try:
            if facility_id:
                facilities = Facility.objects.filter(pk=facility_id)
            else:
                # All facilities with MFL codes (SHA-enabled)
                facilities = Facility.objects.exclude(Q(mfl_code="") | Q(mfl_code__isnull=True))

            service = SHARemittanceService()

            for facility in facilities:
                try:
                    # Resolve DHA FR code for remittance fetch
                    fr_code = _resolve_fr_code(facility) or facility.mfl_code or ""
                    remittances = service.fetch_remittances(
                        facility_code=fr_code,
                        facility=facility,
                    )
                    result["facilities_processed"] += 1
                    result["remittances_fetched"] += len(remittances)

                    # Reconciliation happens inside fetch_remittances
                    for remittance in remittances:
                        result["claims_reconciled"] += getattr(remittance, "reconciled_count", 0)

                except Exception as e:
                    logger.warning(
                        "Remittance fetch failed for facility %s: %s",
                        facility.mfl_code,
                        str(e),
                    )

            return result

        except Exception as e:
            logger.exception("Remittance fetch and reconcile failed")
            return {**result, "error": str(e)}

    # -------------------------------------------------------------------------
    # 6. Smart query response workflow
    # -------------------------------------------------------------------------

    @classmethod
    def handle_claim_query(cls, claim_id: int) -> dict:
        """
        Handle a claim that received a QUERY status from SHA.

        Actions:
        - Assign the query to the encounter's clinician
        - Calculate response deadline (14 days)
        - Publish high-priority notification
        - Pre-populate available data for response

        Returns:
            Dict with assignment and deadline info.
        """
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.core.events import publish_event

        try:
            claim = SHAClaim.objects.select_related(
                "encounter", "encounter__created_by", "facility"
            ).get(pk=claim_id)

            # Calculate deadline (14 days from query)
            query_raised_at = claim.updated_at  # When status changed to QUERY
            deadline = query_raised_at + timedelta(days=14)
            hours_remaining = (deadline - timezone.now()).total_seconds() / 3600

            # Assign to encounter clinician
            assigned_to = None
            if claim.encounter and claim.encounter.created_by:
                assigned_to = claim.encounter.created_by

            # Publish high-priority notification event
            publish_event(
                event_type="billing.sha_claim.query_assigned",
                aggregate_type="SHAClaim",
                aggregate_id=claim.pk,
                payload={
                    "claim_number": claim.claim_number,
                    "claim_id": claim.pk,
                    "assigned_to_id": assigned_to.pk if assigned_to else None,
                    "assigned_to_name": assigned_to.get_full_name() if assigned_to else None,
                    "deadline": deadline.isoformat(),
                    "hours_remaining": round(hours_remaining, 1),
                    "patient_name": str(claim.patient) if claim.patient else "",
                    "priority": "high",
                    "trigger": "claim_query_received",
                },
                facility_id=claim.facility_id,
            )

            return {
                "status": "assigned",
                "assigned_to": assigned_to.get_full_name() if assigned_to else None,
                "deadline": deadline.isoformat(),
                "hours_remaining": round(hours_remaining, 1),
            }

        except Exception as e:
            logger.exception("Handle claim query failed for claim %s", claim_id)
            return {"status": "error", "reason": str(e)}

    @classmethod
    def escalate_overdue_queries(cls) -> dict:
        """
        Escalate queries approaching deadline (< 48h remaining).

        Notifies facility admin and publishes escalation event.

        Returns:
            Dict with 'escalated' count.
        """
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.core.events import publish_event

        escalated = 0
        now = timezone.now()
        cutoff_48h = now + timedelta(hours=48)

        query_claims = SHAClaim.objects.filter(
            status=SHAClaim.ClaimStatus.QUERY,
        ).select_related("facility")

        for claim in query_claims:
            deadline = claim.time_barring_deadline
            if deadline and now < deadline <= cutoff_48h:
                hours_remaining = (deadline - now).total_seconds() / 3600

                publish_event(
                    event_type="billing.sha_claim.query_escalated",
                    aggregate_type="SHAClaim",
                    aggregate_id=claim.pk,
                    payload={
                        "claim_number": claim.claim_number,
                        "claim_id": claim.pk,
                        "hours_remaining": round(hours_remaining, 1),
                        "deadline": deadline.isoformat(),
                        "priority": "critical",
                    },
                    facility_id=claim.facility_id,
                )
                escalated += 1

        return {"escalated": escalated}

    # -------------------------------------------------------------------------
    # 7. Batch validation and bulk submission
    # -------------------------------------------------------------------------

    @classmethod
    def batch_validate_claims(cls, facility_id: int) -> dict:
        """
        Validate all draft claims for a facility in batch.

        Returns:
            Summary dict with ready/invalid/missing_docs counts and details.
        """
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        claims = SHAClaim.objects.filter(
            facility_id=facility_id,
            status=SHAClaim.ClaimStatus.DRAFT,
        ).select_related("patient", "encounter", "sha_member")

        from hmis.apps.core.models import Facility

        facility = Facility.objects.filter(pk=facility_id).first()
        service = SHAClaimsService(facility=facility)
        ready = []
        invalid = []
        missing_docs = []

        for claim in claims:
            is_valid, errors = service.validate_claim(claim)
            if is_valid:
                ready.append(
                    {
                        "id": claim.pk,
                        "claim_number": claim.claim_number,
                        "patient_name": str(claim.patient),
                        "claimed_amount": str(claim.claimed_amount or 0),
                    }
                )
            else:
                # Categorize errors
                doc_errors = [e for e in errors if "document" in e.lower()]
                if doc_errors:
                    missing_docs.append(
                        {
                            "id": claim.pk,
                            "claim_number": claim.claim_number,
                            "patient_name": str(claim.patient),
                            "missing_documents": doc_errors,
                        }
                    )
                else:
                    invalid.append(
                        {
                            "id": claim.pk,
                            "claim_number": claim.claim_number,
                            "patient_name": str(claim.patient),
                            "errors": errors,
                        }
                    )

        return {
            "total": len(ready) + len(invalid) + len(missing_docs),
            "ready": len(ready),
            "invalid": len(invalid),
            "missing_docs": len(missing_docs),
            "ready_claims": ready,
            "invalid_claims": invalid,
            "missing_docs_claims": missing_docs,
            "total_claimable_amount": str(sum(Decimal(c["claimed_amount"]) for c in ready)),
        }

    @classmethod
    def bulk_submit_claims(cls, claim_ids: list[int], user=None) -> dict:
        """
        Submit multiple validated claims in bulk.

        Only submits claims that pass validation. Skips invalid ones.

        Args:
            claim_ids: List of SHAClaim PKs to submit
            user: User performing the submission (for audit)

        Returns:
            Dict with 'submitted', 'failed', 'skipped' counts and details.
        """
        from hmis.apps.billing.models import SHAClaim
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        service = SHAClaimsService()
        submitted = []
        failed = []
        skipped = []

        claims = SHAClaim.objects.filter(
            pk__in=claim_ids,
            status__in=[SHAClaim.ClaimStatus.DRAFT, SHAClaim.ClaimStatus.VALIDATED],
        )

        for claim in claims:
            try:
                is_valid, errors = service.validate_claim(claim)
                if not is_valid:
                    skipped.append(
                        {
                            "id": claim.pk,
                            "claim_number": claim.claim_number,
                            "errors": errors,
                        }
                    )
                    continue

                result = service.submit_claim(claim, user or cls._get_system_user())
                submitted.append(
                    {
                        "id": claim.pk,
                        "claim_number": claim.claim_number,
                        "status": result.get("status", "submitted"),
                    }
                )
            except Exception as e:
                failed.append(
                    {
                        "id": claim.pk,
                        "claim_number": claim.claim_number,
                        "error": str(e),
                    }
                )

        return {
            "submitted": len(submitted),
            "failed": len(failed),
            "skipped": len(skipped),
            "submitted_claims": submitted,
            "failed_claims": failed,
            "skipped_claims": skipped,
        }

    # -------------------------------------------------------------------------
    # 8. Eligibility pre-check and caching
    # -------------------------------------------------------------------------

    @classmethod
    def cache_patient_eligibility(cls, patient_id: int, facility_id: int | None = None) -> dict:
        """
        Pre-check and cache SHA eligibility for a patient.

        Called when a patient is registered or updated with National ID.
        Stores the result in SHAEligibilityCheck model for quick lookup.

        Returns:
            Dict with eligibility status and expiry.
        """
        from hmis.apps.billing.models import SHAMember
        from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService
        from hmis.apps.core.models import Facility
        from hmis.apps.patients.models import Patient

        try:
            patient = Patient.objects.get(pk=patient_id)

            # Need an active SHA member record for eligibility check
            sha_member = SHAMember.objects.filter(
                patient=patient,
                status=SHAMember.MembershipStatus.ACTIVE,
            ).first()

            if not sha_member:
                return {"status": "skipped", "reason": "No active SHA membership"}

            facility = None
            if facility_id:
                facility = Facility.objects.filter(pk=facility_id).first()

            service = SHAEligibilityService()
            from hmis.apps.core.utils import get_system_user

            system_user = get_system_user()
            result = service.check_eligibility(
                sha_member=sha_member,
                user=system_user,
                force_refresh=True,
                facility=facility,
            )

            return {
                "status": "checked",
                "eligible": getattr(result, "is_eligible", False),
                "checked_at": timezone.now().isoformat(),
                "valid_until": (timezone.now() + timedelta(hours=24)).isoformat(),
            }

        except Exception as e:
            logger.warning("Eligibility pre-check failed for patient %s: %s", patient_id, e)
            return {"status": "error", "reason": str(e)}

    # -------------------------------------------------------------------------
    # 9. Auto-submit preauth for routine procedures
    # -------------------------------------------------------------------------

    @classmethod
    def auto_submit_preauth(cls, encounter_id: int, procedure_type: str) -> dict:
        """
        Automatically submit preauth for routine procedure types.

        Routine types that are almost always approved:
        - Normal delivery (maternity)
        - Routine imaging (X-ray, ultrasound)
        - Standard lab panels

        Returns:
            Dict with preauth status.
        """
        from hmis.apps.billing.models import ConsentToken, SHAMember, SHAPreauth
        from hmis.apps.billing.services.ilm_preauth_service import IlmPreauthService
        from hmis.apps.encounters.models import Encounter

        ROUTINE_TYPES = {"normal_delivery", "routine_imaging", "standard_labs", "consultation"}

        if procedure_type not in ROUTINE_TYPES:
            return {"status": "skipped", "reason": f"Not a routine type: {procedure_type}"}

        try:
            encounter = Encounter.objects.select_related("patient", "facility").get(pk=encounter_id)

            # Get SHA member
            sha_member = SHAMember.objects.filter(
                patient=encounter.patient,
                status=SHAMember.MembershipStatus.ACTIVE,
            ).first()

            if not sha_member:
                return {"status": "not_eligible"}

            # Check for existing preauth
            existing = SHAPreauth.objects.filter(
                patient=encounter.patient,
                encounter=encounter,
                status__in=[
                    SHAPreauth.Status.SUBMITTED,
                    SHAPreauth.Status.APPROVED,
                ],
            ).exists()

            if existing:
                return {"status": "already_exists"}

            # Find valid consent token
            today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
            consent_token = ConsentToken.objects.filter(
                sha_member=sha_member,
                created_at__gte=today_start,
                status=ConsentToken.ConsentStatus.VALIDATED,
            ).first()

            if not consent_token:
                return {"status": "no_consent"}

            # Create and submit preauth
            service = IlmPreauthService()
            preauth_type = cls._map_procedure_to_preauth_type(procedure_type)

            result = service.create_preauth(
                consent_token=consent_token.token,
                facility=encounter.facility,
                user=None,
                preauth_type=preauth_type,
                patient=encounter.patient,
                encounter=encounter,
            )

            return {
                "status": "submitted",
                "preauth_id": result.pk if hasattr(result, "pk") else None,
            }

        except Exception as e:
            logger.warning("Auto-preauth failed for encounter %s: %s", encounter_id, e)
            return {"status": "error", "reason": str(e)}

    @classmethod
    def _map_procedure_to_preauth_type(cls, procedure_type: str) -> str:
        """Map a routine procedure type to SHA preauth type."""
        mapping = {
            "normal_delivery": "normal",
            "routine_imaging": "imaging",
            "standard_labs": "normal",
            "consultation": "normal",
        }
        return mapping.get(procedure_type, "normal")

    # -------------------------------------------------------------------------
    # 10. End-of-day claims digest
    # -------------------------------------------------------------------------

    @classmethod
    def generate_daily_digest(cls, facility_id: int) -> dict:
        """
        Generate end-of-day claims summary for a facility.

        Returns:
            Comprehensive digest with counts, amounts, and action items.
        """
        from hmis.apps.billing.models import SHAClaim

        today = date.today()
        now = timezone.now()

        # Claims created today
        created_today = SHAClaim.objects.filter(
            facility_id=facility_id,
            created_at__date=today,
        )

        # Claims submitted today
        submitted_today = SHAClaim.objects.filter(
            facility_id=facility_id,
            submitted_at__date=today,
        )

        # Pending submission (draft/validated)
        pending = SHAClaim.objects.filter(
            facility_id=facility_id,
            status__in=[SHAClaim.ClaimStatus.DRAFT, SHAClaim.ClaimStatus.VALIDATED],
        )

        # Approaching time-bar deadline (< 24h)
        time_bar_risk = []
        emergency_drafts = SHAClaim.objects.filter(
            facility_id=facility_id,
            status__in=[
                SHAClaim.ClaimStatus.DRAFT,
                SHAClaim.ClaimStatus.VALIDATED,
            ],
            claim_type=SHAClaim.ClaimType.EMERGENCY,
        )
        for claim in emergency_drafts:
            deadline = claim.time_barring_deadline
            if deadline and (deadline - now).total_seconds() < 86400:
                time_bar_risk.append(
                    {
                        "id": claim.pk,
                        "claim_number": claim.claim_number,
                        "hours_remaining": round((deadline - now).total_seconds() / 3600, 1),
                    }
                )

        # Claims with QUERY status
        queries = SHAClaim.objects.filter(
            facility_id=facility_id,
            status=SHAClaim.ClaimStatus.QUERY,
        )

        # Revenue summary
        pending_amount = pending.aggregate(total=Sum("claimed_amount"))["total"] or Decimal("0")
        approved_today = SHAClaim.objects.filter(
            facility_id=facility_id,
            status__in=[SHAClaim.ClaimStatus.APPROVED, SHAClaim.ClaimStatus.PAID],
            updated_at__date=today,
        ).aggregate(total=Sum("approved_amount"))["total"] or Decimal("0")

        return {
            "date": today.isoformat(),
            "facility_id": facility_id,
            "summary": {
                "created_today": created_today.count(),
                "submitted_today": submitted_today.count(),
                "pending_submission": pending.count(),
                "pending_amount": str(pending_amount),
                "approved_today_amount": str(approved_today),
                "queries_outstanding": queries.count(),
                "time_bar_risk_count": len(time_bar_risk),
            },
            "action_items": {
                "time_bar_risk": time_bar_risk,
                "queries": [
                    {
                        "id": c.pk,
                        "claim_number": c.claim_number,
                        "patient": str(c.patient),
                    }
                    for c in queries[:10]
                ],
                "unsubmitted_drafts": pending.count(),
            },
        }

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    @classmethod
    def _get_system_user(cls):
        """Get or create system user for automated actions."""
        from hmis.apps.core.utils import get_system_user

        return get_system_user()
