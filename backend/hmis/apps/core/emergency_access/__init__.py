"""
Emergency Access (Break-Glass) Module for Vitora HMIS.

This module implements emergency access procedures for healthcare emergencies
where normal access controls may need to be bypassed. All emergency access
is logged and subject to mandatory review.

DHA Compliance: P1 Required
Kenya Data Protection Act 2019: Section 32 (Lawful Bases - Vital Interests)
"""

from .models import EmergencyAccess, EmergencyAccessReason

__all__ = ["EmergencyAccess", "EmergencyAccessReason"]
