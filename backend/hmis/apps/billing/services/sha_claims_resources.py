# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: split SHA claims service mixin methods.
How to use: mixed into SHAClaimsService in split SHA claims core module.
Supported inputs/args: instance methods for SHA claim lifecycle operations.
"""

from hmis.apps.billing.services.sha_claims_shared import *  # noqa: F403


class SHAClaimsResourcesMixin:
    def _build_claim_resource(
        self,
        claim: SHAClaim,
        bundle_guid: str,
        cr_number: str,
        practitioner_id: str | None = None,
        practitioner_user=None,
        is_pfms_eligible: bool = False,
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
        sub_type = "ip" if claim.claim_type == "inpatient" else "op"

        # Build billable period from service date
        service_date = claim.service_date or date.today()
        end_date = claim.discharge_date or service_date

        # Get practitioner display name
        practitioner_display = "Unknown Practitioner"
        if practitioner_user:
            practitioner_display = practitioner_user.get_full_name() or practitioner_user.username
            staff_profile = getattr(practitioner_user, "staff_profile", None)
            if staff_profile and staff_profile.title:
                practitioner_display = f"{staff_profile.title} {practitioner_display}"

        # Build insurance array (SHA Integration Checklist item #13)
        insurance_entries = [
            {
                "sequence": 1,
                "focal": "True",
                "coverage": {
                    "reference": f"{self.fhir_base_url}/fhir/Coverage/{cr_number}-sha-coverage"
                },
            }
        ]

        # Add PFMS coverage if eligible
        if is_pfms_eligible:
            insurance_entries.append(
                {
                    "sequence": 2,
                    "focal": "False",
                    "coverage": {
                        "reference": f"{self.fhir_base_url}/fhir/Coverage/{cr_number}-pfms-coverage"
                    },
                }
            )

        claim_resource = {
            "id": bundle_guid,
            "identifier": [{"system": f"{self.fhir_base_url}/fhir/claim", "value": bundle_guid}],
            "status": "active",
            "type": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/claim-type",
                        "code": "institutional",
                    }
                ]
            },
            "subType": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/ex-claimsubtype",
                        "code": sub_type,
                    }
                ]
            },
            "use": "claim",
            "patient": {
                "reference": f"{self.fhir_base_url}/fhir/Patient/{cr_number}",
                "identifier": {
                    "value": cr_number,
                    "use": "official",
                    "system": f"{self.fhir_base_url}/fhir/identifier/shanumber",
                },
                "type": "Patient",
            },
            "billablePeriod": {
                "start": f"{service_date.isoformat()}T00:00:00",
                "end": f"{end_date.isoformat()}T23:59:59",
            },
            "insurance": insurance_entries,
            "created": claim.created_at.isoformat(),
            "provider": {
                # Reference MUST match the Organization fullUrl in the bundle
                # Per SHA Integration Checklist #11: "All references mentioned in the bundle
                # must point to a resource in bundle with matching fullUrl value"
                "reference": f"{self.fhir_base_url}/fhir/Organization/{self.facility_code}",
            },
            # CareTeam per SHA Integration Checklist #10
            # Reference: docs/sha-guides/claims-submission.md
            "careTeam": [
                {
                    "sequence": 1,
                    "provider": {
                        "reference": f"{self.fhir_base_url}/fhir/Practitioner/{practitioner_id}",
                        "type": "Practitioner",
                        "display": practitioner_display,
                    },
                }
            ],
            "priority": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/processpriority",
                        "code": "normal",
                    }
                ]
            },
            "diagnosis": self._build_diagnosis_list(claim),
            "item": self._build_item_list(claim, cr_number),
            "total": {"value": float(claim.claimed_amount), "currency": "KES"},
            "resourceType": "Claim",
        }

        # ---------------------------------------------------------------------
        # Clinic/service delivery point context (Priority 4.2)
        # ---------------------------------------------------------------------
        clinic = None
        if claim.encounter is not None:
            clinic_visit = getattr(claim.encounter, "clinic_visit", None)
            if clinic_visit is not None:
                clinic_session = getattr(clinic_visit, "session", None)
                if clinic_session is not None:
                    clinic = getattr(clinic_session, "clinic", None)

        if clinic is not None and getattr(clinic, "code", ""):
            claim_resource["facility"] = {
                "reference": f"{self.fhir_base_url}/fhir/Location/{clinic.code}",
                "display": clinic.name,
            }

            claim_resource.setdefault("identifier", []).append(
                {
                    "system": f"{self.fhir_base_url}/fhir/identifier/clinic-code",
                    "value": clinic.code,
                }
            )

            claim_resource.setdefault("extension", []).append(
                {
                    "url": "https://vitora.health/fhir/StructureDefinition/clinic-code",
                    "valueString": clinic.code,
                }
            )

            claim_resource.setdefault("extension", []).append(
                {
                    "url": "https://vitora.health/fhir/StructureDefinition/clinic-type",
                    "valueString": clinic.clinic_type,
                }
            )

            claim_resource.setdefault("extension", []).append(
                {
                    "url": "https://vitora.health/fhir/StructureDefinition/service-delivery-point",
                    "valueReference": {
                        "reference": f"{self.fhir_base_url}/fhir/Location/{clinic.code}",
                        "display": clinic.name,
                    },
                }
            )

        # ---------------------------------------------------------------------
        # DHA HIE consent token & pre-authorization references
        # ---------------------------------------------------------------------
        # Attach validated consent token (required for SHIF/PHC flows)
        consent_token = self._get_active_consent(claim)
        if consent_token:
            claim_resource.setdefault("extension", []).append(
                {
                    "url": "https://vitora.health/fhir/StructureDefinition/consent-token",
                    "valueString": consent_token.consent_token or "",
                }
            )

        # Attach pre-authorization reference (required for SHIF restricted services)
        preauth = self._get_approved_preauth(claim)
        if preauth and preauth.preauth_reference:
            claim_resource.setdefault("extension", []).append(
                {
                    "url": "https://vitora.health/fhir/StructureDefinition/preauth-reference",
                    "valueString": preauth.preauth_reference,
                }
            )
            # Also set the formal preAuth reference per FHIR Claim spec
            claim_resource["preAuthRef"] = [preauth.preauth_reference]

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
            diagnoses.append(
                {
                    "sequence": 1,
                    "diagnosisCodeableConcept": {
                        "coding": [
                            {
                                "system": f"{self.fhir_base_url}/fhir/terminology/CodeSystem/icd-11",
                                "code": claim.primary_diagnosis_code,
                                "display": claim.primary_diagnosis_description
                                or claim.primary_diagnosis_code,
                            }
                        ]
                    },
                }
            )

        # Secondary diagnoses
        for idx, code in enumerate(claim.secondary_diagnosis_codes or [], start=2):
            if isinstance(code, dict):
                diag_code = code.get("code", "")
                diag_desc = code.get("description", diag_code)
            else:
                diag_code = code
                diag_desc = code

            diagnoses.append(
                {
                    "sequence": idx,
                    "diagnosisCodeableConcept": {
                        "coding": [
                            {
                                "system": f"{self.fhir_base_url}/fhir/terminology/CodeSystem/icd-11",
                                "code": diag_code,
                                "display": diag_desc,
                            }
                        ]
                    },
                }
            )

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
            sha_code = ""
            if claim_item.tariff:
                sha_code = claim_item.tariff.code

            # Determine category based on item type or tariff category
            category_code = "procedure"  # Default
            if claim_item.tariff and hasattr(claim_item.tariff, "category"):
                category_mapping = {
                    "drug": "drug",
                    "medication": "drug",
                    "pharmacy": "drug",
                    "lab": "procedure",
                    "laboratory": "procedure",
                    "consultation": "procedure",
                    "procedure": "procedure",
                    "imaging": "procedure",
                    "radiology": "procedure",
                }
                category_code = category_mapping.get(
                    str(claim_item.tariff.category).lower(), "procedure"
                )

            # Determine coverage reference based on item's coverage_type
            # SHA Integration Checklist item #13: extension to show which item belongs to which coverage
            coverage_type = getattr(claim_item, "coverage_type", "sha")

            # Build coverage extension based on coverage type
            if coverage_type == "pfms":
                coverage_ref = f"{self.fhir_base_url}/fhir/Coverage/{cr_number}-pfms-coverage"
            elif coverage_type == "both":
                # For items covered by both, reference SHA (primary), PFMS handles remainder
                coverage_ref = f"{self.fhir_base_url}/fhir/Coverage/{cr_number}-sha-coverage"
            else:
                # Default to SHA coverage
                coverage_ref = f"{self.fhir_base_url}/fhir/Coverage/{cr_number}-sha-coverage"

            item = {
                "sequence": idx,
                "productOrService": {
                    "coding": [
                        {
                            "system": f"{self.fhir_base_url}/fhir/CodeSystem/intervention-codes",
                            "code": sha_code,
                            "display": sha_code or claim_item.description,
                        }
                    ]
                },
                "servicedPeriod": {
                    "start": service_date.isoformat(),
                    "end": service_date.isoformat(),
                },
                "quantity": {"value": float(claim_item.quantity)},
                "unitPrice": {"value": float(claim_item.unit_price), "currency": "KES"},
                "factor": 1,
                "net": {"value": float(claim_item.claimed_amount), "currency": "KES"},
                "category": {
                    "coding": [
                        {
                            "system": f"{self.fhir_base_url}/fhir/CodeSystem/category-codes",
                            "code": category_code,
                            "display": category_code.capitalize(),
                        }
                    ]
                },
                "extension": [
                    {
                        "url": f"{self.fhir_base_url}/fhir/sha-coverage/StructureDefinition/Coverage",
                        "valueReference": {"reference": coverage_ref},
                    }
                ],
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
            "resourceType": "Patient",
            "id": cr_number,
            "meta": {
                "profile": [f"{self.fhir_base_url}/fhir/StructureDefinition/sha-patient|1.0.0"]
            },
            "identifier": [
                {
                    "use": "official",
                    "system": f"{self.fhir_base_url}/fhir/identifier/shanumber",
                    "value": cr_number,
                }
            ],
            "name": [
                {"use": "official", "family": patient.last_name, "given": [patient.first_name]}
            ],
            "gender": self._map_gender(patient.gender),
            "birthDate": self._format_date(patient.date_of_birth),
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
        coverage_id = f"{cr_number}-sha-coverage"

        return {
            "resourceType": "Coverage",
            "id": coverage_id,
            "meta": {
                "profile": [f"{self.fhir_base_url}/fhir/StructureDefinition/sha-coverage|1.0.0"]
            },
            "identifier": [
                {
                    "use": "official",
                    "system": f"{self.fhir_base_url}/fhir/identifier/sha-coverage",
                    "value": coverage_id,
                }
            ],
            "status": "active" if sha_member.status == "active" else "cancelled",
            "type": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                        "code": "PUBLICPOL",
                        "display": "Social Health Authority",
                    }
                ]
            },
            # Per SHA spec: schemeCategoryCode and schemeCategoryName are flat extensions
            # Reference: docs/sha-guides/claims.md - Coverage Resource section
            "extension": [
                {
                    "url": f"{self.fhir_base_url}/fhir/StructureDefinition/schemeCategoryCode",
                    "valueString": "CAT-SHA-001",
                },
                {
                    "url": f"{self.fhir_base_url}/fhir/StructureDefinition/schemeCategoryName",
                    "valueString": "SOCIAL HEALTH AUTHORITY",
                },
            ],
            "subscriber": {
                "reference": f"{self.fhir_base_url}/fhir/Patient/{cr_number}",
                "type": "Patient",
            },
            "beneficiary": {
                "reference": f"{self.fhir_base_url}/fhir/Patient/{cr_number}",
                "type": "Patient",
            },
            "period": {
                "start": (
                    sha_member.coverage_start_date.isoformat()
                    if sha_member.coverage_start_date
                    else None
                ),
                "end": (
                    sha_member.coverage_end_date.isoformat()
                    if sha_member.coverage_end_date
                    else None
                ),
            },
            "payor": [{"type": "Organization", "display": "Social Health Authority (SHA)"}],
        }

    # PFMS scheme code mapping
    # Reference: SHA Integration Checklist item #13
    PFMS_SCHEME_CODES = {
        "vulnerable": "CAT-PFMS-001",
        "elderly": "CAT-PFMS-002",
        "disabled": "CAT-PFMS-003",
        "orphan": "CAT-PFMS-004",
        "indigent": "CAT-PFMS-005",
    }

    PFMS_SCHEME_NAMES = {
        "vulnerable": "PFMS VULNERABLE POPULATION",
        "elderly": "PFMS ELDERLY (65+)",
        "disabled": "PFMS PERSONS WITH DISABILITY",
        "orphan": "PFMS ORPHANS AND VULNERABLE CHILDREN",
        "indigent": "PFMS INDIGENT",
    }

    def get_pfms_scheme_code(self, category: str) -> str:
        """
        Get PFMS scheme category code for a given category.

        Args:
            category: PFMS category (vulnerable, elderly, disabled, orphan, indigent)

        Returns:
            PFMS scheme code (e.g., CAT-PFMS-001)
        """
        return self.PFMS_SCHEME_CODES.get(category.lower(), "CAT-PFMS-001")

    def get_pfms_scheme_name(self, category: str) -> str:
        """
        Get PFMS scheme name for a given category.

        Args:
            category: PFMS category

        Returns:
            PFMS scheme display name
        """
        return self.PFMS_SCHEME_NAMES.get(category.lower(), "PFMS VULNERABLE POPULATION")

    def _build_pfms_coverage_resource(self, sha_member, cr_number: str, pfms_category: str) -> dict:
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
        coverage_id = f"{cr_number}-pfms-coverage"
        scheme_code = self.get_pfms_scheme_code(pfms_category)
        scheme_name = self.get_pfms_scheme_name(pfms_category)

        return {
            "resourceType": "Coverage",
            "id": coverage_id,
            "meta": {
                "profile": [f"{self.fhir_base_url}/fhir/StructureDefinition/pfms-coverage|1.0.0"]
            },
            "identifier": [
                {
                    "use": "official",
                    "system": f"{self.fhir_base_url}/fhir/identifier/pfms-coverage",
                    "value": coverage_id,
                }
            ],
            "status": "active" if sha_member.status == "active" else "cancelled",
            "type": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                        "code": "SUBSIDIZ",
                        "display": "Public Finance Management System (PFMS)",
                    }
                ]
            },
            "extension": [
                {
                    "url": f"{self.fhir_base_url}/fhir/StructureDefinition/schemeCategoryCode",
                    "valueString": scheme_code,
                },
                {
                    "url": f"{self.fhir_base_url}/fhir/StructureDefinition/schemeCategoryName",
                    "valueString": scheme_name,
                },
            ],
            "subscriber": {
                "reference": f"{self.fhir_base_url}/fhir/Patient/{cr_number}",
                "type": "Patient",
            },
            "beneficiary": {
                "reference": f"{self.fhir_base_url}/fhir/Patient/{cr_number}",
                "type": "Patient",
            },
            "period": {
                "start": (
                    sha_member.coverage_start_date.isoformat()
                    if sha_member.coverage_start_date
                    else None
                ),
                "end": (
                    sha_member.coverage_end_date.isoformat()
                    if sha_member.coverage_end_date
                    else None
                ),
            },
            "payor": [{"type": "Organization", "display": "Government of Kenya - PFMS"}],
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
        if hasattr(date_value, "isoformat"):
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
            "M": "male",
            "F": "female",
            "O": "other",
        }
        return mapping.get(gender, "unknown")
