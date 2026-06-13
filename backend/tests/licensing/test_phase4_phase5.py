# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for Phase 4 (Distribution Hardening) and Phase 5 (Aggressive Controls).

Covers:
- Update service (check, download, verify, apply)
- Container image operations (pull, sign, verify)
- Watermarking (build ID generation, embedding, retrieval)
- Canary tokens (generation, verification, identification)
- SQLCipher backend (key derivation, split-key, recovery)
- TPM attestation (availability check, PCR measurement, quote)
- Installation model Phase 4/5 fields
"""

import hashlib
import hmac
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings

from hmis.apps.licensing.canary import (
    generate_canary_token,
    generate_honeypot_strings,
    generate_log_canary,
    generate_pdf_canary,
    identify_installation_from_canary,
    verify_canary_token,
    write_canary_file,
)
from hmis.apps.licensing.sqlcipher_backend import (
    apply_recovery_key,
    derive_database_key,
    generate_recovery_key,
    get_local_key_part,
    get_pragma_statements,
    is_database_accessible,
    store_cloud_key_part,
)
from hmis.apps.licensing.update_service import (
    UpdateInfo,
    _is_newer_version,
    _verify_staged_manifest,
    check_for_update,
    rollback_update,
)
from hmis.apps.licensing.watermark import (
    _derive_build_id,
    embed_build_id_in_file,
    generate_build_id,
    get_build_id,
    get_export_metadata,
    get_log_prefix,
    get_pdf_metadata,
    get_response_headers,
    verify_build_id,
)

# ===========================================================================
# Phase 4: Update Service Tests
# ===========================================================================


class TestVersionComparison:
    """Tests for semantic version comparison logic."""

    def test_newer_major_version(self):
        assert _is_newer_version("2.0.0", "1.9.9") is True

    def test_newer_minor_version(self):
        assert _is_newer_version("1.5.0", "1.4.9") is True

    def test_newer_patch_version(self):
        assert _is_newer_version("1.4.6", "1.4.5") is True

    def test_same_version_not_newer(self):
        assert _is_newer_version("1.4.5", "1.4.5") is False

    def test_older_version_not_newer(self):
        assert _is_newer_version("1.4.4", "1.4.5") is False

    def test_different_length_versions(self):
        assert _is_newer_version("1.5", "1.4.9") is True

    def test_invalid_version_string(self):
        assert _is_newer_version("abc", "1.0.0") is False

    def test_empty_version(self):
        assert _is_newer_version("", "1.0.0") is False


class TestCheckForUpdate:
    """Tests for the update check functionality."""

    @patch("hmis.apps.licensing.update_service.requests.get")
    @patch("hmis.apps.licensing.update_service._detect_delivery_mode")
    def test_update_available_returns_info(self, mock_mode, mock_get):
        mock_mode.return_value = "native"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "version": "2.0.0",
            "channel": "stable",
            "url": "https://get.vitora.digital/hub/vitora-hub-2.0.0.tar.gz",
            "sha256": "abc123",
        }
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        result = check_for_update("1.0.0")

        assert result is not None
        assert result.version == "2.0.0"
        assert result.is_tarball_update is True
        assert result.is_container_update is False

    @patch("hmis.apps.licensing.update_service.requests.get")
    @patch("hmis.apps.licensing.update_service._detect_delivery_mode")
    def test_no_update_available(self, mock_mode, mock_get):
        mock_mode.return_value = "native"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"version": "1.0.0"}
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        result = check_for_update("1.0.0")
        assert result is None

    @patch("hmis.apps.licensing.update_service.requests.get")
    @patch("hmis.apps.licensing.update_service._detect_delivery_mode")
    def test_container_update_detected(self, mock_mode, mock_get):
        mock_mode.return_value = "container"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "version": "2.0.0",
            "channel": "stable",
            "digest": "sha256:abc123def456",
        }
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        result = check_for_update("1.0.0")

        assert result is not None
        assert result.is_container_update is True
        assert result.digest == "sha256:abc123def456"

    @patch("hmis.apps.licensing.update_service.requests.get")
    @patch("hmis.apps.licensing.update_service._detect_delivery_mode")
    def test_network_failure_returns_none(self, mock_mode, mock_get):
        mock_mode.return_value = "native"
        import requests

        mock_get.side_effect = requests.ConnectionError("no network")

        result = check_for_update("1.0.0")
        assert result is None

    @patch("hmis.apps.licensing.update_service.requests.get")
    @patch("hmis.apps.licensing.update_service._detect_delivery_mode")
    def test_auth_header_sent_with_license(self, mock_mode, mock_get):
        mock_mode.return_value = "native"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"version": "1.0.0"}
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value = mock_response

        check_for_update("1.0.0", license_token="my-jwt-token")

        call_kwargs = mock_get.call_args[1]
        assert call_kwargs["headers"]["Authorization"] == "Bearer my-jwt-token"


class TestStagedManifestVerification:
    """Tests for verifying update payload integrity."""

    def test_valid_manifest_passes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)

            # Create a file
            test_file = base / "hmis" / "apps" / "core.so"
            test_file.parent.mkdir(parents=True)
            test_file.write_bytes(b"compiled binary content")
            file_hash = hashlib.sha256(b"compiled binary content").hexdigest()

            # Create manifest
            manifest = {"files": {"hmis/apps/core.so": file_hash}}
            manifest_path = base / "manifest.json"
            manifest_path.write_text(json.dumps(manifest))

            assert _verify_staged_manifest(manifest_path) is True

    def test_corrupted_file_fails(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)

            test_file = base / "hmis" / "apps" / "core.so"
            test_file.parent.mkdir(parents=True)
            test_file.write_bytes(b"corrupted content")

            manifest = {"files": {"hmis/apps/core.so": "wrong_hash_value"}}
            manifest_path = base / "manifest.json"
            manifest_path.write_text(json.dumps(manifest))

            assert _verify_staged_manifest(manifest_path) is False

    def test_missing_file_fails(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)

            manifest = {"files": {"hmis/apps/missing.so": "some_hash"}}
            manifest_path = base / "manifest.json"
            manifest_path.write_text(json.dumps(manifest))

            assert _verify_staged_manifest(manifest_path) is False

    def test_empty_manifest_fails(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            manifest_path = Path(tmpdir) / "manifest.json"
            manifest_path.write_text(json.dumps({"files": {}}))

            assert _verify_staged_manifest(manifest_path) is False


class TestRollbackUpdate:
    """Tests for the rollback mechanism."""

    @override_settings(HUB_INSTALL_DIR="/nonexistent/path")
    def test_rollback_no_previous_version(self):
        assert rollback_update() is False


class TestUpdateInfo:
    """Tests for the UpdateInfo dataclass."""

    def test_tarball_update_detection(self):
        info = UpdateInfo(
            version="2.0.0",
            channel="stable",
            url="https://example.com/hub.tar.gz",
            sha256="abc",
        )
        assert info.is_tarball_update is True
        assert info.is_container_update is False

    def test_container_update_detection(self):
        info = UpdateInfo(
            version="2.0.0",
            channel="stable",
            digest="sha256:abc123",
        )
        assert info.is_container_update is True
        assert info.is_tarball_update is False


# ===========================================================================
# Phase 5A: SQLCipher Backend Tests
# ===========================================================================


class TestDatabaseKeyDerivation:
    """Tests for the split-key database encryption."""

    def test_derive_key_from_two_parts(self):
        key = derive_database_key("local_abc", "cloud_xyz")
        assert len(key) == 64  # SHA-256 hex
        assert key.isalnum()

    def test_key_changes_with_different_local_part(self):
        key1 = derive_database_key("local_a", "cloud_xyz")
        key2 = derive_database_key("local_b", "cloud_xyz")
        assert key1 != key2

    def test_key_changes_with_different_cloud_part(self):
        key1 = derive_database_key("local_abc", "cloud_1")
        key2 = derive_database_key("local_abc", "cloud_2")
        assert key1 != key2

    def test_key_is_deterministic(self):
        key1 = derive_database_key("local_abc", "cloud_xyz")
        key2 = derive_database_key("local_abc", "cloud_xyz")
        assert key1 == key2

    def test_missing_local_part_raises(self):
        with pytest.raises(ValueError):
            derive_database_key("", "cloud_xyz")

    def test_missing_cloud_part_raises(self):
        with pytest.raises(ValueError):
            derive_database_key("local_abc", "")


class TestCloudKeyStorage:
    """Tests for cloud key part caching."""

    def test_store_and_retrieve_cloud_key(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_path = Path(tmpdir) / "cloud_key.json"
            with patch(
                "hmis.apps.licensing.sqlcipher_backend._get_cloud_key_cache_path",
                return_value=cache_path,
            ):
                from hmis.apps.licensing.sqlcipher_backend import get_cloud_key_part

                assert store_cloud_key_part("test_cloud_key") is True
                result = get_cloud_key_part()
                assert result == "test_cloud_key"

    def test_expired_cloud_key_returns_none(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_path = Path(tmpdir) / "cloud_key.json"
            # Write an expired key (issued_at far in the past)
            import time

            data = {"cloud_key": "expired_key", "issued_at": time.time() - (15 * 86400)}
            cache_path.write_text(json.dumps(data))

            with patch(
                "hmis.apps.licensing.sqlcipher_backend._get_cloud_key_cache_path",
                return_value=cache_path,
            ):
                from hmis.apps.licensing.sqlcipher_backend import get_cloud_key_part

                result = get_cloud_key_part()
                assert result is None


class TestDatabaseAccessibility:
    """Tests for database accessibility checks."""

    @override_settings(SQLCIPHER_ENABLED=False)
    def test_plain_mode_always_accessible(self):
        assert is_database_accessible() is True

    @override_settings(SQLCIPHER_ENABLED=True)
    @patch("hmis.apps.licensing.sqlcipher_backend.get_cloud_key_part", return_value=None)
    @patch("hmis.apps.licensing.sqlcipher_backend.get_local_key_part", return_value="abc")
    def test_missing_cloud_key_not_accessible(self, mock_local, mock_cloud):
        assert is_database_accessible() is False


class TestPragmaStatements:
    """Tests for SQLCipher PRAGMA generation."""

    @override_settings(SQLCIPHER_ENABLED=False)
    def test_disabled_returns_empty(self):
        assert get_pragma_statements() == []

    @override_settings(SQLCIPHER_ENABLED=True)
    @patch("hmis.apps.licensing.sqlcipher_backend.get_database_key", return_value="a" * 64)
    def test_enabled_returns_pragmas(self, mock_key):
        pragmas = get_pragma_statements()
        assert len(pragmas) == 5
        assert "PRAGMA key" in pragmas[0]
        assert "cipher_page_size" in pragmas[1]


class TestRecoveryKey:
    """Tests for support recovery key mechanism."""

    def test_generate_recovery_key_format(self):
        key = generate_recovery_key("inst-001", "cloud_key_abc", valid_hours=24)
        assert key.startswith("RECOVERY-")
        parts = key.split("-")
        assert len(parts) == 3

    def test_expired_recovery_key_rejected(self):
        # Generate a key that expired in the past
        import time

        expired_ts = int(time.time()) - 3600
        fake_key = f"RECOVERY-{expired_ts}-abcdef1234567890"
        assert apply_recovery_key(fake_key, "inst-001") is False

    def test_malformed_recovery_key_rejected(self):
        assert apply_recovery_key("INVALID-KEY", "inst-001") is False
        assert apply_recovery_key("", "inst-001") is False


# ===========================================================================
# Phase 5C: Watermarking Tests
# ===========================================================================


class TestBuildIdGeneration:
    """Tests for watermark build ID generation."""

    def test_generate_build_id_returns_16_chars(self):
        build_id = generate_build_id("1.0.0")
        assert len(build_id) == 16
        assert build_id.isalnum()

    def test_build_id_deterministic(self):
        id1 = generate_build_id("1.0.0", "inst-001", "2026-01-01")
        id2 = generate_build_id("1.0.0", "inst-001", "2026-01-01")
        assert id1 == id2

    def test_build_id_different_for_different_installations(self):
        id1 = generate_build_id("1.0.0", "inst-001")
        id2 = generate_build_id("1.0.0", "inst-002")
        assert id1 != id2

    def test_build_id_different_for_different_versions(self):
        id1 = generate_build_id("1.0.0", "inst-001")
        id2 = generate_build_id("2.0.0", "inst-001")
        assert id1 != id2


class TestBuildIdEmbedding:
    """Tests for embedding build ID in files."""

    def test_embed_build_id_creates_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / ".build-id"
            assert embed_build_id_in_file(file_path, "abcdef1234567890") is True
            assert file_path.exists()
            assert file_path.read_text() == "abcdef1234567890"

    def test_embed_creates_parent_dirs(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "nested" / "dir" / ".build-id"
            assert embed_build_id_in_file(file_path, "abc123") is True
            assert file_path.exists()


class TestBuildIdRetrieval:
    """Tests for retrieving the build ID at runtime."""

    @override_settings(BASE_DIR="/nonexistent")
    @patch.dict("os.environ", {"VITORA_BUILD_ID": "env_build_123456"})
    def test_env_var_takes_priority(self):
        # Clear the cache
        get_build_id.cache_clear()
        build_id = get_build_id()
        assert build_id == "env_build_1234567"[:16]
        get_build_id.cache_clear()

    @patch.dict("os.environ", {"VITORA_BUILD_ID": ""})
    def test_falls_back_to_derived_id(self):
        get_build_id.cache_clear()
        with tempfile.TemporaryDirectory() as tmpdir:
            version_file = Path(tmpdir) / "VERSION"
            version_file.write_text("1.0.0")
            with override_settings(BASE_DIR=tmpdir):
                build_id = get_build_id()
                # Should return something (derived from version)
                assert len(build_id) > 0
        get_build_id.cache_clear()


class TestWatermarkMetadata:
    """Tests for watermark metadata generation."""

    @patch("hmis.apps.licensing.watermark.get_build_id", return_value="abc123def456789a")
    def test_pdf_metadata_contains_build_id(self, mock_id):
        metadata = get_pdf_metadata()
        assert "abc123def456789a" in metadata["producer"]
        assert metadata["creator"] == "Nexora Consulting Ltd"

    @patch("hmis.apps.licensing.watermark.get_build_id", return_value="abc123def456789a")
    def test_export_metadata(self, mock_id):
        metadata = get_export_metadata()
        assert metadata["build_id"] == "abc123def456789a"
        assert metadata["generator"] == "Vitora HMIS"
        assert metadata["vendor"] == "Nexora Consulting Ltd"

    @patch("hmis.apps.licensing.watermark.get_build_id", return_value="abc123def456789a")
    def test_response_headers(self, mock_id):
        headers = get_response_headers()
        assert headers["X-Vitora-Build"] == "abc123def456789a"

    @patch("hmis.apps.licensing.watermark.get_build_id", return_value="dev-unknown")
    def test_log_prefix_empty_for_dev(self, mock_id):
        prefix = get_log_prefix()
        assert prefix == ""

    @patch("hmis.apps.licensing.watermark.get_build_id", return_value="abc123def456789a")
    def test_log_prefix_with_build_id(self, mock_id):
        prefix = get_log_prefix()
        assert prefix == "[build:abc123def456789a]"


class TestBuildIdVerification:
    """Tests for verifying build IDs."""

    @patch("hmis.apps.licensing.watermark.get_build_id", return_value="myownbuildid1234")
    def test_verify_matching_id(self, mock_id):
        result = verify_build_id("myownbuildid1234")
        assert result["matches_self"] is True

    @patch("hmis.apps.licensing.watermark.get_build_id", return_value="myownbuildid1234")
    def test_verify_non_matching_id(self, mock_id):
        result = verify_build_id("otherbuildid5678")
        assert result["matches_self"] is False


# ===========================================================================
# Phase 5D: Canary Token Tests
# ===========================================================================


class TestCanaryTokenGeneration:
    """Tests for canary token generation."""

    @override_settings(SECRET_KEY="test-secret-key")
    def test_generate_canary_token_length(self):
        token = generate_canary_token("inst-001")
        assert len(token) == 32
        assert token.isalnum()

    @override_settings(SECRET_KEY="test-secret-key")
    def test_canary_token_deterministic(self):
        token1 = generate_canary_token("inst-001", "binary")
        token2 = generate_canary_token("inst-001", "binary")
        assert token1 == token2

    @override_settings(SECRET_KEY="test-secret-key")
    def test_different_installations_different_tokens(self):
        token1 = generate_canary_token("inst-001", "binary")
        token2 = generate_canary_token("inst-002", "binary")
        assert token1 != token2

    @override_settings(SECRET_KEY="test-secret-key")
    def test_different_purposes_different_tokens(self):
        token1 = generate_canary_token("inst-001", "binary")
        token2 = generate_canary_token("inst-001", "log")
        assert token1 != token2


class TestHoneypotStrings:
    """Tests for honeypot string generation."""

    @override_settings(SECRET_KEY="test-secret-key")
    def test_generates_multiple_strings(self):
        strings = generate_honeypot_strings("inst-001")
        assert len(strings) == 5

    @override_settings(SECRET_KEY="test-secret-key")
    def test_strings_contain_identifiers(self):
        strings = generate_honeypot_strings("inst-001")
        # All strings should contain some identifier
        for s in strings:
            assert len(s) > 10

    @override_settings(SECRET_KEY="test-secret-key")
    def test_strings_include_nexora_reference(self):
        strings = generate_honeypot_strings("inst-001")
        nexora_strings = [s for s in strings if "nexora" in s.lower() or "Nexora" in s]
        assert len(nexora_strings) >= 1


class TestCanaryVerification:
    """Tests for canary token verification."""

    @override_settings(SECRET_KEY="test-secret-key")
    def test_verify_valid_token(self):
        token = generate_canary_token("inst-001", "binary")
        assert verify_canary_token(token, "inst-001", "binary") is True

    @override_settings(SECRET_KEY="test-secret-key")
    def test_verify_invalid_token(self):
        assert verify_canary_token("fake_token_value_here_12345678", "inst-001", "binary") is False

    @override_settings(SECRET_KEY="test-secret-key")
    def test_identify_installation_from_canary(self):
        token = generate_canary_token("inst-002", "binary")
        known = ["inst-001", "inst-002", "inst-003"]
        result = identify_installation_from_canary(token, known, "binary")
        assert result == "inst-002"

    @override_settings(SECRET_KEY="test-secret-key")
    def test_identify_unknown_installation(self):
        token = generate_canary_token("inst-999", "binary")
        known = ["inst-001", "inst-002", "inst-003"]
        result = identify_installation_from_canary(token, known, "binary")
        assert result is None


class TestCanaryFileWriting:
    """Tests for build-time canary file generation."""

    @override_settings(SECRET_KEY="test-secret-key")
    def test_write_canary_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)
            result = write_canary_file(output_dir, "inst-001")
            assert result.exists()
            content = result.read_text()
            assert "_CANARY_TOKEN" in content
            assert "_HONEYPOT" in content
            assert "_LOG_REF" in content


class TestLogAndPdfCanary:
    """Tests for log and PDF canary generation."""

    @override_settings(SECRET_KEY="test-secret-key")
    def test_log_canary_format(self):
        canary = generate_log_canary("inst-001")
        assert canary.startswith("hub-health-ref:")
        assert len(canary) > 15

    @override_settings(SECRET_KEY="test-secret-key")
    def test_pdf_canary_format(self):
        canary = generate_pdf_canary("inst-001")
        assert canary.startswith("nxr-")
        assert len(canary) > 5


# ===========================================================================
# Phase 5B: TPM Attestation Tests
# ===========================================================================


class TestTPMAvailability:
    """Tests for TPM availability detection."""

    @patch("hmis.apps.licensing.tpm.platform.system", return_value="Windows")
    def test_not_available_on_windows(self, mock_platform):
        from hmis.apps.licensing.tpm import is_tpm_available

        assert is_tpm_available() is False

    @patch("hmis.apps.licensing.tpm.platform.system", return_value="Linux")
    @patch("hmis.apps.licensing.tpm.Path")
    def test_not_available_without_device_node(self, mock_path_cls, mock_platform):
        mock_instance = MagicMock()
        mock_instance.exists.return_value = False
        mock_path_cls.return_value = mock_instance
        from hmis.apps.licensing.tpm import is_tpm_available

        assert is_tpm_available() is False

    @patch("hmis.apps.licensing.tpm.subprocess.run")
    @patch("hmis.apps.licensing.tpm.platform.system", return_value="Linux")
    def test_available_with_device_and_tools(self, mock_platform, mock_run):
        mock_run.return_value = MagicMock(returncode=0)

        from hmis.apps.licensing.tpm import is_tpm_available

        # Patch Path.exists to return True for TPM devices
        with patch("hmis.apps.licensing.tpm.Path") as mock_path:
            mock_path_instance = MagicMock()
            mock_path_instance.exists.return_value = True
            mock_path.return_value = mock_path_instance
            assert is_tpm_available() is True


class TestTPMInfo:
    """Tests for TPM info retrieval."""

    @patch("hmis.apps.licensing.tpm.is_tpm_available", return_value=False)
    def test_unavailable_tpm_returns_false_flag(self, mock_avail):
        from hmis.apps.licensing.tpm import get_tpm_info

        info = get_tpm_info()
        assert info["available"] == "false"


class TestTPMQuote:
    """Tests for TPM PCR quote generation."""

    @patch("hmis.apps.licensing.tpm.is_tpm_available", return_value=False)
    def test_quote_returns_none_without_tpm(self, mock_avail):
        from hmis.apps.licensing.tpm import generate_pcr_quote

        assert generate_pcr_quote("test-nonce") is None

    def test_verify_quote_rejects_empty(self):
        from hmis.apps.licensing.tpm import verify_pcr_quote

        assert verify_pcr_quote({}, "expected", "ak_pub") is False

    def test_verify_quote_rejects_missing_fields(self):
        from hmis.apps.licensing.tpm import verify_pcr_quote

        incomplete = {"pcr_bank": "sha256"}
        assert verify_pcr_quote(incomplete, "expected", "ak_pub") is False


class TestTPMMeasurement:
    """Tests for TPM binary measurement."""

    @patch("hmis.apps.licensing.tpm.is_tpm_available", return_value=False)
    def test_measure_skipped_without_tpm(self, mock_avail):
        from hmis.apps.licensing.tpm import measure_all_binaries

        with tempfile.TemporaryDirectory() as tmpdir:
            result = measure_all_binaries(Path(tmpdir))
            assert result == {}

    @patch("hmis.apps.licensing.tpm.is_tpm_available", return_value=False)
    def test_extend_pcr_fails_without_tpm(self, mock_avail):
        from hmis.apps.licensing.tpm import extend_pcr_with_binary

        with tempfile.NamedTemporaryFile() as f:
            assert extend_pcr_with_binary(Path(f.name)) is False


# ===========================================================================
# Installation Model Phase 4/5 Fields Tests
# ===========================================================================


@pytest.mark.django_db
class TestInstallationPhase4Fields:
    """Tests for Phase 4 model fields on Installation."""

    def test_delivery_mode_choices(self):
        from hmis.apps.licensing.models import Installation

        choices = [c[0] for c in Installation.DeliveryMode.choices]
        assert "TARBALL" in choices
        assert "CONTAINER" in choices
        assert "MSI" in choices

    def test_update_channel_choices(self):
        from hmis.apps.licensing.models import Installation

        choices = [c[0] for c in Installation.UpdateChannel.choices]
        assert "stable" in choices
        assert "beta" in choices

    def test_default_delivery_mode(self, sample_organization):
        from hmis.apps.licensing.models import Installation

        inst = Installation.objects.create(
            organization=sample_organization,
            installation_id="test-phase4-001",
            status=Installation.Status.ACTIVE,
        )
        assert inst.delivery_mode == "TARBALL"
        assert inst.update_channel == "stable"

    def test_container_digest_stored(self, sample_organization):
        from hmis.apps.licensing.models import Installation

        inst = Installation.objects.create(
            organization=sample_organization,
            installation_id="test-phase4-002",
            status=Installation.Status.ACTIVE,
            delivery_mode=Installation.DeliveryMode.CONTAINER,
            container_image_digest="sha256:abc123def456",
        )
        inst.refresh_from_db()
        assert inst.container_image_digest == "sha256:abc123def456"


@pytest.mark.django_db
class TestInstallationPhase5Fields:
    """Tests for Phase 5 model fields on Installation."""

    def test_protection_tier_choices(self):
        from hmis.apps.licensing.models import Installation

        choices = [c[0] for c in Installation.ProtectionTier.choices]
        assert "STANDARD" in choices
        assert "ENHANCED" in choices
        assert "MAXIMUM" in choices

    def test_default_protection_tier(self, sample_organization):
        from hmis.apps.licensing.models import Installation

        inst = Installation.objects.create(
            organization=sample_organization,
            installation_id="test-phase5-001",
            status=Installation.Status.ACTIVE,
        )
        assert inst.protection_tier == "STANDARD"
        assert inst.sqlcipher_enabled is False
        assert inst.tpm_available is False
        assert inst.is_per_customer_build is False

    def test_enhanced_protection_with_sqlcipher(self, sample_organization):
        from hmis.apps.licensing.models import Installation

        inst = Installation.objects.create(
            organization=sample_organization,
            installation_id="test-phase5-002",
            status=Installation.Status.ACTIVE,
            protection_tier=Installation.ProtectionTier.ENHANCED,
            sqlcipher_enabled=True,
        )
        inst.refresh_from_db()
        assert inst.protection_tier == "ENHANCED"
        assert inst.sqlcipher_enabled is True

    def test_maximum_protection_with_tpm_and_per_customer(self, sample_organization):
        from hmis.apps.licensing.models import Installation

        inst = Installation.objects.create(
            organization=sample_organization,
            installation_id="test-phase5-003",
            status=Installation.Status.ACTIVE,
            protection_tier=Installation.ProtectionTier.MAXIMUM,
            tpm_available=True,
            tpm_ak_public="base64encodedpublickey==",
            is_per_customer_build=True,
            build_id="abc123def456789a",
            canary_token="canary_token_32chars_here_abcdef",
        )
        inst.refresh_from_db()
        assert inst.protection_tier == "MAXIMUM"
        assert inst.tpm_available is True
        assert inst.tpm_ak_public == "base64encodedpublickey=="
        assert inst.is_per_customer_build is True
        assert inst.build_id == "abc123def456789a"
        assert inst.canary_token == "canary_token_32chars_here_abcdef"


# ===========================================================================
# Phase 4: Update Check Task Tests
# ===========================================================================


class TestCheckForUpdatesTask:
    """Tests for the Celery check_for_updates task."""

    @patch.dict("os.environ", {"DJANGO_ENV": "cloud"})
    def test_skips_on_non_hub(self):
        from hmis.apps.licensing.tasks import check_for_updates

        result = check_for_updates()
        assert result["skipped"] is True
        assert "not a hub" in result["reason"]

    @patch.dict("os.environ", {"DJANGO_ENV": "hub"})
    @patch("hmis.apps.licensing.tasks._get_app_version", return_value="unknown")
    def test_skips_unknown_version(self, mock_version):
        from hmis.apps.licensing.tasks import check_for_updates

        result = check_for_updates()
        assert result["skipped"] is True

    @patch.dict("os.environ", {"DJANGO_ENV": "hub"})
    @patch("hmis.apps.licensing.tasks._get_app_version", return_value="1.0.0")
    @patch(
        "hmis.apps.licensing.update_service.check_for_update",
        return_value=None,
    )
    def test_no_update_available(self, mock_check, mock_version):
        from hmis.apps.licensing.tasks import check_for_updates

        result = check_for_updates()
        assert result["up_to_date"] is True

    @patch.dict("os.environ", {"DJANGO_ENV": "hub"})
    @patch("hmis.apps.licensing.tasks._get_app_version", return_value="1.0.0")
    @patch("hmis.apps.licensing.update_service.check_for_update")
    def test_update_available_reported(self, mock_check, mock_version):
        mock_check.return_value = UpdateInfo(
            version="2.0.0",
            channel="stable",
            url="https://example.com/hub.tar.gz",
            release_notes_url="https://docs.vitora.digital/releases/2.0.0",
        )

        from hmis.apps.licensing.tasks import check_for_updates

        result = check_for_updates()
        assert result["update_available"] is True
        assert result["available_version"] == "2.0.0"
