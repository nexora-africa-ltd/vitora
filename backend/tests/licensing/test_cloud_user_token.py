# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for hub-authorized, passwordless cloud user-token exchange.

Run with: poetry run pytest tests/licensing/test_cloud_user_token.py --no-cov
Inputs: active installation license JWTs and username/optional employee_id payloads.
"""

from __future__ import annotations

import base64
import uuid

import pytest  # type: ignore
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status

from hmis.apps.core.models import AuditLog, Facility, Organization, StaffProfile
from hmis.apps.licensing.cloud_user_token_views import canonical_cloud_user_token_request
from hmis.apps.licensing.models import Installation
from hmis.apps.licensing.tokens import (
    CLOUD_USER_TOKEN_AUDIENCE,
    CLOUD_USER_TOKEN_TYPE,
    verify_cloud_user_token,
)


@pytest.fixture
def cloud_user_token_signing_key():
    """Generate the hub private key used to prove this exchange request."""
    return Ed25519PrivateKey.generate()


@pytest.fixture
def cloud_user_token_installation(
    db, sample_organization, sample_facility, cloud_user_token_signing_key
):
    """Create the active installation that authorizes this exchange."""
    return Installation.objects.create(
        installation_id=f"user-token-{uuid.uuid4()}",
        organization=sample_organization,
        facility=sample_facility,
        name="Cloud user-token test hub",
        status=Installation.Status.ACTIVE,
        activated_at=timezone.now(),
        device_signing_public_key=base64.b64encode(
            cloud_user_token_signing_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        ).decode("ascii"),
    )


@pytest.fixture
def cloud_user_token_license(cloud_user_token_installation):
    """Sign a current license for the exchange installation."""
    from hmis.apps.licensing.tokens import (
        build_license_payload,
        get_private_key,
        sign_license_token,
    )

    try:
        get_private_key()
    except RuntimeError:
        pytest.skip("License keypair not available")
    return sign_license_token(build_license_payload(cloud_user_token_installation))


@pytest.fixture
def cloud_token_staff(test_staff_profile):
    """Use the standard active staff profile at the installation facility."""
    return test_staff_profile


class TestCloudUserTokenExchange:
    """Hub license can exchange a locally identified active user without passwords."""

    url = "/api/licensing/cloud/user-token/"

    def _authorize(self, api_client, license_token):
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {license_token}")

    def _proof(self, installation, staff, signing_key, *, timestamp=None, nonce=None, **overrides):
        """Build an Ed25519 proof bound to one cloud user-token exchange request."""
        timestamp = timestamp if timestamp is not None else int(timezone.now().timestamp())
        nonce = nonce or uuid.uuid4().hex
        payload = {
            "username": staff.user.username,
            "employee_id": staff.employee_id,
            "timestamp": timestamp,
            "nonce": nonce,
        }
        payload.update(overrides)
        signature = signing_key.sign(
            canonical_cloud_user_token_request(
                installation_id=str(installation.installation_id), **payload
            )
        )
        proof = {
            **payload,
            "signature": base64.b64encode(signature).decode("ascii"),
        }
        if proof["employee_id"] is None:
            proof.pop("employee_id")
        return proof

    def test_requires_active_hub_license(self, db, api_client, cloud_token_staff):
        """The endpoint must not accept anonymous requests or user JWT auth."""
        response = api_client.post(
            self.url, {"username": cloud_token_staff.user.username}, format="json"
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_issues_scoped_short_lived_non_refreshable_token_and_audits(
        self,
        db,
        api_client,
        cloud_user_token_installation,
        cloud_user_token_license,
        cloud_token_staff,
        cloud_user_token_signing_key,
    ):
        """An active in-scope staff account receives only the typed five-minute token."""
        self._authorize(api_client, cloud_user_token_license)

        response = api_client.post(
            self.url,
            self._proof(
                cloud_user_token_installation, cloud_token_staff, cloud_user_token_signing_key
            ),
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert set(response.data) == {"access_token", "token_type", "expires_in"}
        assert response.data["token_type"] == "Bearer"
        assert response.data["expires_in"] == 300

        claims = verify_cloud_user_token(response.data["access_token"])
        assert claims["aud"] == CLOUD_USER_TOKEN_AUDIENCE
        assert claims["token_type"] == CLOUD_USER_TOKEN_TYPE
        assert claims["installation_id"] == str(cloud_user_token_installation.installation_id)
        assert claims["organization_id"] == cloud_user_token_installation.organization_id
        assert claims["facility_id"] == cloud_user_token_installation.facility_id
        assert claims["user_id"] == cloud_token_staff.user_id
        assert claims["username"] == cloud_token_staff.user.username
        assert claims["sub"] == str(cloud_token_staff.user_id)
        assert claims["jti"]
        assert claims["exp"] - claims["iat"] == 300
        assert "refresh" not in claims

        # This purpose-specific token is deliberately not registered with normal API auth.
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access_token']}")
        normal_api_response = api_client.get("/api/patients/")
        assert normal_api_response.status_code == status.HTTP_401_UNAUTHORIZED

        audit = AuditLog.objects.get(action="hub_cloud_user_token_issued")
        assert audit.user_id == cloud_token_staff.user_id
        assert audit.organization_id == cloud_user_token_installation.organization_id
        assert audit.facility_id == cloud_user_token_installation.facility_id
        assert audit.details == {
            "installation_id": str(cloud_user_token_installation.installation_id),
            "jti": claims["jti"],
        }

    def test_rejects_staff_outside_installation_organization_or_facility(
        self,
        db,
        api_client,
        cloud_user_token_license,
        cloud_user_token_installation,
        cloud_user_token_signing_key,
        sample_organization,
        sample_facility,
        sample_department,
        sample_role,
    ):
        """A license must never mint a token for a staff profile in another tenant scope."""
        User = get_user_model()
        other_org = Organization.objects.create(
            name="Other Organization", slug=f"other-{uuid.uuid4()}"
        )
        other_facility = Facility.objects.create(
            name="Other Facility",
            mfl_code=f"OTH-{uuid.uuid4().hex[:8]}",
            organization=other_org,
            level=Facility.FacilityLevel.LEVEL_2,
            ownership=Facility.OwnershipType.PRIVATE,
        )
        other_user = User.objects.create_user(username="outside-staff", password="not-used")
        StaffProfile.objects.create(
            user=other_user,
            employee_id=f"OUT-{uuid.uuid4().hex[:8]}",
            organization=other_org,
            primary_facility=other_facility,
            primary_department=sample_department,
            primary_role=sample_role,
            date_joined=timezone.now().date(),
        )
        self._authorize(api_client, cloud_user_token_license)

        response = api_client.post(
            self.url,
            self._proof(
                cloud_user_token_installation,
                type("Staff", (), {"user": other_user, "employee_id": None})(),
                cloud_user_token_signing_key,
            ),
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_rejects_employee_id_that_does_not_match_requested_username(
        self,
        db,
        api_client,
        cloud_user_token_license,
        cloud_token_staff,
        cloud_user_token_installation,
        cloud_user_token_signing_key,
    ):
        """Optional employee ID is an additional exact match, not an alternate lookup."""
        self._authorize(api_client, cloud_user_token_license)

        response = api_client.post(
            self.url,
            {
                **self._proof(
                    cloud_user_token_installation,
                    cloud_token_staff,
                    cloud_user_token_signing_key,
                    employee_id="OTHER-EMPLOYEE",
                ),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_rejects_inactive_user_or_staff_profile(
        self,
        db,
        api_client,
        cloud_user_token_license,
        cloud_token_staff,
        cloud_user_token_installation,
        cloud_user_token_signing_key,
    ):
        """Only an enabled account with active employment can receive a cloud token."""
        cloud_token_staff.user.is_active = False
        cloud_token_staff.user.save(update_fields=["is_active"])
        self._authorize(api_client, cloud_user_token_license)

        response = api_client.post(
            self.url,
            self._proof(
                cloud_user_token_installation, cloud_token_staff, cloud_user_token_signing_key
            ),
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_rejects_bare_license_exchange_without_proof(
        self, db, api_client, cloud_user_token_license, cloud_token_staff
    ):
        """A valid license JWT alone cannot mint a user token."""
        self._authorize(api_client, cloud_user_token_license)

        response = api_client.post(
            self.url, {"username": cloud_token_staff.user.username}, format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert {"timestamp", "nonce", "signature"} <= set(response.data)

    def test_rejects_tampered_proof(
        self,
        db,
        api_client,
        cloud_user_token_installation,
        cloud_user_token_license,
        cloud_token_staff,
        cloud_user_token_signing_key,
    ):
        """Proofs are bound to the complete requested staff identity."""
        self._authorize(api_client, cloud_user_token_license)
        proof = self._proof(
            cloud_user_token_installation, cloud_token_staff, cloud_user_token_signing_key
        )
        proof["username"] = "tampered-user"

        response = api_client.post(self.url, proof, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["code"] == "invalid_installation_proof"

    def test_rejects_replayed_proof(
        self,
        db,
        api_client,
        cloud_user_token_installation,
        cloud_user_token_license,
        cloud_token_staff,
        cloud_user_token_signing_key,
    ):
        """A verified proof nonce is single-use even during its freshness window."""
        self._authorize(api_client, cloud_user_token_license)
        proof = self._proof(
            cloud_user_token_installation, cloud_token_staff, cloud_user_token_signing_key
        )

        assert api_client.post(self.url, proof, format="json").status_code == status.HTTP_200_OK
        response = api_client.post(self.url, proof, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["code"] == "replayed_installation_proof"

    def test_rejects_stale_proof(
        self,
        db,
        api_client,
        cloud_user_token_installation,
        cloud_user_token_license,
        cloud_token_staff,
        cloud_user_token_signing_key,
    ):
        """Proofs older than sixty seconds cannot be exchanged."""
        self._authorize(api_client, cloud_user_token_license)
        proof = self._proof(
            cloud_user_token_installation,
            cloud_token_staff,
            cloud_user_token_signing_key,
            timestamp=int(timezone.now().timestamp()) - 61,
        )

        response = api_client.post(self.url, proof, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["code"] == "stale_installation_proof"
