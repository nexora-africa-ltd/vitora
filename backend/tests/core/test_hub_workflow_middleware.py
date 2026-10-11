# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Verify hub workflow routing gates without bypassing downstream API handling.

Run: poetry run pytest tests/core/test_hub_workflow_middleware.py --no-cov
Inputs: registered API prefixes, execution environments, and capability states.
"""

import json
from unittest.mock import Mock

import pytest
from django.http import HttpResponse

from hmis.apps.core.hub_capabilities import HUB_PATH_CAPABILITIES, HubCapability
from hmis.apps.core.middleware import HubCloudOnlyWorkflowMiddleware


@pytest.mark.parametrize("path,capability", HUB_PATH_CAPABILITIES)
@pytest.mark.parametrize("environment", ["hub", "test", "production"])
def test_registered_workflows_follow_execution_policy(rf, settings, path, capability, environment):
    """Only restricted hub workflows are intercepted before the API view."""
    settings.ENVIRONMENT = environment
    request = rf.get(path)
    downstream_response = HttpResponse(status=204)
    downstream = Mock(return_value=downstream_response)

    response = HubCloudOnlyWorkflowMiddleware(downstream)(request)

    if environment == "hub" and capability != HubCapability.LOCAL_SYNCED:
        assert response.status_code == 409
        assert json.loads(response.content)["code"] == "hub_cloud_only"
        downstream.assert_not_called()
    else:
        assert response is downstream_response
        downstream.assert_called_once_with(request)


def test_unavailable_workflow_is_blocked(rf, settings, monkeypatch):
    """Unavailable workflows keep their distinct 409 error contract."""
    settings.ENVIRONMENT = "hub"
    monkeypatch.setattr(
        "hmis.apps.core.hub_capabilities.get_hub_capability_for_path",
        lambda path: HubCapability.UNAVAILABLE,
    )
    downstream = Mock()

    response = HubCloudOnlyWorkflowMiddleware(downstream)(rf.get("/api/unavailable/"))

    assert response.status_code == 409
    assert json.loads(response.content)["code"] == "hub_workflow_unavailable"
    downstream.assert_not_called()


def test_unmapped_route_reaches_downstream(rf, settings):
    """Unmapped routes remain subject to their own view's access controls."""
    settings.ENVIRONMENT = "hub"
    downstream_response = HttpResponse(status=401)
    downstream = Mock(return_value=downstream_response)
    request = rf.get("/api/unmapped/")

    assert HubCloudOnlyWorkflowMiddleware(downstream)(request) is downstream_response
    downstream.assert_called_once_with(request)
