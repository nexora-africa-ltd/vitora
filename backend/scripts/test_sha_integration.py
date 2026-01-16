#!/usr/bin/env python3
"""
SHA Integration Test Script

Tests core SHA functionality using real developer credentials against
the SHA UAT (User Acceptance Testing) environment.

Prerequisites:
    1. Obtain SHA developer credentials from sha.go.ke or your SHA contact
    2. Set credentials in .env file (project root):
       - SHA_API_BASE_URL (e.g., https://uat.dha.go.ke)
       - SHA_CONSUMER_KEY (your consumer/API key)
       - SHA_CLIENT_SECRET (client secret)
       - SHA_USERNAME (API username for Basic Auth)
       - SHA_PASSWORD (API password for Basic Auth)

Usage:
    # Credentials loaded automatically from .env
    poetry run python scripts/test_sha_integration.py
    
    # Run specific test
    poetry run python scripts/test_sha_integration.py --test eligibility
    poetry run python scripts/test_sha_integration.py --test claims
    
    # Use specific member for testing
    poetry run python scripts/test_sha_integration.py --sha-number "SHA-123456789"
    poetry run python scripts/test_sha_integration.py --national-id "12345678"

Note:
    This script makes REAL API calls to SHA. Use only in sandbox/UAT environment.
    Never use production credentials for testing.

Official API Endpoints (Kenya Digital Superhighway):
    - Auth:       GET  /v1/hie-auth?key={consumer_key}
    - Eligibility: GET  /v2/eligibility?doc_type={type}&doc_value={value}
    - Claims:      POST /v1/shr-med/bundle
    - Status:      GET  /v1/shr-med/claim-status?claim_id={id}
    - ICD-11:      GET  /terminology/v1/icd11?code={code}
"""

import argparse
import base64
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import requests

# Load .env from project root
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✅ Loaded credentials from {env_path}")
except ImportError:
    print("⚠️  python-dotenv not installed, using environment variables only")


@dataclass
class SHACredentials:
    """SHA API credentials container."""
    api_base_url: str
    consumer_key: str
    client_secret: str | None = None
    username: str | None = None
    password: str | None = None
    access_token: str | None = None

    @classmethod
    def from_env(cls) -> 'SHACredentials':
        """Load credentials from environment variables (supports .env file)."""
        return cls(
            api_base_url=os.getenv('SHA_API_BASE_URL', 'https://uat.dha.go.ke'),
            consumer_key=os.getenv('SHA_CONSUMER_KEY', os.getenv('SHA_API_KEY', '')),
            client_secret=os.getenv('SHA_CLIENT_SECRET'),
            username=os.getenv('SHA_USERNAME'),
            password=os.getenv('SHA_PASSWORD'),
        )

    def is_valid(self) -> bool:
        """Check if credentials are configured."""
        return bool(self.api_base_url and self.consumer_key and self.username and self.password)

    def get_basic_auth_header(self) -> str:
        """Create Basic Auth header value."""
        if not self.username or not self.password:
            return ''
        credentials = f"{self.username}:{self.password}"
        return base64.b64encode(credentials.encode()).decode()


class SHAIntegrationTester:
    """
    Test SHA API integration with real credentials.
    
    Tests the following official endpoints:
    - /v1/hie-auth - Authentication (Basic Auth → JWT)
    - /v2/eligibility - Member eligibility verification
    - /v1/shr-med/bundle - Claim submission (FHIR)
    - /v1/shr-med/claim-status - Claim status check
    - /terminology/v1/* - Terminology services
    """

    def __init__(self, credentials: SHACredentials):
        self.credentials = credentials
        self.session = requests.Session()
        self.results: list[dict] = []
        self.jwt_token: str | None = None

        # Configure session defaults
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        })

    def _log(self, message: str, level: str = 'INFO'):
        """Log a message with timestamp."""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"[{timestamp}] [{level}] {message}")

    def _log_result(self, test_name: str, success: bool, details: dict):
        """Log and store test result."""
        result = {
            'test': test_name,
            'success': success,
            'timestamp': datetime.now().isoformat(),
            **details,
        }
        self.results.append(result)

        status = '✅ PASS' if success else '❌ FAIL'
        self._log(f"{status} - {test_name}")
        if not success:
            self._log(f"  Details: {details.get('error', 'Unknown error')}", 'ERROR')

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: dict | None = None,
        params: dict | None = None,
        use_basic_auth: bool = False,
    ) -> tuple[int, dict | None, str | None]:
        """
        Make an API request to SHA.
        
        Args:
            method: HTTP method
            endpoint: API endpoint path
            data: JSON body data
            params: Query parameters
            use_basic_auth: Use Basic Auth instead of Bearer token
        
        Returns:
            Tuple of (status_code, response_json, error_message)
        """
        url = f"{self.credentials.api_base_url.rstrip('/')}/{endpoint.lstrip('/')}"

        self._log(f"Request: {method} {url}")
        if params:
            self._log(f"  Params: {params}")
        if data:
            self._log(f"  Body: {json.dumps(data)[:500]}")

        # Set up headers
        headers = dict(self.session.headers)
        if use_basic_auth:
            basic_auth = self.credentials.get_basic_auth_header()
            headers['Authorization'] = f'Basic {basic_auth}'
        elif self.jwt_token:
            headers['Authorization'] = f'Bearer {self.jwt_token}'

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                headers=headers,
                timeout=30,
            )

            self._log(f"  Response: {response.status_code}")

            try:
                response_data = response.json()
                self._log(f"  Data: {json.dumps(response_data, indent=2)[:1000]}")
                return response.status_code, response_data, None
            except json.JSONDecodeError:
                return response.status_code, None, response.text[:500]

        except requests.Timeout:
            return 0, None, 'Request timeout'
        except requests.RequestException as e:
            return 0, None, str(e)

    # =========================================================================
    # Test Methods - Official SHA API Endpoints
    # =========================================================================

    def test_authentication(self) -> bool:
        """
        Test authentication endpoint.
        
        Official: GET /v1/hie-auth?key={consumer_key}
        Uses Basic Auth to obtain JWT token.
        """
        self._log("=" * 60)
        self._log("Testing SHA Authentication (Official Endpoint)")
        self._log("=" * 60)

        status_code, data, error = self._make_request(
            'GET',
            '/v1/hie-auth',
            params={'key': self.credentials.consumer_key},
            use_basic_auth=True,
        )

        if status_code == 200 and data:
            # Extract token from response
            token = data.get('token')
            if not token and data.get('Data'):
                token = data['Data'].get('token')

            if token:
                self.jwt_token = token
                self._log_result('test_authentication', True, {
                    'message': 'Successfully obtained JWT token',
                    'token_preview': f"{token[:20]}..." if len(token) > 20 else token,
                })
                return True

        self._log_result('test_authentication', False, {
            'error': error or 'Failed to obtain JWT token',
            'status_code': status_code,
        })
        return False

    def test_eligibility_check(
        self,
        sha_number: str | None = None,
        national_id: str | None = None,
    ) -> bool:
        """
        Test eligibility verification endpoint.
        
        Official: GET /v2/eligibility?doc_type={type}&doc_value={value}
        """
        self._log("=" * 60)
        self._log("Testing Eligibility Check (Official Endpoint)")
        self._log("=" * 60)

        # Ensure we have a token
        if not self.jwt_token:
            self._log("No JWT token - attempting authentication first")
            if not self.test_authentication():
                self._log_result('test_eligibility_check', False, {
                    'error': 'Authentication required before eligibility check',
                })
                return False

        # Build request parameters per official spec
        if sha_number:
            params = {'doc_type': 'sha_number', 'doc_value': sha_number}
        elif national_id:
            params = {'doc_type': 'national_id', 'doc_value': national_id}
        else:
            # Use test data
            params = {'doc_type': 'national_id', 'doc_value': '12345678'}

        status_code, data, error = self._make_request(
            'GET',
            '/v2/eligibility',
            params=params,
        )

        if status_code == 200 and data:
            # Handle wrapped response format
            result_data = data.get('Data', data)

            self._log_result('test_eligibility_check', True, {
                'params': params,
                'eligible': result_data.get('eligible'),
                'reason': result_data.get('reason'),
                'coverage_end': result_data.get('coverageEndDate'),
            })
            return True

        self._log_result('test_eligibility_check', False, {
            'error': error or f'API returned {status_code}',
            'params': params,
        })
        return False

    def test_terminology_lookup(self) -> bool:
        """
        Test terminology service endpoints.
        
        Official: GET /terminology/v1/icd11?code={code}
        """
        self._log("=" * 60)
        self._log("Testing Terminology Lookup (Official Endpoints)")
        self._log("=" * 60)

        if not self.jwt_token:
            if not self.test_authentication():
                self._log_result('test_terminology_lookup', False, {
                    'error': 'Authentication required',
                })
                return False

        # Test ICD-11 lookup
        endpoints = [
            ('/terminology/v1/icd11', {'code': 'BA00'}),
            ('/terminology/v1/sha-intervention', {'code': 'SHA'}),
            ('/terminology/v1/loinc', {'code': '2339-0'}),
        ]

        any_success = False
        for endpoint, params in endpoints:
            status_code, data, error = self._make_request('GET', endpoint, params=params)
            if status_code == 200:
                any_success = True
                self._log(f"  ✅ {endpoint} - Success")
            else:
                self._log(f"  ❌ {endpoint} - Failed ({status_code})")

        self._log_result('test_terminology_lookup', any_success, {
            'message': 'At least one terminology endpoint accessible' if any_success else 'No terminology endpoints accessible',
        })
        return any_success

    def test_claim_submission(self, sha_number: str) -> str | None:
        """
        Test claim submission.
        
        Official: POST /v1/shr-med/bundle
        Submits FHIR Bundle format.
        """
        self._log("=" * 60)
        self._log("Testing Claim Submission (Official Endpoint)")
        self._log("=" * 60)

        if not self.jwt_token:
            if not self.test_authentication():
                self._log_result('test_claim_submission', False, {
                    'error': 'Authentication required',
                })
                return None

        # Build FHIR Bundle claim data (SHA-compliant message bundle)
        import uuid
        bundle_guid = str(uuid.uuid4())
        fhir_base_url = 'https://qa-mis.apeiro-digital.com'
        facility_code = os.getenv('FACILITY_MFL_CODE', 'TEST-001')

        bundle = {
            'id': bundle_guid,
            'meta': {
                'profile': [f'{fhir_base_url}/fhir/StructureDefinition/bundle|1.0.0']
            },
            'resourceType': 'Bundle',
            'type': 'message',
            'timestamp': datetime.now().isoformat(),
            'entry': [
                {
                    'fullUrl': f'{fhir_base_url}/fhir/Organization/{facility_code}',
                    'resource': {
                        'resourceType': 'Organization',
                        'id': facility_code,
                        'name': 'Test Facility',
                        'active': 'True',
                    }
                },
                {
                    'fullUrl': f'{fhir_base_url}/fhir/Patient/{sha_number}',
                    'resource': {
                        'resourceType': 'Patient',
                        'id': sha_number,
                        'identifier': [{
                            'use': 'official',
                            'system': f'{fhir_base_url}/fhir/identifier/shanumber',
                            'value': sha_number
                        }],
                    }
                },
                {
                    'fullUrl': f'{fhir_base_url}/fhir/Claim/{bundle_guid}',
                    'resource': {
                        'resourceType': 'Claim',
                        'id': bundle_guid,
                        'status': 'active',
                        'type': {'coding': [{'system': 'http://terminology.hl7.org/CodeSystem/claim-type', 'code': 'institutional'}]},
                        'use': 'claim',
                        'patient': {
                            'reference': f'{fhir_base_url}/fhir/Patient/{sha_number}',
                            'identifier': {'value': sha_number, 'system': f'{fhir_base_url}/fhir/identifier/shanumber'}
                        },
                        'created': datetime.now().strftime('%Y-%m-%d'),
                        'provider': {
                            'reference': f'https://fr.kenya-hie.health/api/v4/Organization/{facility_code}',
                            'identifier': {'value': facility_code}
                        },
                        'priority': {'coding': [{'system': 'http://terminology.hl7.org/CodeSystem/processpriority', 'code': 'normal'}]},
                        'diagnosis': [{
                            'sequence': 1,
                            'diagnosisCodeableConcept': {
                                'coding': [{'system': f'{fhir_base_url}/fhir/terminology/CodeSystem/icd-11', 'code': 'BA00'}]
                            }
                        }],
                        'total': {'value': 500.00, 'currency': 'KES'},
                    }
                }
            ],
            '_test': True,  # Mark as test claim
        }

        status_code, data, error = self._make_request(
            'POST',
            '/v1/shr-med/bundle',
            data=bundle,
        )

        if status_code in (200, 201, 202) and data:
            result_data = data.get('Data', data)
            claim_ref = result_data.get('claim_reference') or result_data.get('claimReference') or result_data.get('id')

            self._log_result('test_claim_submission', True, {
                'claim_reference': claim_ref,
                'status': result_data.get('status'),
            })
            return claim_ref

        self._log_result('test_claim_submission', False, {
            'error': error or f'Submission failed with status {status_code}',
        })
        return None

    def test_claim_status(self, claim_ref: str) -> bool:
        """
        Test claim status lookup.
        
        Official: GET /v1/shr-med/claim-status?claim_id={claim_id}
        """
        self._log("=" * 60)
        self._log("Testing Claim Status Lookup (Official Endpoint)")
        self._log("=" * 60)

        if not self.jwt_token:
            if not self.test_authentication():
                self._log_result('test_claim_status', False, {
                    'error': 'Authentication required',
                })
                return False

        status_code, data, error = self._make_request(
            'GET',
            '/v1/shr-med/claim-status',
            params={'claim_id': claim_ref},
        )

        if status_code == 200 and data:
            result_data = data.get('Data', data)

            self._log_result('test_claim_status', True, {
                'claim_reference': claim_ref,
                'claim_status': result_data.get('status'),
            })
            return True

        self._log_result('test_claim_status', False, {
            'error': error or f'Status check failed with {status_code}',
            'claim_ref': claim_ref,
        })
        return False

    # =========================================================================
    # Run All Tests
    # =========================================================================

    def run_all_tests(
        self,
        sha_number: str | None = None,
        national_id: str | None = None,
    ) -> dict:
        """
        Run all integration tests.
        
        Args:
            sha_number: SHA member number for testing
            national_id: National ID for eligibility testing
            
        Returns:
            Summary of test results
        """
        self._log("=" * 60)
        self._log("SHA Integration Test Suite (Official Endpoints)")
        self._log("=" * 60)
        self._log(f"API Base URL: {self.credentials.api_base_url}")
        self._log(f"Consumer Key: {'*' * 10 + self.credentials.consumer_key[-4:] if len(self.credentials.consumer_key) > 4 else '(not set)'}")
        self._log(f"Username: {self.credentials.username or '(not set)'}")
        self._log("")

        # Test 1: Authentication (required first)
        auth_ok = self.test_authentication()
        if not auth_ok:
            self._log("Cannot proceed without authentication", 'ERROR')
            return self._generate_summary()

        # Test 2: Eligibility
        self.test_eligibility_check(
            sha_number=sha_number,
            national_id=national_id,
        )

        # Test 3: Terminology Services
        self.test_terminology_lookup()

        # Test 4: Claim submission (optional - requires valid member)
        if sha_number:
            claim_ref = self.test_claim_submission(sha_number)

            # Test 5: Claim status (if submission succeeded)
            if claim_ref:
                self.test_claim_status(claim_ref)
        else:
            self._log("Skipping claim tests (no SHA number provided)")

        return self._generate_summary()

    def _generate_summary(self) -> dict:
        """Generate test summary."""
        self._log("")
        self._log("=" * 60)
        self._log("Test Summary")
        self._log("=" * 60)

        passed = sum(1 for r in self.results if r['success'])
        failed = len(self.results) - passed

        summary = {
            'total': len(self.results),
            'passed': passed,
            'failed': failed,
            'pass_rate': f"{(passed / len(self.results) * 100):.1f}%" if self.results else "N/A",
            'results': self.results,
        }

        self._log(f"Total: {summary['total']}")
        self._log(f"Passed: {summary['passed']} ✅")
        self._log(f"Failed: {summary['failed']} ❌")
        self._log(f"Pass Rate: {summary['pass_rate']}")

        return summary


def main():
    parser = argparse.ArgumentParser(
        description='Test SHA API integration with real credentials (Official Endpoints)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Run all tests with default settings
    python scripts/test_sha_integration.py
    
    # Test eligibility for specific member
    python scripts/test_sha_integration.py --sha-number "SHA-123456789"
    
    # Test with national ID
    python scripts/test_sha_integration.py --national-id "12345678"
    
    # Run specific test only
    python scripts/test_sha_integration.py --test eligibility
    
Environment Variables (required):
    SHA_API_BASE_URL  - SHA API base URL (default: https://uat.dha.go.ke)
    SHA_CONSUMER_KEY  - Consumer key for API access
    SHA_USERNAME      - API username for Basic Auth
    SHA_PASSWORD      - API password for Basic Auth
    
Optional:
    SHA_CLIENT_SECRET - Client secret (if required)
        """
    )

    parser.add_argument(
        '--sha-number',
        help='SHA membership number for testing'
    )
    parser.add_argument(
        '--national-id',
        help='National ID for eligibility testing'
    )
    parser.add_argument(
        '--test',
        choices=['auth', 'eligibility', 'terminology', 'claims', 'all'],
        default='all',
        help='Specific test to run'
    )
    parser.add_argument(
        '--api-url',
        help='Override SHA API base URL'
    )
    parser.add_argument(
        '--consumer-key',
        help='Override SHA consumer key'
    )
    parser.add_argument(
        '--output',
        help='Save results to JSON file'
    )

    args = parser.parse_args()

    # Load credentials
    credentials = SHACredentials.from_env()

    # Override from command line
    if args.api_url:
        credentials.api_base_url = args.api_url
    if args.consumer_key:
        credentials.consumer_key = args.consumer_key

    # Validate credentials
    if not credentials.is_valid():
        print("❌ Error: SHA credentials not configured")
        print("")
        print("Please set the following environment variables in .env:")
        print("  SHA_API_BASE_URL=https://uat.dha.go.ke")
        print("  SHA_CONSUMER_KEY=your-consumer-key")
        print("  SHA_USERNAME=your-username")
        print("  SHA_PASSWORD=your-password")
        print("")
        print("Or use command line arguments:")
        print("  --api-url 'https://uat.dha.go.ke'")
        print("  --consumer-key 'your-consumer-key'")
        sys.exit(1)

    # Create tester
    tester = SHAIntegrationTester(credentials)

    # Run tests
    if args.test == 'all':
        summary = tester.run_all_tests(
            sha_number=args.sha_number,
            national_id=args.national_id,
        )
    elif args.test == 'auth':
        tester.test_authentication()
        summary = tester._generate_summary()
    elif args.test == 'eligibility':
        tester.test_eligibility_check(
            sha_number=args.sha_number,
            national_id=args.national_id,
        )
        summary = tester._generate_summary()
    elif args.test == 'terminology':
        tester.test_terminology_lookup()
        summary = tester._generate_summary()
    elif args.test == 'claims':
        if not args.sha_number:
            print("❌ Error: --sha-number required for claims test")
            sys.exit(1)
        claim_ref = tester.test_claim_submission(args.sha_number)
        if claim_ref:
            tester.test_claim_status(claim_ref)
        summary = tester._generate_summary()

    # Save results if requested
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(summary, f, indent=2)
        print(f"\nResults saved to: {args.output}")

    # Exit with appropriate code
    sys.exit(0 if summary['failed'] == 0 else 1)


if __name__ == '__main__':
    main()
