"""
FHIR R4 Resource URL configuration.

Implements the FHIR R4 RESTful API endpoints for IPS testing.

Endpoints:
    /fhir/Patient/{id}              - Read patient resource
    /fhir/Patient/{id}/$summary     - Generate IPS Bundle
    /fhir/Practitioner/{id}         - Read practitioner resource
    /fhir/Organization/{id}         - Read organization resource
    /fhir/Observation/{id}          - Read observation resource
    /fhir/Condition/{id}            - Read condition resource
    /fhir/Composition/{id}          - Read composition resource
    /fhir/AllergyIntolerance/{id}   - Read allergy resource
    /fhir/MedicationStatement/{id}  - Read medication statement
    /fhir/Device/{id}               - Read device resource
"""

from django.urls import path

from hmis.apps.core.fhir.views import (
    FHIRAllergyIntoleranceView,
    FHIRCompositionView,
    FHIRConditionView,
    FHIRDeviceView,
    FHIRMedicationStatementView,
    FHIRObservationView,
    FHIROrganizationView,
    FHIRPatientSummaryView,
    FHIRPatientView,
    FHIRPractitionerView,
)

app_name = "fhir"

urlpatterns = [
    # Patient resources
    path(
        "Patient/<int:pk>",
        FHIRPatientView.as_view(),
        name="patient-read",
    ),
    path(
        "Patient/<int:pk>/$summary",
        FHIRPatientSummaryView.as_view(),
        name="patient-summary",
    ),
    # Practitioner resources
    path(
        "Practitioner/<int:pk>",
        FHIRPractitionerView.as_view(),
        name="practitioner-read",
    ),
    # Organization resources
    path(
        "Organization/<int:pk>",
        FHIROrganizationView.as_view(),
        name="organization-read",
    ),
    # Observation resources (vitals, lab results)
    path(
        "Observation/<int:pk>",
        FHIRObservationView.as_view(),
        name="observation-read",
    ),
    # Condition resources (diagnoses)
    path(
        "Condition/<int:pk>",
        FHIRConditionView.as_view(),
        name="condition-read",
    ),
    # Composition resources (IPS document structure)
    path(
        "Composition/<int:pk>",
        FHIRCompositionView.as_view(),
        name="composition-read",
    ),
    # AllergyIntolerance resources
    path(
        "AllergyIntolerance/<int:pk>",
        FHIRAllergyIntoleranceView.as_view(),
        name="allergy-read",
    ),
    # MedicationStatement resources
    path(
        "MedicationStatement/<int:pk>",
        FHIRMedicationStatementView.as_view(),
        name="medication-statement-read",
    ),
    # Device resources
    path(
        "Device/<int:pk>",
        FHIRDeviceView.as_view(),
        name="device-read",
    ),
]
