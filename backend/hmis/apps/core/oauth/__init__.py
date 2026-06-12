# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
SMART on FHIR OAuth2 module.

This module implements SMART on FHIR authorization for third-party app integration
using django-oauth-toolkit.
"""

from hmis.apps.core.oauth.scopes import SMARTScopes

__all__ = ["SMARTScopes"]
