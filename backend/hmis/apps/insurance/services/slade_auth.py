# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""HealthCloud by Slade360 OAuth2 token service."""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from typing import Any

from django.core.cache import cache
from prometheus_client import Counter

from hmis.apps.insurance.models import FacilitySladeCredential
from hmis.apps.insurance.services.errors import InsuranceUnauthorizedError, InsuranceValidationError

from .client import InsuranceHttpClient

_LOCK = threading.Lock()

HEALTHCLOUD_TOKEN_REQUESTS_TOTAL = Counter(
    "vitora_insurance_healthcloud_token_requests_total",
    "HealthCloud token acquisition attempts by result",
    ["result"],
)


@dataclass
class SladeAccessToken:
    token: str
    expires_in: int
    token_type: str = "Bearer"  # noqa: S105
    refresh_token: str = ""
    obtained_at_epoch: int = 0

    @property
    def is_expired(self) -> bool:
        # Refresh 60 seconds before expiry to avoid edge failures.
        return int(time.time()) >= (self.obtained_at_epoch + self.expires_in - 60)


class SladeAuthService:
    """Obtains and caches HealthCloud OAuth access tokens.

    HealthCloud by Slade360 token issuance requires OAuth password grant fields:
    grant_type, client_id, client_secret, username, and password.
    """

    CACHE_TTL_SECONDS = 3500

    def __init__(self, config: Any) -> None:
        self.config = config
        self.client = InsuranceHttpClient.from_config(config)
        self.creds = config.get_credentials_dict()
        facility_id = getattr(config, "facility_id", None)
        if facility_id is not None:
            facility_creds = FacilitySladeCredential.objects.filter(
                facility_id=facility_id,
                organization_id=getattr(config, "organization_id", None),
            ).first()
            if facility_creds is not None:
                for key, value in facility_creds.get_credentials_dict().items():
                    self.creds.setdefault(key, value)

    def get_access_token(self, *, force_refresh: bool = False) -> SladeAccessToken:
        cache_key = self._cache_key()
        if not force_refresh:
            cached = cache.get(cache_key)
            if isinstance(cached, dict):
                token = SladeAccessToken(**cached)
                if token.token and not token.is_expired:
                    return token

        with _LOCK:
            if not force_refresh:
                cached = cache.get(cache_key)
                if isinstance(cached, dict):
                    token = SladeAccessToken(**cached)
                    if token.token and not token.is_expired:
                        return token

            token = self._request_new_token()
            cache.set(cache_key, token.__dict__, timeout=self.CACHE_TTL_SECONDS)
            return token

    def get_auth_headers(self) -> dict[str, str]:
        token = self.get_access_token()
        return {
            "Authorization": f"{token.token_type} {token.token}",
            "Accept": "application/json",
        }

    def _request_new_token(self) -> SladeAccessToken:
        client_id = (
            os.getenv("SLADE_CLIENT_ID", "")
            or self.creds.get("slade_client_id", "")
            or self.creds.get("api_key", "")
        )
        client_secret = (
            os.getenv("SLADE_SECRET_KEY", "")
            or os.getenv("SLADE_CLIENT_SECRET", "")
            or self.creds.get("slade_client_secret", "")
            or self.creds.get("api_secret", "")
        )
        username = (
            os.getenv("SLADE_USERNAME", "")
            or os.getenv("SLADE_API_USERNAME", "")
            or self.creds.get("slade_username", "")
            or self.creds.get("username", "")
        )
        password = (
            os.getenv("SLADE_PASSWORD", "")
            or os.getenv("SLADE_API_PASSWORD", "")
            or self.creds.get("slade_password", "")
            or self.creds.get("password", "")
        )

        payload: dict[str, Any] = {
            "grant_type": "password",
            "client_id": client_id,
            "client_secret": client_secret,
            "username": username,
            "password": password,
        }

        if not all(
            [
                payload["client_id"],
                payload["client_secret"],
                payload["username"],
                payload["password"],
            ]
        ):
            HEALTHCLOUD_TOKEN_REQUESTS_TOTAL.labels(result="failed").inc()
            raise InsuranceUnauthorizedError(
                "Missing HealthCloud OAuth credentials",
                provider_code=getattr(self.config.provider, "code", None),
            )

        try:
            response = self.client.post(
                "/oauth2/token/",
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                host="auth",
            )
        except InsuranceValidationError:
            HEALTHCLOUD_TOKEN_REQUESTS_TOTAL.labels(result="failed").inc()
            raise
        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError):
            HEALTHCLOUD_TOKEN_REQUESTS_TOTAL.labels(result="failed").inc()
            raise
        body = response.json or {}
        access_token = str(body.get("access_token") or "")
        if not access_token:
            HEALTHCLOUD_TOKEN_REQUESTS_TOTAL.labels(result="failed").inc()
            raise InsuranceUnauthorizedError(
                "HealthCloud did not return an access token",
                provider_code=getattr(self.config.provider, "code", None),
                response_body=body,
            )

        HEALTHCLOUD_TOKEN_REQUESTS_TOTAL.labels(result="success").inc()

        return SladeAccessToken(
            token=access_token,
            token_type=str(body.get("token_type") or "Bearer"),
            refresh_token=str(body.get("refresh_token") or ""),
            expires_in=int(body.get("expires_in") or 3600),
            obtained_at_epoch=int(time.time()),
        )

    def _cache_key(self) -> str:
        provider_id = getattr(self.config.provider, "id", "")
        facility_id = getattr(self.config, "facility_id", "")
        auth_host = self.config.auth_base_url or self.config.api_base_url
        return f"insurance:slade:token:{provider_id}:{facility_id}:{auth_host}"
