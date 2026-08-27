# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: adverse transfusion reaction enums/models and discharge template configuration models.
How to use: imported by `hmis.apps.inpatient.models` compatibility module for model registration.
Supported inputs/args: Django model fields/methods for ATR reporting and discharge summary templates.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel
from hmis.apps.core.pii import encrypted_pii_property

from .clearance import calculate_patient_blocking_balance
from .models_monitoring import BloodTransfusionObservation

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser
    from django.db.models import QuerySet

User = get_user_model()


class GeneralReaction(models.TextChoices):
    FEVER = "FEVER", "Fever"
    CHILLS_RIGORS = "CHILLS_RIGORS", "Chills/Rigors"
    FLUSHING = "FLUSHING", "Flushing"
    NAUSEA_VOMITING = "NAUSEA_VOMITING", "Nausea/Vomiting"


class DermatologicalReaction(models.TextChoices):
    URTICARIA = "URTICARIA", "Urticaria"
    OTHER_SKIN_RASH = "OTHER_SKIN_RASH", "Other Skin Rash"


class CardiacRespiratoryReaction(models.TextChoices):
    CHEST_PAIN = "CHEST_PAIN", "Chest Pain"
    DYSPNOEA = "DYSPNOEA", "Dyspnoea"
    HYPOTENSION = "HYPOTENSION", "Hypotension"
    TACHYCARDIA = "TACHYCARDIA", "Tachycardia"


class RenalReaction(models.TextChoices):
    HAEMOGLOBINURIA = "HAEMOGLOBINURIA", "Haemoglobinuria (Dark Urine)"
    OLIGURIA = "OLIGURIA", "Oliguria"
    ANURIA = "ANURIA", "Anuria"


class HaematologicalReaction(models.TextChoices):
    UNEXPLAINED_BLEEDING = "UNEXPLAINED_BLEEDING", "Unexplained Bleeding"


class HemolysisResult(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    ABSENT = "ABSENT", "Absent"
    EQUIVOCAL = "EQUIVOCAL", "Equivocal"


class HemolysisSeverity(models.TextChoices):
    MILD = "MILD", "Mild"
    MODERATE = "MODERATE", "Moderate"
    MARKED = "MARKED", "Marked"


class AgglutinationResult(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    ABSENT = "ABSENT", "Absent"


class CompatibilityResult(models.TextChoices):
    COMPATIBLE = "COMPATIBLE", "Compatible"
    INCOMPATIBLE = "INCOMPATIBLE", "Incompatible"


class DonorHemolysisResult(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    ABSENT = "ABSENT", "Absent"


class CausalityAssessment(models.TextChoices):
    YES = "YES", "Yes"
    NO = "NO", "No"
    INCONCLUSIVE = "INCONCLUSIVE", "Inconclusive"


class ATRStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PENDING_REVIEW = "PENDING_REVIEW", "Pending Review"
    SUBMITTED = "SUBMITTED", "Submitted to PPB"
    ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged by PPB"


class ObstetricStatus(models.TextChoices):
    NA = "NA", "N/A"
    GRAVID = "GRAVID", "Gravid"
    PARA = "PARA", "Para"


class AdverseTransfusionReaction(FacilityScopedModel, TimeStampedModel):
    """
    Adverse Transfusion Reaction report aligned with Kenya MOH/PPB form
    FOM20/MIP/PMS/SOP/001.

    This is the detailed regulatory report created after a blood transfusion
    reaction is detected. The existing ``BloodTransfusionObservation.mark_reaction()``
    is the immediate clinical stop; this model captures the full PPB-mandated
    investigation and reporting data.

    Sections follow the physical form layout:
    1. Patient Information (linked via transfusion → admission → patient)
    2. Reaction Information (structured checkboxes per category)
    3. Vital Signs (auto-populated from observation entries)
    4. Component Information (from parent transfusion record)
    5. Lab Investigation (filled by transfusion manager)
    6. Reporter Details
    7. PPB Tracking
    """

    # ── Section 1: Source event ──────────────────────────────────────────
    transfusion = models.OneToOneField(
        BloodTransfusionObservation,
        on_delete=models.CASCADE,
        related_name="adverse_reaction_report",
        help_text="Blood transfusion that triggered this reaction report",
    )

    # ── Lab order link (integrates with lab module workflow) ─────────────
    lab_order = models.OneToOneField(
        "laboratory.LabOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="atr_report",
        help_text="Lab order created for post-transfusion investigation",
    )

    # ── Section 1: Patient history ───────────────────────────────────────
    pre_transfusion_hb = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Pre-transfusion haemoglobin (g/dL)",
    )
    obstetric_status = models.CharField(
        max_length=10,
        choices=ObstetricStatus.choices,
        default=ObstetricStatus.NA,
        help_text="Obstetric history status",
    )
    gravida = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of pregnancies (if obstetric status is Gravid)",
    )
    para = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of deliveries (if obstetric status is Para)",
    )
    previous_transfusion = models.BooleanField(
        null=True,
        blank=True,
        help_text="Has the patient had a previous transfusion?",
    )
    previous_transfusion_comment = models.TextField(
        blank=True,
        help_text="Details of previous transfusions",
    )
    previous_reactions = models.BooleanField(
        null=True,
        blank=True,
        help_text="Has the patient had previous transfusion reactions?",
    )
    previous_reactions_comment = models.TextField(
        blank=True,
        help_text="Details of previous reactions",
    )
    current_medications = models.TextField(
        blank=True,
        help_text="Current medications at time of transfusion",
    )

    # ── Section 2: Reaction categories (JSONField checkbox lists) ────────
    general_reactions = models.JSONField(
        default=list,
        blank=True,
        help_text="General reactions: Fever, Chills/Rigors, Flushing, Nausea/Vomiting",
    )
    dermatological_reactions = models.JSONField(
        default=list,
        blank=True,
        help_text="Dermatological reactions: Urticaria, Other Skin Rash",
    )
    cardiac_respiratory_reactions = models.JSONField(
        default=list,
        blank=True,
        help_text="Cardiac/Respiratory: Chest Pain, Dyspnoea, Hypotension, Tachycardia",
    )
    renal_reactions = models.JSONField(
        default=list,
        blank=True,
        help_text="Renal: Haemoglobinuria, Oliguria, Anuria",
    )
    haematological_reactions = models.JSONField(
        default=list,
        blank=True,
        help_text="Haematological: Unexplained Bleeding",
    )
    other_reactions = models.TextField(
        blank=True,
        help_text="Other reactions not listed above (free text)",
    )

    # ── Section 3: Vital signs snapshot ──────────────────────────────────
    vitals_at_start_bp = models.CharField(max_length=20, blank=True)
    vitals_at_start_temp = models.DecimalField(
        max_digits=4, decimal_places=1, null=True, blank=True
    )
    vitals_at_start_pulse = models.IntegerField(null=True, blank=True)
    vitals_at_start_rr = models.IntegerField(null=True, blank=True)

    vitals_during_bp = models.CharField(max_length=20, blank=True)
    vitals_during_temp = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    vitals_during_pulse = models.IntegerField(null=True, blank=True)
    vitals_during_rr = models.IntegerField(null=True, blank=True)

    vitals_at_stop_bp = models.CharField(max_length=20, blank=True)
    vitals_at_stop_temp = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    vitals_at_stop_pulse = models.IntegerField(null=True, blank=True)
    vitals_at_stop_rr = models.IntegerField(null=True, blank=True)

    # ── Section 5: Lab Investigation ─────────────────────────────────────
    volume_transfused_ml = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Actual volume transfused before/at reaction (mL)",
    )

    recipient_supernatant_hemolysis = models.CharField(
        max_length=15,
        choices=HemolysisResult.choices,
        blank=True,
        help_text="Recipient's blood supernatant hemolysis",
    )
    recipient_hemolysis_severity = models.CharField(
        max_length=10,
        choices=HemolysisSeverity.choices,
        blank=True,
        help_text="If hemolysis present, severity",
    )
    recipient_agglutination = models.CharField(
        max_length=10,
        choices=AgglutinationResult.choices,
        blank=True,
        help_text="Recipient's blood agglutination",
    )
    haematological_results = models.JSONField(
        default=dict,
        blank=True,
        help_text="Haematological results: {wbc, hb, rbc, hct, mcv, mch, mchc, plt}",
    )
    blood_film_rbc = models.TextField(
        blank=True,
        help_text="Blood film RBC findings",
    )
    blood_film_wbc = models.TextField(
        blank=True,
        help_text="Blood film WBC findings",
    )
    blood_film_plt = models.TextField(
        blank=True,
        help_text="Blood film platelet findings",
    )
    donor_supernatant_hemolysis = models.CharField(
        max_length=10,
        choices=DonorHemolysisResult.choices,
        blank=True,
        help_text="Donor blood supernatant hemolysis",
    )
    donor_pack_age = models.CharField(
        max_length=50,
        blank=True,
        help_text="Age of the donor blood pack",
    )
    culture_donor_pack_results = models.TextField(
        blank=True,
        help_text="Culture results for donor pack",
    )
    culture_recipient_blood_results = models.TextField(
        blank=True,
        help_text="Culture results for recipient blood",
    )
    compatibility_saline_rt = models.CharField(
        max_length=15,
        choices=CompatibilityResult.choices,
        blank=True,
        help_text="Compatibility testing: Saline RT",
    )
    compatibility_saline_37 = models.CharField(
        max_length=15,
        choices=CompatibilityResult.choices,
        blank=True,
        help_text="Compatibility testing: Saline 37°C",
    )
    compatibility_ahg = models.CharField(
        max_length=15,
        choices=CompatibilityResult.choices,
        blank=True,
        help_text="Compatibility testing: AHG",
    )
    compatibility_albumin_37 = models.CharField(
        max_length=15,
        choices=CompatibilityResult.choices,
        blank=True,
        help_text="Compatibility testing: Albumin 37°C",
    )
    enzyme_treated_cells_result = models.TextField(
        blank=True,
        help_text="Enzyme-treated cells compatibility result",
    )
    anti_a_titres = models.CharField(
        max_length=50,
        blank=True,
        help_text="Anti-A titres (for group O → A/B/AB transfusions)",
    )
    anti_b_titres = models.CharField(
        max_length=50,
        blank=True,
        help_text="Anti-B titres (for group O → A/B/AB transfusions)",
    )
    urinalysis = models.TextField(
        blank=True,
        help_text="Urinalysis results",
    )
    evaluation_diagnosis = models.TextField(
        blank=True,
        help_text="Evaluation diagnosis after investigation",
    )
    reaction_related_to_transfusion = models.CharField(
        max_length=15,
        choices=CausalityAssessment.choices,
        blank=True,
        help_text="Was the adverse reaction related to the transfusion?",
    )

    # ── Section 6: Reporter details ──────────────────────────────────────
    initial_reporter = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="atr_reports",
        help_text="Staff who initially reported the reaction",
    )
    initial_reporter_cadre = models.CharField(
        max_length=100,
        blank=True,
        help_text="Cadre/designation of the initial reporter",
    )
    initial_reporter_mobile_encrypted = models.TextField(default="", blank=True)
    initial_reporter_mobile = encrypted_pii_property("initial_reporter_mobile")
    initial_reporter_email_encrypted = models.TextField(default="", blank=True)
    initial_reporter_email = encrypted_pii_property("initial_reporter_email")
    report_date = models.DateField(
        help_text="Date the ATR report was created",
    )
    ppb_submitter_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Name of person submitting to PPB (if different from reporter)",
    )
    ppb_submitter_cadre = models.CharField(
        max_length=100,
        blank=True,
        help_text="Cadre/designation of the PPB submitter",
    )
    ppb_submitter_mobile_encrypted = models.TextField(default="", blank=True)
    ppb_submitter_mobile = encrypted_pii_property("ppb_submitter_mobile")
    ppb_submitter_email_encrypted = models.TextField(default="", blank=True)
    ppb_submitter_email = encrypted_pii_property("ppb_submitter_email")
    submission_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date the form was submitted to PPB",
    )

    # ── Section 7: PPB tracking ──────────────────────────────────────────
    status = models.CharField(
        max_length=20,
        choices=ATRStatus.choices,
        default=ATRStatus.DRAFT,
        help_text="Regulatory submission status",
    )
    adr_report_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="PPB-assigned ADR report number",
    )
    vigiflow_entry_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="PPB Vigiflow entry number",
    )
    ppb_date_received = models.DateField(
        null=True,
        blank=True,
        help_text="Date PPB received the report",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-report_date", "-created_at"]
        verbose_name = "Adverse Transfusion Reaction"
        verbose_name_plural = "Adverse Transfusion Reactions"
        indexes = [
            models.Index(fields=["transfusion"]),
            models.Index(fields=["status", "-report_date"]),
        ]

    def __str__(self):
        patient = self.transfusion.admission.patient
        return f"ATR #{self.id} — {patient} ({self.report_date})"

    def auto_populate_vitals(self):
        """Pull vital signs from linked TransfusionObservationEntry records."""
        entries = self.transfusion.observations.all()
        entry_map = {e.observation_interval: e for e in entries}

        # At start = BEFORE observation
        before = entry_map.get("BEFORE")
        if before:
            self.vitals_at_start_bp = before.blood_pressure or ""
            self.vitals_at_start_temp = before.temperature
            self.vitals_at_start_pulse = before.pulse
            self.vitals_at_start_rr = before.respiratory_rate

        # During = 15_MIN observation (closest to the standard "During 15min" on the form)
        during = entry_map.get("15_MIN")
        if during:
            self.vitals_during_bp = during.blood_pressure or ""
            self.vitals_during_temp = during.temperature
            self.vitals_during_pulse = during.pulse
            self.vitals_during_rr = during.respiratory_rate

        # At stop = last observation entry by exact_time
        if entries.exists():
            last_entry = entries.order_by("-exact_time").first()
            if last_entry and last_entry.observation_interval not in ("BEFORE", "15_MIN"):
                self.vitals_at_stop_bp = last_entry.blood_pressure or ""
                self.vitals_at_stop_temp = last_entry.temperature
                self.vitals_at_stop_pulse = last_entry.pulse
                self.vitals_at_stop_rr = last_entry.respiratory_rate

    def create_lab_order(self, user):
        """
        Create a lab order for post-transfusion investigation.

        Ordered tests (per MOH form section 4):
        - CBC/FBC (WBC, HB, RBC, HCT, MCV, MCH, MCHC, PLT)
        - BG (Blood Grouping — for crossmatch)
        - UA (Urinalysis — for hemoglobinuria)

        Returns the created LabOrder, or raises ValidationError if one already exists.
        """
        from hmis.apps.laboratory.models import LabOrder, LabOrderItem, TestCatalog

        if self.lab_order_id:
            raise ValidationError("A lab order has already been created for this ATR report.")

        admission = self.transfusion.admission
        patient = admission.patient
        encounter = admission.ipd_encounter

        # Determine which tests to order per MOH form section 4:
        # Item 3: CBC (haematological results + blood film)
        # Items 6-7: Blood culture (donor pack + recipient blood)
        # Item 11: Urinalysis (hemoglobinuria check)
        ATR_TEST_CODES = ["CBC", "BCULTURE", "UA"]
        tests = TestCatalog.objects.filter(code__in=ATR_TEST_CODES, is_active=True)
        if not tests.exists():
            raise ValidationError(
                "No matching lab tests found in the catalog. "
                "Ensure CBC, BCULTURE, and UA tests are configured."
            )

        order = LabOrder.objects.create(
            patient=patient,
            encounter=encounter,
            admission=admission,
            ordered_by=user,
            order_type="IN_HOUSE",
            priority="STAT",
            clinical_notes=(
                f"Post-transfusion reaction investigation (ATR #{self.id}). "
                f"Blood product: {self.transfusion.get_blood_product_display()}, "
                f"Unit: {self.transfusion.blood_unit_number}. "
                f"Reactions: {', '.join(self.reaction_categories_display)}."
            ),
            facility=self.facility,
            organization=self.organization,
        )

        for test in tests:
            LabOrderItem.objects.create(
                lab_order=order,
                test=test,
                unit_cost=test.cost,
                special_instructions="ATR investigation — urgent post-transfusion reaction workup",
            )

        order.calculate_total_cost()

        self.lab_order = order
        self.save(update_fields=["lab_order", "updated_at"])

        return order

    def populate_from_lab_results(self):
        """
        Pull verified lab results from the linked lab order into the ATR
        lab investigation fields.

        Maps:
        - CBC/FBC results → haematological_results JSON + blood_film fields
        - UA results → urinalysis text
        - Does NOT overwrite manually-entered fields.

        Returns True if any fields were updated.
        """
        if not self.lab_order_id:
            return False

        updated = False
        results_by_code: dict[str, object] = {}

        for item in self.lab_order.items.select_related("test", "result").all():
            if hasattr(item, "result") and item.result.verification_status == "VERIFIED":
                results_by_code[item.test.code] = item.result

        # Map CBC/FBC results → haematological_results
        haem_map = {
            "WBC": "wbc",
            "HB": "hb",
            "PLT": "plt",
        }
        cbc_result = results_by_code.get("CBC") or results_by_code.get("FBC")
        if cbc_result:
            current = self.haematological_results or {}
            if cbc_result.text_value:
                # If result is a text blob, store it directly
                if not current:
                    self.haematological_results = {"notes": cbc_result.text_value}
                    updated = True
            elif cbc_result.numeric_value is not None:
                # Single numeric value from a non-panel CBC
                pass  # Handled by individual components below

        # Individual hematology components (if ordered separately or as panel items)
        for code, key in haem_map.items():
            result = results_by_code.get(code)
            if result and result.numeric_value is not None:
                current = self.haematological_results or {}
                if not current.get(key):
                    current[key] = str(result.numeric_value)
                    self.haematological_results = current
                    updated = True

        # Urinalysis → urinalysis field
        ua_result = results_by_code.get("UA")
        if ua_result and not self.urinalysis:
            value = ua_result.text_value or (
                str(ua_result.numeric_value) if ua_result.numeric_value is not None else ""
            )
            if value:
                self.urinalysis = value
                updated = True

        # Blood culture → culture fields (items 6 & 7 on MOH form)
        bculture_result = results_by_code.get("BCULTURE")
        if bculture_result:
            value = bculture_result.text_value or (
                str(bculture_result.numeric_value)
                if bculture_result.numeric_value is not None
                else ""
            )
            if value:
                if not self.culture_donor_pack_results:
                    self.culture_donor_pack_results = value
                    updated = True
                if not self.culture_recipient_blood_results:
                    self.culture_recipient_blood_results = value
                    updated = True

        update_fields = ["updated_at"]
        if updated:
            update_fields.extend(
                [
                    "haematological_results",
                    "urinalysis",
                    "culture_donor_pack_results",
                    "culture_recipient_blood_results",
                ]
            )
            self.save(update_fields=update_fields)

        return updated

    def submit_to_ppb(self, user=None, notes=""):
        """Transition status to SUBMITTED and record submission details."""
        if self.status in (ATRStatus.SUBMITTED, ATRStatus.ACKNOWLEDGED):
            raise ValidationError("This ATR report has already been submitted.")

        self.status = ATRStatus.SUBMITTED
        self.submission_date = timezone.now().date()
        if user and not self.ppb_submitter_name:
            self.ppb_submitter_name = user.get_full_name() or user.username
        self.save(
            update_fields=[
                "status",
                "submission_date",
                "ppb_submitter_name",
                "updated_at",
            ]
        )

    def mark_acknowledged(self, adr_number: str, vigiflow_number: str = ""):
        """Record PPB acknowledgment after submission."""
        if self.status != ATRStatus.SUBMITTED:
            raise ValidationError("ATR must be in SUBMITTED status to be acknowledged.")

        self.status = ATRStatus.ACKNOWLEDGED
        self.adr_report_number = adr_number
        self.vigiflow_entry_number = vigiflow_number
        self.ppb_date_received = timezone.now().date()
        self.save(
            update_fields=[
                "status",
                "adr_report_number",
                "vigiflow_entry_number",
                "ppb_date_received",
                "updated_at",
            ]
        )

    @property
    def has_lab_investigation(self) -> bool:
        """Return True if any lab investigation field has been filled."""
        lab_fields = [
            self.recipient_supernatant_hemolysis,
            self.recipient_agglutination,
            self.donor_supernatant_hemolysis,
            self.compatibility_saline_rt,
            self.compatibility_saline_37,
            self.compatibility_ahg,
            self.compatibility_albumin_37,
            self.urinalysis,
            self.evaluation_diagnosis,
            self.reaction_related_to_transfusion,
            self.culture_donor_pack_results,
            self.culture_recipient_blood_results,
            self.blood_film_rbc,
            self.blood_film_wbc,
            self.blood_film_plt,
            self.enzyme_treated_cells_result,
        ]
        if any(lab_fields):
            return True
        if self.haematological_results and self.haematological_results != {}:
            return True
        return False

    @property
    def reaction_categories_display(self) -> list[str]:
        """Return flattened list of all selected reaction labels."""
        labels: list[str] = []
        for val in self.general_reactions or []:
            labels.append(GeneralReaction(val).label)
        for val in self.dermatological_reactions or []:
            labels.append(DermatologicalReaction(val).label)
        for val in self.cardiac_respiratory_reactions or []:
            labels.append(CardiacRespiratoryReaction(val).label)
        for val in self.renal_reactions or []:
            labels.append(RenalReaction(val).label)
        for val in self.haematological_reactions or []:
            labels.append(HaematologicalReaction(val).label)
        if self.other_reactions:
            labels.append(self.other_reactions)
        return labels


# =============================================================================
# Discharge Template Configuration
# =============================================================================


class DischargeTemplateLayout(models.TextChoices):
    """Layout preset for discharge summary print templates."""

    STANDARD = "STANDARD", "Standard (narrative layout)"
    STRUCTURED = "STRUCTURED", "Structured (labelled fields in grid)"
    MINIMAL = "MINIMAL", "Minimal (compact single-page)"


class DischargeTemplate(FacilityScopedModel, TimeStampedModel):
    """
    Configurable discharge summary print template.

    Each facility can have multiple templates and set one as default.
    Templates control:
    - Which sections appear on the printed summary
    - Section ordering
    - Print layout variant (narrative, grid, compact)
    - Custom facility header text

    The combination (facility, name) must be unique so facilities
    can maintain multiple named templates without collisions.
    """

    name = models.CharField(
        max_length=120,
        help_text="Human-readable template name, e.g. 'Maternity Discharge'",
    )
    layout = models.CharField(
        max_length=20,
        choices=DischargeTemplateLayout.choices,
        default=DischargeTemplateLayout.STANDARD,
        help_text="Print layout variant (standard narrative, structured grid, minimal).",
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Whether this is the default template for the facility.",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive templates are hidden from the print selector.",
    )

    # Section configuration stored as JSON list:
    #  [
    #    {"key": "hospital_course", "label": "Hospital Course", "enabled": true},
    #    {"key": "investigations", "label": "Investigations Done", "enabled": true},
    #    ...
    #  ]
    sections = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Ordered list of section configs. "
            "Each entry: {key, label, enabled}. "
            "The key maps to a content source (AI section id or model field)."
        ),
    )

    # Optional overrides printed on the document header
    header_title = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Override document title (default: 'Discharge Summary').",
    )
    header_subtitle = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Subtitle line printed below the facility name.",
    )
    show_signature_lines = models.BooleanField(
        default=True,
        help_text="Whether to include signature lines on the printed document.",
    )
    show_qr_code = models.BooleanField(
        default=True,
        help_text="Whether to include a QR code for document verification.",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-is_default", "name"]
        verbose_name = "Discharge Template"
        verbose_name_plural = "Discharge Templates"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "name"],
                name="unique_discharge_template_per_facility",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_layout_display()})"

    def save(self, *args, **kwargs):
        # If marking as default, unset other defaults for the same facility.
        if self.is_default and self.facility_id:
            DischargeTemplate.objects.filter(
                facility=self.facility,
                is_default=True,
            ).exclude(pk=self.pk).update(is_default=False)
        # Populate default sections when none are specified.
        if not self.sections:
            self.sections = self.get_default_sections()
        super().save(*args, **kwargs)

    @staticmethod
    def get_default_sections() -> list[dict]:
        """Return the default section configuration for a new template."""
        return [
            {"key": "patient_demographics", "label": "Patient Information", "enabled": True},
            {"key": "admission_details", "label": "Admission Details", "enabled": True},
            {"key": "diagnosis", "label": "Diagnosis", "enabled": True},
            {"key": "complaints", "label": "Complaints", "enabled": True},
            {"key": "history", "label": "History", "enabled": True},
            {"key": "hospital_course", "label": "Hospital Course", "enabled": True},
            {"key": "physical_examination", "label": "Physical Examination", "enabled": True},
            {"key": "investigations", "label": "Investigations Done", "enabled": True},
            {"key": "management", "label": "Management", "enabled": True},
            {"key": "condition_at_discharge", "label": "Condition at Discharge", "enabled": True},
            {"key": "discharge_medications", "label": "Discharge Medications", "enabled": True},
            {"key": "discharge_instructions", "label": "Discharge Instructions", "enabled": True},
            {"key": "follow_up", "label": "Follow-up / TCA", "enabled": True},
        ]
