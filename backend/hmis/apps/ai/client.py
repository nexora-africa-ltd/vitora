"""
TibaBot API client.

Handles communication with the TibaBot AI service, including:
- Retry logic with exponential backoff
- Timeout management
- Error handling with graceful degradation
- Request sanitization (PII stripping)
- Dual-layer auth: X-API-Key (facility) + Authorization: Bearer (user identity)
"""

import logging
import threading
from contextlib import contextmanager
from typing import Any, ClassVar

import requests
from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .sanitizer import sanitize_clinical_text
from .tokens import mint_tibabot_jwt

logger = logging.getLogger(__name__)

# Thread-local storage for per-request user identity
_thread_local = threading.local()


@contextmanager
def tibabot_user_context(user: AbstractBaseUser, facility=None):
    """
    Context manager that sets the current user for TibaBot JWT auth.

    Usage in views::

        with tibabot_user_context(request.user, request.facility):
            client = get_tibabot_client()
            result = client.clinical_chat(data)

    The ``TibaBotClient._request`` method will automatically mint a JWT
    and include it as ``Authorization: Bearer <jwt>`` on the request.
    The facility (from TenantMiddleware) is used to resolve the per-facility
    API key.
    """
    _thread_local.tibabot_user = user
    _thread_local.tibabot_facility = facility
    try:
        yield
    finally:
        _thread_local.tibabot_user = None
        _thread_local.tibabot_facility = None


def _get_current_user() -> AbstractBaseUser | None:
    """Get the user set by the nearest ``tibabot_user_context``."""
    return getattr(_thread_local, "tibabot_user", None)


def _get_current_facility():
    """Get the facility set by the nearest ``tibabot_user_context``."""
    return getattr(_thread_local, "tibabot_facility", None)


def _resolve_facility_api_key(user: AbstractBaseUser) -> str | None:
    """
    Look up a per-facility TibaBot API key.

    Resolution order:
    1. Facility from thread-local (set by TenantMiddleware via request.facility)
    2. Fallback to user's staff_profile.primary_facility

    Returns the key string if found and active, otherwise ``None``
    (caller falls back to the session-level default from settings).
    """
    try:
        # 1. Prefer request-scoped facility (from TenantMiddleware / X-Facility-Id)
        facility = _get_current_facility()
        source = "request"

        # 2. Fallback to user's primary facility from staff profile
        if facility is None:
            profile = getattr(user, "staff_profile", None)
            if profile is None:
                logger.info("TibaBot key resolve: user %s has no staff_profile", user)
                return None
            facility = getattr(profile, "primary_facility", None)
            source = "staff_profile"

        if facility is None:
            logger.info(
                "TibaBot key resolve: user %s has no facility (checked request + profile)", user
            )
            return None

        fk = getattr(facility, "tibabot_key", None)
        if fk is None:
            logger.info(
                "TibaBot key resolve: facility %s (pk=%s, source=%s) has no tibabot_key record",
                facility.name,
                facility.pk,
                source,
            )
            return None
        if not fk.is_active:
            logger.info("TibaBot key resolve: facility %s key is inactive", facility.name)
            return None
        if not fk.api_key:
            logger.info("TibaBot key resolve: facility %s key is empty", facility.name)
            return None
        logger.info(
            "TibaBot key resolve: using per-facility key for %s (hash=%s, source=%s)",
            facility.name,
            fk.key_hash,
            source,
        )
        return fk.api_key
    except Exception:
        logger.warning("Could not resolve per-facility TibaBot key", exc_info=True)
    return None


class TibaBotError(Exception):
    """Base exception for TibaBot client errors."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class TibaBotUnavailableError(TibaBotError):
    """Raised when TibaBot is unreachable or returns a server error."""

    pass


class TibaBotClient:
    """
    HTTP client for communicating with the TibaBot AI service.

    Configuration via Django settings:
    - TIBABOT_API_URL: Base URL for TibaBot API
    - TIBABOT_API_KEY: API key for authentication
    - TIBABOT_TIMEOUT: Request timeout in seconds (default 30)
    """

    def __init__(self) -> None:
        self.base_url: str = getattr(
            settings,
            "TIBABOT_API_URL",
            "https://tibabot.vitora.nexora.africa",
        )
        raw_key: str = getattr(settings, "TIBABOT_API_KEY", "")
        # Support comma-separated key list — use the first key
        self.api_key: str = raw_key.split(",")[0].strip() if raw_key else ""
        self.timeout: int = getattr(settings, "TIBABOT_TIMEOUT", 30)

        # Configure session with retry logic
        self.session = requests.Session()
        retry_strategy = Retry(
            total=2,
            backoff_factor=0.5,
            status_forcelist=[502, 503, 504],
            allowed_methods=["GET", "POST"],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

        # Set default headers
        self.session.headers.update(
            {
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )
        if self.api_key:
            self.session.headers["X-API-Key"] = self.api_key

    def _request(
        self,
        method: str,
        endpoint: str,
        data: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Make an HTTP request to TibaBot.

        If a user is set via ``tibabot_user_context``, a short-lived JWT is
        minted and sent as ``Authorization: Bearer <jwt>`` alongside the
        facility ``X-API-Key`` header (dual-layer auth).

        Args:
            method: HTTP method (GET, POST)
            endpoint: API endpoint path (e.g., '/icd10/code')
            data: JSON body for POST requests
            params: Query parameters for GET requests

        Returns:
            Parsed JSON response

        Raises:
            TibaBotUnavailableError: When the service is unreachable
            TibaBotError: For other API errors
        """
        url = f"{self.base_url.rstrip('/')}/{endpoint.lstrip('/')}"

        # Per-request headers (user identity JWT + per-facility API key)
        headers: dict[str, str] = {}
        user = _get_current_user()
        if user is not None:
            # User-identity JWT (dual-layer auth layer 2)
            token = mint_tibabot_jwt(user)
            if token:
                headers["Authorization"] = f"Bearer {token}"

            # Per-facility API key override (dual-layer auth layer 1)
            facility_key = _resolve_facility_api_key(user)
            if facility_key:
                headers["X-API-Key"] = facility_key

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                timeout=self.timeout,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()  # type: ignore[no-any-return]

        except requests.exceptions.ConnectionError as e:
            logger.warning("TibaBot connection failed: %s", e)
            raise TibaBotUnavailableError("TibaBot AI service is currently unavailable.") from e

        except requests.exceptions.Timeout as e:
            logger.warning("TibaBot request timed out after %ds", self.timeout)
            raise TibaBotUnavailableError("TibaBot AI service request timed out.") from e

        except requests.exceptions.RetryError as e:
            logger.warning("TibaBot max retries exceeded: %s", e)
            raise TibaBotUnavailableError("TibaBot AI service is currently unavailable.") from e

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else None
            response_body = ""
            if e.response is not None:
                try:
                    response_body = e.response.text[:500]
                except Exception:
                    pass
            if status and status >= 500:
                logger.warning("TibaBot server error: %s", status)
                raise TibaBotUnavailableError(
                    "TibaBot AI service returned a server error.",
                    status_code=status,
                ) from e
            logger.error(
                "TibaBot API error: %s %s — response: %s",
                status,
                e,
                response_body,
            )
            raise TibaBotError(
                f"TibaBot API error: {e}",
                status_code=status,
            ) from e

    def suggest_icd10(self, clinical_text: str) -> dict[str, Any]:
        """
        Get ICD-10 code suggestions for clinical text.

        Sends sanitized clinical text to TibaBot's /icd10/code endpoint
        and returns ranked code suggestions with confidence scores.

        Args:
            clinical_text: Free-text clinical description (will be sanitized)

        Returns:
            Dict containing suggested ICD-10 codes with confidence scores:
            {
                "suggestions": [
                    {
                        "code": "B50.9",
                        "description": "Plasmodium falciparum malaria, unspecified",
                        "confidence": 0.92
                    },
                    ...
                ]
            }
        """
        sanitized = sanitize_clinical_text(clinical_text)
        return self._request(
            method="POST",
            endpoint="/icd10/code",
            data={"clinical_text": sanitized},
        )

    def suggest_icd10_typeahead(self, query: str, limit: int = 10) -> dict[str, Any]:
        """
        Get ICD-10 code suggestions as typeahead/autocomplete.

        Uses GET /icd10/suggest for quick suggestions while typing.

        Args:
            query: Search query text (will be sanitized)
            limit: Maximum number of suggestions (default 10)

        Returns:
            Dict containing suggested ICD-10 codes
        """
        sanitized = sanitize_clinical_text(query)
        return self._request(
            method="GET",
            endpoint="/icd10/suggest",
            params={"q": sanitized, "limit": limit},
        )

    # -----------------------------------------------------------------
    # Phase 2 — Clinical Chat & Assist
    # -----------------------------------------------------------------

    def clinical_chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Send a message in a clinical chat session.

        The payload is pre-enriched with user_context and facility_context
        by the view layer.  The message content is sanitized.

        Args:
            payload: Dict containing message, session_id (optional),
                     user_context, facility_context.

        Returns:
            Dict with session_id and assistant message.
        """
        # Sanitize the user message before forwarding
        if "message" in payload:
            payload["message"] = sanitize_clinical_text(payload["message"])
        return self._request(
            method="POST",
            endpoint="/clinical/chat",
            data=payload,
        )

    def clinical_assist(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Get encounter-aware clinical assistance.

        The payload is pre-enriched with user_context and facility_context
        by the view layer.

        Args:
            payload: Dict containing query, patient_context, encounter_context,
                     user_context, facility_context, verbosity.

        Returns:
            Dict with response text and optional references.
        """
        # Sanitize the query before forwarding
        if "query" in payload:
            payload["query"] = sanitize_clinical_text(payload["query"])
        return self._request(
            method="POST",
            endpoint="/clinical/assist",
            data=payload,
        )

    # -----------------------------------------------------------------
    # Phase 3 — Condition Predictor
    # -----------------------------------------------------------------

    def predict_condition(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Predict probable conditions from patient features.

        Sends age, gender, vitals, chief complaint, and lifestyle factors
        to TibaBot's ``POST /predict/condition`` endpoint for ML-based
        risk assessment.

        Args:
            payload: Dict containing patient_features with age, gender,
                     vitals, chief_complaint, etc.

        Returns:
            Dict with primary_condition, confidence, risk_factors, and
            differential_conditions.
        """
        return self._request(
            method="POST",
            endpoint="/predict/condition",
            data=payload,
        )

    # -----------------------------------------------------------------
    # Phase 4 — ICU Predictor
    # -----------------------------------------------------------------

    # Gender code → TibaBot full-word mapping
    _GENDER_MAP: ClassVar[dict[str, str]] = {
        "M": "Male",
        "F": "Female",
        "O": "Other",
    }

    def _prepare_icu_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Flatten and adapt *payload* to the schema TibaBot ICU endpoints expect.

        TibaBot expects patient fields at the **request body root** (not
        nested under ``patient_data``), ``oxygen_saturation`` instead of
        ``spo2``, and full-word gender values (``Male``/``Female``/``Other``).
        """
        patient_data: dict[str, Any] = dict(payload.get("patient_data", {}))

        # Rename spo2 → oxygen_saturation
        if "spo2" in patient_data:
            patient_data["oxygen_saturation"] = patient_data.pop("spo2")

        # Map gender code to full word
        raw_gender = patient_data.get("gender", "")
        patient_data["gender"] = self._GENDER_MAP.get(raw_gender, raw_gender)

        return patient_data

    def predict_icu(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Predict ICU admission risk for an admitted patient.

        Sends patient clinical data (vitals, labs, clinical context) to
        TibaBot's ``POST /predict/icu/predict`` endpoint for SOFA/qSOFA
        scoring and ICU risk assessment.

        Args:
            payload: Dict containing patient_data with age, gender,
                     vitals, lab values, clinical context, plus
                     user_context and facility_context.

        Returns:
            Dict with risk_level, risk_score, sofa_score, qsofa_score,
            critical_alerts, escalation recommendations.
        """
        return self._request(
            method="POST",
            endpoint="/predict/icu/predict",
            data=self._prepare_icu_payload(payload),
        )

    def predict_icu_risk_stratify(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Get composite risk stratification for sepsis, AKI, and deterioration.

        Sends patient clinical data to TibaBot's
        ``POST /predict/icu/risk-stratify`` endpoint for multi-condition
        probability scoring.

        Args:
            payload: Dict containing patient_data with age, gender,
                     vitals, lab values, clinical context, plus
                     user_context and facility_context.

        Returns:
            Dict with risk_level, risk_score, sepsis_probability,
            aki_probability, deterioration_probability, plus
            SOFA/qSOFA scores and recommendations.
        """
        return self._request(
            method="POST",
            endpoint="/predict/icu/risk-stratify",
            data=self._prepare_icu_payload(payload),
        )

    # -----------------------------------------------------------------
    # Phase 8 — Surgical Assistant
    # -----------------------------------------------------------------

    def assess_surgical_pre_op(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Run TibaBot surgical pre-operative risk assessment."""
        return self._request(
            method="POST",
            endpoint="/surgical/pre-op/assess",
            data=payload,
        )

    def start_surgical_checklist(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Start a TibaBot advisory WHO checklist session."""
        return self._request(
            method="POST",
            endpoint="/surgical/checklist/start",
            data=payload,
        )

    def advance_surgical_checklist(
        self,
        session_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Advance a TibaBot advisory WHO checklist session."""
        return self._request(
            method="POST",
            endpoint=f"/surgical/checklist/{session_id}/advance",
            data=payload,
        )

    def get_surgical_checklist_status(self, session_id: str) -> dict[str, Any]:
        """Fetch current TibaBot checklist session state."""
        return self._request(
            method="GET",
            endpoint=f"/surgical/checklist/{session_id}/status",
        )

    def generate_surgical_post_op_care_plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Generate a TibaBot post-operative care plan."""
        return self._request(
            method="POST",
            endpoint="/surgical/post-op/care-plan",
            data=payload,
        )

    def list_surgical_procedures(self) -> dict[str, Any]:
        """List TibaBot surgical procedure templates."""
        return self._request(
            method="GET",
            endpoint="/surgical/procedures",
        )

    def get_surgical_procedure(self, procedure_key: str) -> dict[str, Any]:
        """Get a TibaBot surgical procedure template."""
        return self._request(
            method="GET",
            endpoint=f"/surgical/procedures/{procedure_key}",
        )

    # -----------------------------------------------------------------
    # Phase 3 — Feedback
    # -----------------------------------------------------------------

    def submit_feedback(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Submit thumbs-up/down feedback on a TibaBot response.

        Args:
            payload: Dict with message_id, feedback ("up"/"down"),
                     and optional conversation_id, user_query,
                     bot_response, risk_level.

        Returns:
            Dict with status, message, and feedback_id.
        """
        return self._request(
            method="POST",
            endpoint="/feedback",
            data=payload,
        )

    def get_feedback_stats(self) -> dict[str, Any]:
        """
        Get aggregate feedback statistics.

        Returns:
            Dict with total_up, total_down, recent_negatives.
        """
        return self._request(
            method="GET",
            endpoint="/feedback/stats",
        )

    # -----------------------------------------------------------------
    # Phase 5 — Lab Assist
    # -----------------------------------------------------------------

    def interpret_lab(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Interpret lab results in clinical context.

        Sends lab results with patient demographics to TibaBot's
        ``POST /lab/interpret`` endpoint for reference range flagging
        and multi-lab pattern detection.

        Args:
            payload: Dict containing patient_age, patient_sex, lab_results[],
                     optional is_pregnant, gestational_weeks, diagnoses.

        Returns:
            Dict with flags, patterns, interpretation_summary,
            suggested_followup_labs, critical_alerts.
        """
        return self._request(
            method="POST",
            endpoint="/lab/interpret",
            data=payload,
        )

    # -----------------------------------------------------------------
    # Phase 5 — Discharge Readiness
    # -----------------------------------------------------------------

    def assess_discharge(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Assess patient discharge readiness.

        Sends patient clinical data to TibaBot's ``POST /discharge/assess``
        endpoint for condition-specific checklist evaluation.

        Args:
            payload: Dict containing patient_age, primary_diagnosis,
                     days_admitted, optional vitals_history, lab_results,
                     functional status, Kenya-specific social criteria.

        Returns:
            Dict with readiness_score, readiness_level, criteria[],
            recommendations, vitals_stability.
        """
        return self._request(
            method="POST",
            endpoint="/discharge/assess",
            data=payload,
        )

    def list_discharge_conditions(self) -> dict[str, Any]:
        """
        List conditions supported by discharge readiness assessment.

        Returns:
            Dict with conditions[] and count.
        """
        return self._request(
            method="GET",
            endpoint="/discharge/conditions",
        )

    # -----------------------------------------------------------------
    # Phase 5 — Care Plan Generator
    # -----------------------------------------------------------------

    def generate_care_plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Generate a structured, evidence-based care plan.

        Sends diagnosis and patient context to TibaBot's
        ``POST /care-plan/generate`` endpoint.

        Args:
            payload: Dict containing primary_diagnosis, patient_age,
                     patient_sex, optional comorbidities, allergies,
                     current_medications, facility_level, vitals, lab_results.

        Returns:
            Dict with goals, interventions, discharge_criteria,
            follow_up, references, cds_alerts, facility_level_notes.
        """
        return self._request(
            method="POST",
            endpoint="/care-plan/generate",
            data=payload,
        )

    def generate_care_plan_fhir(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Generate a care plan as an HL7 FHIR R4 CarePlan resource.

        Same input as ``generate_care_plan`` but returns FHIR R4 JSON.

        Args:
            payload: Same as ``generate_care_plan``.

        Returns:
            FHIR R4 CarePlan resource dict.
        """
        return self._request(
            method="POST",
            endpoint="/care-plan/generate/fhir",
            data=payload,
        )

    def list_care_plan_conditions(self) -> dict[str, Any]:
        """
        List conditions with care plan templates.

        Returns:
            Dict with conditions[] and count.
        """
        return self._request(
            method="GET",
            endpoint="/care-plan/conditions",
        )

    # -----------------------------------------------------------------
    # Phase 5 — Clerking Assist
    # -----------------------------------------------------------------

    # Map proxy field_name values to TibaBot cursor_section names.
    # TibaBot only accepts a fixed set of section names; nursing-specific
    # fields are mapped to the closest clinical equivalent.
    _SECTION_MAP: ClassVar[dict[str, str]] = {
        # Standard clerking fields (1:1)
        "chief_complaint": "presenting_complaint",
        "presenting_complaint": "presenting_complaint",
        "hpi": "hpi",
        "history": "hpi",
        "pmh": "pmh",
        "drug_history": "drug_history",
        "allergies": "allergies",
        "family_history": "family_history",
        "social_history": "social_history",
        "review_of_systems": "review_of_systems",
        "examination": "examination",
        "investigations": "investigations",
        "assessment": "assessment",
        "plan": "plan",
        # Nursing ADPIE → closest TibaBot section
        "nursing_assessment": "assessment",
        "nursing_diagnosis": "assessment",
        "nursing_goal": "plan",
        "nursing_plan_of_action": "plan",
        "scientific_rationale": "plan",
    }

    def clerking_autocomplete(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Context-aware medical autocomplete for clinical notes.

        Translates the proxy API fields (``text``, ``field_name``) to
        TibaBot's expected fields (``current_text``, ``cursor_section``).

        Args:
            payload: Dict containing text, field_name,
                     optional note_format, patient_context.

        Returns:
            Dict with suggestions[] (text, confidence, category).
        """
        # Build TibaBot-native payload
        raw_text = payload.get("text", "")
        field_name = payload.get("field_name", "assessment")

        tibabot_payload: dict[str, Any] = {
            "current_text": sanitize_clinical_text(raw_text),
            "cursor_section": self._SECTION_MAP.get(field_name, "assessment"),
        }

        # Forward optional fields that TibaBot accepts
        if payload.get("patient_context"):
            tibabot_payload["patient_context"] = payload["patient_context"]
        if payload.get("note_format"):
            tibabot_payload["specialty"] = (
                "internal_medicine"  # default specialty; note_format is a proxy concept
            )

        return self._request(
            method="POST",
            endpoint="/clerking/autocomplete",
            data=tibabot_payload,
        )

    def clerking_structure(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Convert free-text clinical notes to structured format.

        Sends free-text to TibaBot's ``POST /clerking/structure`` endpoint
        for SOAP/SBAR formatting.

        Args:
            payload: Dict containing free_text, note_format (soap/sbar).

        Returns:
            Dict with structured_note, sections[], original_text.
        """
        if "free_text" in payload:
            payload["free_text"] = sanitize_clinical_text(payload["free_text"])
        return self._request(
            method="POST",
            endpoint="/clerking/structure",
            data=payload,
        )

    # -----------------------------------------------------------------
    # Chat title inference
    # -----------------------------------------------------------------

    #: System prompt used for LLM-based chat title generation.
    TITLE_SYSTEM_PROMPT: ClassVar[str] = (
        "Generate a concise 3-8 word topic title for this clinical conversation. "
        "Reply with ONLY the title text — no quotes, no punctuation at the end, "
        "no explanation."
    )

    def generate_chat_title(self, user_message: str, assistant_message: str) -> str | None:
        """
        Infer a short topic title from the first user–assistant exchange.

        Uses the ``/clinical/chat`` endpoint with a title-generation system
        prompt.  Returns the title string or *None* on any failure so callers
        can fall back gracefully.

        A shorter timeout (8 s) is used since this is non-critical.
        """
        payload = {
            "message": (f"User message: {user_message}\n\nAssistant reply: {assistant_message}"),
            "system_instruction": self.TITLE_SYSTEM_PROMPT,
        }

        saved_timeout = self.timeout
        try:
            self.timeout = min(self.timeout, 8)
            result = self._request(method="POST", endpoint="/clinical/chat", data=payload)
        except (TibaBotError, TibaBotUnavailableError):
            logger.debug("Title generation failed — will use fallback")
            return None
        finally:
            self.timeout = saved_timeout

        # Extract the content from the response
        msg = result.get("message", {})
        if isinstance(msg, dict):
            title = msg.get("content", "")
        elif isinstance(msg, str):
            title = msg
        else:
            title = result.get("response", result.get("content", ""))

        title = str(title).strip().strip('"').strip("'").rstrip(".")
        return title[:120] if title else None

    # -----------------------------------------------------------------
    # Phase 6 — Clinical Document Generation
    # -----------------------------------------------------------------

    def generate_clinical_document(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Generate a structured clinical document via TibaBot.

        Sends patient, admission, encounter, and facility context to
        TibaBot's ``POST /clinical/document`` endpoint for LLM-powered
        document generation (discharge summaries, SOAP notes, progress
        notes, referral letters, clerking notes).

        Args:
            payload: Dict with document_type, patient_context,
                     admission_context, optional encounter_context,
                     facility_context, output_format, etc.

        Returns:
            Dict with document_type, sections[], full_text,
            suggested_icd10_codes[], safety_alerts[], citations[],
            processing_time_ms, model_used, disclaimer.
        """
        return self._request(
            method="POST",
            endpoint="/clinical/document",
            data=payload,
        )

    # -----------------------------------------------------------------
    # Phase 7 — Investigation Suggestions
    # -----------------------------------------------------------------

    def suggest_investigations(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Suggest investigations for a clinical encounter.

        Sends diagnoses, symptoms, existing orders, and patient context
        to TibaBot's ``POST /clinical/investigations/suggest`` endpoint.
        Returns structured suggestions with LOINC codes and optional
        FHIR R4 ServiceRequest resources.

        Args:
            payload: Dict containing chief_complaint, diagnoses[],
                     symptoms[], existing_orders[], existing_results{},
                     patient_age, patient_sex, is_pregnant, facility_level,
                     region, include_fhir, max_suggestions.

        Returns:
            Dict with suggestions[], fhir_service_requests[],
            matched_conditions[], cds_alerts_applied, total_suggestions,
            disclaimer.
        """
        return self._request(
            method="POST",
            endpoint="/clinical/investigations/suggest",
            data=payload,
        )

    # -----------------------------------------------------------------
    # Phase 5 — Enhanced CDS Evaluation
    # -----------------------------------------------------------------

    def evaluate_cds_rules(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Evaluate CDS rules via TibaBot (supplements local engine).

        Sends medications, diagnoses, symptoms, labs, and patient info
        to TibaBot's ``POST /cds/evaluate`` endpoint for DDI,
        contraindication, protocol-adherence, and formulary checks.

        Args:
            payload: Dict with medications[], diagnoses[], symptoms[],
                     lab_results{}, allergies[], patient_age, patient_sex,
                     optional is_pregnant, region, facility_level.

        Returns:
            Dict with alerts[], recommendations[], rules_evaluated,
            rules_fired, processing_time_ms.
        """
        return self._request(
            method="POST",
            endpoint="/cds/evaluate",
            data=payload,
        )


# Module-level singleton (created on first import — lazy via function)
_client: TibaBotClient | None = None


def get_tibabot_client() -> TibaBotClient:
    """Get or create the TibaBot client singleton."""
    global _client
    if _client is None:
        _client = TibaBotClient()
    return _client
