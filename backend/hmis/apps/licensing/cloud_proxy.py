# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Cloud proxy service for hub installations.

When a hub needs to submit SHA claims, KHIS reports, or other cloud-only
operations, it routes through this service which forwards the request to
the Vitora cloud API. The cloud holds the DHA/SHA credentials — the hub
never has direct access to those secrets.

This module is only used on hub installations (DJANGO_ENV=hub).
On the cloud, the SHA services talk to DHA directly.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Timeout for cloud proxy requests (seconds)
PROXY_TIMEOUT = 60


@dataclass
class CloudProxyResponse:
    """Response from a cloud-proxied request."""

    success: bool
    status_code: int
    data: dict[str, Any]
    error: str | None = None


class CloudProxyClient:
    """
    HTTP client for hub → cloud proxy calls.

    Authenticates using the hub's license JWT (cached locally).
    The cloud validates the license and forwards the request to
    the target external service (DHA, KHIS, etc).
    """

    def __init__(self):
        self.cloud_url = getattr(settings, "SYNC_SERVER_URL", "").rstrip("/")
        if not self.cloud_url:
            self.cloud_url = os.getenv(
                "SYNC_SERVER_URL", "https://api.vitora.digital/api/sync"
            ).rstrip("/")
        # Derive base API URL from sync URL
        # e.g. https://api.vitora.digital/api/sync -> https://api.vitora.digital
        self.base_url = self.cloud_url.rsplit("/api/", 1)[0]

    def _get_license_token(self) -> str:
        """Read the cached license JWT for authentication."""
        token = os.getenv("LICENSE_TOKEN", "")
        if token:
            return token

        token_path = getattr(
            settings,
            "HUB_LICENSE_TOKEN_PATH",
            "/var/lib/vitora-hub/license.jwt",
        )
        try:
            with open(token_path) as f:
                return f.read().strip()
        except (FileNotFoundError, PermissionError):
            return ""

    def _headers(self) -> dict[str, str]:
        """Build request headers with license JWT auth."""
        token = self._get_license_token()
        headers = {
            "Content-Type": "application/json",
            "X-Hub-Id": getattr(settings, "HUB_ID", "") or os.getenv("HUB_ID", ""),
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def post(self, path: str, payload: dict[str, Any]) -> CloudProxyResponse:
        """
        Send a proxied POST request to the cloud.

        Args:
            path: Cloud API path (e.g. "/api/cloud/sha/submit/")
            payload: JSON body to forward

        Returns:
            CloudProxyResponse with success/failure status and data.
        """
        url = f"{self.base_url}{path}"
        try:
            response = requests.post(
                url,
                json=payload,
                headers=self._headers(),
                timeout=PROXY_TIMEOUT,
            )
            data = {}
            try:
                data = response.json()
            except (ValueError, requests.exceptions.JSONDecodeError):
                data = {"raw": response.text[:500]}

            if response.status_code < 400:
                return CloudProxyResponse(
                    success=True,
                    status_code=response.status_code,
                    data=data,
                )
            else:
                return CloudProxyResponse(
                    success=False,
                    status_code=response.status_code,
                    data=data,
                    error=data.get("detail", f"HTTP {response.status_code}"),
                )
        except requests.exceptions.Timeout:
            logger.error("Cloud proxy timeout: POST %s", path)
            return CloudProxyResponse(
                success=False,
                status_code=504,
                data={},
                error="Cloud proxy request timed out",
            )
        except requests.exceptions.ConnectionError:
            logger.error("Cloud proxy connection failed: POST %s", path)
            return CloudProxyResponse(
                success=False,
                status_code=503,
                data={},
                error="Cannot reach Vitora cloud. Check internet connectivity.",
            )
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as exc:
            logger.exception("Cloud proxy unexpected error: POST %s", path)
            return CloudProxyResponse(
                success=False,
                status_code=500,
                data={},
                error=str(exc),
            )


# Module-level singleton
_client: CloudProxyClient | None = None


def get_cloud_proxy() -> CloudProxyClient:
    """Get or create the cloud proxy client singleton."""
    global _client
    if _client is None:
        _client = CloudProxyClient()
    return _client


def is_hub_mode() -> bool:
    """Check if we're running as a hub installation."""
    return os.getenv("DJANGO_ENV", "") == "hub"


def submit_sha_claim_via_cloud(claim_data: dict[str, Any]) -> CloudProxyResponse:
    """
    Submit a SHA claim through the Vitora cloud proxy.

    The hub sends the claim payload to the cloud, which:
    1. Validates the hub's license
    2. Injects SHA credentials (held in Azure Key Vault)
    3. Forwards to DHA HIE Middleware
    4. Returns the DHA response

    Args:
        claim_data: The claim payload (same shape as direct DHA submission)

    Returns:
        CloudProxyResponse from the cloud relay.
    """
    client = get_cloud_proxy()
    return client.post("/api/cloud/sha/submit/", claim_data)


def submit_sha_preauth_via_cloud(preauth_data: dict[str, Any]) -> CloudProxyResponse:
    """Submit a SHA preauthorization through the Vitora cloud proxy."""
    client = get_cloud_proxy()
    return client.post("/api/cloud/sha/preauth/", preauth_data)


def submit_khis_report_via_cloud(report_data: dict[str, Any]) -> CloudProxyResponse:
    """
    Submit a KHIS/DHIS2 report through the Vitora cloud proxy.

    The hub sends aggregated period data; the cloud generates the
    full DHIS2 data value set and submits to KHIS.
    """
    client = get_cloud_proxy()
    return client.post("/api/cloud/khis/report/", report_data)


def check_sha_eligibility_via_cloud(eligibility_data: dict[str, Any]) -> CloudProxyResponse:
    """Check patient SHA eligibility through the cloud proxy."""
    client = get_cloud_proxy()
    return client.post("/api/cloud/sha/eligibility/", eligibility_data)
