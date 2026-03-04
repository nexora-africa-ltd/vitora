"""
TibaBot API client.

Handles communication with the TibaBot AI service, including:
- Retry logic with exponential backoff
- Timeout management
- Error handling with graceful degradation
- Request sanitization (PII stripping)
"""

import logging
from typing import Any

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .sanitizer import sanitize_clinical_text

logger = logging.getLogger(__name__)


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
            "https://tibabot.hmis.nexora.africa",
        )
        self.api_key: str = getattr(settings, "TIBABOT_API_KEY", "")
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

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()  # type: ignore[no-any-return]

        except requests.exceptions.ConnectionError as e:
            logger.warning("TibaBot connection failed: %s", e)
            raise TibaBotUnavailableError(
                "TibaBot AI service is currently unavailable."
            ) from e

        except requests.exceptions.Timeout as e:
            logger.warning("TibaBot request timed out after %ds", self.timeout)
            raise TibaBotUnavailableError(
                "TibaBot AI service request timed out."
            ) from e

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else None
            if status and status >= 500:
                logger.warning("TibaBot server error: %s", status)
                raise TibaBotUnavailableError(
                    "TibaBot AI service returned a server error.",
                    status_code=status,
                ) from e
            logger.error("TibaBot API error: %s %s", status, e)
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

    def suggest_icd10_typeahead(
        self, query: str, limit: int = 10
    ) -> dict[str, Any]:
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
            data=payload,
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
            data=payload,
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


# Module-level singleton (created on first import — lazy via function)
_client: TibaBotClient | None = None


def get_tibabot_client() -> TibaBotClient:
    """Get or create the TibaBot client singleton."""
    global _client
    if _client is None:
        _client = TibaBotClient()
    return _client
