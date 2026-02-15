"""
HL7/MLLP Integration Service for External LIS Communication.

This module provides high-level integration for sending lab orders to external
Laboratory Information Systems (LIS) and receiving results via HL7 v2.x over MLLP.

Phase C: External exchange wiring (HL7/MLLP) behind flags

Key features:
- Feature-flagged: All operations are no-ops when HL7_INTEGRATION_ENABLED=False
- Uses ExternalCodeMapping for test code resolution
- Supports both send (ORM^O01) and receive (ORU^R01) workflows
- Provides controlled ingestion for testing without always-on socket listener

Usage:
    from hmis.apps.laboratory.services.hl7_integration import HL7IntegrationService

    service = HL7IntegrationService()

    # Send order to external LIS
    success, ack = service.send_order_to_lis(lab_order)

    # Process incoming ORU message
    results = service.process_oru_message(oru_message, user)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.conf import settings
from django.contrib.auth import get_user_model

if TYPE_CHECKING:
    from hmis.apps.laboratory.models import LabOrder, LabResult

logger = logging.getLogger(__name__)
User = get_user_model()


@dataclass
class HL7IntegrationConfig:
    """Configuration for HL7/MLLP integration."""

    enabled: bool = False
    lis_code_system: str = "LIS_DEFAULT"
    mllp_host: str = "localhost"
    mllp_port: int = 2575
    mllp_timeout: float = 30.0
    mllp_receive_timeout: float = 60.0
    mllp_max_retries: int = 3
    mllp_use_ssl: bool = False
    mllp_ssl_verify: bool = True
    mllp_ssl_cert_file: str = ""
    mllp_ssl_key_file: str = ""
    mllp_ssl_ca_file: str = ""

    @classmethod
    def from_settings(cls) -> HL7IntegrationConfig:
        """Create config from Django settings."""
        return cls(
            enabled=getattr(settings, "HL7_INTEGRATION_ENABLED", False),
            lis_code_system=getattr(settings, "HL7_LIS_CODE_SYSTEM", "LIS_DEFAULT"),
            mllp_host=getattr(settings, "MLLP_HOST", "localhost"),
            mllp_port=getattr(settings, "MLLP_PORT", 2575),
            mllp_timeout=getattr(settings, "MLLP_TIMEOUT", 30.0),
            mllp_receive_timeout=getattr(settings, "MLLP_RECEIVE_TIMEOUT", 60.0),
            mllp_max_retries=getattr(settings, "MLLP_MAX_RETRIES", 3),
            mllp_use_ssl=getattr(settings, "MLLP_USE_SSL", False),
            mllp_ssl_verify=getattr(settings, "MLLP_SSL_VERIFY", True),
            mllp_ssl_cert_file=getattr(settings, "MLLP_SSL_CERT_FILE", ""),
            mllp_ssl_key_file=getattr(settings, "MLLP_SSL_KEY_FILE", ""),
            mllp_ssl_ca_file=getattr(settings, "MLLP_SSL_CA_FILE", ""),
        )


@dataclass
class SendOrderResult:
    """Result of sending an order to external LIS."""

    success: bool
    message_control_id: str
    ack_code: str | None = None
    ack_message: str | None = None
    error: str | None = None
    raw_message: str | None = None
    raw_ack: str | None = None


@dataclass
class ProcessResultsResult:
    """Result of processing ORU message."""

    success: bool
    results_created: int
    results_skipped: int
    errors: list[str]
    lab_results: list[LabResult]


class HL7IntegrationService:
    """
    High-level HL7/MLLP integration service.

    Orchestrates HL7 message building, MLLP transport, and result import
    with ExternalCodeMapping support for test code resolution.

    All operations check the HL7_INTEGRATION_ENABLED flag and are no-ops
    when disabled, ensuring the system behaves unchanged.
    """

    def __init__(self, config: HL7IntegrationConfig | None = None):
        """
        Initialize the integration service.

        Args:
            config: Optional configuration. If not provided, loads from settings.
        """
        self.config = config or HL7IntegrationConfig.from_settings()
        self._hl7_service = None
        self._mllp_client = None

    @property
    def is_enabled(self) -> bool:
        """Check if HL7 integration is enabled."""
        return self.config.enabled

    def _get_hl7_service(self):
        """Lazy-load HL7 service."""
        if self._hl7_service is None:
            from .hl7_service import HL7Service

            self._hl7_service = HL7Service()
        return self._hl7_service

    def _get_mllp_config(self):
        """Get MLLP configuration."""
        from .mllp_client import MLLPConfig

        return MLLPConfig(
            host=self.config.mllp_host,
            port=self.config.mllp_port,
            timeout=self.config.mllp_timeout,
            receive_timeout=self.config.mllp_receive_timeout,
            max_retries=self.config.mllp_max_retries,
            use_ssl=self.config.mllp_use_ssl,
            ssl_verify=self.config.mllp_ssl_verify,
            ssl_cert_file=self.config.mllp_ssl_cert_file or None,
            ssl_key_file=self.config.mllp_ssl_key_file or None,
            ssl_ca_file=self.config.mllp_ssl_ca_file or None,
        )

    def send_order_to_lis(self, lab_order: LabOrder) -> SendOrderResult:
        """
        Send a lab order to external LIS via HL7/MLLP.

        Builds an ORM^O01 message from the lab order and sends it via MLLP.
        Waits for and parses the ACK response.

        Args:
            lab_order: LabOrder instance to send

        Returns:
            SendOrderResult with status and details
        """
        if not self.is_enabled:
            logger.debug("HL7 integration disabled, skipping send_order_to_lis")
            return SendOrderResult(
                success=False,
                message_control_id="",
                error="HL7 integration is disabled",
            )

        from hmis.apps.laboratory.services.hl7_service import HL7ServiceError
        from hmis.apps.laboratory.services.mllp_client import MLLPClient, MLLPError

        hl7_service = self._get_hl7_service()

        try:
            # Build ORM^O01 message
            message = hl7_service.build_orm_o01(lab_order)

            # Extract message control ID from MSH segment
            msh_line = message.split("\r")[0]
            msh_fields = msh_line.split("|")
            message_control_id = msh_fields[9] if len(msh_fields) > 9 else ""

            logger.info(
                "Sending ORM^O01 for order %s (msg_id: %s)",
                lab_order.order_number,
                message_control_id,
            )

            # Send via MLLP
            mllp_config = self._get_mllp_config()
            client = MLLPClient(mllp_config)

            with client:
                response = client.send_message(message)

            # Parse ACK response
            ack = hl7_service.parse_ack(response.message)

            success = ack.ack_code == "AA"
            if not success:
                logger.warning(
                    "Order %s rejected by LIS: %s - %s",
                    lab_order.order_number,
                    ack.ack_code,
                    ack.text_message,
                )

            return SendOrderResult(
                success=success,
                message_control_id=message_control_id,
                ack_code=ack.ack_code,
                ack_message=ack.text_message,
                raw_message=message,
                raw_ack=response.message,
            )

        except HL7ServiceError as e:
            logger.exception("HL7 service error sending order %s", lab_order.order_number)
            return SendOrderResult(
                success=False,
                message_control_id="",
                error=f"HL7 service error: {e!s}",
            )
        except MLLPError as e:
            logger.exception("MLLP error sending order %s", lab_order.order_number)
            return SendOrderResult(
                success=False,
                message_control_id="",
                error=f"MLLP transport error: {e!s}",
            )
        except Exception as e:
            logger.exception("Unexpected error sending order %s", lab_order.order_number)
            return SendOrderResult(
                success=False,
                message_control_id="",
                error=f"Unexpected error: {e!s}",
            )

    def process_oru_message(
        self,
        oru_message: str,
        entered_by,
        code_system: str | None = None,
    ) -> ProcessResultsResult:
        """
        Process an incoming ORU^R01 message and create lab results.

        Parses the ORU message, resolves external test codes via ExternalCodeMapping,
        and creates LabResult records.

        Args:
            oru_message: Raw HL7 ORU^R01 message string
            entered_by: User who is importing the results
            code_system: Optional code system override for ExternalCodeMapping lookup.
                         Defaults to HL7_LIS_CODE_SYSTEM from settings.

        Returns:
            ProcessResultsResult with created results and any errors
        """
        if not self.is_enabled:
            logger.debug("HL7 integration disabled, skipping process_oru_message")
            return ProcessResultsResult(
                success=False,
                results_created=0,
                results_skipped=0,
                errors=["HL7 integration is disabled"],
                lab_results=[],
            )

        from .hl7_service import HL7ParseError, HL7ServiceError

        hl7_service = self._get_hl7_service()
        code_system = code_system or self.config.lis_code_system

        results_created: list[LabResult] = []
        results_skipped = 0
        errors: list[str] = []

        try:
            # Parse ORU message
            parsed_results = hl7_service.parse_oru_r01(oru_message)

            logger.info(
                "Parsed ORU message with %d results, code_system=%s",
                len(parsed_results),
                code_system,
            )

            for hl7_result in parsed_results:
                try:
                    # Try to resolve external code via ExternalCodeMapping
                    resolved_result = self._resolve_and_import_result(
                        hl7_result, entered_by, code_system
                    )

                    if resolved_result:
                        results_created.append(resolved_result)
                    else:
                        results_skipped += 1
                        errors.append(
                            f"Could not import result for test code {hl7_result.test_code}, "
                            f"order {hl7_result.placer_order_number}"
                        )

                except Exception as e:
                    logger.exception(
                        "Error importing result for test %s", hl7_result.test_code
                    )
                    errors.append(f"Error importing {hl7_result.test_code}: {e!s}")
                    results_skipped += 1

            success = len(results_created) > 0 or (
                len(parsed_results) == 0 and len(errors) == 0
            )

            return ProcessResultsResult(
                success=success,
                results_created=len(results_created),
                results_skipped=results_skipped,
                errors=errors,
                lab_results=results_created,
            )

        except (HL7ParseError, HL7ServiceError) as e:
            logger.exception("HL7 parse error processing ORU message")
            return ProcessResultsResult(
                success=False,
                results_created=0,
                results_skipped=0,
                errors=[f"HL7 parse error: {e!s}"],
                lab_results=[],
            )
        except Exception as e:
            logger.exception("Unexpected error processing ORU message")
            return ProcessResultsResult(
                success=False,
                results_created=0,
                results_skipped=0,
                errors=[f"Unexpected error: {e!s}"],
                lab_results=[],
            )

    def _resolve_and_import_result(
        self,
        hl7_result,
        entered_by,
        code_system: str,
    ) -> LabResult | None:
        """
        Resolve external test code and import result.

        First attempts to resolve the test code via ExternalCodeMapping.
        If no mapping found, falls back to direct LOINC/internal code lookup.

        Args:
            hl7_result: Parsed HL7LabResult object
            entered_by: User importing the result
            code_system: External code system for mapping lookup

        Returns:
            Created LabResult or None if import failed
        """
        from hmis.apps.core.models import ExternalCodeMapping
        from hmis.apps.laboratory.models import LabOrder, TestCatalog

        test_code = hl7_result.test_code
        order_number = hl7_result.placer_order_number

        if not order_number:
            logger.warning("HL7 result has no placer order number, skipping")
            return None

        # Find the lab order
        try:
            order = LabOrder.objects.get(order_number=order_number)
        except LabOrder.DoesNotExist:
            logger.warning("Lab order not found: %s", order_number)
            return None

        # Try to resolve via ExternalCodeMapping first
        test_catalog = ExternalCodeMapping.resolve(code_system, test_code)

        if test_catalog and isinstance(test_catalog, TestCatalog):
            logger.debug(
                "Resolved external code %s:%s to TestCatalog %s",
                code_system,
                test_code,
                test_catalog.code,
            )
            # Find matching order item by resolved test
            order_item = order.items.filter(test=test_catalog).first()
        else:
            # Fallback: Try LOINC code or internal code direct lookup
            logger.debug(
                "No ExternalCodeMapping found for %s:%s, trying direct lookup",
                code_system,
                test_code,
            )
            order_item = (
                order.items.filter(test__loinc_code=test_code).first()
                or order.items.filter(test__code=test_code).first()
            )

        if not order_item:
            logger.warning(
                "No matching order item for test code %s in order %s",
                test_code,
                order_number,
            )
            return None

        # Create LabResult directly (don't delegate to hl7_service.import_result
        # which would re-resolve the test code and fail for external codes)
        return self._create_lab_result_from_hl7(order_item, hl7_result, entered_by)

    def _create_lab_result_from_hl7(
        self,
        order_item,
        hl7_result,
        entered_by,
    ) -> LabResult | None:
        """
        Create a LabResult from parsed HL7 data.

        Args:
            order_item: The resolved LabOrderItem
            hl7_result: Parsed HL7LabResult object
            entered_by: User creating the result

        Returns:
            Created LabResult or None if already exists
        """
        import contextlib
        import decimal

        from django.utils import timezone

        from hmis.apps.laboratory.models import LabResult

        # Check if result already exists
        if hasattr(order_item, "result") and order_item.result:
            logger.warning(
                "Result already exists for order item %s",
                order_item.id,
            )
            return None

        # Parse numeric value if possible
        numeric_value = None
        text_value = hl7_result.value

        with contextlib.suppress(ValueError, TypeError, decimal.InvalidOperation):
            numeric_value = decimal.Decimal(str(hl7_result.value))

        # Map HL7 abnormal flags to our flags
        flag_map = {
            "L": "LOW",
            "LL": "CRITICAL_LOW",
            "H": "HIGH",
            "HH": "CRITICAL_HIGH",
            "A": "ABNORMAL",
            "N": "NORMAL",
            "POS": "POSITIVE",
            "NEG": "NEGATIVE",
        }
        result_flag = flag_map.get(hl7_result.abnormal_flag or "", "")

        # Create the lab result
        lab_result = LabResult.objects.create(
            order_item=order_item,
            numeric_value=numeric_value,
            text_value=text_value if numeric_value is None else "",
            result_unit=hl7_result.units or "",
            reference_range_text=hl7_result.reference_range or "",
            result_flag=result_flag,
            is_external_result=True,
            external_result_date=hl7_result.result_datetime.date()
            if hl7_result.result_datetime
            else None,
            entered_by=entered_by,
            verification_status="UNVERIFIED",
        )

        # Update order item status
        order_item.status = "COMPLETED"
        order_item.save(update_fields=["status", "updated_at"])

        # Check if all order items are complete
        order = order_item.lab_order
        if order.is_complete():
            order.status = "COMPLETED"
            order.completed_at = timezone.now()
            order.save(update_fields=["status", "completed_at", "updated_at"])

        logger.info(
            "Created LabResult for order item %s from HL7 data",
            order_item.id,
        )

        return lab_result

    def generate_ack(
        self,
        original_message_control_id: str,
        ack_code: str,
        text_message: str,
        error_code: str | None = None,
    ) -> str:
        """
        Generate ACK message for an incoming HL7 message.

        Args:
            original_message_control_id: Control ID from original message
            ack_code: AA (Accept), AE (Error), AR (Reject)
            text_message: Human-readable message
            error_code: Optional error code

        Returns:
            HL7 ACK message string
        """
        hl7_service = self._get_hl7_service()
        return hl7_service.build_ack(
            original_message_control_id, ack_code, text_message, error_code
        )

    def validate_oru_message(self, oru_message: str) -> tuple[bool, str]:
        """
        Validate an ORU message without importing.

        Useful for testing message format before actual ingestion.

        Args:
            oru_message: Raw HL7 ORU^R01 message string

        Returns:
            Tuple of (is_valid, error_message)
        """
        from .hl7_service import HL7ParseError, HL7ServiceError

        if not oru_message:
            return False, "Empty message"

        hl7_service = self._get_hl7_service()

        try:
            results = hl7_service.parse_oru_r01(oru_message)
            return True, f"Valid ORU message with {len(results)} result(s)"
        except (HL7ParseError, HL7ServiceError) as e:
            return False, str(e)
        except Exception as e:
            return False, f"Unexpected error: {e!s}"


# Module-level singleton for convenience
_integration_service: HL7IntegrationService | None = None


def get_hl7_integration_service() -> HL7IntegrationService:
    """Get or create the HL7 integration service singleton."""
    global _integration_service
    if _integration_service is None:
        _integration_service = HL7IntegrationService()
    return _integration_service


def is_hl7_integration_enabled() -> bool:
    """Check if HL7 integration is enabled."""
    return get_hl7_integration_service().is_enabled
