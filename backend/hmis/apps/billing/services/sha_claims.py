"""
SHA Claims Service for Vitora HMIS.

This module handles SHA (Social Health Authority) claims creation,
validation, packaging (FHIR format), and submission.

Reference: docs/sha-claims-bundle-validation-report.md
Official FHIR Bundle Spec: docs/sha-guides/claims.md
Official Endpoints:
    - Submit: POST /v1/shr-med/bundle
    - Status: GET /v1/shr-med/claim-status?claim_id={claim_id}

FHIR Bundle Requirements (SHA MIS):
    - Bundle type: "message"
    - Required resources: Organization, Patient, Coverage, Claim
    - Diagnosis coding: ICD-11 (not ICD-10)
    - Patient ID: SHA CR Number
    - Coverage: Must include scheme extensions (CAT-SHA-001)
"""

import logging
import uuid
from datetime import date

import requests
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.billing.models import (
    SHAClaim,
    SHAClaimItem,
)
from hmis.apps.billing.services.sha_auth import SHAAuthError, SHAAuthService
from hmis.apps.core.models import AuditLog
from hmis.apps.core.sync import ConnectivityChecker, SyncManager

logger = logging.getLogger(__name__)


class SHAClaimsService:
    """
    Service for SHA claims management.

    Handles claim creation, validation, packaging, and submission
    using the official Kenya Digital Superhighway API.

    Official Endpoints:
        - POST /v1/shr-med/bundle - Submit FHIR claim bundle
        - GET /v1/shr-med/claim-status?claim_id={id} - Check claim status

    Attributes:
        api_base_url: Base URL for SHA API
        auth_service: SHA authentication service
        facility_code: MFL (Master Facility List) code
        facility_level: Facility level (L1-L6)

    Example:
        >>> service = SHAClaimsService()
        >>> claim = service.create_claim_from_encounter(encounter, invoice, user)
        >>> is_valid, errors = service.validate_claim(claim)
        >>> if is_valid:
        ...     response = service.submit_claim(claim, user)
    """

    def __init__(self):
        """Initialize SHAClaimsService with settings from Django config."""
        self.api_base_url = settings.SHA_API_BASE_URL.rstrip('/')
        self.auth_service = SHAAuthService()
        self.facility_code = settings.FACILITY_MFL_CODE
        self.facility_level = settings.FACILITY_LEVEL
        self.facility_name = getattr(settings, 'FACILITY_NAME', 'Healthcare Facility')

        # SHA MIS FHIR Base URL (different from API base URL)
        # UAT: https://qa-mis.apeiro-digital.com
        # Production: https://mis.apeiro-digital.com
        self.fhir_base_url = getattr(
            settings, 'SHA_FHIR_BASE_URL',
            'https://qa-mis.apeiro-digital.com'
        ).rstrip('/')

        # Backward compatible attributes for tests
        self.api_key = settings.SHA_API_KEY

        # Get endpoints from settings
        self.claims_submit_endpoint = settings.SHA_ENDPOINTS.get(
            'claims_submit', '/v1/shr-med/bundle'
        )
        self.claims_status_endpoint = settings.SHA_ENDPOINTS.get(
            'claims_status', '/v1/shr-med/claim-status'
        )

    def create_claim_from_encounter(
        self,
        encounter,
        invoice,
        user,
        claim_type: str = None
    ) -> SHAClaim:
        """
        Create a new claim from an encounter and invoice.

        Args:
            encounter: The encounter to claim for
            invoice: Associated invoice
            user: User creating the claim
            claim_type: Override claim type (auto-detected if None)

        Returns:
            New SHAClaim instance

        Raises:
            ValidationError: If patient does not have SHA membership

        Example:
            >>> claim = service.create_claim_from_encounter(
            ...     encounter=encounter,
            ...     invoice=invoice,
            ...     user=request.user
            ... )
        """
        patient = encounter.patient

        # Verify SHA membership
        if not hasattr(patient, 'sha_member'):
            raise ValidationError("Patient does not have SHA membership")

        sha_member = patient.sha_member

        # Determine claim type
        if not claim_type:
            claim_type = self._determine_claim_type(encounter)

        # Extract diagnosis info from encounter if available
        # Get diagnosis from encounter's diagnoses relation if available
        primary_diagnosis_code = ''
        primary_diagnosis_description = ''
        secondary_diagnosis_codes = []

        # Check if encounter has diagnoses relation
        if hasattr(encounter, 'diagnoses') and encounter.diagnoses.exists():
            # Get primary diagnosis first
            primary = encounter.diagnoses.filter(diagnosis_type='PRIMARY').first()
            if primary:
                if primary.icd10_code:
                    primary_diagnosis_code = primary.icd10_code.code
                    primary_diagnosis_description = primary.icd10_code.description
                elif primary.free_text_diagnosis:
                    primary_diagnosis_code = 'UNSPECIFIED'
                    primary_diagnosis_description = primary.free_text_diagnosis

            # Get secondary diagnoses
            secondaries = encounter.diagnoses.filter(diagnosis_type='SECONDARY')
            for diag in secondaries:
                if diag.icd10_code:
                    secondary_diagnosis_codes.append(diag.icd10_code.code)

        # Fall back to direct attributes if no diagnoses relation
        if not primary_diagnosis_code:
            primary_diagnosis_code = getattr(encounter, 'primary_diagnosis_code', '') or ''
            primary_diagnosis_description = getattr(encounter, 'primary_diagnosis_description', '') or ''

        if not secondary_diagnosis_codes:
            secondary_diagnosis_codes = getattr(encounter, 'secondary_diagnosis_codes', []) or []

        # Build claim data - always include required fields even if empty (model validation will catch)
        claim_data = {
            'patient': patient,
            'sha_member': sha_member,
            'encounter': encounter,
            'invoice': invoice,
            'claim_type': claim_type,
            'service_date': encounter.encounter_date,
            'facility_code': self.facility_code,
            'facility_level': self.facility_level,
            'created_by': user,
        }

        # Add diagnosis info
        if primary_diagnosis_code:
            claim_data['primary_diagnosis_code'] = primary_diagnosis_code
            claim_data['primary_diagnosis_description'] = primary_diagnosis_description
        if secondary_diagnosis_codes:
            claim_data['secondary_diagnosis_codes'] = secondary_diagnosis_codes

        # For IPD claims, extract admission date
        if claim_type == SHAClaim.ClaimType.INPATIENT:
            admission_date = getattr(encounter, 'admission_date', None)
            if admission_date:
                claim_data['admission_date'] = admission_date

        # Create claim
        claim = SHAClaim.objects.create(**claim_data)

        # Create claim items from invoice items
        for invoice_item in invoice.items.all():
            SHAClaimItem.create_from_invoice_item(claim, invoice_item)

        return claim

    def _determine_claim_type(self, encounter) -> str:
        """
        Auto-determine claim type from encounter.

        Args:
            encounter: Encounter to determine type from

        Returns:
            ClaimType value string
        """
        if encounter.encounter_type == 'IPD':
            return SHAClaim.ClaimType.INPATIENT
        elif encounter.encounter_type == 'EMERGENCY':
            return SHAClaim.ClaimType.EMERGENCY
        return SHAClaim.ClaimType.OUTPATIENT

    def validate_claim(self, claim: SHAClaim) -> tuple[bool, list[str]]:
        """
        Comprehensive claim validation.

        Delegates to model's validate_for_submission() method.

        Args:
            claim: SHAClaim to validate

        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        return claim.validate_for_submission()

    def _get_practitioner_id(self, user) -> str:
        """
        Get or generate practitioner identifier for a user.

        Priority:
        1. StaffProfile license_number if available (maps to PUID)
        2. Fallback to employee_id with PUID prefix
        3. Final fallback: use user PK with prefix

        Args:
            user: Django User instance

        Returns:
            PUID-style identifier string
        """
        if user is None:
            return 'PUID-UNKNOWN-1'

        # Try to get StaffProfile
        staff_profile = getattr(user, 'staff_profile', None)

        if staff_profile:
            # Use license number if available
            if staff_profile.license_number:
                return f'PUID-{staff_profile.license_number}'
            # Fallback to employee_id
            if staff_profile.employee_id:
                return f'PUID-{staff_profile.employee_id}'

        # Final fallback: user PK
        return f'PUID-USR-{user.pk}'

    def _build_practitioner_resource(self, user, practitioner_id: str) -> dict:
        """
        Build FHIR Practitioner resource from User.

        Reference: docs/sha-guides/claims-submission.md - Reference PreAuth JSON

        Args:
            user: Django User instance (from encounter.finalized_by)
            practitioner_id: PUID-style identifier

        Returns:
            FHIR Practitioner resource dict
        """
        if user is None:
            return {
                'resourceType': 'Practitioner',
                'id': practitioner_id,
                'meta': {
                    'profile': [
                        f'{self.fhir_base_url}/fhir/StructureDefinition/practitioner|1.0.0'
                    ]
                },
                'name': [{'text': 'Unknown Practitioner'}],
                'active': True,
            }

        # Build name
        full_name = user.get_full_name() or user.username
        staff_profile = getattr(user, 'staff_profile', None)
        if staff_profile and staff_profile.title:
            full_name = f'{staff_profile.title} {full_name}'

        # Build identifiers
        identifiers = [
            {
                'use': 'official',
                'system': f'{self.fhir_base_url}/fhir/Practitioner/PractitionerRegistryID',
                'value': practitioner_id
            }
        ]

        if staff_profile:
            if staff_profile.license_number:
                identifiers.append({
                    'use': 'official',
                    'system': f'{self.fhir_base_url}/fhir/Practitioner/PractitionerRegistrationNumber',
                    'value': staff_profile.license_number
                })

        # Build qualifications from staff profile
        qualifications = []
        if staff_profile and staff_profile.specialization:
            qualifications.append({
                'code': {'text': staff_profile.specialization}
            })

        resource = {
            'resourceType': 'Practitioner',
            'id': practitioner_id,
            'meta': {
                'profile': [
                    f'{self.fhir_base_url}/fhir/StructureDefinition/practitioner|1.0.0'
                ]
            },
            'name': [{'text': full_name}],
            'identifier': identifiers,
            'active': True,
        }

        if qualifications:
            resource['qualification'] = qualifications

        return resource

    def package_claim(self, claim: SHAClaim) -> dict:
        """
        Package claim for submission in SHA-required FHIR format.

        Creates a FHIR Bundle (type: "message") containing:
        - Practitioner resource (attending healthcare worker)
        - Organization resource (healthcare facility)
        - Coverage resource (SHA membership)
        - PFMS Coverage resource (if PFMS eligible - checklist item #13)
        - Patient resource (patient demographics)
        - Claim resource (claim details with careTeam)

        Reference: docs/sha-guides/claims.md

        Args:
            claim: SHAClaim to package

        Returns:
            SHA-compliant FHIR Bundle dict
        """
        # Generate unique bundle ID (same as claim ID in FHIR)
        bundle_guid = str(uuid.uuid4())

        # Get SHA CR Number (used as patient identifier in SHA system)
        cr_number = claim.sha_member.sha_number

        # Get practitioner from encounter
        practitioner_user = None
        if claim.encounter:
            practitioner_user = claim.encounter.finalized_by
        practitioner_id = self._get_practitioner_id(practitioner_user)

        # Check for PFMS eligibility (checklist item #13)
        is_pfms_eligible = getattr(claim.sha_member, 'is_pfms_eligible', False)

        # Build base entries
        entries = [
            # Order per SHA spec: Practitioner, Organization, Coverage, Patient, Claim
            {
                'fullUrl': f'{self.fhir_base_url}/fhir/Practitioner/{practitioner_id}',
                'resource': self._build_practitioner_resource(practitioner_user, practitioner_id)
            },
            {
                'fullUrl': f'{self.fhir_base_url}/fhir/Organization/{self.facility_code}',
                'resource': self._build_organization_resource()
            },
            {
                'fullUrl': f'{self.fhir_base_url}/fhir/Coverage/{cr_number}-sha-coverage',
                'resource': self._build_coverage_resource(claim.sha_member, cr_number)
            },
        ]

        # Add PFMS coverage if eligible (SHA Integration Checklist item #13)
        if is_pfms_eligible:
            pfms_category = getattr(claim.sha_member, 'pfms_category', 'vulnerable')
            entries.append({
                'fullUrl': f'{self.fhir_base_url}/fhir/Coverage/{cr_number}-pfms-coverage',
                'resource': self._build_pfms_coverage_resource(
                    claim.sha_member, cr_number, pfms_category
                )
            })

        # Add patient and claim resources
        entries.extend([
            {
                'fullUrl': f'{self.fhir_base_url}/fhir/Patient/{cr_number}',
                'resource': self._build_patient_resource(claim.patient, claim.sha_member)
            },
            {
                'fullUrl': f'{self.fhir_base_url}/fhir/Claim/{bundle_guid}',
                'resource': self._build_claim_resource(
                    claim, bundle_guid, cr_number, practitioner_id, practitioner_user,
                    is_pfms_eligible=is_pfms_eligible
                )
            },
        ])

        bundle = {
            'id': bundle_guid,
            'meta': {
                'profile': [
                    f'{self.fhir_base_url}/fhir/StructureDefinition/bundle|1.0.0'
                ]
            },
            'timestamp': timezone.now().isoformat(),
            'type': 'message',
            'entry': entries,
            'resourceType': 'Bundle'
        }

        return bundle

    def _build_organization_resource(self) -> dict:
        """
        Build FHIR Organization resource for the healthcare facility.

        This resource identifies the facility submitting the claim.
        Data should match the Health Facilities Registry (HFR).

        Returns:
            FHIR Organization resource dict
        """
        return {
            'id': self.facility_code,
            'meta': {
                'profile': [
                    f'{self.fhir_base_url}/fhir/StructureDefinition/provider-organization|1.0.0'
                ]
            },
            'name': self.facility_name,
            'active': 'True',
            'extension': [
                {
                    'url': f'{self.fhir_base_url}/fhir/StructureDefinition/facility-level',
                    'valueCodeableConcept': {
                        'coding': [{
                            'system': f'{self.fhir_base_url}/fhir/StructureDefinition/facility-level',
                            'code': self.facility_level.upper(),
                            'display': self.facility_level.upper()
                        }]
                    }
                }
            ],
            'identifier': [{
                'use': 'official',
                'type': {
                    'coding': [{
                        'display': 'Code',
                        'system': f'{self.fhir_base_url}/fhir/terminology/CodeSystem/facility-identifier-types',
                        'code': 'fr-code'
                    }]
                },
                'value': self.facility_code
            }],
            'type': [{
                'coding': [{
                    'system': 'https://ts.kenya-hie.health/fhir/terminology/CodeSystem/organization-type',
                    'code': 'prov'
                }]
            }],
            'resourceType': 'Organization'
        }

    def _build_claim_resource(
        self,
        claim: SHAClaim,
        bundle_guid: str,
        cr_number: str,
        practitioner_id: str | None = None,
        practitioner_user=None,
        is_pfms_eligible: bool = False
    ) -> dict:
        """
        Build FHIR Claim resource per SHA specification.

        Args:
            claim: SHAClaim to build resource from
            bundle_guid: Unique GUID for this claim bundle
            cr_number: SHA CR Number for the patient
            practitioner_id: PUID for the attending practitioner
            practitioner_user: User instance for practitioner details
            is_pfms_eligible: Whether member has PFMS coverage (checklist #13)

        Returns:
            FHIR Claim resource dict
        """
        # Determine claim subType (op=outpatient, ip=inpatient)
        sub_type = 'ip' if claim.claim_type == 'inpatient' else 'op'

        # Build billable period from service date
        service_date = claim.service_date or date.today()
        end_date = claim.discharge_date or service_date

        # Get practitioner display name
        practitioner_display = 'Unknown Practitioner'
        if practitioner_user:
            practitioner_display = practitioner_user.get_full_name() or practitioner_user.username
            staff_profile = getattr(practitioner_user, 'staff_profile', None)
            if staff_profile and staff_profile.title:
                practitioner_display = f'{staff_profile.title} {practitioner_display}'

        # Build insurance array (SHA Integration Checklist item #13)
        insurance_entries = [{
            'sequence': 1,
            'focal': 'True',
            'coverage': {
                'reference': f'{self.fhir_base_url}/fhir/Coverage/{cr_number}-sha-coverage'
            }
        }]

        # Add PFMS coverage if eligible
        if is_pfms_eligible:
            insurance_entries.append({
                'sequence': 2,
                'focal': 'False',
                'coverage': {
                    'reference': f'{self.fhir_base_url}/fhir/Coverage/{cr_number}-pfms-coverage'
                }
            })

        claim_resource = {
            'id': bundle_guid,
            'identifier': [{
                'system': f'{self.fhir_base_url}/fhir/claim',
                'value': bundle_guid
            }],
            'status': 'active',
            'type': {
                'coding': [{
                    'system': 'http://terminology.hl7.org/CodeSystem/claim-type',
                    'code': 'institutional'
                }]
            },
            'subType': {
                'coding': [{
                    'system': 'http://terminology.hl7.org/CodeSystem/ex-claimsubtype',
                    'code': sub_type
                }]
            },
            'use': 'claim',
            'patient': {
                'reference': f'{self.fhir_base_url}/fhir/Patient/{cr_number}',
                'identifier': {
                    'value': cr_number,
                    'use': 'official',
                    'system': f'{self.fhir_base_url}/fhir/identifier/shanumber'
                },
                'type': 'Patient'
            },
            'billablePeriod': {
                'start': f'{service_date.isoformat()}T00:00:00',
                'end': f'{end_date.isoformat()}T23:59:59'
            },
            'insurance': insurance_entries,
            'created': claim.created_at.isoformat(),
            'provider': {
                # Reference MUST match the Organization fullUrl in the bundle
                # Per SHA Integration Checklist #11: "All references mentioned in the bundle
                # must point to a resource in bundle with matching fullUrl value"
                'reference': f'{self.fhir_base_url}/fhir/Organization/{self.facility_code}',
            },
            # CareTeam per SHA Integration Checklist #10
            # Reference: docs/sha-guides/claims-submission.md
            'careTeam': [{
                'sequence': 1,
                'provider': {
                    'reference': f'{self.fhir_base_url}/fhir/Practitioner/{practitioner_id}',
                    'type': 'Practitioner',
                    'display': practitioner_display
                }
            }],
            'priority': {
                'coding': [{
                    'system': 'http://terminology.hl7.org/CodeSystem/processpriority',
                    'code': 'normal'
                }]
            },
            'diagnosis': self._build_diagnosis_list(claim),
            'item': self._build_item_list(claim, cr_number),
            'total': {
                'value': float(claim.claimed_amount),
                'currency': 'KES'
            },
            'resourceType': 'Claim'
        }

        return claim_resource

    def _build_diagnosis_list(self, claim: SHAClaim) -> list[dict]:
        """
        Build FHIR diagnosis list from claim.

        NOTE: SHA uses ICD-11 coding system, NOT ICD-10!

        Args:
            claim: SHAClaim to extract diagnoses from

        Returns:
            List of FHIR diagnosis dicts
        """
        diagnoses = []

        # Primary diagnosis (using ICD-11 system per SHA spec)
        if claim.primary_diagnosis_code:
            diagnoses.append({
                'sequence': 1,
                'diagnosisCodeableConcept': {
                    'coding': [{
                        'system': f'{self.fhir_base_url}/fhir/terminology/CodeSystem/icd-11',
                        'code': claim.primary_diagnosis_code,
                        'display': claim.primary_diagnosis_description or claim.primary_diagnosis_code
                    }]
                }
            })

        # Secondary diagnoses
        for idx, code in enumerate(claim.secondary_diagnosis_codes or [], start=2):
            if isinstance(code, dict):
                diag_code = code.get('code', '')
                diag_desc = code.get('description', diag_code)
            else:
                diag_code = code
                diag_desc = code

            diagnoses.append({
                'sequence': idx,
                'diagnosisCodeableConcept': {
                    'coding': [{
                        'system': f'{self.fhir_base_url}/fhir/terminology/CodeSystem/icd-11',
                        'code': diag_code,
                        'display': diag_desc
                    }]
                }
            })

        return diagnoses

    def _build_item_list(self, claim: SHAClaim, cr_number: str) -> list[dict]:
        """
        Build FHIR item list from claim items.

        Each item includes:
        - SHA intervention code (productOrService)
        - Serviced period (not just date)
        - Category (procedure, drug, etc.)
        - Coverage extension reference

        Args:
            claim: SHAClaim to extract items from
            cr_number: SHA CR Number for coverage reference

        Returns:
            List of FHIR item dicts
        """
        items = []

        for idx, claim_item in enumerate(claim.items.all(), start=1):
            # Get service date or use claim service date
            service_date = claim_item.service_date or claim.service_date or date.today()

            # Get SHA intervention code from tariff
            sha_code = ''
            if claim_item.tariff:
                sha_code = claim_item.tariff.code

            # Determine category based on item type or tariff category
            category_code = 'procedure'  # Default
            if claim_item.tariff and hasattr(claim_item.tariff, 'category'):
                category_mapping = {
                    'drug': 'drug',
                    'medication': 'drug',
                    'pharmacy': 'drug',
                    'lab': 'procedure',
                    'laboratory': 'procedure',
                    'consultation': 'procedure',
                    'procedure': 'procedure',
                    'imaging': 'procedure',
                    'radiology': 'procedure',
                }
                category_code = category_mapping.get(
                    str(claim_item.tariff.category).lower(),
                    'procedure'
                )

            # Determine coverage reference based on item's coverage_type
            # SHA Integration Checklist item #13: extension to show which item belongs to which coverage
            coverage_type = getattr(claim_item, 'coverage_type', 'sha')

            # Build coverage extension based on coverage type
            if coverage_type == 'pfms':
                coverage_ref = f'{self.fhir_base_url}/fhir/Coverage/{cr_number}-pfms-coverage'
            elif coverage_type == 'both':
                # For items covered by both, reference SHA (primary), PFMS handles remainder
                coverage_ref = f'{self.fhir_base_url}/fhir/Coverage/{cr_number}-sha-coverage'
            else:
                # Default to SHA coverage
                coverage_ref = f'{self.fhir_base_url}/fhir/Coverage/{cr_number}-sha-coverage'

            item = {
                'sequence': idx,
                'productOrService': {
                    'coding': [{
                        'system': f'{self.fhir_base_url}/fhir/CodeSystem/intervention-codes',
                        'code': sha_code,
                        'display': sha_code or claim_item.description
                    }]
                },
                'servicedPeriod': {
                    'start': service_date.isoformat(),
                    'end': service_date.isoformat()
                },
                'quantity': {
                    'value': float(claim_item.quantity)
                },
                'unitPrice': {
                    'value': float(claim_item.unit_price),
                    'currency': 'KES'
                },
                'factor': 1,
                'net': {
                    'value': float(claim_item.claimed_amount),
                    'currency': 'KES'
                },
                'category': {
                    'coding': [{
                        'system': f'{self.fhir_base_url}/fhir/CodeSystem/category-codes',
                        'code': category_code,
                        'display': category_code.capitalize()
                    }]
                },
                'extension': [{
                    'url': f'{self.fhir_base_url}/fhir/sha-coverage/StructureDefinition/Coverage',
                    'valueReference': {
                        'reference': coverage_ref
                    }
                }]
            }

            items.append(item)

        return items

    def _build_patient_resource(self, patient, sha_member) -> dict:
        """
        Build FHIR Patient resource per SHA specification.

        IMPORTANT: SHA requires the patient ID to be the SHA CR Number,
        NOT the internal patient ID. The identifier must use the SHA
        identifier system.

        Args:
            patient: Patient model instance
            sha_member: SHAMember model instance (provides CR Number)

        Returns:
            FHIR Patient resource dict with SHA-compliant structure

        Reference: docs/sha-guides/claims.md - Patient Resource section
        """
        cr_number = sha_member.sha_number

        return {
            'resourceType': 'Patient',
            'id': cr_number,
            'meta': {
                'profile': [
                    f'{self.fhir_base_url}/fhir/StructureDefinition/sha-patient|1.0.0'
                ]
            },
            'identifier': [{
                'use': 'official',
                'system': f'{self.fhir_base_url}/fhir/identifier/shanumber',
                'value': cr_number
            }],
            'name': [{
                'use': 'official',
                'family': patient.last_name,
                'given': [patient.first_name]
            }],
            'gender': self._map_gender(patient.gender),
            'birthDate': self._format_date(patient.date_of_birth),
        }

    def _build_coverage_resource(self, sha_member, cr_number: str) -> dict:
        """
        Build FHIR Coverage resource for SHA membership.

        IMPORTANT: SHA requires specific scheme extensions:
        - schemeCategoryCode: CAT-SHA-001
        - schemeCategoryName: SOCIAL HEALTH AUTHORITY

        Args:
            sha_member: SHAMember model instance
            cr_number: SHA CR Number (e.g., CR0000000000001-1)

        Returns:
            FHIR Coverage resource dict with SHA-compliant structure

        Reference: docs/sha-guides/claims.md - Coverage Resource section
        """
        coverage_id = f'{cr_number}-sha-coverage'

        return {
            'resourceType': 'Coverage',
            'id': coverage_id,
            'meta': {
                'profile': [
                    f'{self.fhir_base_url}/fhir/StructureDefinition/sha-coverage|1.0.0'
                ]
            },
            'identifier': [{
                'use': 'official',
                'system': f'{self.fhir_base_url}/fhir/identifier/sha-coverage',
                'value': coverage_id
            }],
            'status': 'active' if sha_member.status == 'active' else 'cancelled',
            'type': {
                'coding': [{
                    'system': 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                    'code': 'PUBLICPOL',
                    'display': 'Social Health Authority'
                }]
            },
            # Per SHA spec: schemeCategoryCode and schemeCategoryName are flat extensions
            # Reference: docs/sha-guides/claims.md - Coverage Resource section
            'extension': [
                {
                    'url': f'{self.fhir_base_url}/fhir/StructureDefinition/schemeCategoryCode',
                    'valueString': 'CAT-SHA-001'
                },
                {
                    'url': f'{self.fhir_base_url}/fhir/StructureDefinition/schemeCategoryName',
                    'valueString': 'SOCIAL HEALTH AUTHORITY'
                }
            ],
            'subscriber': {
                'reference': f'{self.fhir_base_url}/fhir/Patient/{cr_number}',
                'type': 'Patient'
            },
            'beneficiary': {
                'reference': f'{self.fhir_base_url}/fhir/Patient/{cr_number}',
                'type': 'Patient'
            },
            'period': {
                'start': sha_member.coverage_start_date.isoformat() if sha_member.coverage_start_date else None,
                'end': sha_member.coverage_end_date.isoformat() if sha_member.coverage_end_date else None,
            },
            'payor': [{
                'type': 'Organization',
                'display': 'Social Health Authority (SHA)'
            }]
        }

    # PFMS scheme code mapping
    # Reference: SHA Integration Checklist item #13
    PFMS_SCHEME_CODES = {
        'vulnerable': 'CAT-PFMS-001',
        'elderly': 'CAT-PFMS-002',
        'disabled': 'CAT-PFMS-003',
        'orphan': 'CAT-PFMS-004',
        'indigent': 'CAT-PFMS-005',
    }

    PFMS_SCHEME_NAMES = {
        'vulnerable': 'PFMS VULNERABLE POPULATION',
        'elderly': 'PFMS ELDERLY (65+)',
        'disabled': 'PFMS PERSONS WITH DISABILITY',
        'orphan': 'PFMS ORPHANS AND VULNERABLE CHILDREN',
        'indigent': 'PFMS INDIGENT',
    }

    def get_pfms_scheme_code(self, category: str) -> str:
        """
        Get PFMS scheme category code for a given category.

        Args:
            category: PFMS category (vulnerable, elderly, disabled, orphan, indigent)

        Returns:
            PFMS scheme code (e.g., CAT-PFMS-001)
        """
        return self.PFMS_SCHEME_CODES.get(category.lower(), 'CAT-PFMS-001')

    def get_pfms_scheme_name(self, category: str) -> str:
        """
        Get PFMS scheme name for a given category.

        Args:
            category: PFMS category

        Returns:
            PFMS scheme display name
        """
        return self.PFMS_SCHEME_NAMES.get(category.lower(), 'PFMS VULNERABLE POPULATION')

    def _build_pfms_coverage_resource(
        self, sha_member, cr_number: str, pfms_category: str
    ) -> dict:
        """
        Build FHIR Coverage resource for PFMS (government subsidy) coverage.

        SHA Integration Checklist item #13:
        "If the patient is eligible for PFMS coverage then both SHA and PFMS
        coverage must be mentioned in insurance section."

        Args:
            sha_member: SHAMember model instance
            cr_number: SHA CR Number
            pfms_category: PFMS category (vulnerable, elderly, disabled, orphan, indigent)

        Returns:
            FHIR Coverage resource dict for PFMS
        """
        coverage_id = f'{cr_number}-pfms-coverage'
        scheme_code = self.get_pfms_scheme_code(pfms_category)
        scheme_name = self.get_pfms_scheme_name(pfms_category)

        return {
            'resourceType': 'Coverage',
            'id': coverage_id,
            'meta': {
                'profile': [
                    f'{self.fhir_base_url}/fhir/StructureDefinition/pfms-coverage|1.0.0'
                ]
            },
            'identifier': [{
                'use': 'official',
                'system': f'{self.fhir_base_url}/fhir/identifier/pfms-coverage',
                'value': coverage_id
            }],
            'status': 'active' if sha_member.status == 'active' else 'cancelled',
            'type': {
                'coding': [{
                    'system': 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                    'code': 'SUBSIDIZ',
                    'display': 'Public Finance Management System (PFMS)'
                }]
            },
            'extension': [
                {
                    'url': f'{self.fhir_base_url}/fhir/StructureDefinition/schemeCategoryCode',
                    'valueString': scheme_code
                },
                {
                    'url': f'{self.fhir_base_url}/fhir/StructureDefinition/schemeCategoryName',
                    'valueString': scheme_name
                }
            ],
            'subscriber': {
                'reference': f'{self.fhir_base_url}/fhir/Patient/{cr_number}',
                'type': 'Patient'
            },
            'beneficiary': {
                'reference': f'{self.fhir_base_url}/fhir/Patient/{cr_number}',
                'type': 'Patient'
            },
            'period': {
                'start': sha_member.coverage_start_date.isoformat() if sha_member.coverage_start_date else None,
                'end': sha_member.coverage_end_date.isoformat() if sha_member.coverage_end_date else None,
            },
            'payor': [{
                'type': 'Organization',
                'display': 'Government of Kenya - PFMS'
            }]
        }

    def _format_date(self, date_value) -> str | None:
        """
        Format a date value as ISO string.

        Handles both date objects and already-formatted strings.

        Args:
            date_value: Date object or string

        Returns:
            ISO formatted date string or None
        """
        if date_value is None:
            return None
        if isinstance(date_value, str):
            return date_value
        if hasattr(date_value, 'isoformat'):
            return date_value.isoformat()
        return str(date_value)

    def _map_gender(self, gender: str) -> str:
        """
        Map internal gender code to FHIR gender.

        Args:
            gender: Internal gender code (M/F/O)

        Returns:
            FHIR gender code
        """
        mapping = {
            'M': 'male',
            'F': 'female',
            'O': 'other',
        }
        return mapping.get(gender, 'unknown')

    def submit_claim(self, claim: SHAClaim, user, force_online: bool = False) -> dict:
        """
        Submit claim to SHA.

        Validates claim, packages it, submits to SHA API, and updates
        claim status with response. If offline, queues the claim for
        later submission.

        Args:
            claim: SHAClaim to submit
            user: User performing the submission
            force_online: If True, fail immediately if offline (don't queue)

        Returns:
            Submission response dict from SHA API or queue confirmation

        Raises:
            ValidationError: If claim is not valid for submission or API fails
        """
        # Validate first
        is_valid, errors = self.validate_claim(claim)
        if not is_valid:
            raise ValidationError({'errors': errors})

        # Check connectivity
        checker = ConnectivityChecker(server_url=self.api_base_url)
        is_online = checker.check()

        if not is_online and not force_online:
            # Queue for offline submission
            return self._queue_claim_for_submission(claim, user)

        if not is_online and force_online:
            raise ValidationError("Cannot submit claim: system is offline")

        # Package claim
        bundle = self.package_claim(claim)

        # Submit via API
        try:
            response = self._submit_to_sha_api(bundle, claim)

            # Update claim status
            claim.status = SHAClaim.ClaimStatus.SUBMITTED
            claim.submitted_at = timezone.now()
            claim.submitted_by = user
            claim.sha_claim_reference = response.get('claim_reference', '')
            claim.submission_response = response
            claim.save(update_fields=[
                'status', 'submitted_at', 'submitted_by',
                'sha_claim_reference', 'submission_response', 'updated_at'
            ])

            # Log audit
            AuditLog.log(
                action='sha_claim_submit',
                user=user,
                resource_type='SHAClaim',
                resource_id=claim.id,
                details={'sha_reference': claim.sha_claim_reference}
            )

            return response

        except requests.RequestException as e:
            # If submission fails due to network, queue for retry
            if self._is_network_error(e):
                logger.warning(f"Network error submitting claim {claim.claim_number}, queueing for retry")
                return self._queue_claim_for_submission(claim, user)

            claim.submission_response = {'error': str(e)}
            claim.save(update_fields=['submission_response', 'updated_at'])
            raise ValidationError(f"Submission failed: {str(e)}")

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
            'claim_id': claim.id,
            'claim_number': claim.claim_number,
            'fhir_bundle': bundle,
            'serialized_claim': serializer.data,
            'submitted_by_id': user.id,
            'queued_at': timezone.now().isoformat(),
        }

        # Create sync queue entry
        sync_manager = SyncManager()
        queue_entry = sync_manager.queue_change(
            operation='CREATE',
            model_name='SHAClaimSubmission',
            record_id=claim.id,
            data=claim_data,
        )

        # Update claim status to show it's queued
        claim.status = SHAClaim.ClaimStatus.PENDING_SUBMISSION
        claim.submission_response = {
            'queued': True,
            'queue_entry_id': queue_entry.id,
            'queued_at': timezone.now().isoformat(),
        }
        claim.save(update_fields=['status', 'submission_response', 'updated_at'])

        # Log audit
        AuditLog.log(
            action='sha_claim_queued',
            user=user,
            resource_type='SHAClaim',
            resource_id=claim.id,
            details={
                'queue_entry_id': queue_entry.id,
                'reason': 'offline_submission',
            }
        )

        logger.info(f"Claim {claim.claim_number} queued for offline submission (queue_id={queue_entry.id})")

        return {
            'status': 'queued',
            'message': 'Claim queued for submission when online',
            'queue_entry_id': queue_entry.id,
            'claim_number': claim.claim_number,
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
            model_name='SHAClaimSubmission',
            status='PENDING',
        ).order_by('created_at')

        results = {
            'processed': 0,
            'succeeded': 0,
            'failed': 0,
            'details': [],
        }

        for entry in pending_entries:
            entry.mark_syncing()

            try:
                claim_id = entry.data.get('claim_id')
                user_id = entry.data.get('submitted_by_id')

                claim = SHAClaim.objects.get(id=claim_id)
                user = User.objects.get(id=user_id)

                # Submit with force_online to prevent re-queueing
                response = self.submit_claim(claim, user, force_online=True)

                entry.mark_synced()
                results['succeeded'] += 1
                results['details'].append({
                    'claim_number': claim.claim_number,
                    'status': 'submitted',
                    'sha_reference': response.get('claim_reference', ''),
                })

            except Exception as e:
                entry.retry_count += 1
                entry.error_message = str(e)

                if entry.retry_count >= 3:
                    entry.status = 'FAILED'
                else:
                    entry.status = 'PENDING'

                entry.save()
                results['failed'] += 1
                results['details'].append({
                    'claim_id': entry.data.get('claim_id'),
                    'status': 'failed',
                    'error': str(e),
                    'retry_count': entry.retry_count,
                })

            results['processed'] += 1

        logger.info(
            f"Processed {results['processed']} queued claims: "
            f"{results['succeeded']} succeeded, {results['failed']} failed"
        )

        return results

    def _submit_to_sha_api(self, bundle: dict, claim: SHAClaim) -> dict:
        """
        Submit claim bundle to SHA API.

        Uses the official endpoint: POST /v1/shr-med/bundle

        Args:
            bundle: FHIR Bundle to submit
            claim: SHAClaim (for attachments)

        Returns:
            API response dict

        Raises:
            requests.RequestException: If API call fails
            SHAAuthError: If authentication fails
        """
        # Get auth headers
        headers = self.auth_service.get_auth_headers()
        headers['Content-Type'] = 'application/fhir+json'

        # Prepare multipart with attachments if any
        files = []
        for attachment in claim.attachments.all():
            files.append((
                'attachments',
                (attachment.original_filename, attachment.file, attachment.mime_type)
            ))

        # Submit to official endpoint: /v1/shr-med/bundle
        response = requests.post(
            f'{self.api_base_url}{self.claims_submit_endpoint}',
            json=bundle,
            files=files or None,
            headers=headers,
            timeout=60,
        )

        # Handle auth errors
        if response.status_code == 401:
            self.auth_service.clear_token_cache()
            raise SHAAuthError("Authentication failed during claim submission", status_code=401)

        response.raise_for_status()

        # Parse response - handle official wrapper format
        data = response.json()

        # Official format: {"IsSuccess": true, "Data": {...}}
        if 'Data' in data and data.get('IsSuccess'):
            return data['Data']

        return data

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
            f'{self.api_base_url}{self.claims_status_endpoint}',
            params={'claim_id': claim_id},
            headers=headers,
            timeout=30,
        )

        if response.status_code == 401:
            self.auth_service.clear_token_cache()
            raise SHAAuthError("Authentication failed during status check", status_code=401)

        response.raise_for_status()

        data = response.json()

        # Handle official wrapper format
        if 'Data' in data and data.get('IsSuccess'):
            return data['Data']

        return data
