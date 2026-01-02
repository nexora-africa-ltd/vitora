"""Laboratory services module."""

from .workflow import LabOrderWorkflow, InvalidTransitionError
from .requisition import ExternalLabRequisition
from .notifications import LabNotificationService

# Import from parent services.py module (which contains LabWorkflowService and LabAlertService)
try:
    from ..services import LabWorkflowService, LabAlertService
except ImportError:
    # Fallback if services.py is being refactored
    LabWorkflowService = None
    LabAlertService = None

__all__ = [
    'LabOrderWorkflow',
    'InvalidTransitionError',
    'ExternalLabRequisition',
    'LabNotificationService',
    'LabWorkflowService',
    'LabAlertService',
]
