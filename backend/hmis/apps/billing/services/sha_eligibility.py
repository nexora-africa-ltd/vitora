"""
SHA Eligibility Service for Vitora HMIS.

This module handles SHA (Social Health Authority) eligibility verification
with API communication, caching, retry logic, and error handling.

Reference: docs/sha-api-validation-report.md
Official Endpoint: GET /v2/eligibility?doc_type={type}&doc_value={value}
"""

import time
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

import requests
from django.conf import settings

from hmis.apps.billing.models import SHAEligibilityCheck, SHAMember
from hmis.apps.billing.services.sha_auth import SHAAuthError, SHAAuthService

# ---------------------------------------------------------------------------
# Scheme \u2194 facility level matrix (DHA HIE user-journey spec)
# ---------------------------------------------------------------------------
# Defines which schemes a facility of a given KEPH level may bill against.
# Used to derive a coverage caveat when the member's covered schemes don't
# intersect with what the requesting facility can actually claim against \u2014
# e.g. a UHC-only member presenting at a Level 4 hospital is technically
# "eligible" upstream but cannot fund hospital-level services.
BILLABLE_SCHEMES_BY_LEVEL: dict[str, set[str]] = {
    "1": {"UHC"},  # Community units \u2014 outpatient/PHC only
    "2": {"UHC"},  # Dispensaries
    "3": {"UHC", "SHIF"},  # Health centres
    "4": {"SHIF"},  # Sub-county hospitals
    "5": {"SHIF"},  # County referral
    "6": {"SHIF"},  # National referral
}


def evaluate_facility_coverage(
    eligible_schemes: list[str],
    facility_level: str | None,
) -> dict[str, Any]:
    """
    Evaluate whether the member's covered schemes intersect with what the
    facility can bill at its KEPH level.

    Returns a dict with:
        billable_schemes: schemes claimable at this facility level
        usable_schemes:   intersection of eligible_schemes \u2229 billable_schemes
        coverage_caveat:  human-readable warning when schemes don't match,
                          else empty string
        coverage_blocked: True when there is no overlap (member cannot fund
                          services at this facility level)
    """
    normalized = [s.strip().upper() for s in eligible_schemes if isinstance(s, str) and s.strip()]
    level = (facility_level or "").strip()
    if not level:
        return {
            "billable_schemes": [],
            "usable_schemes": normalized,
            "coverage_caveat": "",
            "coverage_blocked": False,
        }

    billable = BILLABLE_SCHEMES_BY_LEVEL.get(level, set())
    usable = sorted(set(normalized) & billable)
    if usable:
        return {
            "billable_schemes": sorted(billable),
            "usable_schemes": usable,
            "coverage_caveat": "",
            "coverage_blocked": False,
        }

    if not normalized:
        return {
            "billable_schemes": sorted(billable),
            "usable_schemes": [],
            "coverage_caveat": "",
            "coverage_blocked": False,
        }

    member_schemes = ", ".join(normalized)
    facility_schemes = ", ".join(sorted(billable)) or "no schemes"
    caveat = (
        f"Member has {member_schemes} cover only \u2014 services at a Level {level} "
        f"facility are billable under {facility_schemes}. Patient must self-pay "
        "or the claim will be rejected."
    )
    return {
        "billable_schemes": sorted(billable),
        "usable_schemes": [],
        "coverage_caveat": caveat,
        "coverage_blocked": True,
    }


class SHAEligibilityService:
    """
    Service for verifying SHA member eligibility.

    Handles API communication with SHA, caching, and retry logic.
    Uses the official Kenya Digital Superhighway eligibility endpoint.

    Official API:
        GET /v2/eligibility?doc_type={doc_type}&doc_value={doc_value}

    Supported doc_types:
        - national_id
        - kra_pin
        - sha_number
        - cr_number (Client Registry number)

    Attributes:
        api_base_url: Base URL for SHA API
        auth_service: SHA authentication service
        timeout: Request timeout in seconds
        max_retries: Maximum number of retry attempts

    Example:
        >>> service = SHAEligibilityService()
        >>> check = service.check_eligibility(sha_member, user)
        >>> print(check.is_eligible)
        True
    """

    def __init__(self):
        """Initialize SHAEligibilityService with settings from Django config."""
        self.auth_service = SHAAuthService()
        self.auth_mode = self.auth_service.auth_mode
        if self.auth_mode == "ilm":
            self.api_base_url = self.auth_service.auth_base_url.rstrip("/")
        else:
            self.api_base_url = settings.SHA_API_BASE_URL.rstrip("/")
        self.timeout = settings.SHA_API_TIMEOUT
        self.max_retries = 3

        # Backward compatible attributes for tests
        self.api_key = settings.SHA_API_KEY

        # Get endpoint from settings
        if self.auth_mode == "ilm":
            self.eligibility_endpoint = settings.SHA_ENDPOINTS.get(
                "ilm_eligibility", "/api/v1/patients/eligibility"
            )
            self.patient_lookup_endpoint = settings.SHA_ENDPOINTS.get(
                "patient_lookup", "/api/v1/patients"
            )
        else:
            self.eligibility_endpoint = settings.SHA_ENDPOINTS.get("eligibility", "/v2/eligibility")
            self.patient_lookup_endpoint = None

    def check_eligibility(
        self,
        sha_member: SHAMember,
        user,
        force_refresh: bool = False,
        facility=None,
    ) -> SHAEligibilityCheck:
        """
        Check eligibility for a SHA member.

        Args:
            sha_member: The member to check
            user: User performing the check
            force_refresh: Bypass cache and always call API
            facility: Optional Facility instance. When provided, the response
                payload is annotated with `eligible_schemes`, `coverage_caveat`
                and `coverage_blocked` so downstream callers can warn when the
                member's covered schemes don't match what this facility's KEPH
                level can bill (e.g. UHC-only at Level 4).

        Returns:
            SHAEligibilityCheck record with results

        Example:
            >>> service = SHAEligibilityService()
            >>> check = service.check_eligibility(member, user, facility=request.facility)
            >>> if check.is_eligible:
            ...     print(f"Eligible until {check.eligible_until}")
        """
        # Check if we can use cached result
        if not force_refresh and not sha_member.needs_eligibility_check():
            return self._create_cached_result(sha_member, user, facility=facility)

        # Build request
        request_data = self._build_request(sha_member)

        # Call API with retry
        start_time = time.time()
        try:
            response = self._call_api(request_data)
            response_time = int((time.time() - start_time) * 1000)

            # Parse response
            check = self._process_response(
                sha_member, user, request_data, response, response_time, facility=facility
            )
        except requests.Timeout:
            check = self._create_error_result(
                sha_member, user, request_data, "TIMEOUT", "API request timeout"
            )
        except requests.RequestException as e:
            check = self._create_error_result(sha_member, user, request_data, "API_ERROR", str(e))

        # Update member record
        check.update_member_eligibility()

        return check

    def _build_request(self, sha_member: SHAMember) -> dict:
        """
        Build API request parameters for eligibility check.

        Per official SHA API spec, uses query parameters:
        - doc_type: Type of document (sha_number, national_id, etc.)
        - doc_value: The document value

        Args:
            sha_member: The member to build request for

        Returns:
            Dict containing request parameters
        """
        if self.auth_mode == "ilm":
            if sha_member.national_id:
                return {
                    "identification_type": "National ID",
                    "identification_number": sha_member.national_id,
                }
            if sha_member.sha_number:
                return {
                    "identification_type": "SHA Number",
                    "identification_number": sha_member.sha_number,
                }
            return {
                "identification_type": "SHA Number",
                "identification_number": sha_member.cr_number or "",
            }

        # Prefer SHA number if available, otherwise use national ID
        if sha_member.sha_number:
            return {
                "doc_type": "sha_number",
                "doc_value": sha_member.sha_number,
            }
        if sha_member.national_id:
            return {
                "doc_type": "national_id",
                "doc_value": sha_member.national_id,
            }
        # Fallback to CR number if available
        return {
            "doc_type": "cr_number",
            "doc_value": sha_member.cr_number or "",
        }

    def _call_api(self, request_params: dict) -> dict:
        """
        Make API call with retry logic.

        Uses GET request to /v2/eligibility with query parameters
        per the official SHA API specification.

        Implements exponential backoff: 1s, 2s, 4s between retries.

        Args:
            request_params: Query parameters to send

        Returns:
            Dict containing API response data

        Raises:
            requests.Timeout: If all retries timeout
            requests.RequestException: If all retries fail
            SHAAuthError: If authentication fails
        """
        last_exception: Exception | None = None

        for attempt in range(self.max_retries):
            try:
                # Get fresh auth headers (handles token refresh)
                headers = self.auth_service.get_auth_headers()

                # Make GET request with query parameters (official spec)
                response = requests.get(
                    f"{self.api_base_url}{self.eligibility_endpoint}",
                    params=request_params,
                    headers=headers,
                    timeout=self.timeout,
                )

                # Handle auth errors
                if response.status_code == 401:
                    # Token might be expired, clear cache and retry
                    self.auth_service.clear_token_cache()
                    if attempt < self.max_retries - 1:
                        continue
                    raise SHAAuthError("Authentication failed", status_code=401)

                response.raise_for_status()

                # Parse response - handle official wrapper format
                data = response.json()

                if self.auth_mode == "ilm":
                    return data

                # Official format: {"IsSuccess": true, "Data": {...}}
                if "Data" in data and data.get("IsSuccess"):
                    return data["Data"]

                # Direct format fallback
                return data

            except SHAAuthError:
                raise
            except requests.RequestException as e:
                last_exception = e
                if attempt == self.max_retries - 1:
                    raise
                # Exponential backoff: 2^0=1, 2^1=2, 2^2=4 seconds
                time.sleep(2**attempt)

        # Should not reach here, but satisfy type checker
        raise last_exception  # type: ignore

    def _normalize_response(self, response: dict) -> dict:
        """Map legacy and ILM responses into a common eligibility shape."""
        if self.auth_mode != "ilm":
            return response

        if isinstance(response.get("schemes"), list):
            schemes = [scheme for scheme in response.get("schemes", []) if isinstance(scheme, dict)]
            covered_schemes = []
            shif_scheme = None
            uhc_scheme = None
            for scheme in schemes:
                scheme_name = scheme.get("schemeName")
                member_type = (scheme.get("memberType") or "").strip().upper()
                if isinstance(scheme_name, str):
                    upper_name = scheme_name.strip().upper()
                    if upper_name == "SHIF":
                        # Prefer PRIMARY over BENEFICIARY
                        if shif_scheme is None or member_type == "PRIMARY":
                            shif_scheme = scheme
                    elif upper_name == "UHC":
                        if uhc_scheme is None or member_type == "PRIMARY":
                            uhc_scheme = scheme

                coverage = (
                    scheme.get("coverage") if isinstance(scheme.get("coverage"), dict) else {}
                )
                status_value = coverage.get("status")
                if status_value in (1, True, "1", "active", "ACTIVE", "covered", "COVERED"):
                    covered_schemes.append(scheme)

            # Names of schemes the member is actively covered under (uppercase,
            # de-duplicated). Used downstream to compute facility-level caveats.
            eligible_scheme_names: list[str] = []
            for scheme in covered_schemes:
                name = scheme.get("schemeName")
                if isinstance(name, str) and name.strip():
                    upper = name.strip().upper()
                    if upper not in eligible_scheme_names:
                        eligible_scheme_names.append(upper)

            # Prioritize SHIF first, then UHC, then any covered scheme
            prioritized_schemes = (
                [shif_scheme] if shif_scheme else [uhc_scheme] if uhc_scheme else covered_schemes
            ) or schemes
            primary_scheme = prioritized_schemes[0] if prioritized_schemes else {}
            primary_coverage = (
                primary_scheme.get("coverage")
                if isinstance(primary_scheme.get("coverage"), dict)
                else {}
            )
            principal = (
                primary_scheme.get("principalContributor")
                if isinstance(primary_scheme.get("principalContributor"), dict)
                else {}
            )
            employer_details = (
                principal.get("employerDetails")
                if isinstance(principal.get("employerDetails"), dict)
                else {}
            )
            primary_status = primary_coverage.get("status")
            primary_is_eligible = primary_status in (
                1,
                True,
                "1",
                "active",
                "ACTIVE",
                "covered",
                "COVERED",
            )

            return {
                **response,
                "eligible": primary_is_eligible,
                "coverageEndDate": primary_coverage.get("endDate"),
                "reason": (
                    primary_coverage.get("message")
                    or primary_coverage.get("reason")
                    or response.get("statusDesc")
                    or response.get("message")
                    or ""
                ),
                "possible_solution": primary_coverage.get("possibleSolution")
                or primary_coverage.get("possible_solution"),
                "sha_number": response.get("memberCrNumber")
                or response.get("id")
                or response.get("sha_number"),
                "full_name": response.get("fullName") or response.get("full_name"),
                "employment_type": principal.get("employmentType"),
                "employer_name": employer_details.get("name"),
                "status_code": response.get("statusCode"),
                "status_desc": response.get("statusDesc"),
                "member_cr_number": response.get("memberCrNumber"),
                "date_of_birth": response.get("dateOfBirth"),
                "gender": response.get("gender"),
                "age": response.get("age"),
                "whitelisted_for_otp": response.get("whitelistedForOTP"),
                "schemes": schemes,
                "eligible_schemes": eligible_scheme_names,
                "primary_scheme_name": primary_scheme.get("schemeName"),
                "primary_scheme_member_type": primary_scheme.get("memberType"),
                "lookup_mode": "ilm_eligibility_schemes",
                "raw_response": response,
            }

        # ILM eligibility endpoint returns coverage-oriented fields like
        # eligible/reason/possible_solution/coverageEndDate. Preserve that shape.
        if any(
            key in response
            for key in ["eligible", "coverageEndDate", "possible_solution", "eligible_nhif"]
        ):
            first_name = (response.get("first_name") or "").strip()
            middle_name = (response.get("middle_name") or "").strip()
            last_name = (response.get("last_name") or "").strip()
            full_name = " ".join(part for part in [first_name, middle_name, last_name] if part)

            return {
                **response,
                "sha_number": response.get("id")
                or response.get("sha_number")
                or response.get("cr_number"),
                "full_name": full_name or response.get("full_name"),
                "status_code": response.get("statusCode"),
                "status_desc": response.get("statusDesc"),
                "member_cr_number": response.get("memberCrNumber"),
                "date_of_birth": response.get("dateOfBirth"),
                "gender": response.get("gender"),
                "age": response.get("age"),
                "whitelisted_for_otp": response.get("whitelistedForOTP"),
                "raw_response": response,
                "lookup_mode": "ilm_eligibility",
            }

        # ILM patient lookup returns a patient resource and is registry-like, not a
        # true eligibility decision. Keep a best-effort normalized shape only when
        # we explicitly process a lookup response.
        if "resourceType" not in response and not any(
            key in response for key in ["first_name", "middle_name", "last_name"]
        ):
            return {**response, "raw_response": response}

        first_name = (response.get("first_name") or "").strip()
        middle_name = (response.get("middle_name") or "").strip()
        last_name = (response.get("last_name") or "").strip()
        full_name = " ".join(part for part in [first_name, middle_name, last_name] if part)
        sha_number = response.get("id") or response.get("sha_number") or response.get("cr_number")
        is_eligible = bool(response.get("id") or response.get("identification_number"))

        return {
            **response,
            "eligible": is_eligible,
            "coverageEndDate": response.get("coverageEndDate") or response.get("coverage_end_date"),
            "balance": response.get("balance"),
            "reason": response.get("message") or response.get("reason") or "",
            "sha_number": sha_number,
            "full_name": full_name or response.get("full_name"),
            "lookup_mode": "ilm_patient",
            "raw_response": response,
        }

    def _process_response(
        self,
        sha_member: SHAMember,
        user,
        request_data: dict,
        response: dict,
        response_time: int,
        facility=None,
    ) -> SHAEligibilityCheck:
        """
        Process API response and create check record.

        Official SHA response format:
        {
            "eligible": true,
            "reason": "Active Coverage",
            "coverageEndDate": "2025-12-31",
            "isEmployed": true,
            "means_testing_details": {
                "category": "STANDARD",
                "copay_percentage": 10
            }
        }

        Args:
            sha_member: The member checked
            user: User who performed the check
            request_data: Original request parameters
            response: API response data (already extracted from wrapper)
            response_time: Response time in milliseconds

        Returns:
            SHAEligibilityCheck record with parsed results
        """
        normalized_response = self._normalize_response(response)
        eligible_value = normalized_response.get("eligible", False)
        is_eligible = eligible_value == 1 or eligible_value is True

        # Parse benefit balance (if provided)
        benefit_balance = self._parse_decimal(normalized_response.get("balance"))

        # Parse eligible_until date - official field is 'coverageEndDate'
        eligible_until = self._parse_date(
            normalized_response.get("coverageEndDate") or normalized_response.get("valid_until")
        )

        # Get ineligibility reason
        reason = normalized_response.get("reason", "")

        # Annotate with facility-aware coverage caveat (DHA HIE flow router
        # routes UHC at Level 4+ to SHIF, but SHIF cover is required to fund it).
        coverage_info = evaluate_facility_coverage(
            normalized_response.get("eligible_schemes") or [],
            getattr(facility, "level", None),
        )

        # Store full response including means testing details
        full_response = {
            **normalized_response,
            **coverage_info,
            "raw_response": response,  # Keep original for debugging
        }

        return SHAEligibilityCheck.objects.create(
            sha_member=sha_member,
            patient=sha_member.patient,
            request_data=request_data,
            result=(
                SHAEligibilityCheck.CheckResult.ELIGIBLE
                if is_eligible
                else SHAEligibilityCheck.CheckResult.INELIGIBLE
            ),
            response_data=full_response,
            response_time_ms=response_time,
            is_eligible=is_eligible,
            eligible_until=eligible_until,
            benefit_balance=benefit_balance,
            ineligibility_reason=reason if not is_eligible else "",
            checked_by=user,
        )

    def _create_cached_result(
        self, sha_member: SHAMember, user, facility=None
    ) -> SHAEligibilityCheck:
        """
        Create a cached eligibility check result from stored member data.

        Used when the member has a recent valid eligibility check and
        force_refresh is False.

        Args:
            sha_member: The member with cached eligibility data
            user: User performing the check
            facility: Optional Facility instance \u2014 re-evaluates the
                facility-aware coverage caveat against the cached schemes.

        Returns:
            SHAEligibilityCheck record based on cached data
        """
        cached_response = sha_member.eligibility_response or {}
        is_eligible = cached_response.get("eligible", sha_member.is_eligible())

        coverage_info = evaluate_facility_coverage(
            cached_response.get("eligible_schemes") or [],
            getattr(facility, "level", None),
        )

        return SHAEligibilityCheck.objects.create(
            sha_member=sha_member,
            patient=sha_member.patient,
            request_data={"cached": True, "sha_number": sha_member.sha_number},
            result=(
                SHAEligibilityCheck.CheckResult.ELIGIBLE
                if is_eligible
                else SHAEligibilityCheck.CheckResult.INELIGIBLE
            ),
            response_data={
                "cached": True,
                "cached_from": (
                    sha_member.last_eligibility_check.isoformat()
                    if sha_member.last_eligibility_check
                    else None
                ),
                **cached_response,
                **coverage_info,
            },
            response_time_ms=0,  # No API call made
            is_eligible=is_eligible,
            eligible_until=sha_member.eligibility_valid_until,
            benefit_balance=self._parse_decimal(cached_response.get("balance")),
            ineligibility_reason=cached_response.get("reason", ""),
            checked_by=user,
        )

    def _create_error_result(
        self, sha_member: SHAMember, user, request_data: dict, error_code: str, error_message: str
    ) -> SHAEligibilityCheck:
        """
        Create an error eligibility check result.

        Used when API call fails due to timeout or other errors.

        Args:
            sha_member: The member being checked
            user: User performing the check
            request_data: Original request payload
            error_code: Error code (e.g., 'TIMEOUT', 'API_ERROR')
            error_message: Human-readable error message

        Returns:
            SHAEligibilityCheck record with error details
        """
        # Map error codes to result types
        if error_code == "TIMEOUT":
            result = SHAEligibilityCheck.CheckResult.TIMEOUT
        else:
            result = SHAEligibilityCheck.CheckResult.ERROR

        return SHAEligibilityCheck.objects.create(
            sha_member=sha_member,
            patient=sha_member.patient,
            request_data=request_data,
            result=result,
            response_data={"error": True, "error_code": error_code},
            response_time_ms=None,
            is_eligible=False,
            eligible_until=None,
            benefit_balance=None,
            ineligibility_reason="",
            error_code=error_code,
            error_message=error_message,
            checked_by=user,
        )

    def _parse_decimal(self, value: Any) -> Decimal | None:
        """
        Safely parse a value to Decimal.

        Args:
            value: Value to parse (string, int, float, or None)

        Returns:
            Decimal value or None if parsing fails
        """
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return None

    def _parse_date(self, value: Any) -> date | None:
        """
        Safely parse a value to date.

        Args:
            value: ISO format date string or None

        Returns:
            date object or None if parsing fails
        """
        if value is None:
            return None
        try:
            if isinstance(value, date):
                return value
            return date.fromisoformat(str(value))
        except (ValueError, TypeError):
            return None

    def check_eligibility_direct(
        self,
        identification_type: str,
        identification_number: str,
    ) -> dict:
        """
        Check eligibility directly via SHA API without requiring an SHAMember record.

        This is useful during patient registration/lookup to verify SHA coverage
        before creating a local SHAMember record.

        Official API: GET /v2/eligibility?identification_type={type}&identification_number={value}

        Args:
            identification_type: Type of ID ('National ID', 'SHA Number', etc.)
            identification_number: The ID number value

        Returns:
            Dict with eligibility information:
            {
                'is_eligible': bool,
                'sha_number': str or None,
                'full_name': str or None,
                'coverage_end_date': str or None,
                'copay_percentage': int,
                'reason': str,
                'raw_response': dict,
                'error': str or None,
            }
        """
        import logging

        logger = logging.getLogger(__name__)

        request_params = {
            "identification_type": identification_type,
            "identification_number": identification_number,
        }

        logger.info(f"Direct eligibility check: {identification_type}={identification_number}")

        try:
            response = self._call_api(request_params)
            normalized = self._normalize_response(response)

            # Parse response - official format has eligibility data in 'message' wrapper
            # or directly in the response
            data = (
                normalized.get("message", normalized)
                if isinstance(normalized.get("message"), dict)
                else normalized
            )

            # Check if eligible - SHA uses 'eligible' field (1 = eligible, 0 = not)
            eligible_value = data.get("eligible", 0)
            is_eligible = eligible_value == 1 or eligible_value is True

            # Get SHA number (CR number)
            sha_number = data.get("id") or data.get("sha_number") or data.get("cr_number")

            # Coverage end date
            coverage_end_date = data.get("coverageEndDate")
            if coverage_end_date:
                # Parse ISO date format - may have timezone
                try:
                    from datetime import datetime

                    if "T" in str(coverage_end_date):
                        dt = datetime.fromisoformat(coverage_end_date.replace("Z", "+00:00"))
                        coverage_end_date = dt.date().isoformat()
                except (ValueError, AttributeError):
                    pass

            # Determine copay - means testing details may have this
            means_testing = data.get("means_testing_details", {})
            copay_percentage = means_testing.get("copay_percentage", 0)

            # If employed, typically standard 0% copay for SHIF
            if data.get("isEmployed") and is_eligible:
                copay_percentage = 0

            # Format means testing info for frontend
            means_testing_info = None
            if means_testing and means_testing.get("means_testing_done"):
                means_testing_info = {
                    "record_id": means_testing.get("record_id"),
                    "contribution": means_testing.get("contribution"),
                    "monthly_contribution": means_testing.get("monthly_contribution"),
                    "annual_contribution": means_testing.get("annual_contribution"),
                    "mt_date": means_testing.get("mt_date"),
                    "appeal_status": means_testing.get("appeal_status"),
                    "income_prediction_category": means_testing.get("income_prediction_category"),
                    "means_testing_done": means_testing.get("means_testing_done"),
                }

            # Fetch dependents if we have a SHA number (regardless of eligibility status)
            dependents = []
            dependents_covered = data.get("dependents_covered", 0)

            if sha_number:
                try:
                    from hmis.apps.billing.models import SHAMember

                    # Look up the principal member by SHA number
                    principal = SHAMember.objects.filter(
                        sha_number=sha_number, membership_type=SHAMember.MembershipType.PRINCIPAL
                    ).first()

                    if principal:
                        # Get dependents via FK or legacy string field
                        from django.db.models import Q

                        dependent_members = SHAMember.objects.filter(
                            Q(principal=principal) | Q(principal_sha_number=sha_number)
                        ).select_related("patient")

                        for dep in dependent_members:
                            dependents.append(
                                {
                                    "name": dep.patient.full_name if dep.patient else "Unknown",
                                    "relationship": dep.get_membership_type_display(),
                                    "date_of_birth": (
                                        dep.patient.date_of_birth.isoformat()
                                        if dep.patient and dep.patient.date_of_birth
                                        else None
                                    ),
                                    "sha_number": dep.sha_number,
                                    "is_active": dep.status == SHAMember.MembershipStatus.ACTIVE,
                                }
                            )

                        if not dependents_covered:
                            dependents_covered = len(dependents)
                except Exception as e:
                    logger.warning(f"Could not fetch dependents: {e}")

            return {
                "is_eligible": is_eligible,
                "sha_number": sha_number,
                "full_name": data.get("full_name"),
                "coverage_end_date": coverage_end_date,
                "copay_percentage": copay_percentage,
                "reason": data.get("message") or data.get("reason", ""),
                "possible_solution": data.get("possible_solution"),
                "is_employed": data.get("isEmployed", False),
                "employment_type": data.get("employment_type")
                or data.get("client_portal_details", {}).get("employment_type"),
                "employer_name": data.get("employer_name")
                or data.get("client_portal_details", {}).get("employer_name"),
                "nhif_transition_status": data.get("transition_status"),
                "status_code": data.get("status_code") or data.get("statusCode"),
                "status_desc": data.get("status_desc") or data.get("statusDesc"),
                "member_cr_number": data.get("member_cr_number") or data.get("memberCrNumber"),
                "date_of_birth": data.get("date_of_birth") or data.get("dateOfBirth"),
                "gender": data.get("gender"),
                "age": data.get("age"),
                "whitelisted_for_otp": data.get("whitelisted_for_otp")
                if data.get("whitelisted_for_otp") is not None
                else data.get("whitelistedForOTP"),
                "primary_scheme_name": data.get("primary_scheme_name"),
                "primary_scheme_member_type": data.get("primary_scheme_member_type"),
                "schemes": data.get("schemes") if isinstance(data.get("schemes"), list) else [],
                "means_testing": means_testing_info,
                "dependents": dependents,
                "dependents_covered": dependents_covered,
                "raw_response": response,
                "error": None,
            }

        except SHAAuthError as e:
            logger.error(f"Auth error during eligibility check: {e}")
            return {
                "is_eligible": False,
                "sha_number": None,
                "full_name": None,
                "coverage_end_date": None,
                "copay_percentage": 100,
                "reason": "SHA auth failed",
                "raw_response": {},
                "error": "SHA auth failed. Unable to authenticate with the upstream SHA service.",
                "error_code": "SHA_AUTH_FAILED",
                "error_title": "SHA auth failed",
                "error_detail": str(e),
                "upstream_status": getattr(e, "status_code", 0) or None,
            }
        except requests.Timeout:
            logger.error("Timeout during eligibility check")
            return {
                "is_eligible": False,
                "sha_number": None,
                "full_name": None,
                "coverage_end_date": None,
                "copay_percentage": 100,
                "reason": "SHA upstream timed out",
                "raw_response": {},
                "error": "SHA upstream timed out. Please retry the eligibility check.",
                "error_code": "SHA_UPSTREAM_TIMEOUT",
                "error_title": "SHA upstream timed out",
                "error_detail": "The upstream SHA eligibility service did not respond before the timeout.",
                "upstream_status": 504,
            }
        except requests.RequestException as e:
            logger.error(f"Request error during eligibility check: {e}")
            return {
                "is_eligible": False,
                "sha_number": None,
                "full_name": None,
                "coverage_end_date": None,
                "copay_percentage": 100,
                "reason": "SHA service unavailable",
                "raw_response": {},
                "error": "SHA service unavailable. The upstream eligibility service could not be reached.",
                "error_code": "SHA_UPSTREAM_UNAVAILABLE",
                "error_title": "SHA service unavailable",
                "error_detail": str(e),
                "upstream_status": getattr(getattr(e, "response", None), "status_code", None),
            }
