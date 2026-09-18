# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Read-dominant, tenant-scoped Locust workload for isolated staging data.

Run with: poetry run locust -f tests/integration/locustfile.py --host "$LOCUST_HOST".
Inputs: LOCUST_USERNAME, LOCUST_PASSWORD, LOCUST_FACILITY_ID, optional
LOCUST_PATIENT_ID and LOCUST_CREATE_WRITES=true for synthetic write traffic.
"""

import os
import time
import uuid

from locust import HttpUser, between, task


def required_env(name: str) -> str:
    """Return a required load-test input without embedding credentials in code."""
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be set for authenticated load testing.")
    return value


class ClinicalWorkflowUser(HttpUser):
    """Simulate reception and clinician reads against one authorized facility."""

    wait_time = between(1, 3)
    patient_id = os.getenv("LOCUST_PATIENT_ID", "").strip()
    create_writes = os.getenv("LOCUST_CREATE_WRITES", "false").lower() == "true"
    request_headers: dict[str, str]

    def on_start(self) -> None:
        username = required_env("LOCUST_USERNAME")
        password = required_env("LOCUST_PASSWORD")
        facility_id = required_env("LOCUST_FACILITY_ID")

        with self.client.post(
            "/api/token/",
            json={"username": username, "password": password},
            name="auth: token",
            catch_response=True,
        ) as response:
            token = response.json().get("access") if response.status_code == 200 else None
            if not token:
                response.failure("Load-test account could not obtain a JWT access token.")
                raise RuntimeError("Load-test authentication failed.")

        self.request_headers = {
            "Authorization": f"Bearer {token}",
            "X-Facility-ID": facility_id,
            "Accept": "application/json",
        }

    @task(8)
    def list_patients(self) -> None:
        with self.client.get(
            "/api/patients/?page=1&page_size=20",
            headers=self.request_headers,
            name="patients: list",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"Expected patient list, got {response.status_code}.")
                return
            payload = response.json()
            if not isinstance(payload, dict) or "results" not in payload:
                response.failure("Patient list did not return a paginated response.")

    @task(4)
    def list_encounters(self) -> None:
        with self.client.get(
            "/api/encounters/?page=1&page_size=20",
            headers=self.request_headers,
            name="encounters: list",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"Expected encounter list, got {response.status_code}.")

    @task(2)
    def patient_detail(self) -> None:
        if not self.patient_id:
            return
        with self.client.get(
            f"/api/patients/{self.patient_id}/",
            headers=self.request_headers,
            name="patients: detail",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(
                    f"Expected tenant-scoped patient detail, got {response.status_code}."
                )

    @task(1)
    def create_synthetic_patient(self) -> None:
        """Create only synthetic records, and only after an explicit opt-in."""
        if not self.create_writes:
            return

        suffix = uuid.uuid4().hex[:12]
        payload = {
            "first_name": "Load",
            "last_name": f"Test{suffix}",
            "date_of_birth": "1990-01-01",
            "gender": "O",
            "phone_number": f"+2547{suffix[:8]}",
            "consent_given": True,
            "county": int(required_env("LOCUST_COUNTY_ID")),
            "sub_county": int(required_env("LOCUST_SUB_COUNTY_ID")),
        }
        headers = {**self.request_headers, "X-Idempotency-Key": str(uuid.uuid4())}
        started_at = time.monotonic()
        with self.client.post(
            "/api/patients/",
            json=payload,
            headers=headers,
            name="patients: create synthetic",
            catch_response=True,
        ) as response:
            if response.status_code not in {200, 201}:
                response.failure(f"Synthetic patient creation failed: {response.status_code}.")
            elif time.monotonic() - started_at > 5:
                response.failure("Synthetic patient creation exceeded the 5 second SLO budget.")
