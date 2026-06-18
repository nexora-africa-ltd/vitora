# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Rate limits for public licensing endpoints."""

from rest_framework.throttling import SimpleRateThrottle


class LicenseActivationThrottle(SimpleRateThrottle):
    """Limit activation-code attempts by client IP address."""

    scope = "license_activation"

    def get_cache_key(self, request, _view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class LicenseCheckInThrottle(SimpleRateThrottle):
    """Limit license check-in attempts by client IP address."""

    scope = "license_check_in"

    def get_cache_key(self, request, _view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }
