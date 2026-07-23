"""Shared tenant access helpers."""


def user_has_facility_access(user, facility) -> bool:
    """Return True when ``user`` is allowed to act within ``facility``."""
    if not user or not getattr(user, "is_authenticated", False):
        return False

    if getattr(user, "is_superuser", False):
        return True

    profile = getattr(user, "staff_profile", None)
    if not profile or not facility:
        return False

    if profile.primary_facility_id == facility.id:
        return True

    secondary_facilities = getattr(profile, "secondary_facilities", None)
    if secondary_facilities is not None and secondary_facilities.filter(id=facility.id).exists():
        return True

    from hmis.apps.core.models import OrgMembership

    return OrgMembership.objects.filter(
        staff_profile=profile,
        organization=facility.organization,
        status=OrgMembership.MembershipStatus.ACTIVE,
        facilities=facility,
    ).exists()
