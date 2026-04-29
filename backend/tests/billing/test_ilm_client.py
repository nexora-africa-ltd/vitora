"""Tests for the shared DHA HIE Middleware (ILM) HTTP client.

Covers retry behaviour, audit row persistence, error mapping and PII redaction.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
import requests

from hmis.apps.billing.services.dha_errors import (
    DHAServerError,
    DHATimeoutError,
    DHAUnauthorizedError,
    DHAValidationError,
)
from hmis.apps.billing.services.ilm_client import IlmClient, _redact
from hmis.apps.core.models import DHAOutboundCall


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None, text=None, headers=None):
        self.status_code = status_code
        self._json = json_data
        self.text = text if text is not None else ("" if json_data is None else str(json_data))
        self.headers = headers or {"Content-Type": "application/json"}

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json


@pytest.fixture
def auth_stub(mocker):
    """Replace SHAAuthService so we don't touch the network for token fetches."""
    from hmis.apps.billing.services import ilm_client as mod

    fake = mocker.MagicMock()
    fake.auth_mode = "ilm"
    fake.auth_base_url = "https://uat-middleware.example"
    fake.get_auth_headers.return_value = {"Authorization": "Bearer test-token"}
    return fake


@pytest.fixture
def client(auth_stub):
    return IlmClient(
        auth_service=auth_stub,
        base_url="https://uat-middleware.example",
        timeout=5,
        max_retries=2,
        backoff_seconds=0,
    )


@pytest.mark.django_db
class TestIlmClientSuccess:
    def test_get_returns_parsed_json_and_writes_audit(self, client):
        with patch.object(
            client._session, "request", return_value=_FakeResponse(200, {"ok": True})
        ):
            result = client.get("/api/v1/ping")
        assert result.status_code == 200
        assert result.json == {"ok": True}
        audit = DHAOutboundCall.objects.get()
        assert audit.status == "SUCCESS"
        assert audit.method == "GET"
        assert audit.path == "/api/v1/ping"
        assert audit.status_code == 200
        assert audit.attempt == 1

    def test_post_redacts_pii_in_audit(self, client):
        body = {
            "national_id": "1234567",
            "phone": "+254700000000",
            "patient": {"otp": "999999", "first_name": "Jane"},
        }
        with patch.object(client._session, "request", return_value=_FakeResponse(201, {"id": 1})):
            client.post("/api/v1/claims", json_body=body)
        audit = DHAOutboundCall.objects.get()
        payload = audit.request_payload
        assert payload["national_id"] == "***REDACTED***"
        assert payload["phone"] == "***REDACTED***"
        assert payload["patient"]["otp"] == "***REDACTED***"
        assert payload["patient"]["first_name"] == "Jane"


@pytest.mark.django_db
class TestIlmClientRetries:
    def test_retries_5xx_and_eventually_succeeds(self, client):
        responses = [
            _FakeResponse(503, {"error": "down"}),
            _FakeResponse(502, {"error": "down"}),
            _FakeResponse(200, {"ok": True}),
        ]
        with patch.object(client._session, "request", side_effect=responses) as req:
            result = client.get("/api/v1/ping")
        assert result.status_code == 200
        assert req.call_count == 3
        # Only the FINAL outcome is audited.
        assert DHAOutboundCall.objects.count() == 1
        audit = DHAOutboundCall.objects.get()
        assert audit.attempt == 3
        assert audit.status == "SUCCESS"

    def test_5xx_after_max_retries_raises_server_error(self, client):
        with patch.object(
            client._session,
            "request",
            return_value=_FakeResponse(500, {"error": "boom"}),
        ):
            with pytest.raises(DHAServerError):
                client.get("/api/v1/ping")
        audit = DHAOutboundCall.objects.get()
        assert audit.status == "SERVER_ERROR"
        assert audit.status_code == 500
        assert audit.attempt == 3  # max_retries=2 -> 3 attempts

    def test_4xx_is_not_retried(self, client):
        with patch.object(
            client._session,
            "request",
            return_value=_FakeResponse(422, {"message": "bad", "errors": []}),
        ) as req:
            with pytest.raises(DHAValidationError):
                client.post("/api/v1/claims", json_body={"x": 1})
        assert req.call_count == 1

    def test_401_maps_to_unauthorized(self, client):
        with patch.object(
            client._session,
            "request",
            return_value=_FakeResponse(401, {"message": "nope"}),
        ):
            with pytest.raises(DHAUnauthorizedError):
                client.get("/api/v1/ping")

    def test_timeout_after_retries_raises_timeout(self, client):
        with patch.object(client._session, "request", side_effect=requests.Timeout("t/o")):
            with pytest.raises(DHATimeoutError):
                client.get("/api/v1/ping")
        audit = DHAOutboundCall.objects.get()
        assert audit.status == "TIMEOUT"
        assert audit.error_code == "timeout"


class TestRedact:
    def test_strips_known_pii_keys(self):
        out = _redact({"national_id": "x", "ok": "y"})
        assert out == {"national_id": "***REDACTED***", "ok": "y"}

    def test_handles_nested_lists(self):
        out = _redact({"items": [{"otp": "1", "name": "a"}]})
        assert out["items"][0]["otp"] == "***REDACTED***"
        assert out["items"][0]["name"] == "a"

    def test_passes_through_primitives(self):
        assert _redact("hello") == "hello"
        assert _redact(42) == 42
