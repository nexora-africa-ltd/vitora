"""Tests for SHA PII decryption helpers."""

import pytest
from unittest import mock

from hmis.apps.billing.services.sha_pii import (
    SHADecryptionError,
    _PIIParts,
    _split_pii,
    maybe_decrypt_client_registry_item,
)


class TestSHADecryptionError:
    """Tests for SHADecryptionError exception."""

    def test_error_is_exception(self):
        """SHADecryptionError should be an Exception."""
        assert issubclass(SHADecryptionError, Exception)

    def test_error_message(self):
        """SHADecryptionError should store the message."""
        error = SHADecryptionError("Test error message")
        assert str(error) == "Test error message"


class TestPIIParts:
    """Tests for _PIIParts dataclass."""

    def test_pii_parts_creation(self):
        """_PIIParts should be a frozen dataclass."""
        parts = _PIIParts(
            encrypted_aes_key="key123",
            encrypted_iv="iv456",
            encrypted_json_data="data789",
        )
        assert parts.encrypted_aes_key == "key123"
        assert parts.encrypted_iv == "iv456"
        assert parts.encrypted_json_data == "data789"

    def test_pii_parts_immutable(self):
        """_PIIParts should be immutable (frozen)."""
        parts = _PIIParts(
            encrypted_aes_key="key",
            encrypted_iv="iv",
            encrypted_json_data="data",
        )
        with pytest.raises(AttributeError):
            parts.encrypted_aes_key = "new_key"


class TestSplitPii:
    """Tests for _split_pii function."""

    def test_split_valid_pii(self):
        """Should split valid PII string into parts."""
        pii = "aes_key_encrypted:iv_encrypted:json_data_encrypted"
        parts = _split_pii(pii)
        
        assert parts.encrypted_aes_key == "aes_key_encrypted"
        assert parts.encrypted_iv == "iv_encrypted"
        assert parts.encrypted_json_data == "json_data_encrypted"

    def test_split_invalid_pii_too_few_parts(self):
        """Should raise error if PII has fewer than 3 parts."""
        pii = "only:two"
        with pytest.raises(SHADecryptionError) as exc_info:
            _split_pii(pii)
        assert "expected 3 colon-separated parts" in str(exc_info.value)

    def test_split_invalid_pii_too_many_parts(self):
        """Should raise error if PII has more than 3 parts."""
        pii = "one:two:three:four"
        with pytest.raises(SHADecryptionError) as exc_info:
            _split_pii(pii)
        assert "expected 3 colon-separated parts" in str(exc_info.value)

    def test_split_invalid_pii_single_part(self):
        """Should raise error if PII has no colons."""
        pii = "nodividers"
        with pytest.raises(SHADecryptionError) as exc_info:
            _split_pii(pii)
        assert "expected 3 colon-separated parts" in str(exc_info.value)

    def test_split_empty_parts_allowed(self):
        """Should allow empty parts (just two colons)."""
        pii = "::"
        parts = _split_pii(pii)
        assert parts.encrypted_aes_key == ""
        assert parts.encrypted_iv == ""
        assert parts.encrypted_json_data == ""


class TestMaybeDecryptClientRegistryItem:
    """Tests for maybe_decrypt_client_registry_item function."""

    def test_no_pii_returns_item_unchanged(self):
        """Should return item unchanged if no _pii field."""
        item = {"name": "John Doe", "id": "12345"}
        result = maybe_decrypt_client_registry_item(item)
        assert result == item

    def test_empty_pii_returns_item_unchanged(self):
        """Should return item unchanged if _pii is empty string."""
        item = {"name": "John Doe", "_pii": ""}
        result = maybe_decrypt_client_registry_item(item)
        assert result == item

    def test_none_pii_returns_item_unchanged(self):
        """Should return item unchanged if _pii is None."""
        item = {"name": "John Doe", "_pii": None}
        result = maybe_decrypt_client_registry_item(item)
        assert result == item

    def test_invalid_pii_type_raises_error(self):
        """Should raise error if _pii is not a string."""
        item = {"name": "John Doe", "_pii": 12345}
        with pytest.raises(SHADecryptionError) as exc_info:
            maybe_decrypt_client_registry_item(item)
        assert "expected string" in str(exc_info.value)

    def test_invalid_pii_dict_raises_error(self):
        """Should raise error if _pii is a dict."""
        item = {"name": "John Doe", "_pii": {"nested": "value"}}
        with pytest.raises(SHADecryptionError) as exc_info:
            maybe_decrypt_client_registry_item(item)
        assert "expected string" in str(exc_info.value)

    def test_invalid_pii_list_raises_error(self):
        """Should raise error if _pii is a list."""
        item = {"name": "John Doe", "_pii": ["a", "b", "c"]}
        with pytest.raises(SHADecryptionError) as exc_info:
            maybe_decrypt_client_registry_item(item)
        assert "expected string" in str(exc_info.value)


class TestLoadSHAPrivateKeyPem:
    """Tests for _load_sha_private_key_pem function."""

    def test_missing_key_raises_error(self):
        """Should raise error if private key file doesn't exist."""
        from hmis.apps.billing.services.sha_pii import _load_sha_private_key_pem

        # Clear the LRU cache
        _load_sha_private_key_pem.cache_clear()

        with mock.patch("pathlib.Path.exists", return_value=False):
            with pytest.raises(SHADecryptionError) as exc_info:
                _load_sha_private_key_pem()
            assert "private key not found" in str(exc_info.value).lower()

        # Clear cache again for other tests
        _load_sha_private_key_pem.cache_clear()
