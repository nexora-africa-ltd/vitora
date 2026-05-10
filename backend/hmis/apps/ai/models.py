"""
Models for AI integration persistence.

Stores:
- TibaBot facility API key management (TibaBotFacilityKey)
- Clinical chat sessions and messages (ChatSession, ChatMessage)
- AI panel results for encounters and admissions (AIResultBase subclasses)

Results are stored *after* the TibaBot round-trip completes, so the local DB
serves as a history/cache rather than the source of truth for the AI response.
"""

import uuid

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel

# =============================================================================
# TibaBot facility key management
# =============================================================================


class TibaBotFacilityKey(models.Model):
    """
    Per-facility TibaBot API key for dual-layer authentication.

    Each facility in a multi-tenant deployment can have its own TibaBot
    API key (one billing seat per facility).  Keys are provisioned via
    the TibaBot admin API and stored here for the Django proxy to use
    when forwarding requests on behalf of users at that facility.

    When no per-facility key exists, the client falls back to the
    ``TIBABOT_API_KEY`` environment variable (deployment-wide default).
    """

    facility = models.OneToOneField(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="tibabot_key",
        help_text="Facility this API key belongs to.",
    )
    api_key = models.CharField(
        max_length=255,
        help_text="TibaBot API key (tb_...). Shown only once when provisioned.",
    )
    key_hash = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="First 16 hex chars of the key hash (returned by TibaBot on provisioning).",
    )
    tibabot_facility_id = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Facility ID registered with TibaBot (e.g. 'knh-001').",
    )
    scopes = models.JSONField(
        default=list,
        blank=True,
        help_text='Permitted API scopes (e.g. ["chat", "triage", "icd10", "clinical", "predict"]).',
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this key is currently active. Deactivate instead of deleting.",
    )
    provisioned_at = models.DateTimeField(
        default=timezone.now,
        help_text="When the key was provisioned from TibaBot.",
    )
    last_rotated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the key was last rotated.",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Admin notes (rotation reason, etc.).",
    )

    class Meta:
        verbose_name = "TibaBot Facility Key"
        verbose_name_plural = "TibaBot Facility Keys"
        ordering = ["-provisioned_at"]

    def __str__(self) -> str:
        return f"{self.facility.name} — {'active' if self.is_active else 'revoked'}"

    @property
    def masked_key(self) -> str:
        """Return the key with middle portion masked for display."""
        key = self.api_key
        if len(key) <= 10:
            return "****"
        return f"{key[:6]}…{key[-4:]}"


# =============================================================================
# Chat persistence (Phase 2)
# =============================================================================


class ChatSession(FacilityScopedModel):
    """
    A multi-turn clinical chat session owned by a single user.

    Each session maps to a TibaBot session_id.  The local model stores
    metadata (title, timestamps, message count) for the session list UI.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_chat_sessions",
    )

    title = models.CharField(
        max_length=255,
        default="New Chat",
        help_text="Auto-generated from the first user message.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "AI Chat Session"
        verbose_name_plural = "AI Chat Sessions"

    def __str__(self) -> str:
        return f"ChatSession {self.id} — {self.title}"

    @property
    def message_count(self) -> int:
        """Return the number of messages in this session."""
        return self.messages.count()


class ChatMessage(models.Model):
    """
    A single message in a chat session.

    Stores both user and assistant messages.  The ``id`` is a UUID string
    (matching the frontend ``AIChatMessage.id`` type).
    """

    ROLE_CHOICES = [
        ("user", "User"),
        ("assistant", "Assistant"),
        ("system", "System"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["timestamp"]
        verbose_name = "AI Chat Message"
        verbose_name_plural = "AI Chat Messages"

    def __str__(self) -> str:
        return f"{self.role}: {self.content[:60]}"


# =============================================================================
# AI panel result persistence (Phase 5+)
# =============================================================================


class AIResultBase(FacilityScopedModel):
    """
    Abstract base for persisted AI panel results.

    Stores the full request + response JSON so results survive page reloads.
    Each concrete model links to the relevant clinical entity (encounter,
    admission, or lab result).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="%(class)s_results",
    )

    request_data = models.JSONField(
        help_text="Input payload sent to TibaBot (sanitized).",
    )
    result_data = models.JSONField(
        help_text="Full response JSON from TibaBot or fallback engine.",
    )
    service_mode = models.CharField(
        max_length=20,
        default="tibabot",
        help_text="'tibabot' or 'fallback'.",
    )
    input_tokens = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of input/prompt tokens consumed.",
    )
    output_tokens = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of output/completion tokens consumed.",
    )
    total_tokens = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Total tokens consumed (input + output).",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        # Auto-extract token counts from result_data when not set explicitly
        if is_new and self.result_data and isinstance(self.result_data, dict):
            usage = self.result_data.get("usage") or self.result_data.get("token_usage") or {}
            if isinstance(usage, dict):
                if self.input_tokens is None and usage.get("input_tokens"):
                    self.input_tokens = usage["input_tokens"]
                if self.output_tokens is None and usage.get("output_tokens"):
                    self.output_tokens = usage["output_tokens"]
                if self.total_tokens is None and usage.get("total_tokens"):
                    self.total_tokens = usage["total_tokens"]
                # OpenAI-style keys
                if self.input_tokens is None and usage.get("prompt_tokens"):
                    self.input_tokens = usage["prompt_tokens"]
                if self.output_tokens is None and usage.get("completion_tokens"):
                    self.output_tokens = usage["completion_tokens"]
        super().save(*args, **kwargs)
        # On creation, record token usage against the organization quota
        if is_new and self.total_tokens:
            org = self._resolve_org()
            if org is not None:
                org.record_ai_token_usage(self.total_tokens)

    def _resolve_org(self):
        """Resolve the Organization from the facility FK."""
        facility = getattr(self, "facility", None)
        if facility is not None:
            return getattr(facility, "organization", None)
        return None


class AICarePlanResult(AIResultBase):
    """Persisted care plan generated by TibaBot or fallback engine."""

    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_care_plans",
    )
    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_care_plans",
    )
    primary_diagnosis = models.CharField(max_length=500, blank=True, default="")

    class Meta(AIResultBase.Meta):
        verbose_name = "AI Care Plan Result"
        verbose_name_plural = "AI Care Plan Results"

    def __str__(self) -> str:
        return f"CarePlan {self.id} — {self.primary_diagnosis[:60]}"


class AICDSResult(AIResultBase):
    """Persisted CDS rule evaluation result."""

    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_cds_results",
    )
    rules_fired = models.IntegerField(default=0)
    alert_count = models.IntegerField(default=0)

    class Meta(AIResultBase.Meta):
        verbose_name = "AI CDS Result"
        verbose_name_plural = "AI CDS Results"

    def __str__(self) -> str:
        return f"CDS {self.id} — {self.rules_fired} rules fired"


class AILabInterpretResult(AIResultBase):
    """Persisted lab result interpretation."""

    lab_result = models.ForeignKey(
        "laboratory.LabResult",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_interpretations",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_lab_interpretations",
    )
    abnormal_count = models.IntegerField(default=0)
    critical_count = models.IntegerField(default=0)

    class Meta(AIResultBase.Meta):
        verbose_name = "AI Lab Interpretation"
        verbose_name_plural = "AI Lab Interpretations"

    def __str__(self) -> str:
        return f"LabInterpret {self.id} — {self.abnormal_count} abnormal"


class AIDischargeResult(AIResultBase):
    """Persisted discharge readiness assessment."""

    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_discharge_assessments",
    )
    readiness_level = models.CharField(max_length=20, blank=True, default="")
    readiness_score = models.FloatField(null=True, blank=True)

    class Meta(AIResultBase.Meta):
        verbose_name = "AI Discharge Assessment"
        verbose_name_plural = "AI Discharge Assessments"

    def __str__(self) -> str:
        return f"Discharge {self.id} — {self.readiness_level}"


class AIICURiskResult(AIResultBase):
    """Persisted ICU risk prediction/stratification."""

    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_icu_predictions",
    )
    prediction_type = models.CharField(
        max_length=20,
        default="predict",
        help_text="'predict' or 'risk-stratify'.",
    )
    risk_level = models.CharField(max_length=20, blank=True, default="")
    risk_score = models.FloatField(null=True, blank=True)

    class Meta(AIResultBase.Meta):
        verbose_name = "AI ICU Risk Result"
        verbose_name_plural = "AI ICU Risk Results"

    def __str__(self) -> str:
        return f"ICURisk {self.id} — {self.risk_level}"


class AIInvestigationSuggestResult(AIResultBase):
    """Persisted investigation suggestion result from TibaBot."""

    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_investigation_suggestions",
    )
    matched_conditions = models.JSONField(
        default=list,
        help_text="Care plan template condition keys that matched.",
    )
    suggestion_count = models.IntegerField(
        default=0,
        help_text="Number of investigation suggestions returned.",
    )

    class Meta(AIResultBase.Meta):
        verbose_name = "AI Investigation Suggestion"
        verbose_name_plural = "AI Investigation Suggestions"

    def __str__(self) -> str:
        return f"InvestigationSuggest {self.id} — {self.suggestion_count} suggestions"


class AISurgicalPreOpAssessResult(AIResultBase):
    """Persisted surgical pre-operative risk assessment."""

    surgery_case = models.ForeignKey(
        "theatre.SurgeryCase",
        on_delete=models.CASCADE,
        related_name="ai_surgical_pre_op_assessments",
    )
    overall_risk_level = models.CharField(max_length=20, blank=True, default="")
    facility_capable = models.BooleanField(null=True, blank=True)

    class Meta(AIResultBase.Meta):
        verbose_name = "AI Surgical Pre-Op Assessment"
        verbose_name_plural = "AI Surgical Pre-Op Assessments"

    def __str__(self) -> str:
        return f"SurgicalPreOp {self.id} — {self.overall_risk_level or 'unknown'}"


class AISurgicalChecklistSessionResult(AIResultBase):
    """Persisted advisory WHO checklist session state from TibaBot."""

    surgery_case = models.ForeignKey(
        "theatre.SurgeryCase",
        on_delete=models.CASCADE,
        related_name="ai_surgical_checklist_sessions",
    )
    tibabot_session_id = models.CharField(max_length=100, db_index=True)
    current_phase = models.CharField(max_length=40, blank=True, default="")
    percent_complete = models.FloatField(null=True, blank=True)
    phase_complete = models.BooleanField(default=False)

    class Meta(AIResultBase.Meta):
        verbose_name = "AI Surgical Checklist Session"
        verbose_name_plural = "AI Surgical Checklist Sessions"

    def __str__(self) -> str:
        return f"SurgicalChecklist {self.id} — {self.current_phase or self.tibabot_session_id}"


class AISurgicalPostOpCarePlanResult(AIResultBase):
    """Persisted surgical post-operative care plan result."""

    surgery_case = models.ForeignKey(
        "theatre.SurgeryCase",
        on_delete=models.CASCADE,
        related_name="ai_surgical_post_op_care_plans",
    )
    procedure_key = models.CharField(max_length=100, blank=True, default="")
    surgical_apgar_score = models.IntegerField(null=True, blank=True)
    risk_level = models.CharField(max_length=20, blank=True, default="")

    class Meta(AIResultBase.Meta):
        verbose_name = "AI Surgical Post-Op Care Plan"
        verbose_name_plural = "AI Surgical Post-Op Care Plans"

    def __str__(self) -> str:
        return f"SurgicalPostOp {self.id} — {self.procedure_key or 'unknown procedure'}"


# =============================================================================
# AI Advisory ↔ Order link (junction table)
# =============================================================================


class AIAdvisoryOrderLinkStatus(models.TextChoices):
    SUGGESTED = "SUGGESTED", "Suggested"
    ORDERED = "ORDERED", "Ordered"
    DECLINED = "DECLINED", "Declined"
    NOT_APPLICABLE = "NOT_APPLICABLE", "Not applicable"


class AIAdvisoryOrderLink(FacilityScopedModel):
    """
    Links an individual AI advisory suggestion to a clinical order.

    Each row represents one suggestion line from a stored AI result (identified
    by ``ai_result_content_type`` + ``ai_result_id``) at a specific path within
    the result JSON (``suggestion_category`` + ``suggestion_index``).

    Exactly one of ``lab_order``, ``imaging_order``, or ``prescription`` is set
    when ``status`` is ORDERED.
    """

    # ── AI result (polymorphic via ContentType) ──────────────────────────
    ai_result_content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name="advisory_order_links",
    )
    ai_result_id = models.UUIDField(
        help_text="PK of the AI result row (all AI results use UUID PKs).",
    )
    ai_result = GenericForeignKey("ai_result_content_type", "ai_result_id")

    # ── Suggestion identification ────────────────────────────────────────
    suggestion_category = models.CharField(
        max_length=60,
        help_text=(
            "Category within result_data, e.g. 'medications', "
            "'pre_op_checklist.investigations', 'complications_to_watch'."
        ),
    )
    suggestion_index = models.PositiveIntegerField(
        help_text="Zero-based index of the suggestion within its category array.",
    )
    suggestion_text = models.TextField(
        help_text="Snapshot of the suggestion text at link-creation time.",
    )

    # ── Target order (exactly one is set when ORDERED) ───────────────────
    lab_order = models.ForeignKey(
        "laboratory.LabOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_advisory_links",
    )
    imaging_order = models.ForeignKey(
        "imaging.ImagingOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_advisory_links",
    )
    prescription = models.ForeignKey(
        "pharmacy.Prescription",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_advisory_links",
    )

    # ── Status & audit ───────────────────────────────────────────────────
    status = models.CharField(
        max_length=20,
        choices=AIAdvisoryOrderLinkStatus.choices,
        default=AIAdvisoryOrderLinkStatus.SUGGESTED,
    )
    actioned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_advisory_actions",
    )
    actioned_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["suggestion_category", "suggestion_index"]
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "ai_result_content_type",
                    "ai_result_id",
                    "suggestion_category",
                    "suggestion_index",
                ],
                name="unique_advisory_suggestion",
            ),
        ]
        verbose_name = "AI Advisory Order Link"
        verbose_name_plural = "AI Advisory Order Links"

    def __str__(self) -> str:
        return f"{self.suggestion_category}[{self.suggestion_index}] → {self.get_status_display()}"
