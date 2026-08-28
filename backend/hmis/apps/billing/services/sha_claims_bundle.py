# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Billing sha claims bundle for Vitora HMIS.

What this file is for:
- Implement sha claims bundle logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.billing.services.sha_claims_shared import *  # noqa: F403


class SHAClaimsBundleMixin:
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
            return "PUID-UNKNOWN-1"

        # Try to get StaffProfile
        staff_profile = getattr(user, "staff_profile", None)

        if staff_profile:
            # Use license number if available
            if staff_profile.license_number:
                return f"PUID-{staff_profile.license_number}"
            # Fallback to employee_id
            if staff_profile.employee_id:
                return f"PUID-{staff_profile.employee_id}"

        # Final fallback: user PK
        return f"PUID-USR-{user.pk}"

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
                "resourceType": "Practitioner",
                "id": practitioner_id,
                "meta": {
                    "profile": [f"{self.fhir_base_url}/fhir/StructureDefinition/practitioner|1.0.0"]
                },
                "name": [{"text": "Unknown Practitioner"}],
                "active": True,
            }

        # Build name
        full_name = user.get_full_name() or user.username
        staff_profile = getattr(user, "staff_profile", None)
        if staff_profile and staff_profile.title:
            full_name = f"{staff_profile.title} {full_name}"

        # Build identifiers
        identifiers = [
            {
                "use": "official",
                "system": f"{self.fhir_base_url}/fhir/Practitioner/PractitionerRegistryID",
                "value": practitioner_id,
            }
        ]

        if staff_profile:
            if staff_profile.license_number:
                identifiers.append(
                    {
                        "use": "official",
                        "system": f"{self.fhir_base_url}/fhir/Practitioner/PractitionerRegistrationNumber",
                        "value": staff_profile.license_number,
                    }
                )

        # Build qualifications from staff profile
        qualifications = []
        if staff_profile and staff_profile.specialization:
            qualifications.append({"code": {"text": staff_profile.specialization}})

        resource = {
            "resourceType": "Practitioner",
            "id": practitioner_id,
            "meta": {
                "profile": [f"{self.fhir_base_url}/fhir/StructureDefinition/practitioner|1.0.0"]
            },
            "name": [{"text": full_name}],
            "identifier": identifiers,
            "active": True,
        }

        if qualifications:
            resource["qualification"] = qualifications

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

        # Get SHA member number (used as patient identifier in legacy FHIR bundle).
        # NOTE: For ILM endpoints, the correct patient identifier is
        # Patient.cr_number (the Client Registry number from eligibility),
        # not sha_number.  This legacy builder uses sha_number for backward
        # compatibility with the older SHR bundle flow.
        cr_number = claim.sha_member.sha_number

        # Get practitioner from encounter
        practitioner_user = None
        if claim.encounter:
            practitioner_user = claim.encounter.finalized_by
        practitioner_id = self._get_practitioner_id(practitioner_user)

        # Check for PFMS eligibility (checklist item #13)
        is_pfms_eligible = getattr(claim.sha_member, "is_pfms_eligible", False)

        # Optional clinic/service delivery point context
        clinic = None
        if claim.encounter is not None:
            clinic_visit = getattr(claim.encounter, "clinic_visit", None)
            if clinic_visit is not None:
                clinic_session = getattr(clinic_visit, "session", None)
                if clinic_session is not None:
                    clinic = getattr(clinic_session, "clinic", None)

        # Build base entries
        entries = [
            # Order per SHA spec: Practitioner, Organization, Coverage, Patient, Claim
            {
                "fullUrl": f"{self.fhir_base_url}/fhir/Practitioner/{practitioner_id}",
                "resource": self._build_practitioner_resource(practitioner_user, practitioner_id),
            },
            {
                "fullUrl": f"{self.fhir_base_url}/fhir/Organization/{self.facility_code}",
                "resource": self._build_organization_resource(),
            },
            # Include a Location resource for clinic/service delivery point when available
            # (keeps any facility reference resolvable within the bundle)
            *(
                [
                    {
                        "fullUrl": f"{self.fhir_base_url}/fhir/Location/{clinic.code}",
                        "resource": {
                            "resourceType": "Location",
                            "id": clinic.code,
                            "name": clinic.name,
                            "status": "active",
                        },
                    }
                ]
                if clinic is not None and getattr(clinic, "code", "")
                else []
            ),
            {
                "fullUrl": f"{self.fhir_base_url}/fhir/Coverage/{cr_number}-sha-coverage",
                "resource": self._build_coverage_resource(claim.sha_member, cr_number),
            },
        ]

        # Add PFMS coverage if eligible (SHA Integration Checklist item #13)
        if is_pfms_eligible:
            pfms_category = getattr(claim.sha_member, "pfms_category", "vulnerable")
            entries.append(
                {
                    "fullUrl": f"{self.fhir_base_url}/fhir/Coverage/{cr_number}-pfms-coverage",
                    "resource": self._build_pfms_coverage_resource(
                        claim.sha_member, cr_number, pfms_category
                    ),
                }
            )

        # Add patient and claim resources
        entries.append(
            {
                "fullUrl": f"{self.fhir_base_url}/fhir/Patient/{cr_number}",
                "resource": self._build_patient_resource(claim.patient, claim.sha_member),
            }
        )

        # Include Encounter context when available (helps traceability & clinic reporting)
        if claim.encounter is not None:
            encounter_resource: dict = {
                "resourceType": "Encounter",
                "id": str(getattr(claim.encounter, "id", "")) or str(uuid.uuid4()),
                "status": "finished",
                "subject": {"reference": f"{self.fhir_base_url}/fhir/Patient/{cr_number}"},
                "serviceProvider": {
                    "reference": f"{self.fhir_base_url}/fhir/Organization/{self.facility_code}"
                },
            }

            if clinic is not None and getattr(clinic, "code", ""):
                encounter_resource.setdefault("extension", []).extend(
                    [
                        {
                            "url": "https://vitora.health/fhir/StructureDefinition/clinic-code",
                            "valueString": clinic.code,
                        },
                        {
                            "url": "https://vitora.health/fhir/StructureDefinition/clinic-type",
                            "valueString": clinic.clinic_type,
                        },
                        {
                            "url": "https://vitora.health/fhir/StructureDefinition/service-delivery-point",
                            "valueReference": {
                                "reference": f"{self.fhir_base_url}/fhir/Location/{clinic.code}",
                                "display": clinic.name,
                            },
                        },
                    ]
                )

            entries.append(
                {
                    "fullUrl": f"{self.fhir_base_url}/fhir/Encounter/{encounter_resource['id']}",
                    "resource": encounter_resource,
                }
            )

        entries.append(
            {
                "fullUrl": f"{self.fhir_base_url}/fhir/Claim/{bundle_guid}",
                "resource": self._build_claim_resource(
                    claim,
                    bundle_guid,
                    cr_number,
                    practitioner_id,
                    practitioner_user,
                    is_pfms_eligible=is_pfms_eligible,
                ),
            }
        )

        bundle = {
            "id": bundle_guid,
            "meta": {"profile": [f"{self.fhir_base_url}/fhir/StructureDefinition/bundle|1.0.0"]},
            "timestamp": timezone.now().isoformat(),
            "type": "message",
            "entry": entries,
            "resourceType": "Bundle",
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
            "id": self.facility_code,
            "meta": {
                "profile": [
                    f"{self.fhir_base_url}/fhir/StructureDefinition/provider-organization|1.0.0"
                ]
            },
            "name": self.facility_name,
            "active": "True",
            "extension": [
                {
                    "url": f"{self.fhir_base_url}/fhir/StructureDefinition/facility-level",
                    "valueCodeableConcept": {
                        "coding": [
                            {
                                "system": f"{self.fhir_base_url}/fhir/StructureDefinition/facility-level",
                                "code": self.facility_level.upper(),
                                "display": self.facility_level.upper(),
                            }
                        ]
                    },
                }
            ],
            "identifier": [
                {
                    "use": "official",
                    "type": {
                        "coding": [
                            {
                                "display": "Code",
                                "system": f"{self.fhir_base_url}/fhir/terminology/CodeSystem/facility-identifier-types",
                                "code": "fr-code",
                            }
                        ]
                    },
                    "value": self.facility_code,
                }
            ],
            "type": [
                {
                    "coding": [
                        {
                            "system": "https://ts.kenya-hie.health/fhir/terminology/CodeSystem/organization-type",
                            "code": "prov",
                        }
                    ]
                }
            ],
            "resourceType": "Organization",
        }

    def _get_active_consent(self, claim: SHAClaim):
        """Return the most recent validated, non-expired consent token for this claim's member."""
        from hmis.apps.billing.models import ConsentToken

        if not claim.sha_member_id:
            return None
        return (
            ConsentToken.objects.filter(
                sha_member_id=claim.sha_member_id,
                status=ConsentToken.ConsentStatus.VALIDATED,
            )
            .order_by("-validated_at")
            .first()
        )

    def _get_approved_preauth(self, claim: SHAClaim):
        """Return the most recent approved, non-expired preauth for this claim."""
        from hmis.apps.billing.models import PreauthRequest

        return (
            claim.preauth_requests.filter(
                decision=PreauthRequest.PreauthDecision.APPROVED,
            )
            .order_by("-created_at")
            .first()
        )
