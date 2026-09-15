# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Authenticated SHA ILM terminology proxy endpoints.

GET ``/api/sha/ilm/terminology/concepts/`` and ``mappings/`` forward optional
ILM query filters using configured terminology provenance.
"""

from __future__ import annotations

import logging

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.services.dha_errors import DHAError
from hmis.apps.billing.services.ilm_terminology_service import (
    IlmTerminologyConfigurationError,
    IlmTerminologyService,
)
from hmis.apps.billing.sha_ilm_prescription_views import BillingILMSchemaMixin, _ilm_handle_error
from hmis.apps.core.api_errors import safe_error_response
from hmis.apps.core.permissions import ReadRequiresModelPermission

logger = logging.getLogger(__name__)


class IlmTerminologyConceptsView(BillingILMSchemaMixin, APIView):
    """Proxy configured clinical concept searches to DHA ILM."""

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request):
        try:
            service = IlmTerminologyService()
            payload = service.list_concepts(query=request.query_params.dict())
            if isinstance(payload, dict):
                payload = {**payload, "provenance": service.configured_provenance()}
        except IlmTerminologyConfigurationError as exc:
            return safe_error_response(
                action="billing.ilm_terminology_concepts",
                exc=exc,
                logger=logger,
                expose_message_for=(IlmTerminologyConfigurationError,),
            )
        except DHAError as exc:
            return _ilm_handle_error("terminology-concepts", exc)
        return Response(payload)


class IlmTerminologyMappingsView(BillingILMSchemaMixin, APIView):
    """Proxy configured clinical concept mapping searches to DHA ILM."""

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request):
        try:
            service = IlmTerminologyService()
            payload = service.list_mappings(query=request.query_params.dict())
            if isinstance(payload, dict):
                payload = {**payload, "provenance": service.configured_provenance()}
        except IlmTerminologyConfigurationError as exc:
            return safe_error_response(
                action="billing.ilm_terminology_mappings",
                exc=exc,
                logger=logger,
                expose_message_for=(IlmTerminologyConfigurationError,),
            )
        except DHAError as exc:
            return _ilm_handle_error("terminology-mappings", exc)
        return Response(payload)
