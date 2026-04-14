"""
Tests for HL7/MLLP Integration Service.

Phase C: External exchange wiring (HL7/MLLP) behind flags

Tests verify:
- Feature flag behavior (disabled vs enabled)
- ExternalCodeMapping integration for test code resolution
- Send order to LIS workflow
- Process ORU message workflow
- Management command functionality
"""

from datetime import date, datetime
from decimal import Decimal
from io import StringIO
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command

from hmis.apps.core.models import ExternalCodeMapping
from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog
from hmis.apps.laboratory.services.hl7_integration import (
    HL7IntegrationConfig,
    HL7IntegrationService,
    ProcessResultsResult,
    SendOrderResult,
    get_hl7_integration_service,
    is_hl7_integration_enabled,
)
from hmis.apps.laboratory.services.hl7_service import HL7LabResult

# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def hl7_integration_config_enabled():
    """Create enabled HL7 integration config."""
    return HL7IntegrationConfig(
        enabled=True,
        lis_code_system="LIS_TEST",
        mllp_host="localhost",
        mllp_port=2575,
    )


@pytest.fixture
def hl7_integration_config_disabled():
    """Create disabled HL7 integration config."""
    return HL7IntegrationConfig(
        enabled=False,
        lis_code_system="LIS_TEST",
    )


@pytest.fixture
def integration_service_enabled(hl7_integration_config_enabled):
    """Create enabled integration service."""
    return HL7IntegrationService(hl7_integration_config_enabled)


@pytest.fixture
def integration_service_disabled(hl7_integration_config_disabled):
    """Create disabled integration service."""
    return HL7IntegrationService(hl7_integration_config_disabled)


@pytest.fixture
def test_catalog(db):
    """Create test catalog entry."""
    return TestCatalog.objects.create(
        code="HB",
        name="Hemoglobin",
        short_name="Hb",
        loinc_code="718-7",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        cost=Decimal("250.00"),
    )


@pytest.fixture
def test_catalog_no_loinc(db):
    """Create test catalog without LOINC code."""
    return TestCatalog.objects.create(
        code="MTEST",
        name="Manual Test",
        short_name="MT",
        category="CHEMISTRY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        cost=Decimal("150.00"),
    )


@pytest.fixture
def external_code_mapping(db, test_catalog_no_loinc):
    """Create external code mapping for test catalog."""
    content_type = ContentType.objects.get_for_model(TestCatalog)
    return ExternalCodeMapping.objects.create(
        code_system="LIS_TEST",
        external_code="EXT-12345",
        external_display="External Manual Test",
        content_type=content_type,
        object_id=test_catalog_no_loinc.id,
        relationship="EQUIVALENT",
        is_active=True,
    )


@pytest.fixture
def lab_order_for_integration(
    db,
    sample_patient,
    sample_encounter,
    test_user,
    test_catalog,
    sample_organization,
    sample_facility,
):
    """Create lab order for integration testing."""
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        order_type="EXTERNAL",
        status="ORDERED",
        priority="ROUTINE",
        clinical_notes="Integration test order",
        facility=sample_facility,
        organization=sample_organization,
    )
    LabOrderItem.objects.create(
        lab_order=order,
        test=test_catalog,
        unit_cost=test_catalog.cost,
    )
    return order


@pytest.fixture
def lab_order_with_mapped_test(
    db,
    sample_patient,
    sample_encounter,
    test_user,
    test_catalog_no_loinc,
    external_code_mapping,
    sample_facility,
    sample_organization,
):
    """Create lab order with externally mapped test."""
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        order_type="EXTERNAL",
        status="ORDERED",
        priority="ROUTINE",
        clinical_notes="Mapped test order",
        facility=sample_facility,
        organization=sample_organization,
    )
    LabOrderItem.objects.create(
        lab_order=order,
        test=test_catalog_no_loinc,
        unit_cost=test_catalog_no_loinc.cost,
    )
    return order


@pytest.fixture
def sample_oru_message(lab_order_for_integration):
    """Create sample ORU message for testing."""
    order_number = lab_order_for_integration.order_number
    return f"""MSH|^~\\&|LAB_LIS|EXTERNAL_LAB|VITORA_HMIS|VITORA|20260215120000||ORU^R01|MSG001|P|2.5.1
PID|1||MRN-001||Doe^John||19900101|M
ORC|RE|{order_number}|EXT-001
OBR|1|{order_number}|EXT-001|718-7^Hemoglobin
OBX|1|NM|718-7^Hemoglobin||14.5|g/dL|12.0-15.0|N|||F|||20260215115500"""


@pytest.fixture
def sample_oru_with_external_code(lab_order_with_mapped_test):
    """Create ORU message with external code requiring mapping."""
    order_number = lab_order_with_mapped_test.order_number
    return f"""MSH|^~\\&|LAB_LIS|EXTERNAL_LAB|VITORA_HMIS|VITORA|20260215120000||ORU^R01|MSG002|P|2.5.1
PID|1||MRN-001||Doe^John||19900101|M
ORC|RE|{order_number}|EXT-002
OBR|1|{order_number}|EXT-002|EXT-12345^External Manual Test
OBX|1|NM|EXT-12345^External Manual Test||42.5|units||N|||F|||20260215115500"""


# ============================================================================
# Test Feature Flag Behavior
# ============================================================================


@pytest.mark.django_db
class TestHL7IntegrationFeatureFlag:
    """Tests for feature flag behavior."""

    def test_service_disabled_by_default(self):
        """Service should be disabled when config.enabled=False."""
        service = HL7IntegrationService(HL7IntegrationConfig(enabled=False))
        assert service.is_enabled is False

    def test_service_enabled_when_configured(self, hl7_integration_config_enabled):
        """Service should be enabled when config.enabled=True."""
        service = HL7IntegrationService(hl7_integration_config_enabled)
        assert service.is_enabled is True

    def test_send_order_returns_failure_when_disabled(
        self, integration_service_disabled, lab_order_for_integration
    ):
        """send_order_to_lis should return failure when disabled."""
        result = integration_service_disabled.send_order_to_lis(lab_order_for_integration)

        assert result.success is False
        assert result.error == "HL7 integration is disabled"

    def test_process_oru_returns_empty_when_disabled(
        self, integration_service_disabled, sample_oru_message, test_user
    ):
        """process_oru_message should return empty result when disabled."""
        result = integration_service_disabled.process_oru_message(sample_oru_message, test_user)

        assert result.success is False
        assert result.results_created == 0
        assert "HL7 integration is disabled" in result.errors

    def test_config_from_settings(self, settings):
        """Config should load from Django settings."""
        settings.HL7_INTEGRATION_ENABLED = True
        settings.HL7_LIS_CODE_SYSTEM = "TEST_SYSTEM"
        settings.MLLP_HOST = "test.host"
        settings.MLLP_PORT = 9999

        config = HL7IntegrationConfig.from_settings()

        assert config.enabled is True
        assert config.lis_code_system == "TEST_SYSTEM"
        assert config.mllp_host == "test.host"
        assert config.mllp_port == 9999


# ============================================================================
# Test Send Order to LIS
# ============================================================================


@pytest.mark.django_db
class TestSendOrderToLIS:
    """Tests for sending orders to external LIS."""

    def test_send_order_builds_orm_and_sends(
        self, integration_service_enabled, lab_order_for_integration
    ):
        """Should build ORM message and send via MLLP."""
        with (
            patch.object(integration_service_enabled, "_get_hl7_service") as mock_get_hl7,
            patch("hmis.apps.laboratory.services.mllp_client.MLLPClient") as mock_mllp_class,
        ):
            # Setup mocks
            mock_hl7_service = MagicMock()
            mock_hl7_service.build_orm_o01.return_value = (
                "MSH|^~\\&|...|MSG001|...\rPID|...\rORC|...\rOBR|..."
            )
            mock_hl7_service.parse_ack.return_value = MagicMock(
                ack_code="AA", text_message="Accepted"
            )
            mock_get_hl7.return_value = mock_hl7_service

            mock_mllp_instance = MagicMock()
            mock_mllp_instance.__enter__ = MagicMock(return_value=mock_mllp_instance)
            mock_mllp_instance.__exit__ = MagicMock(return_value=False)
            mock_mllp_instance.send_message.return_value = MagicMock(message="ACK response")
            mock_mllp_class.return_value = mock_mllp_instance

            result = integration_service_enabled.send_order_to_lis(lab_order_for_integration)

            assert result.success is True
            assert result.ack_code == "AA"
            mock_hl7_service.build_orm_o01.assert_called_once_with(lab_order_for_integration)
            mock_mllp_instance.send_message.assert_called_once()

    def test_send_order_handles_ack_rejection(
        self, integration_service_enabled, lab_order_for_integration
    ):
        """Should handle ACK rejection from LIS."""
        with (
            patch.object(integration_service_enabled, "_get_hl7_service") as mock_get_hl7,
            patch("hmis.apps.laboratory.services.mllp_client.MLLPClient") as mock_mllp_class,
        ):
            mock_hl7_service = MagicMock()
            mock_hl7_service.build_orm_o01.return_value = "MSH|..."
            mock_hl7_service.parse_ack.return_value = MagicMock(
                ack_code="AR", text_message="Invalid order"
            )
            mock_get_hl7.return_value = mock_hl7_service

            mock_mllp_instance = MagicMock()
            mock_mllp_instance.__enter__ = MagicMock(return_value=mock_mllp_instance)
            mock_mllp_instance.__exit__ = MagicMock(return_value=False)
            mock_mllp_instance.send_message.return_value = MagicMock(message="ACK")
            mock_mllp_class.return_value = mock_mllp_instance

            result = integration_service_enabled.send_order_to_lis(lab_order_for_integration)

            assert result.success is False
            assert result.ack_code == "AR"

    def test_send_order_handles_mllp_error(
        self, integration_service_enabled, lab_order_for_integration
    ):
        """Should handle MLLP connection errors gracefully."""
        from hmis.apps.laboratory.services.mllp_client import MLLPConnectionError

        with (
            patch.object(integration_service_enabled, "_get_hl7_service") as mock_get_hl7,
            patch("hmis.apps.laboratory.services.mllp_client.MLLPClient") as mock_mllp_class,
        ):
            mock_hl7_service = MagicMock()
            mock_hl7_service.build_orm_o01.return_value = "MSH|..."
            mock_get_hl7.return_value = mock_hl7_service

            mock_mllp_instance = MagicMock()
            mock_mllp_instance.__enter__ = MagicMock(
                side_effect=MLLPConnectionError("Connection refused")
            )
            mock_mllp_class.return_value = mock_mllp_instance

            result = integration_service_enabled.send_order_to_lis(lab_order_for_integration)

            assert result.success is False
            assert "MLLP transport error" in result.error


# ============================================================================
# Test Process ORU Message
# ============================================================================


@pytest.mark.django_db
class TestProcessORUMessage:
    """Tests for processing incoming ORU messages."""

    def test_process_oru_creates_lab_result(
        self, integration_service_enabled, sample_oru_message, test_user, lab_order_for_integration
    ):
        """Should parse ORU and create LabResult."""
        result = integration_service_enabled.process_oru_message(sample_oru_message, test_user)

        assert result.success is True
        assert result.results_created == 1
        assert len(result.lab_results) == 1

        # Verify created result
        lab_result = result.lab_results[0]
        assert lab_result.numeric_value == Decimal("14.5")
        assert lab_result.result_unit == "g/dL"
        assert lab_result.is_external_result is True
        assert lab_result.verification_status == "UNVERIFIED"

    def test_process_oru_uses_external_code_mapping(
        self,
        integration_service_enabled,
        sample_oru_with_external_code,
        test_user,
        lab_order_with_mapped_test,
        external_code_mapping,
    ):
        """Should resolve external code via ExternalCodeMapping."""
        result = integration_service_enabled.process_oru_message(
            sample_oru_with_external_code,
            test_user,
            code_system="LIS_TEST",
        )

        assert result.success is True
        assert result.results_created == 1

        # Verify the correct test was matched
        lab_result = result.lab_results[0]
        assert lab_result.order_item.test.code == "MTEST"
        assert lab_result.numeric_value == Decimal("42.5")

    def test_process_oru_handles_invalid_message(self, integration_service_enabled, test_user):
        """Should handle invalid ORU message gracefully."""
        invalid_message = "This is not a valid HL7 message"

        result = integration_service_enabled.process_oru_message(invalid_message, test_user)

        assert result.success is False
        assert "parse error" in result.errors[0].lower()

    def test_process_oru_handles_unknown_order(self, integration_service_enabled, test_user):
        """Should handle ORU with unknown order number."""
        oru_message = """MSH|^~\\&|LAB_LIS|EXTERNAL_LAB|VITORA_HMIS|VITORA|20260215120000||ORU^R01|MSG003|P|2.5.1
PID|1||MRN-001||Doe^John||19900101|M
ORC|RE|UNKNOWN-ORDER|EXT-001
OBR|1|UNKNOWN-ORDER|EXT-001|718-7^Hemoglobin
OBX|1|NM|718-7^Hemoglobin||14.5|g/dL|12.0-15.0|N|||F"""

        result = integration_service_enabled.process_oru_message(oru_message, test_user)

        assert result.success is False
        assert result.results_created == 0
        assert result.results_skipped == 1

    def test_process_oru_handles_unmapped_code(
        self, integration_service_enabled, test_user, lab_order_for_integration
    ):
        """Should skip results with unmapped external codes."""
        order_number = lab_order_for_integration.order_number
        oru_message = f"""MSH|^~\\&|LAB_LIS|EXTERNAL_LAB|VITORA_HMIS|VITORA|20260215120000||ORU^R01|MSG004|P|2.5.1
PID|1||MRN-001||Doe^John||19900101|M
ORC|RE|{order_number}|EXT-001
OBR|1|{order_number}|EXT-001|UNKNOWN-TEST^Unknown Test
OBX|1|NM|UNKNOWN-TEST^Unknown Test||99.9|units||N|||F"""

        result = integration_service_enabled.process_oru_message(oru_message, test_user)

        # Should not create result for unmapped code
        assert result.results_created == 0
        assert result.results_skipped == 1


# ============================================================================
# Test Utility Methods
# ============================================================================


@pytest.mark.django_db
class TestHL7IntegrationUtilities:
    """Tests for utility methods."""

    def test_validate_oru_message_valid(self, integration_service_enabled, sample_oru_message):
        """Should validate valid ORU message."""
        is_valid, message = integration_service_enabled.validate_oru_message(sample_oru_message)

        assert is_valid is True
        assert "result" in message.lower()

    def test_validate_oru_message_invalid(self, integration_service_enabled):
        """Should reject invalid ORU message."""
        is_valid, message = integration_service_enabled.validate_oru_message(
            "Not a valid HL7 message"
        )

        assert is_valid is False

    def test_validate_oru_message_empty(self, integration_service_enabled):
        """Should reject empty message."""
        is_valid, message = integration_service_enabled.validate_oru_message("")

        assert is_valid is False
        assert "empty" in message.lower()

    def test_generate_ack_message(self, integration_service_enabled):
        """Should generate valid ACK message."""
        ack = integration_service_enabled.generate_ack("MSG001", "AA", "Message accepted")

        assert "MSH|" in ack
        assert "MSA|AA|MSG001" in ack

    def test_singleton_service(self, settings):
        """Should return singleton service instance."""
        settings.HL7_INTEGRATION_ENABLED = False

        service1 = get_hl7_integration_service()
        service2 = get_hl7_integration_service()

        # Note: Singleton is reset per test, but within test they should be same
        assert service1 is service2

    def test_is_hl7_integration_enabled_helper(self, settings):
        """Should check enabled status via helper function."""
        settings.HL7_INTEGRATION_ENABLED = False

        # Reset singleton for this test
        import hmis.apps.laboratory.services.hl7_integration as module

        module._integration_service = None

        assert is_hl7_integration_enabled() is False


# ============================================================================
# Test Management Command
# ============================================================================


@pytest.mark.django_db
class TestHL7IngestCommand:
    """Tests for hl7_ingest management command."""

    def test_command_validate_mode(self, sample_oru_message, settings, tmp_path):
        """Should validate ORU message without importing."""
        settings.HL7_INTEGRATION_ENABLED = True

        # Write message to temp file
        oru_file = tmp_path / "test.hl7"
        oru_file.write_text(sample_oru_message)

        out = StringIO()
        call_command(
            "hl7_ingest",
            "--file",
            str(oru_file),
            "--validate",
            "--force",
            stdout=out,
        )

        output = out.getvalue()
        assert "Valid ORU message" in output or "✓" in output

    def test_command_requires_user_for_import(self, sample_oru_message, settings, tmp_path):
        """Should require --user for import mode."""
        settings.HL7_INTEGRATION_ENABLED = True

        oru_file = tmp_path / "test.hl7"
        oru_file.write_text(sample_oru_message)

        with pytest.raises(Exception) as exc_info:
            call_command(
                "hl7_ingest",
                "--file",
                str(oru_file),
                "--force",
            )

        assert "user" in str(exc_info.value).lower()

    def test_command_import_creates_results(
        self,
        sample_oru_message,
        settings,
        tmp_path,
        test_user,
        lab_order_for_integration,
    ):
        """Should import results when user provided."""
        settings.HL7_INTEGRATION_ENABLED = True

        oru_file = tmp_path / "test.hl7"
        oru_file.write_text(sample_oru_message)

        out = StringIO()
        call_command(
            "hl7_ingest",
            "--file",
            str(oru_file),
            "--user",
            test_user.username,
            "--force",
            stdout=out,
        )

        output = out.getvalue()
        assert "Results created: 1" in output

    def test_command_disabled_without_force(self, sample_oru_message, settings, tmp_path):
        """Should fail when disabled and no --force flag."""
        settings.HL7_INTEGRATION_ENABLED = False

        oru_file = tmp_path / "test.hl7"
        oru_file.write_text(sample_oru_message)

        with pytest.raises(Exception) as exc_info:
            call_command(
                "hl7_ingest",
                "--file",
                str(oru_file),
                "--validate",
            )

        assert "disabled" in str(exc_info.value).lower()

    def test_command_code_system_override(
        self,
        sample_oru_with_external_code,
        settings,
        tmp_path,
        test_user,
        lab_order_with_mapped_test,
        external_code_mapping,
    ):
        """Should use overridden code system for mapping."""
        settings.HL7_INTEGRATION_ENABLED = True

        oru_file = tmp_path / "test.hl7"
        oru_file.write_text(sample_oru_with_external_code)

        out = StringIO()
        call_command(
            "hl7_ingest",
            "--file",
            str(oru_file),
            "--user",
            test_user.username,
            "--code-system",
            "LIS_TEST",
            "--force",
            stdout=out,
        )

        output = out.getvalue()
        assert "Results created: 1" in output
