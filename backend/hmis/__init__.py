"""
Vitora HMIS Backend Package.

This is the main package for the Vitora HMIS backend application.
"""

__version__ = "0.1.0"

# Import Celery app so it's loaded when Django starts (optional for tests)
try:
    from hmis.celery import app as celery_app

    __all__ = ("celery_app", "__version__")
except ImportError:
    # Celery not available (e.g., in test environment)
    celery_app = None
    __all__ = ("__version__",)
