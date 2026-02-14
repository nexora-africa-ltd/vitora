"""
SMART on FHIR OAuth2 Scopes.

Defines the SMART on FHIR scopes supported by Vitora HMIS.
Reference: http://hl7.org/fhir/smart-app-launch/scopes-and-launch-context.html
"""

from oauth2_provider.scopes import BaseScopes


class SMARTScopes(BaseScopes):
    """
    SMART on FHIR scope backend for django-oauth-toolkit.

    Implements the SMART App Launch scope syntax:
    - Clinical scopes: patient/*.read, patient/*.write, user/*.read, etc.
    - OIDC scopes: openid, profile, fhirUser
    - Launch scopes: launch, launch/patient, launch/encounter
    """

    # OIDC scopes
    OIDC_SCOPES = {
        "openid": "OpenID Connect authentication",
        "profile": "Access to user profile information",
        "fhirUser": "Access to the FHIR User resource",
        "offline_access": "Request refresh tokens for offline access",
    }

    # Launch context scopes
    LAUNCH_SCOPES = {
        "launch": "Receive launch context from EHR",
        "launch/patient": "Request patient context at launch",
        "launch/encounter": "Request encounter context at launch",
    }

    # Patient-level clinical scopes (SMART v2 format)
    # patient/<resource>.<read|write|*>
    PATIENT_RESOURCE_SCOPES = {
        "patient/Patient.read": "Read patient demographics",
        "patient/Patient.write": "Write patient demographics",
        "patient/Patient.*": "Full access to patient demographics",
        "patient/Observation.read": "Read patient observations (vitals, labs)",
        "patient/Observation.write": "Write patient observations",
        "patient/Observation.*": "Full access to patient observations",
        "patient/Condition.read": "Read patient conditions/diagnoses",
        "patient/Condition.write": "Write patient conditions/diagnoses",
        "patient/Condition.*": "Full access to patient conditions",
        "patient/MedicationRequest.read": "Read patient prescriptions",
        "patient/MedicationRequest.write": "Write patient prescriptions",
        "patient/MedicationRequest.*": "Full access to patient prescriptions",
        "patient/MedicationDispense.read": "Read patient dispensing records",
        "patient/MedicationDispense.write": "Write patient dispensing records",
        "patient/MedicationDispense.*": "Full access to patient dispensing",
        "patient/Encounter.read": "Read patient encounters",
        "patient/Encounter.write": "Write patient encounters",
        "patient/Encounter.*": "Full access to patient encounters",
        "patient/AllergyIntolerance.read": "Read patient allergies",
        "patient/AllergyIntolerance.write": "Write patient allergies",
        "patient/AllergyIntolerance.*": "Full access to patient allergies",
        "patient/Procedure.read": "Read patient procedures",
        "patient/Procedure.write": "Write patient procedures",
        "patient/Procedure.*": "Full access to patient procedures",
        "patient/DiagnosticReport.read": "Read diagnostic reports",
        "patient/DiagnosticReport.write": "Write diagnostic reports",
        "patient/DiagnosticReport.*": "Full access to diagnostic reports",
        "patient/ServiceRequest.read": "Read service requests (lab orders)",
        "patient/ServiceRequest.write": "Write service requests",
        "patient/ServiceRequest.*": "Full access to service requests",
        "patient/Coverage.read": "Read insurance coverage",
        "patient/Coverage.write": "Write insurance coverage",
        "patient/Coverage.*": "Full access to insurance coverage",
        "patient/Claim.read": "Read insurance claims",
        "patient/Claim.write": "Write insurance claims",
        "patient/Claim.*": "Full access to insurance claims",
        # Wildcard scopes
        "patient/*.read": "Read all patient data",
        "patient/*.write": "Write all patient data",
        "patient/*.*": "Full access to all patient data",
    }

    # User-level clinical scopes (provider-centric access)
    USER_RESOURCE_SCOPES = {
        "user/Patient.read": "Read any patient demographics",
        "user/Patient.write": "Write any patient demographics",
        "user/Patient.*": "Full access to any patient demographics",
        "user/Practitioner.read": "Read practitioner information",
        "user/Practitioner.write": "Write practitioner information",
        "user/Practitioner.*": "Full access to practitioner data",
        "user/Organization.read": "Read organization information",
        "user/Organization.write": "Write organization information",
        "user/Organization.*": "Full access to organization data",
        "user/Location.read": "Read location information",
        "user/Location.write": "Write location information",
        "user/Location.*": "Full access to location data",
        # Wildcard scopes
        "user/*.read": "Read all accessible data",
        "user/*.write": "Write all accessible data",
        "user/*.*": "Full access to all accessible data",
    }

    # System-level scopes (backend services)
    SYSTEM_SCOPES = {
        "system/Patient.read": "System read access to all patients",
        "system/Patient.write": "System write access to all patients",
        "system/*.read": "System read access to all resources",
        "system/*.write": "System write access to all resources",
        "system/*.*": "Full system access",
    }

    @classmethod
    def get_all_scopes(cls) -> dict[str, str]:
        """Return all supported SMART on FHIR scopes."""
        all_scopes = {}
        all_scopes.update(cls.OIDC_SCOPES)
        all_scopes.update(cls.LAUNCH_SCOPES)
        all_scopes.update(cls.PATIENT_RESOURCE_SCOPES)
        all_scopes.update(cls.USER_RESOURCE_SCOPES)
        all_scopes.update(cls.SYSTEM_SCOPES)
        return all_scopes

    def get_available_scopes(self, application=None, request=None, *args, **kwargs) -> list[str]:
        """Return list of available scope names."""
        return list(self.get_all_scopes().keys())

    def get_default_scopes(self, application=None, request=None, *args, **kwargs) -> list[str]:
        """Return default scopes for authorization requests without explicit scope."""
        return ["openid", "profile"]

    def is_valid_scope(self, scope: str) -> bool:
        """
        Check if a scope is valid.

        Supports both specific scopes and SMART v2 wildcard syntax.
        """
        all_scopes = self.get_all_scopes()

        # Direct match
        if scope in all_scopes:
            return True

        # Check for wildcard matches
        # e.g., patient/Immunization.read matches patient/*.read pattern
        parts = scope.split("/")
        if len(parts) == 2:
            context, resource_action = parts
            if context in ("patient", "user", "system"):
                resource_parts = resource_action.split(".")
                if len(resource_parts) == 2:
                    resource, action = resource_parts
                    if action in ("read", "write", "*"):
                        # Accept any FHIR resource type
                        return True

        return False

    def get_scope_descriptions(self, scopes: list[str]) -> dict[str, str]:
        """Return descriptions for the given scopes."""
        all_scopes = self.get_all_scopes()
        return {scope: all_scopes.get(scope, scope) for scope in scopes}


# Scope categories for UI display
SCOPE_CATEGORIES = {
    "identity": {
        "label": "Identity",
        "description": "Access to your identity information",
        "scopes": ["openid", "profile", "fhirUser"],
    },
    "launch": {
        "label": "Launch Context",
        "description": "Receive context from the EHR system",
        "scopes": ["launch", "launch/patient", "launch/encounter"],
    },
    "patient_read": {
        "label": "Read Patient Data",
        "description": "Read access to patient information",
        "scopes": [
            "patient/Patient.read",
            "patient/Observation.read",
            "patient/Condition.read",
            "patient/MedicationRequest.read",
            "patient/Encounter.read",
            "patient/*.read",
        ],
    },
    "patient_write": {
        "label": "Write Patient Data",
        "description": "Write access to patient information",
        "scopes": [
            "patient/Patient.write",
            "patient/Observation.write",
            "patient/Condition.write",
            "patient/MedicationRequest.write",
            "patient/Encounter.write",
            "patient/*.write",
        ],
    },
}
