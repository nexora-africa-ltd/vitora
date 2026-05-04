"""
Mention parsing utility for clinical comments.

Extracts @username references from comment body text and resolves them
to User objects within the same organization.
"""

import re

from django.contrib.auth import get_user_model

User = get_user_model()

# Match @username (alphanumeric + underscores, 1-150 chars)
MENTION_PATTERN = re.compile(r"@(\w{1,150})")


def parse_mentions(body: str, organization_id: int | None = None) -> list:
    """
    Parse @username mentions from comment body and resolve to User instances.

    Args:
        body: The comment text to parse.
        organization_id: Limit resolution to users in this organization.

    Returns:
        List of User instances that were mentioned and exist in the organization.
    """
    if not body:
        return []

    usernames = set(MENTION_PATTERN.findall(body))
    if not usernames:
        return []

    qs = User.objects.filter(username__in=usernames, is_active=True)
    if organization_id:
        qs = qs.filter(staff_profile__organization_id=organization_id)

    return list(qs)
