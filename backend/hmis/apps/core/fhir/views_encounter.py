# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
FHIR Encounter read endpoint.

Use: ``GET /fhir/Encounter/<id>`` with an authenticated FHIR client.
Inputs: Encounter integer primary key and the standard FHIR authorization context.
"""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response

from hmis.apps.core.fhir.security import request_can_access_fhir_resource
from hmis.apps.core.fhir.views_patient_admin import PublicFHIRReadAPIView


class FHIREncounterView(PublicFHIRReadAPIView):
    """Return a single Encounter resource by its FHIR logical ID."""

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
        description="Get a FHIR R4 Encounter resource by ID",
    )
    def get(self, request, pk: int) -> Response:
        """Return the requested encounter or a FHIR OperationOutcome."""
        from hmis.apps.encounters.models import Encounter

        try:
            encounter = Encounter.objects.select_related("patient").get(pk=pk)
        except Encounter.DoesNotExist:
            return Response(
                {
                    "resourceType": "OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "not-found",
                            "diagnostics": f"Encounter with ID {pk} not found",
                        }
                    ],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        if not request_can_access_fhir_resource(request, encounter):
            return Response(status=status.HTTP_403_FORBIDDEN)

        return Response(self.to_fhir_resource(encounter), status=status.HTTP_200_OK)

    @staticmethod
    def to_fhir_resource(encounter) -> dict:
        """Map a Vitora encounter to its FHIR R4 representation."""
        type_to_class = {"OPD": "AMB", "IPD": "IMP", "EMERGENCY": "EMER"}
        fhir_class = type_to_class.get(encounter.encounter_type, "AMB")

        status_map = {
            "COMPLETED": "finished",
            "DISCHARGED": "finished",
            "CANCELLED": "cancelled",
        }
        fhir_status = status_map.get(getattr(encounter, "status", ""), "in-progress")

        resource = {
            "resourceType": "Encounter",
            "id": str(encounter.pk),
            "status": fhir_status,
            "class": {
                "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "code": fhir_class,
            },
            "subject": {"reference": f"Patient/{encounter.patient_id}"},
            "period": {
                "start": encounter.encounter_date.isoformat() if encounter.encounter_date else None,
            },
        }
        if encounter.chief_complaint:
            resource["reasonCode"] = [{"text": encounter.chief_complaint}]
        return resource
