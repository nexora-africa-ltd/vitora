# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F405
"""Billing sha claims submission for Vitora HMIS.

What this file is for:
- Implement sha claims submission logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from __future__ import annotations

from hmis.apps.billing.services.sha_claims_shared import *  # noqa: F403


class SHAClaimsSubmissionMixin:
    def submit_claim(self, claim: SHAClaim, user, force_online: bool = False) -> dict:
        """
        Submit claim to SHA.

        Validates claim, packages it, submits to SHA API, and updates
        claim status with response.

        Args:
            claim: SHAClaim to submit
            user: User performing the submission
            force_online: Deprecated compatibility flag; ignored.

        Returns:
            Submission response dict from SHA API

        Raises:
            ValidationError: If claim is not valid for submission or API fails
        """
        # Validate first
        is_valid, errors = self.validate_claim(claim, user=user)
        if not is_valid:
            raise ValidationError({"errors": errors})

        # Check connectivity
        checker = legacy_sha_claims_module().ConnectivityChecker(server_url=self.api_base_url)
        is_online = checker.check()

        if not is_online:
            raise ValidationError(
                "Cannot submit claim: live SHA connectivity is required for OTP/biometric submission"
            )

        # Package claim
        bundle = self.package_claim(claim)

        # Submit via API
        try:
            response = self._submit_to_sha_api(bundle, claim)

            # Update claim status
            claim.status = SHAClaim.ClaimStatus.SUBMITTED
            claim.submitted_at = timezone.now()
            claim.submitted_by = user
            claim.sha_claim_reference = response.get("claim_reference", "")
            claim.submission_response = response
            claim.save(
                update_fields=[
                    "status",
                    "submitted_at",
                    "submitted_by",
                    "sha_claim_reference",
                    "submission_response",
                    "updated_at",
                ]
            )

            # Log audit
            AuditLog.log(
                action="sha_claim_submit",
                user=user,
                resource_type="SHAClaim",
                resource_id=claim.id,
                details={"sha_reference": claim.sha_claim_reference},
            )

            return response

        except requests.RequestException:
            claim.submission_response = {
                "error": "Claim submission request failed.",
            }
            claim.save(update_fields=["submission_response", "updated_at"])
            raise ValidationError("Submission failed due to an upstream service error.")

    def _queue_claim_for_submission(self, claim: SHAClaim, user) -> dict:
        """
        Queue a claim for offline submission.

        Creates a SyncQueue entry for the claim and updates claim status
        to PENDING_SUBMISSION.

        Args:
            claim: SHAClaim to queue
            user: User who initiated the submission

        Returns:
            Queue confirmation dict
        """
        from hmis.apps.billing.sha_serializers import SHAClaimSerializer

        # Package the claim data
        bundle = self.package_claim(claim)

        # Serialize claim data for sync queue
        serializer = SHAClaimSerializer(claim)
        claim_data = {
            "claim_id": claim.id,
            "claim_number": claim.claim_number,
            "fhir_bundle": bundle,
            "serialized_claim": serializer.data,
            "submitted_by_id": user.id,
            "queued_at": timezone.now().isoformat(),
        }

        # Create sync queue entry
        sync_manager = legacy_sha_claims_module().SyncManager()
        queue_entry = sync_manager.queue_change(
            operation="CREATE",
            model_name="SHAClaimSubmission",
            record_id=claim.id,
            data=claim_data,
        )

        # Update claim status to show it's queued
        claim.status = SHAClaim.ClaimStatus.PENDING_SUBMISSION
        claim.submission_response = {
            "queued": True,
            "queue_entry_id": queue_entry.id,
            "queued_at": timezone.now().isoformat(),
        }
        claim.save(update_fields=["status", "submission_response", "updated_at"])

        # Log audit
        AuditLog.log(
            action="sha_claim_queued",
            user=user,
            resource_type="SHAClaim",
            resource_id=claim.id,
            details={
                "queue_entry_id": queue_entry.id,
                "reason": "offline_submission",
            },
        )

        logger.info(
            f"Claim {claim.claim_number} queued for offline submission (queue_id={queue_entry.id})"
        )

        return {
            "status": "queued",
            "message": "Claim queued for submission when online",
            "queue_entry_id": queue_entry.id,
            "claim_number": claim.claim_number,
        }

    def _is_network_error(self, exception: Exception) -> bool:
        """
        Check if an exception is a network-related error.

        Args:
            exception: The exception to check

        Returns:
            True if network error, False otherwise
        """
        network_errors = (
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
            requests.exceptions.ConnectTimeout,
        )
        return isinstance(exception, network_errors)

    def process_queued_claims(self) -> dict:
        """
        Process all queued claim submissions.

        Called when connectivity is restored to submit all pending claims.

        Returns:
            Summary of processed claims
        """
        from django.contrib.auth import get_user_model

        from hmis.apps.core.models import SyncQueue

        User = get_user_model()

        # Get all pending claim submissions
        pending_entries = SyncQueue.objects.filter(
            model_name="SHAClaimSubmission",
            status="PENDING",
        ).order_by("created_at")

        results = {
            "processed": 0,
            "succeeded": 0,
            "failed": 0,
            "details": [],
        }

        for entry in pending_entries:
            entry.mark_syncing()

            try:
                claim_id = entry.data.get("claim_id")
                user_id = entry.data.get("submitted_by_id")

                claim = SHAClaim.objects.get(id=claim_id)
                user = User.objects.get(id=user_id)

                # Submit with force_online to prevent re-queueing
                response = self.submit_claim(claim, user, force_online=True)

                entry.mark_synced()
                results["succeeded"] += 1
                results["details"].append(
                    {
                        "claim_number": claim.claim_number,
                        "status": "submitted",
                        "sha_reference": response.get("claim_reference", ""),
                    }
                )

            except Exception as e:  # noqa: BLE001 - queued claim processing must fail-open per entry
                entry.retry_count += 1
                entry.error_message = str(e)

                if entry.retry_count >= 3:
                    entry.status = "FAILED"
                else:
                    entry.status = "PENDING"

                entry.save()
                results["failed"] += 1
                results["details"].append(
                    {
                        "claim_id": entry.data.get("claim_id"),
                        "status": "failed",
                        "error": str(e),
                        "retry_count": entry.retry_count,
                    }
                )

            results["processed"] += 1

        logger.info(
            f"Processed {results['processed']} queued claims: "
            f"{results['succeeded']} succeeded, {results['failed']} failed"
        )

        return results

    def _submit_to_sha_api(self, bundle: dict, claim: SHAClaim) -> dict:
        """
        Submit claim bundle to SHA API.

        Uses the official endpoint: POST /v1/shr-med/bundle
        On hub installations, routes through the Vitora cloud proxy.

        Args:
            bundle: FHIR Bundle to submit
            claim: SHAClaim (for attachments)

        Returns:
            API response dict

        Raises:
            requests.RequestException: If API call fails
            SHAAuthError: If authentication fails
        """
        from hmis.apps.licensing.cloud_proxy import is_hub_mode, submit_sha_claim_via_cloud

        # Hub mode: route through cloud proxy (hub never holds SHA credentials)
        if is_hub_mode():
            proxy_response = submit_sha_claim_via_cloud(
                {"bundle": bundle, "claim_id": claim.pk, "claim_number": claim.claim_number}
            )
            if not proxy_response.success:
                raise requests.RequestException(f"Cloud proxy error: {proxy_response.error}")
            return proxy_response.data
        # Get auth headers
        headers = self.auth_service.get_auth_headers()
        headers["Content-Type"] = "application/fhir+json"

        # Prepare multipart with attachments if any
        files = []
        opened_files = []
        for attachment in claim.attachments.all():
            if (
                getattr(claim, "is_outpatient_capitation_claim", False)
                and attachment.attachment_type == "invoice"
            ):
                continue

            file_field = attachment.file
            if not file_field:
                continue

            try:
                exists = file_field.storage.exists(file_field.name)
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):  # noqa: BLE001
                exists = False

            if not exists:
                logger.warning(
                    "Skipping missing SHA attachment id=%s file=%s for claim %s",
                    attachment.id,
                    getattr(file_field, "name", ""),
                    claim.claim_number,
                )
                continue

            try:
                file_field.open("rb")
                opened_files.append(file_field)
            except FileNotFoundError:
                logger.warning(
                    "Skipping unreadable SHA attachment id=%s file=%s for claim %s",
                    attachment.id,
                    getattr(file_field, "name", ""),
                    claim.claim_number,
                )
                continue

            files.append(
                (
                    "attachments",
                    (attachment.original_filename, file_field, attachment.mime_type),
                )
            )

        try:
            # Submit to official endpoint: /v1/shr-med/bundle
            response = requests.post(
                f"{self.api_base_url}{self.claims_submit_endpoint}",
                json=bundle,
                files=files or None,
                headers=headers,
                timeout=60,
            )
        finally:
            for opened_file in opened_files:
                with contextlib.suppress(Exception):  # noqa: BLE001
                    opened_file.close()

        # Handle auth errors
        if response.status_code == 401:
            self.auth_service.clear_token_cache()
            raise SHAAuthError("Authentication failed during claim submission", status_code=401)

        if not response.ok:
            raise requests.RequestException(self._format_sha_submit_error(response))

        # Parse response - handle official wrapper format
        data = response.json()

        # Official format: {"IsSuccess": true, "Data": {...}}
        if "Data" in data and data.get("IsSuccess"):
            return data["Data"]

        return data

    def _format_sha_submit_error(self, response: requests.Response) -> str:
        """Extract the most useful SHA/API error message from a failed response."""
        body_message = ""
        try:
            payload = response.json()
        except ValueError:
            payload = None

        if isinstance(payload, Mapping):
            # Common backend/API envelope keys.
            for key in (
                "error",
                "detail",
                "message",
                "error_message",
                "ErrorMessage",
                "Message",
            ):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    body_message = value.strip()
                    break

            if not body_message:
                errors = payload.get("errors")
                if isinstance(errors, list) and errors:
                    body_message = "; ".join(str(item) for item in errors if item)
                elif isinstance(errors, Mapping) and errors:
                    parts = []
                    for field, msgs in errors.items():
                        if isinstance(msgs, list):
                            joined = ", ".join(str(m) for m in msgs if m)
                        else:
                            joined = str(msgs)
                        if joined:
                            parts.append(f"{field}: {joined}")
                    if parts:
                        body_message = "; ".join(parts)

            # Some SHA failures return structured EDI payloads at top-level.
            if not body_message and payload:
                body_message = str(payload)
        elif isinstance(payload, list) and payload:
            body_message = "; ".join(str(item) for item in payload if item)

        if not body_message:
            text = (response.text or "").strip()
            body_message = text[:500] if text else "No additional details provided by SHA"

        return f"SHA submission failed ({response.status_code}): {body_message}"

    def get_claim_status(self, claim_id: str) -> dict:
        """
        Get claim status from SHA API.

        Uses the official endpoint: GET /v1/shr-med/claim-status?claim_id={claim_id}

        Args:
            claim_id: SHA claim reference/ID

        Returns:
            Claim status response dict

        Raises:
            requests.RequestException: If API call fails
            SHAAuthError: If authentication fails
        """
        headers = self.auth_service.get_auth_headers()

        response = requests.get(
            f"{self.api_base_url}{self.claims_status_endpoint}",
            params={"claim_id": claim_id},
            headers=headers,
            timeout=30,
        )

        if response.status_code == 401:
            self.auth_service.clear_token_cache()
            raise SHAAuthError("Authentication failed during status check", status_code=401)

        response.raise_for_status()

        data = response.json()

        # Handle official wrapper format
        if "Data" in data and data.get("IsSuccess"):
            return data["Data"]

        return data
