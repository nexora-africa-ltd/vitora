"""
Django settings for Vitora HMIS project.

This module provides settings configuration for different environments.
"""

import os

# Determine which settings to use based on environment
ENVIRONMENT = os.getenv("DJANGO_ENV", "development")

if ENVIRONMENT == "test":
    from .test import *  # noqa: F401, F403
elif ENVIRONMENT == "production":
    from .production import *  # noqa: F401, F403
elif ENVIRONMENT == "staging":
    from .staging import *  # noqa: F401, F403
elif ENVIRONMENT == "hub":
    from .hub import *  # noqa: F401, F403
else:
    from .development import *  # noqa: F401, F403
