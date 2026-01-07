"""
SHA Claims Service for Vitora HMIS.

This module handles SHA (Social Health Authority) claims creation,
validation, packaging (FHIR format), and submission.

Reference: docs/sprint-2.1-2.2-sha-claims-integration-deliverables.md
"""

from datetime import date
from decimal import Decimal
from typing import Any, Optional

import requests
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.billing.models import (
    SHAClaim,
    SHAClaimItem,
)
from hmis.apps.core.models import AuditLog


class SHAClaimsService:
    """
    Service for SHA claims management.
    
    Handles claim creation, validation, packaging, and submission.
    
    Attributes:
        api_base_url: Base URL for SHA API
        api_key: API key for authentication
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
        self.api_base_url = settings.SHA_API_BASE_URL
        self.api_key = settings.SHA_API_KEY
        self.facility_code = settings.FACILITY_MFL_CODE
        self.facility_level = settings.FACILITY_LEVEL
    
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
    
    def package_claim(self, claim: SHAClaim) -> dict:
        """
        Package claim for submission in SHA-required format.
        
        Creates a FHIR-compatible claim bundle containing:
        - Claim resource
        - Patient resource
        - Coverage resource
        
        Args:
            claim: SHAClaim to package
            
        Returns:
            FHIR-compatible claim bundle dict
        """
        bundle = {
            'resourceType': 'Bundle',
            'type': 'collection',
            'timestamp': timezone.now().isoformat(),
            'entry': []
        }
        
        # Add claim resource
        bundle['entry'].append({
            'resource': self._build_claim_resource(claim)
        })
        
        # Add patient resource
        bundle['entry'].append({
            'resource': self._build_patient_resource(claim.patient)
        })
        
        # Add coverage resource
        bundle['entry'].append({
            'resource': self._build_coverage_resource(claim.sha_member)
        })
        
        return bundle
    
    def _build_claim_resource(self, claim: SHAClaim) -> dict:
        """
        Build FHIR Claim resource.
        
        Args:
            claim: SHAClaim to build resource from
            
        Returns:
            FHIR Claim resource dict
        """
        return {
            'resourceType': 'Claim',
            'identifier': [{
                'system': 'urn:vitora:claim',
                'value': claim.claim_number
            }],
            'status': 'active',
            'type': {
                'coding': [{
                    'system': 'http://terminology.hl7.org/CodeSystem/claim-type',
                    'code': 'institutional' if claim.claim_type == 'inpatient' else 'professional'
                }]
            },
            'use': 'claim',
            'patient': {
                'reference': f'Patient/{claim.patient.id}'
            },
            'created': claim.created_at.isoformat(),
            'provider': {
                'identifier': {
                    'value': claim.facility_code
                }
            },
            'priority': {'coding': [{'code': 'normal'}]},
            'diagnosis': self._build_diagnosis_list(claim),
            'item': self._build_item_list(claim),
            'total': {
                'value': float(claim.claimed_amount),
                'currency': 'KES'
            }
        }
    
    def _build_diagnosis_list(self, claim: SHAClaim) -> list[dict]:
        """
        Build FHIR diagnosis list from claim.
        
        Args:
            claim: SHAClaim to extract diagnoses from
            
        Returns:
            List of FHIR diagnosis dicts
        """
        diagnoses = []
        
        # Primary diagnosis
        if claim.primary_diagnosis_code:
            diagnoses.append({
                'sequence': 1,
                'diagnosisCodeableConcept': {
                    'coding': [{
                        'system': 'http://hl7.org/fhir/sid/icd-10',
                        'code': claim.primary_diagnosis_code,
                        'display': claim.primary_diagnosis_description
                    }]
                },
                'type': [{'coding': [{'code': 'principal'}]}]
            })
        
        # Secondary diagnoses
        for idx, code in enumerate(claim.secondary_diagnosis_codes or [], start=2):
            if isinstance(code, dict):
                diag_code = code.get('code', '')
                diag_desc = code.get('description', '')
            else:
                diag_code = code
                diag_desc = ''
            
            diagnoses.append({
                'sequence': idx,
                'diagnosisCodeableConcept': {
                    'coding': [{
                        'system': 'http://hl7.org/fhir/sid/icd-10',
                        'code': diag_code,
                        'display': diag_desc
                    }]
                }
            })
        
        return diagnoses
    
    def _build_item_list(self, claim: SHAClaim) -> list[dict]:
        """
        Build FHIR item list from claim items.
        
        Args:
            claim: SHAClaim to extract items from
            
        Returns:
            List of FHIR item dicts
        """
        items = []
        
        for idx, claim_item in enumerate(claim.items.all(), start=1):
            item = {
                'sequence': idx,
                'productOrService': {
                    'coding': [{
                        'system': 'urn:vitora:service',
                        'code': claim_item.tariff.code if claim_item.tariff else '',
                        'display': claim_item.description
                    }]
                },
                'quantity': {
                    'value': float(claim_item.quantity)
                },
                'unitPrice': {
                    'value': float(claim_item.unit_price),
                    'currency': 'KES'
                },
                'net': {
                    'value': float(claim_item.claimed_amount),
                    'currency': 'KES'
                }
            }
            
            if claim_item.service_date:
                item['servicedDate'] = claim_item.service_date.isoformat()
            
            items.append(item)
        
        return items
    
    def _build_patient_resource(self, patient) -> dict:
        """
        Build FHIR Patient resource.
        
        Args:
            patient: Patient model instance
            
        Returns:
            FHIR Patient resource dict
        """
        return {
            'resourceType': 'Patient',
            'id': str(patient.id),
            'identifier': [{
                'system': 'urn:vitora:mrn',
                'value': patient.mrn
            }],
            'name': [{
                'use': 'official',
                'family': patient.last_name,
                'given': [patient.first_name]
            }],
            'gender': self._map_gender(patient.gender),
            'birthDate': self._format_date(patient.date_of_birth),
        }
    
    def _build_coverage_resource(self, sha_member) -> dict:
        """
        Build FHIR Coverage resource for SHA membership.
        
        Args:
            sha_member: SHAMember model instance
            
        Returns:
            FHIR Coverage resource dict
        """
        return {
            'resourceType': 'Coverage',
            'id': str(sha_member.id),
            'identifier': [{
                'system': 'urn:kenya:sha',
                'value': sha_member.sha_number
            }],
            'status': 'active' if sha_member.status == 'active' else 'cancelled',
            'type': {
                'coding': [{
                    'system': 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                    'code': 'PUBLICPOL',
                    'display': 'Social Health Authority'
                }]
            },
            'subscriber': {
                'reference': f'Patient/{sha_member.patient.id}'
            },
            'beneficiary': {
                'reference': f'Patient/{sha_member.patient.id}'
            },
            'period': {
                'start': sha_member.coverage_start_date.isoformat() if sha_member.coverage_start_date else None,
                'end': sha_member.coverage_end_date.isoformat() if sha_member.coverage_end_date else None,
            },
            'payor': [{
                'display': 'Social Health Authority (SHA)'
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
    
    def submit_claim(self, claim: SHAClaim, user) -> dict:
        """
        Submit claim to SHA.
        
        Validates claim, packages it, submits to SHA API, and updates
        claim status with response.
        
        Args:
            claim: SHAClaim to submit
            user: User performing the submission
            
        Returns:
            Submission response dict from SHA API
            
        Raises:
            ValidationError: If claim is not valid for submission or API fails
        """
        # Validate first
        is_valid, errors = self.validate_claim(claim)
        if not is_valid:
            raise ValidationError({'errors': errors})
        
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
            claim.submission_response = {'error': str(e)}
            claim.save(update_fields=['submission_response', 'updated_at'])
            raise ValidationError(f"Submission failed: {str(e)}")
    
    def _submit_to_sha_api(self, bundle: dict, claim: SHAClaim) -> dict:
        """
        Submit claim bundle to SHA API.
        
        Args:
            bundle: FHIR Bundle to submit
            claim: SHAClaim (for attachments)
            
        Returns:
            API response dict
            
        Raises:
            requests.RequestException: If API call fails
        """
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/fhir+json',
        }
        
        # Prepare multipart with attachments
        files = []
        for attachment in claim.attachments.all():
            files.append((
                'attachments',
                (attachment.original_filename, attachment.file, attachment.mime_type)
            ))
        
        response = requests.post(
            f'{self.api_base_url}/claims/submit',
            json=bundle,
            files=files or None,
            headers=headers,
            timeout=60,
        )
        response.raise_for_status()
        return response.json()
