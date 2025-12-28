"""
Vitora HMIS Backend Package.

This is the main package for the Vitora HMIS backend application.
"""

__version__ = "0.1.0"

# Import Celery app so it's loaded when Django starts
from hmis.celery import app as celery_app

__all__ = ("celery_app", "__version__")
