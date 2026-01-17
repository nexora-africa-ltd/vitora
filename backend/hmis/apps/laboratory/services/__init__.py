"""Laboratory services module.

This package consolidates all laboratory service classes.
"""

# Import from services_legacy module for backward compatibility
from hmis.apps.laboratory.services_legacy import LabAlertService, LabWorkflowService

from .notifications import LabNotificationService
from .requisition import ExternalLabRequisition
from .workflow import InvalidTransitionError, LabOrderWorkflow

__all__ = [
    "LabOrderWorkflow",
    "InvalidTransitionError",
    "ExternalLabRequisition",
    "LabNotificationService",
    "LabWorkflowService",
    "LabAlertService",
]
