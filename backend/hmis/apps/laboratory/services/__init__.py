"""Laboratory services module."""

from .workflow import LabOrderWorkflow, InvalidTransitionError
from .requisition import ExternalLabRequisition
from .notifications import LabNotificationService

# Deprecated: LabWorkflowService and LabAlertService are no longer imported here
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
