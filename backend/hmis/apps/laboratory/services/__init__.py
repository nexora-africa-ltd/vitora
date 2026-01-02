"""Laboratory services module.

This package consolidates all laboratory service classes.
"""

from .workflow import LabOrderWorkflow, InvalidTransitionError
from .requisition import ExternalLabRequisition
from .notifications import LabNotificationService

# Import from services_legacy module for backward compatibility
from hmis.apps.laboratory.services_legacy import LabWorkflowService, LabAlertService

__all__ = [
    'LabOrderWorkflow',
    'InvalidTransitionError',
    'ExternalLabRequisition',
    'LabNotificationService',
    'LabWorkflowService',
    'LabAlertService',
]
