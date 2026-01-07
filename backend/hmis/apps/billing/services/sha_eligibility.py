"""
SHA Eligibility Service for Vitora HMIS.

This module handles SHA (Social Health Authority) eligibility verification
with API communication, caching, retry logic, and error handling.

Reference: docs/sprint-2.1-2.2-sha-claims-integration-deliverables.md
"""

import time
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

import requests
from django.conf import settings
from django.utils import timezone

from hmis.apps.billing.models import SHAEligibilityCheck, SHAMember


class SHAEligibilityService:
    """
    Service for verifying SHA member eligibility.
    
    Handles API communication with SHA, caching, and retry logic.
    
    Attributes:
        api_base_url: Base URL for SHA API
        api_key: API key for authentication
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
        self.api_base_url = settings.SHA_API_BASE_URL
        self.api_key = settings.SHA_API_KEY
        self.timeout = settings.SHA_API_TIMEOUT
        self.max_retries = 3
    
    def check_eligibility(
        self,
        sha_member: SHAMember,
        user,
        force_refresh: bool = False
    ) -> SHAEligibilityCheck:
        """
        Check eligibility for a SHA member.
        
        Args:
            sha_member: The member to check
            user: User performing the check
            force_refresh: Bypass cache and always call API
        
        Returns:
            SHAEligibilityCheck record with results
        
        Example:
            >>> service = SHAEligibilityService()
            >>> check = service.check_eligibility(member, user)
            >>> if check.is_eligible:
            ...     print(f"Eligible until {check.eligible_until}")
        """
        # Check if we can use cached result
        if not force_refresh and not sha_member.needs_eligibility_check():
            return self._create_cached_result(sha_member, user)
        
        # Build request
        request_data = self._build_request(sha_member)
        
        # Call API with retry
        start_time = time.time()
        try:
            response = self._call_api(request_data)
            response_time = int((time.time() - start_time) * 1000)
            
            # Parse response
            check = self._process_response(
                sha_member, user, request_data, response, response_time
            )
        except requests.Timeout:
            check = self._create_error_result(
                sha_member, user, request_data,
                'TIMEOUT', 'API request timeout'
            )
        except requests.RequestException as e:
            check = self._create_error_result(
                sha_member, user, request_data,
                'API_ERROR', str(e)
            )
        
        # Update member record
        check.update_member_eligibility()
        
        return check
    
    def _build_request(self, sha_member: SHAMember) -> dict:
        """
        Build API request payload.
        
        Args:
            sha_member: The member to build request for
            
        Returns:
            Dict containing request payload
        """
        return {
            'sha_number': sha_member.sha_number,
            'national_id': sha_member.national_id,
            'check_date': date.today().isoformat(),
        }
    
    def _call_api(self, request_data: dict) -> dict:
        """
        Make API call with retry logic.
        
        Implements exponential backoff: 1s, 2s, 4s between retries.
        
        Args:
            request_data: Request payload to send
            
        Returns:
            Dict containing API response
            
        Raises:
            requests.Timeout: If all retries timeout
            requests.RequestException: If all retries fail
        """
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
        }
        
        last_exception: Optional[Exception] = None
        
        for attempt in range(self.max_retries):
            try:
                response = requests.post(
                    f'{self.api_base_url}/eligibility/check',
                    json=request_data,
                    headers=headers,
                    timeout=self.timeout,
                )
                response.raise_for_status()
                return response.json()
            except requests.RequestException as e:
                last_exception = e
                if attempt == self.max_retries - 1:
                    raise
                # Exponential backoff: 2^0=1, 2^1=2, 2^2=4 seconds
                time.sleep(2 ** attempt)
        
        # Should not reach here, but satisfy type checker
        raise last_exception  # type: ignore
    
    def _process_response(
        self,
        sha_member: SHAMember,
        user,
        request_data: dict,
        response: dict,
        response_time: int
    ) -> SHAEligibilityCheck:
        """
        Process API response and create check record.
        
        Args:
            sha_member: The member checked
            user: User who performed the check
            request_data: Original request payload
            response: API response data
            response_time: Response time in milliseconds
            
        Returns:
            SHAEligibilityCheck record with parsed results
        """
        is_eligible = response.get('eligible', False)
        
        # Parse benefit balance
        benefit_balance = self._parse_decimal(response.get('balance'))
        
        # Parse eligible_until date
        eligible_until = self._parse_date(response.get('valid_until'))
        
        return SHAEligibilityCheck.objects.create(
            sha_member=sha_member,
            patient=sha_member.patient,
            request_data=request_data,
            result=(
                SHAEligibilityCheck.CheckResult.ELIGIBLE
                if is_eligible else
                SHAEligibilityCheck.CheckResult.INELIGIBLE
            ),
            response_data=response,
            response_time_ms=response_time,
            is_eligible=is_eligible,
            eligible_until=eligible_until,
            benefit_balance=benefit_balance,
            ineligibility_reason=response.get('reason', ''),
            checked_by=user,
        )
    
    def _create_cached_result(
        self,
        sha_member: SHAMember,
        user
    ) -> SHAEligibilityCheck:
        """
        Create a cached eligibility check result from stored member data.
        
        Used when the member has a recent valid eligibility check and
        force_refresh is False.
        
        Args:
            sha_member: The member with cached eligibility data
            user: User performing the check
            
        Returns:
            SHAEligibilityCheck record based on cached data
        """
        cached_response = sha_member.eligibility_response or {}
        is_eligible = cached_response.get('eligible', sha_member.is_eligible())
        
        return SHAEligibilityCheck.objects.create(
            sha_member=sha_member,
            patient=sha_member.patient,
            request_data={'cached': True, 'sha_number': sha_member.sha_number},
            result=(
                SHAEligibilityCheck.CheckResult.ELIGIBLE
                if is_eligible else
                SHAEligibilityCheck.CheckResult.INELIGIBLE
            ),
            response_data={
                'cached': True,
                'cached_from': sha_member.last_eligibility_check.isoformat()
                if sha_member.last_eligibility_check else None,
                **cached_response
            },
            response_time_ms=0,  # No API call made
            is_eligible=is_eligible,
            eligible_until=sha_member.eligibility_valid_until,
            benefit_balance=self._parse_decimal(cached_response.get('balance')),
            ineligibility_reason=cached_response.get('reason', ''),
            checked_by=user,
        )
    
    def _create_error_result(
        self,
        sha_member: SHAMember,
        user,
        request_data: dict,
        error_code: str,
        error_message: str
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
        if error_code == 'TIMEOUT':
            result = SHAEligibilityCheck.CheckResult.TIMEOUT
        else:
            result = SHAEligibilityCheck.CheckResult.ERROR
        
        return SHAEligibilityCheck.objects.create(
            sha_member=sha_member,
            patient=sha_member.patient,
            request_data=request_data,
            result=result,
            response_data={'error': True, 'error_code': error_code},
            response_time_ms=None,
            is_eligible=False,
            eligible_until=None,
            benefit_balance=None,
            ineligibility_reason='',
            error_code=error_code,
            error_message=error_message,
            checked_by=user,
        )
    
    def _parse_decimal(self, value: Any) -> Optional[Decimal]:
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
    
    def _parse_date(self, value: Any) -> Optional[date]:
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
