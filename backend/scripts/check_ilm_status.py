#!/usr/bin/env python3
"""Temporary ILM middleware status checker for DHA integration troubleshooting.

This script is meant for short-lived operational checks while the DHA ILM
middleware contract is still being stabilized. It exercises the smallest useful
flow end to end:

1. Load local credentials from the repository or backend environment files.
2. Request a client-credentials access token from the ILM tenant token route.
3. Decode the JWT payload without verifying the signature so the report can
    show whether DHA is issuing required claims such as ``tenant_id``.
4. Probe a small set of protected endpoints to distinguish between token
    issuance problems, claim-shape problems, and general middleware outages.

The output is intentionally compact so it can be used in repeated manual checks
or pasted into support updates without additional cleanup.
"""

from __future__ import annotations

import argparse
import base64
import importlib
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

try:
    load_dotenv = importlib.import_module("dotenv").load_dotenv

    env_candidates = [
        Path(__file__).resolve().parents[2] / ".env",
        Path(__file__).resolve().parents[1] / ".env",
    ]
    for env_path in env_candidates:
        if env_path.exists():
            load_dotenv(env_path)
except ImportError:
    pass


def _decode_jwt_payload(token: str) -> dict[str, Any]:
    """Decode a JWT payload for diagnostics without verifying the signature.

    The script uses this only for troubleshooting output. It is not attempting
    to authenticate the token locally; it only surfaces claim contents so we
    can quickly confirm whether DHA is issuing fields like ``tenant_id``,
    ``scope``, or client identifiers.

    Returns a dictionary of decoded claims. When the token is malformed or the
    payload cannot be decoded as JSON, a dictionary containing ``_decode_error``
    is returned instead so the caller can keep reporting useful context.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {"_decode_error": "Token is not a JWT"}
        payload = parts[1]
        padding = "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding)
        return json.loads(decoded)
    except Exception as exc:  # noqa: BLE001
        return {"_decode_error": str(exc)}


@dataclass
class ILMConfig:
    """Runtime configuration for a single ILM health check run.

    The values here intentionally mix token-request settings and probe inputs.
    The token settings define how the checker authenticates against the ILM
    middleware, while the identification and facility fields provide lightweight
    query parameters for protected endpoint probes.

    These probe values are not expected to represent real patient or facility
    data. They simply provide deterministic request shapes so the script can
    distinguish transport/auth failures from downstream validation responses.
    """

    base_url: str
    client_id: str
    client_secret: str
    grant_type: str
    identification_number: str
    identification_type: str
    facility_identifier: str
    facility_identifier_type: str
    timeout: int

    @classmethod
    def from_args(cls, args: argparse.Namespace) -> ILMConfig:
        """Build runtime configuration from CLI arguments and environment.

        Precedence is command-line override first, then ILM-specific environment
        variables, then compatible SHA settings already used by the backend.
        For the base URL, the checker deliberately defaults to the ILM middleware
        host rather than the legacy DHA host unless ILM mode is explicitly set in
        backend configuration.
        """
        env_auth_mode = (os.getenv("SHA_AUTH_MODE") or "").strip().lower()
        env_auth_base_url = os.getenv("SHA_AUTH_BASE_URL")
        default_base_url = "https://ilm-dev.dha.go.ke/uat-middleware"
        base_url = args.base_url or os.getenv("ILM_BASE_URL")
        if not base_url and env_auth_mode == "ilm" and env_auth_base_url:
            base_url = env_auth_base_url
        if not base_url:
            base_url = default_base_url
        base_url = base_url.rstrip("/")
        client_id = (
            args.client_id or os.getenv("ILM_CLIENT_ID") or os.getenv("SHA_CLIENT_ID") or "vitora"
        )
        client_secret = (
            args.client_secret
            or os.getenv("ILM_CLIENT_SECRET")
            or os.getenv("SHA_CLIENT_SECRET")
            or ""
        )
        return cls(
            base_url=base_url,
            client_id=client_id,
            client_secret=client_secret,
            grant_type=args.grant_type,
            identification_number=args.identification_number,
            identification_type=args.identification_type,
            facility_identifier=args.facility_identifier,
            facility_identifier_type=args.facility_identifier_type,
            timeout=args.timeout,
        )


class ILMStatusChecker:
    """Run a focused ILM middleware smoke test.

    The checker is intentionally narrow: it verifies that token issuance works,
    that the issued token contains expected claims, and that at least a couple
    of protected routes respond. That combination is enough to identify the
    failure mode we have repeatedly seen during DHA troubleshooting:

    - token endpoint down or misrouted,
    - token returned but missing required claims,
    - token accepted but downstream routes still failing,
    - general request/transport issues.
    """

    def __init__(self, config: ILMConfig):
        self.config = config
        self.session = requests.Session()

    def _print(self, message: str) -> None:
        """Emit a single report line.

        Kept as a tiny wrapper so formatting behavior can be adjusted in one
        place if the checker later needs timestamps, prefixes, or structured
        output.
        """
        print(message)

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        """Send one HTTP request against the configured ILM base URL.

        ``path`` should be the route portion beginning with ``/``. Timeout is
        applied centrally from the resolved runtime configuration so every probe
        behaves consistently.
        """
        url = f"{self.config.base_url}{path}"
        return self.session.request(method=method, url=url, timeout=self.config.timeout, **kwargs)

    def get_token(
        self,
    ) -> tuple[str | None, dict[str, Any] | None, requests.Response | None, str | None]:
        """Request an ILM access token using the client-credentials flow.

        The middleware currently expects ``application/x-www-form-urlencoded``
        payloads even though some external examples previously suggested JSON.
        The tuple return shape keeps error handling simple for the CLI report:

        - access token, if one was returned
        - parsed JSON body, if the response was valid JSON
        - raw response object, when a response was received
        - request error string, when the request failed before a response
        """
        try:
            response = self._request(
                "POST",
                "/api/v1/tenants/token",
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "client_id": self.config.client_id,
                    "client_secret": self.config.client_secret,
                    "grant_type": self.config.grant_type,
                },
            )
        except requests.RequestException as exc:
            return None, None, None, str(exc)

        try:
            body = response.json()
        except ValueError:
            body = None

        token = body.get("access_token") if isinstance(body, dict) else None
        return token, body, response, None

    def probe_endpoint(self, path: str, token: str) -> tuple[requests.Response | None, str | None]:
        """Call one protected ILM route with the supplied bearer token.

        The checker does not try to interpret the business meaning of the
        response. It only captures whether the route is reachable and returns a
        compact body preview so auth and routing problems are visible quickly.
        """
        try:
            response = self._request(
                "GET",
                path,
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {token}",
                },
            )
            return response, None
        except requests.RequestException as exc:
            return None, str(exc)

    def run(self) -> int:
        """Execute the full token-and-probe workflow and return a process code.

        Exit codes are intentionally simple for repeated manual use:

        - ``0``: token was issued, required claims were present, and probes did
          not return HTTP errors.
        - ``1``: the middleware responded, but token issuance, claims, or probe
          responses indicate an application-level problem.
        - ``2``: the checker could not complete due to request failures or local
          configuration problems.
        """
        self._print("ILM middleware status check")
        self._print(f"Base URL: {self.config.base_url}")
        self._print(f"Client ID: {self.config.client_id}")
        self._print("")

        token, token_body, token_response, token_error = self.get_token()
        if token_error:
            self._print(f"Token request failed: {token_error}")
            return 2

        assert token_response is not None
        self._print(f"Token endpoint: HTTP {token_response.status_code}")
        if token_body is not None:
            self._print("Token response keys: " + ", ".join(sorted(token_body.keys())))
        else:
            self._print("Token response was not valid JSON")

        if not token:
            preview = token_response.text[:300].replace("\n", " ")
            self._print(f"No access token returned. Body preview: {preview}")
            return 1

        payload = _decode_jwt_payload(token)
        tenant_id = payload.get("tenant_id")
        self._print(f"JWT tenant_id claim: {tenant_id!r}")
        self._print(f"JWT scope: {payload.get('scope')!r}")
        self._print(f"JWT azp/client: {payload.get('azp') or payload.get('client_id')!r}")
        self._print("")

        probes = {
            "eligibility": (
                "/api/v1/patients/eligibility"
                f"?identification_number={self.config.identification_number}"
                f"&identification_type={quote(self.config.identification_type)}"
            ),
            "facility_search": (
                "/api/v1/facilities/search"
                f"?identifier={self.config.facility_identifier}"
                f"&identifier-type={quote(self.config.facility_identifier_type)}"
            ),
        }

        exit_code = 0
        for name, path in probes.items():
            response, error = self.probe_endpoint(path, token)
            if error:
                self._print(f"{name}: request failed: {error}")
                exit_code = max(exit_code, 2)
                continue

            assert response is not None
            body_preview = response.text[:240].replace("\n", " ")
            self._print(f"{name}: HTTP {response.status_code}")
            self._print(f"{name} body: {body_preview}")
            self._print("")

            if response.status_code >= 400:
                exit_code = max(exit_code, 1)

        if tenant_id is None:
            exit_code = max(exit_code, 1)

        return exit_code


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for ad hoc ILM status checks.

    Defaults are biased toward quick operational use: a known ILM base URL, the
    client-credentials grant, lightweight sample probe values, and a modest
    timeout. All of them can be overridden when testing a different environment
    or credential set.
    """
    parser = argparse.ArgumentParser(description="Check current ILM middleware status")
    parser.add_argument("--base-url", help="ILM middleware base URL")
    parser.add_argument("--client-id", help="ILM client ID")
    parser.add_argument("--client-secret", help="ILM client secret")
    parser.add_argument(
        "--grant-type",
        default="client_credentials",
        help="OAuth grant type to send to the token endpoint",
    )
    parser.add_argument(
        "--identification-number",
        default="12345678",
        help="Sample identification number for the eligibility probe",
    )
    parser.add_argument(
        "--identification-type",
        default="National ID",
        help="Identification type for the eligibility probe",
    )
    parser.add_argument(
        "--facility-identifier",
        default="123",
        help="Sample facility identifier for the facility search probe",
    )
    parser.add_argument(
        "--facility-identifier-type",
        default="fid",
        help="Identifier type for the facility search probe",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=20,
        help="Request timeout in seconds",
    )
    return parser.parse_args()


def main() -> int:
    """Validate configuration, run the checker, and return a shell exit code."""
    config = ILMConfig.from_args(parse_args())
    if not config.client_secret:
        print(
            "Missing client secret. Set ILM_CLIENT_SECRET or SHA_CLIENT_SECRET, "
            "or pass --client-secret.",
            file=sys.stderr,
        )
        return 2
    return ILMStatusChecker(config).run()


if __name__ == "__main__":
    raise SystemExit(main())
