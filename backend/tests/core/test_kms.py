"""
Tests for Key Management System (KMS) module.

Sprint: Phase 1 - DHA Compliance
Feature: Key Management System (KMS) Integration

Tests cover:
- KMS provider factory
- Local Fernet provider
- Key rotation service
- Error handling
"""

from datetime import UTC, datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from cryptography.fernet import Fernet

from hmis.apps.core.kms import clear_kms_cache, get_kms_provider
from hmis.apps.core.kms.base import (
    DecryptionError,
    EncryptionError,
    KeyMetadata,
    KeyRotationError,
    KeyState,
    KMSProvider,
)
from hmis.apps.core.kms.local import LocalKMSProvider
from hmis.apps.core.kms.rotation import KeyRotationService


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear KMS provider cache before each test."""
    clear_kms_cache()
    yield
    clear_kms_cache()


@pytest.fixture
def valid_fernet_key() -> str:
    """Generate a valid Fernet key for testing."""
    return Fernet.generate_key().decode("ascii")


@pytest.fixture
def local_provider(valid_fernet_key) -> LocalKMSProvider:
    """Create a LocalKMSProvider for testing."""
    return LocalKMSProvider(encryption_key=valid_fernet_key)


@pytest.mark.unit
class TestLocalKMSProvider:
    """Tests for LocalKMSProvider."""

    def test_init_with_valid_key(self, valid_fernet_key):
        """Provider should initialize with valid Fernet key."""
        provider = LocalKMSProvider(encryption_key=valid_fernet_key)
        assert provider is not None
        assert provider.is_healthy()

    def test_init_with_invalid_key_raises_error(self):
        """Provider should raise ValueError for invalid key."""
        with pytest.raises(ValueError, match="Invalid Fernet key"):
            LocalKMSProvider(encryption_key="invalid-key")

    def test_encrypt_decrypt_bytes(self, local_provider):
        """Should encrypt and decrypt bytes correctly."""
        plaintext = b"sensitive patient data"

        ciphertext = local_provider.encrypt(plaintext)
        decrypted = local_provider.decrypt(ciphertext)

        assert decrypted == plaintext
        assert ciphertext != plaintext

    def test_encrypt_decrypt_string(self, local_provider):
        """Should encrypt and decrypt strings correctly."""
        plaintext = "National ID: 12345678"

        ciphertext = local_provider.encrypt_string(plaintext)
        decrypted = local_provider.decrypt_string(ciphertext)

        assert decrypted == plaintext
        assert ciphertext != plaintext

    def test_encrypt_with_context(self, local_provider):
        """Should accept encryption context for auditing."""
        plaintext = b"data"
        context = {"patient_id": "123", "field": "national_id"}

        ciphertext = local_provider.encrypt(plaintext, context=context)
        decrypted = local_provider.decrypt(ciphertext, context=context)

        assert decrypted == plaintext

    def test_decrypt_invalid_ciphertext_raises_error(self, local_provider):
        """Should raise DecryptionError for invalid ciphertext."""
        with pytest.raises(DecryptionError):
            local_provider.decrypt(b"invalid-ciphertext")

    def test_decrypt_wrong_key_raises_error(self, valid_fernet_key):
        """Should raise DecryptionError when decrypting with wrong key."""
        provider1 = LocalKMSProvider(encryption_key=valid_fernet_key)
        provider2 = LocalKMSProvider(encryption_key=Fernet.generate_key().decode())

        ciphertext = provider1.encrypt(b"secret")

        with pytest.raises(DecryptionError, match="Invalid ciphertext or wrong encryption key"):
            provider2.decrypt(ciphertext)

    def test_get_key_metadata(self, local_provider):
        """Should return key metadata."""
        metadata = local_provider.get_key_metadata()

        assert metadata.key_id == "local-key"
        assert metadata.key_name == "local-fernet-key"
        assert metadata.state == KeyState.ENABLED
        assert metadata.provider == "local"
        assert metadata.algorithm == "Fernet (AES-128-CBC + HMAC-SHA256)"

    def test_is_healthy_returns_true_for_valid_provider(self, local_provider):
        """Health check should return True for valid provider."""
        assert local_provider.is_healthy() is True

    def test_supports_automatic_rotation_returns_false(self, local_provider):
        """Local provider should not support automatic rotation."""
        assert local_provider.supports_automatic_rotation() is False

    def test_rotate_key_generates_new_key(self, local_provider):
        """rotate_key should generate new Fernet key."""
        metadata = local_provider.rotate_key()

        assert metadata.state == KeyState.ENABLED
        assert metadata.tags is not None
        assert "new_key" in metadata.tags
        # Verify the new key is valid
        new_key = metadata.tags["new_key"]
        assert len(new_key) == 44  # Fernet key length

    def test_generate_key_static_method(self):
        """generate_key should return valid Fernet key."""
        key = LocalKMSProvider.generate_key()

        assert len(key) == 44
        # Verify it works
        provider = LocalKMSProvider(encryption_key=key)
        assert provider.is_healthy()


@pytest.mark.unit
class TestKMSProviderFactory:
    """Tests for get_kms_provider factory function."""

    def test_get_local_provider(self, settings, valid_fernet_key):
        """Should return LocalKMSProvider for local setting."""
        settings.KMS_PROVIDER = "local"
        settings.ENCRYPTION_KEY = valid_fernet_key

        provider = get_kms_provider()

        assert isinstance(provider, LocalKMSProvider)

    def test_get_provider_without_encryption_key_raises_error(self, settings):
        """Should raise ValueError if ENCRYPTION_KEY not set."""
        settings.KMS_PROVIDER = "local"
        settings.ENCRYPTION_KEY = None

        with pytest.raises(ValueError, match="ENCRYPTION_KEY must be set"):
            clear_kms_cache()
            get_kms_provider()

    def test_get_azure_provider_without_vault_url_raises_error(self, settings):
        """Should raise ValueError if Azure vault URL not set."""
        settings.KMS_PROVIDER = "azure"
        settings.AZURE_KEY_VAULT_URL = None

        with pytest.raises(ValueError, match="AZURE_KEY_VAULT_URL must be set"):
            clear_kms_cache()
            get_kms_provider()

    def test_invalid_provider_raises_error(self, settings):
        """Should raise ValueError for unknown provider."""
        settings.KMS_PROVIDER = "unknown"

        with pytest.raises(ValueError, match="Invalid KMS_PROVIDER"):
            clear_kms_cache()
            get_kms_provider()

    def test_provider_is_cached(self, settings, valid_fernet_key):
        """Provider should be cached (singleton)."""
        settings.KMS_PROVIDER = "local"
        settings.ENCRYPTION_KEY = valid_fernet_key

        provider1 = get_kms_provider()
        provider2 = get_kms_provider()

        assert provider1 is provider2


@pytest.mark.unit
class TestKeyRotationService:
    """Tests for KeyRotationService."""

    def test_init_with_default_provider(self, settings, valid_fernet_key):
        """Should initialize with default KMS provider."""
        settings.KMS_PROVIDER = "local"
        settings.ENCRYPTION_KEY = valid_fernet_key

        service = KeyRotationService()
        assert service._provider is not None

    def test_init_with_custom_provider(self, local_provider):
        """Should accept custom provider."""
        service = KeyRotationService(provider=local_provider)
        assert service._provider is local_provider

    def test_needs_rotation_false_when_recently_created(self, local_provider):
        """Should not need rotation when key is new."""
        service = KeyRotationService(provider=local_provider, rotation_days=365)

        # New provider key was just created
        assert service.needs_rotation() is False

    def test_needs_rotation_true_when_past_rotation_period(self, valid_fernet_key):
        """Should need rotation when past rotation period."""
        provider = LocalKMSProvider(encryption_key=valid_fernet_key)
        # Mock created_at to be old
        provider._created_at = datetime.now(UTC) - timedelta(days=400)

        service = KeyRotationService(provider=provider, rotation_days=365)

        assert service.needs_rotation() is True

    def test_rotate_returns_result(self, local_provider):
        """rotate() should return RotationResult."""
        service = KeyRotationService(provider=local_provider)

        result = service.rotate()

        assert result.success is True
        assert result.new_key_id is not None
        assert result.started_at is not None
        assert result.completed_at is not None

    def test_rotate_creates_new_key(self, local_provider):
        """rotate() should create new key metadata."""
        service = KeyRotationService(provider=local_provider)

        result = service.rotate()

        assert result.metadata is not None
        assert result.metadata.state == KeyState.ENABLED
        assert result.metadata.tags is not None
        assert "new_key" in result.metadata.tags


@pytest.mark.unit
class TestKeyMetadata:
    """Tests for KeyMetadata dataclass."""

    def test_key_metadata_creation(self):
        """Should create KeyMetadata with all fields."""
        now = datetime.now(UTC)

        metadata = KeyMetadata(
            key_id="test-key-id",
            key_name="test-key",
            state=KeyState.ENABLED,
            created_at=now,
            updated_at=now,
            rotation_period_days=365,
            algorithm="AES-256-GCM",
            provider="test",
        )

        assert metadata.key_id == "test-key-id"
        assert metadata.key_name == "test-key"
        assert metadata.state == KeyState.ENABLED
        assert metadata.rotation_period_days == 365

    def test_key_state_enum(self):
        """KeyState enum should have expected values."""
        assert KeyState.ENABLED.value == "enabled"
        assert KeyState.DISABLED.value == "disabled"
        assert KeyState.DESTROYED.value == "destroyed"


@pytest.mark.unit
class TestKMSExceptions:
    """Tests for KMS exception classes."""

    def test_encryption_error(self):
        """EncryptionError should be raisable."""
        with pytest.raises(EncryptionError):
            raise EncryptionError("Test encryption error")

    def test_decryption_error(self):
        """DecryptionError should be raisable."""
        with pytest.raises(DecryptionError):
            raise DecryptionError("Test decryption error")

    def test_key_rotation_error(self):
        """KeyRotationError should be raisable."""
        with pytest.raises(KeyRotationError):
            raise KeyRotationError("Test rotation error")


@pytest.mark.unit
class TestEncryptionEdgeCases:
    """Test edge cases for encryption operations."""

    def test_encrypt_empty_bytes(self, local_provider):
        """Should handle empty byte string."""
        ciphertext = local_provider.encrypt(b"")
        decrypted = local_provider.decrypt(ciphertext)
        assert decrypted == b""

    def test_encrypt_empty_string(self, local_provider):
        """Should handle empty string."""
        ciphertext = local_provider.encrypt_string("")
        decrypted = local_provider.decrypt_string(ciphertext)
        assert decrypted == ""

    def test_encrypt_unicode(self, local_provider):
        """Should handle Unicode characters."""
        plaintext = "Patient: 患者 مريض 🏥"
        ciphertext = local_provider.encrypt_string(plaintext)
        decrypted = local_provider.decrypt_string(ciphertext)
        assert decrypted == plaintext

    def test_encrypt_large_data(self, local_provider):
        """Should handle large data."""
        plaintext = b"x" * 1_000_000  # 1MB

        ciphertext = local_provider.encrypt(plaintext)
        decrypted = local_provider.decrypt(ciphertext)

        assert decrypted == plaintext

    def test_encrypt_special_characters(self, local_provider):
        """Should handle special characters in strings."""
        plaintext = "ID: 12345/678\n\t\"Special\" 'chars' <>&"
        ciphertext = local_provider.encrypt_string(plaintext)
        decrypted = local_provider.decrypt_string(ciphertext)
        assert decrypted == plaintext
