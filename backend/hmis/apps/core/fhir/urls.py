# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
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
    /fhir/CarePlan/{id}             - Read care plan (treatment plan)
    /fhir/Device/{id}               - Read device resource
"""

from django.urls import path

from hmis.apps.core.fhir.search import (
    FHIRConditionSearchView,
    FHIRDiagnosticReportSearchView,
    FHIREncounterSearchView,
    FHIRMedicationStatementSearchView,
    FHIRObservationSearchView,
    FHIRPatientSearchView,
)
from hmis.apps.core.fhir.views import (
    FHIRAllergyIntoleranceView,
    FHIRBundleView,
    FHIRCarePlanView,
    FHIRCompositionDocumentView,
    FHIRCompositionView,
    FHIRConditionView,
    FHIRDeviceUseStatementView,
    FHIRDeviceView,
    FHIRDiagnosticReportView,
    FHIRImagingStudyView,
    FHIRImmunizationView,
    FHIRMediaView,
    FHIRMedicationStatementView,
    FHIRMedicationView,
    FHIRObservationView,
    FHIROrganizationView,
    FHIRPatientSummaryView,
    FHIRPatientView,
    FHIRPractitionerRoleView,
    FHIRPractitionerView,
    FHIRProcedureView,
    FHIRSpecimenView,
)
from hmis.apps.core.fhir.write import (
    FHIRConditionCreateView,
    FHIRDiagnosticReportCreateView,
    FHIREncounterCreateView,
    FHIRMedicationRequestCreateView,
    FHIRObservationCreateView,
    FHIRPatientCreateView,
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
    path(
        "Bundle/<str:pk>",
        FHIRBundleView.as_view(),
        name="bundle-read",
    ),
    # Practitioner resources
    path(
        "Practitioner/<int:pk>",
        FHIRPractitionerView.as_view(),
        name="practitioner-read",
    ),
    path(
        "PractitionerRole/<int:pk>",
        FHIRPractitionerRoleView.as_view(),
        name="practitioner-role-read",
    ),
    # Organization resources
    path(
        "Organization/<int:pk>",
        FHIROrganizationView.as_view(),
        name="organization-read",
    ),
    # Observation resources (vitals, lab results, social history)
    path(
        "Observation/<str:pk>",
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
    path(
        "Composition/<int:pk>/$document",
        FHIRCompositionDocumentView.as_view(),
        name="composition-document",
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
    path(
        "Medication/<int:pk>",
        FHIRMedicationView.as_view(),
        name="medication-read",
    ),
    # CarePlan resources (treatment plans)
    path(
        "CarePlan/<int:pk>",
        FHIRCarePlanView.as_view(),
        name="care-plan-read",
    ),
    path(
        "Specimen/<int:pk>",
        FHIRSpecimenView.as_view(),
        name="specimen-read",
    ),
    path(
        "DiagnosticReport/<int:pk>",
        FHIRDiagnosticReportView.as_view(),
        name="diagnostic-report-read",
    ),
    path(
        "Immunization/<int:pk>",
        FHIRImmunizationView.as_view(),
        name="immunization-read",
    ),
    path(
        "Procedure/<int:pk>",
        FHIRProcedureView.as_view(),
        name="procedure-read",
    ),
    path(
        "ImagingStudy/<int:pk>",
        FHIRImagingStudyView.as_view(),
        name="imaging-study-read",
    ),
    path(
        "Media/<int:pk>",
        FHIRMediaView.as_view(),
        name="media-read",
    ),
    # Device resources
    path(
        "Device/<int:pk>",
        FHIRDeviceView.as_view(),
        name="device-read",
    ),
    path(
        "DeviceUseStatement/<int:pk>",
        FHIRDeviceUseStatementView.as_view(),
        name="device-use-statement-read",
    ),
    # --- FHIR Search Endpoints ---
    path(
        "Patient",
        FHIRPatientSearchView.as_view(),
        name="patient-search",
    ),
    path(
        "Observation",
        FHIRObservationSearchView.as_view(),
        name="observation-search",
    ),
    path(
        "Condition",
        FHIRConditionSearchView.as_view(),
        name="condition-search",
    ),
    path(
        "MedicationStatement",
        FHIRMedicationStatementSearchView.as_view(),
        name="medication-statement-search",
    ),
    path(
        "Encounter",
        FHIREncounterSearchView.as_view(),
        name="encounter-search",
    ),
    path(
        "DiagnosticReport",
        FHIRDiagnosticReportSearchView.as_view(),
        name="diagnostic-report-search",
    ),
    # --- FHIR Write (Create) Endpoints ---
    path(
        "Patient/",
        FHIRPatientCreateView.as_view(),
        name="patient-create",
    ),
    path(
        "Observation/",
        FHIRObservationCreateView.as_view(),
        name="observation-create",
    ),
    path(
        "Condition/",
        FHIRConditionCreateView.as_view(),
        name="condition-create",
    ),
    path(
        "Encounter/",
        FHIREncounterCreateView.as_view(),
        name="encounter-create",
    ),
    path(
        "MedicationRequest/",
        FHIRMedicationRequestCreateView.as_view(),
        name="medication-request-create",
    ),
    path(
        "DiagnosticReport/",
        FHIRDiagnosticReportCreateView.as_view(),
        name="diagnostic-report-create",
    ),
]
