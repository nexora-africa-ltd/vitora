# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core sync views for Vitora HMIS.

What this file is for:
- Implement sync views logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
import time

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import identify_hasher
from django.db import DatabaseError, models, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import SyncConflict, SyncQueue
from hmis.apps.core.sync_registry import (
    downward_sync_models,
    get_registry_entry,
    is_upward_sync_model,
)
from hmis.apps.core.sync_serializers import (
    SyncConflictDetailSerializer,
    SyncConflictResolveSerializer,
    SyncPushRequestSerializer,
)
from hmis.apps.core.sync_signals import add_sync_meta, serialize_instance_for_sync
from hmis.apps.licensing.hub_auth import HubLicenseOrJWTAuthentication, IsAuthenticatedOrHubLicense

logger = logging.getLogger(__name__)

DOWNWARD_FULL_PULL_PAGE_LIMIT = 250

# Full-pull dependency edges: key depends on each listed model and must be
# emitted after its parents. Keep this list minimal and explicit for models
# with strict FK validation/full_clean side effects during materialization.
FULL_PULL_DEPENDENCIES: dict[str, set[str]] = {
    "core.SubCounty": {"core.County"},
    "core.Ward": {"core.SubCounty"},
    "core.Facility": {"core.Organization", "core.County", "core.SubCounty"},
    "core.Department": {"core.Organization", "core.Facility"},
    "core.StaffProfile": {"auth.User", "core.Role", "core.Department", "core.Facility"},
    "core.OrgMembership": {
        "core.StaffProfile",
        "core.Organization",
        "core.Role",
        "core.Department",
    },
    "patients.Patient": {"core.Organization", "core.Facility", "core.County", "core.SubCounty"},
    "encounters.Encounter": {"patients.Patient", "core.Facility", "auth.User"},
    "encounters.Diagnosis": {"encounters.Encounter", "encounters.ICD10Code", "auth.User"},
    "encounters.TreatmentPlan": {"encounters.Encounter"},
    "encounters.Medication": {"encounters.TreatmentPlan"},
    "triage.TriageAssessment": {"encounters.Encounter"},
    "pharmacy.Prescription": {"encounters.Encounter", "patients.Patient", "core.Facility"},
    "pharmacy.PrescriptionItem": {"pharmacy.Prescription"},
    "laboratory.LabOrder": {
        "encounters.Encounter",
        "patients.Patient",
        "core.Facility",
        "auth.User",
    },
    "laboratory.LabOrderItem": {"laboratory.LabOrder"},
    "laboratory.LabResult": {"laboratory.LabOrderItem"},
    "billing.Invoice": {
        "patients.Patient",
        "core.Facility",
        "encounters.Encounter",
        "clinics.ClinicVisit",
        "auth.User",
    },
    "billing.InvoiceItem": {
        "billing.Invoice",
        "pharmacy.Drug",
        "laboratory.LabOrder",
        "imaging.ImagingOrder",
    },
    "billing.Payment": {"billing.Invoice", "billing.PaymentPoint", "auth.User"},
    "clinics.ClinicVisit": {"clinics.ClinicSession", "patients.Patient", "auth.User"},
    "imaging.ImagingOrder": {"encounters.Encounter", "patients.Patient", "auth.User"},
    "imaging.RadiologyReport": {"imaging.ImagingOrder", "auth.User"},
    "inpatient.Ward": {"core.Facility"},
    "inpatient.Bed": {"inpatient.Ward"},
    "inpatient.Admission": {
        "inpatient.Ward",
        "inpatient.Bed",
        "encounters.Encounter",
        "patients.Patient",
        "auth.User",
    },
}

# Tables allowed for sync (prevent arbitrary model writes)
SYNCABLE_TABLES = {
    "patients_patient",
    "patients_emergencycontact",
    "encounters_encounter",
    "encounters_diagnosis",
    "encounters_treatmentplan",
    "encounters_medication",
    "triage_triageassessment",
    "pharmacy_prescription",
    "pharmacy_prescriptionitem",
    "laboratory_laborder",
    "laboratory_laborderitem",
    "laboratory_labresult",
    "billing_invoice",
    "scheduling_shift",
}

HUB_IDENTITY_TABLES = {
    "auth.User",
    "core.StaffProfile",
    "core.Role",
    "core.Department",
    "core.OrgMembership",
}
HUB_USER_ALLOWED_FIELDS = {
    "id",
    "username",
    "email",
    "first_name",
    "last_name",
    "password",
    "is_active",
    "sync_meta",
}
HUB_STAFF_PROFILE_ALLOWED_FIELDS = {
    "id",
    "user",
    "user_id",
    "user_username",
    "username",
    "employee_id",
    "title",
    "middle_name",
    "primary_role",
    "primary_role_id",
    "primary_role_code",
    "primary_department",
    "primary_department_id",
    "primary_department_code",
    "primary_department_facility_mfl_code",
    "organization",
    "organization_id",
    "organization_slug",
    "primary_facility",
    "primary_facility_id",
    "primary_facility_mfl_code",
    "facility",
    "facility_id",
    "hwr_id",
    "license_number",
    "license_expiry",
    "license_verified",
    "licensing_body",
    "specialization",
    "employment_status",
    "employment_type",
    "date_joined",
    "date_left",
    "sync_meta",
}
HUB_ROLE_ALLOWED_FIELDS = {
    "id",
    "code",
    "name",
    "category",
    "description",
    "scope",
    "organization",
    "organization_id",
    "facility",
    "facility_id",
    "permissions_matrix",
    "hierarchy_level",
    "parent_role",
    "parent_role_id",
    "is_active",
    "sync_meta",
}
HUB_DEPARTMENT_ALLOWED_FIELDS = {
    "id",
    "code",
    "name",
    "description",
    "department_type",
    "organization",
    "organization_id",
    "facility",
    "facility_id",
    "parent",
    "parent_id",
    "head",
    "head_id",
    "is_active",
    "sync_meta",
}
HUB_ORG_MEMBERSHIP_ALLOWED_FIELDS = {
    "id",
    "staff_profile",
    "staff_profile_id",
    "staff_profile_employee_id",
    "staff_profile_username",
    "staff_username",
    "organization",
    "organization_id",
    "organization_slug",
    "role",
    "role_id",
    "role_code",
    "department",
    "department_id",
    "department_code",
    "department_facility_mfl_code",
    "facility_ids",
    "facility_mfl_codes",
    "is_primary",
    "status",
    "joined_at",
    "invited_by",
    "invited_by_id",
    "sync_meta",
}

# Soft-failure codes returned by `_apply_hub_identity_change`. The hub keeps
# entries with these reasons in PENDING state instead of marking them FAILED
# so they can be retried on a subsequent push cycle (e.g. after a dependency
# row finally arrives).
SOFT_FAILURE_DEPENDENCY_MISSING = "DEPENDENCY_MISSING"

# Natural-key relation hints emitted by sync_signals._with_relation_hints().
# These are non-authoritative fields used for cloud-side FK remapping and
# should never block hub identity writes when new hints are introduced.
HINT_FIELD_SUFFIXES = (
    "_username",
    "_slug",
    "_code",
    "_name",
    "_mrn",
    "_cr_number",
    "_mfl_code",
    "_mfl_codes",
    "_employee_id",
    "_date",
    "_type",
    "_number",
    "_reference",
    "_status",
    "_description",
    "_specialty",
    "_time",
)


def _record_id_to_int(record_id) -> int | None:
    """Return an integer record id if one was supplied."""
    if record_id in (None, ""):
        return None
    try:
        return int(record_id)
    except (TypeError, ValueError):
        return None


def _reject_identity(reason: str, *, code: str | None = None) -> dict:
    """Build a common identity sync result for rejected changes.

    Pass ``code=SOFT_FAILURE_DEPENDENCY_MISSING`` for rejections that the hub
    should retry on the next push cycle (e.g. waiting for a related row).
    """
    result: dict = {"success": False, "reason": reason}
    if code:
        result["code"] = code
    return result


def _is_hint_only_field(field_name: str) -> bool:
    """Return True when *field_name* looks like a non-authoritative relation hint."""
    if not field_name:
        return False
    if field_name.endswith("_id") or field_name.endswith("_ids"):
        return False
    return field_name.endswith(HINT_FIELD_SUFFIXES)


def _validate_hub_identity_fields(*, table: str, data: dict, allowed_fields: set[str]) -> dict:
    """Validate hub identity payload fields and tolerate unknown hint-only keys.

    Unknown authoritative fields still reject the payload. Unknown hint-only
    fields are ignored with a warning to keep hub/cloud payload evolution
    backward-compatible.
    """
    unexpected_fields = set(data) - allowed_fields
    ignored_hint_fields = {field for field in unexpected_fields if _is_hint_only_field(field)}
    disallowed_fields = unexpected_fields - ignored_hint_fields
    if disallowed_fields:
        return {
            "ok": False,
            "reason": f"Field(s) not allowed for {table}: {', '.join(sorted(disallowed_fields))}.",
            "cleaned_data": data,
        }

    if ignored_hint_fields:
        logger.warning(
            "Ignoring unknown hint field(s) for %s: %s",
            table,
            ", ".join(sorted(ignored_hint_fields)),
        )
        data = {key: value for key, value in data.items() if key not in ignored_hint_fields}

    return {"ok": True, "reason": "", "cleaned_data": data}


def _apply_hub_identity_change(*, table: str, operation: str, record_id, data: dict, installation):
    """Apply tightly scoped hub identity changes directly on the cloud."""
    if installation is None:
        return _reject_identity("Identity sync requires an active hub license.")
    if operation == "DELETE":
        # Identity tables are never deleted via sync — staff records are
        # soft-archived via employment_status/date_left fields instead.
        return _reject_identity(
            f"Identity sync only supports CREATE and UPDATE operations for '{table}'."
        )
    if operation not in {"CREATE", "UPDATE"}:
        return _reject_identity("Identity sync only supports CREATE and UPDATE operations.")
    if table == "auth.User":
        return _upsert_hub_user(record_id=record_id, data=data, installation=installation)
    if table == "core.StaffProfile":
        return _upsert_hub_staff_profile(record_id=record_id, data=data, installation=installation)
    if table == "core.Role":
        return _upsert_hub_role(record_id=record_id, data=data, installation=installation)
    if table == "core.Department":
        return _upsert_hub_department(record_id=record_id, data=data, installation=installation)
    if table == "core.OrgMembership":
        return _upsert_hub_org_membership(record_id=record_id, data=data, installation=installation)
    return _reject_identity(f"Unsupported identity table '{table}'.")


def _upsert_hub_user(*, record_id, data: dict, installation):
    """Create/update a non-privileged cloud user from a licensed hub."""
    validation = _validate_hub_identity_fields(
        table="hub user sync",
        data=data,
        allowed_fields=HUB_USER_ALLOWED_FIELDS,
    )
    if not validation["ok"]:
        return _reject_identity(validation["reason"])
    data = validation["cleaned_data"]

    record_pk = _record_id_to_int(record_id or data.get("id"))
    if record_pk is None:
        return _reject_identity("Hub user sync requires a numeric record_id.")

    username = str(data.get("username") or "").strip()
    if not username:
        return _reject_identity("Hub user sync requires a username.")

    password_hash = data.get("password")
    if password_hash:
        try:
            identify_hasher(password_hash)
        except ValueError:
            return _reject_identity("Hub user sync requires an encoded Django password hash.")

    User = get_user_model()
    existing_by_pk = User.objects.filter(pk=record_pk).first()
    existing_by_username = User.objects.filter(username=username).first()
    email = str(data.get("email") or "").strip()
    existing_by_email = User.objects.filter(email__iexact=email).first() if email else None

    # Soft-link colliding hub users: when the hub's local PK differs from the
    # cloud PK but username/email match the same canonical user, we treat the
    # push as success and update the canonical user in place. This prevents a
    # cascade where the StaffProfile push would otherwise fail forever with
    # "user does not exist in the cloud" because the hub keeps quoting its
    # hub-local user_id. ``_upsert_hub_staff_profile`` resolves user_id by
    # username when the PK lookup misses, completing the link.
    user = existing_by_pk
    collision_link = False
    if user is None and existing_by_username is not None:
        # Username already taken on cloud → treat as the canonical record.
        user = existing_by_username
        collision_link = True
    if user is None and existing_by_email is not None:
        user = existing_by_email
        collision_link = True
    # Cross-check: if username and email resolved to different cloud users,
    # the push is genuinely ambiguous and we must reject.
    if (
        existing_by_username is not None
        and existing_by_email is not None
        and existing_by_username.pk != existing_by_email.pk
    ):
        return _reject_identity(
            "Hub user sync would collide with two different cloud users (username vs email)."
        )

    profile = getattr(user, "staff_profile", None) if user else None
    if (
        profile
        and profile.organization_id
        and profile.organization_id != installation.organization_id
    ):
        return _reject_identity("Hub user belongs to a different organization.")

    if collision_link:
        logger.warning(
            "Hub user sync soft-linked hub PK %s to cloud PK %s (username=%s).",
            record_pk,
            user.pk,
            username,
        )

    creating = user is None
    if creating and not password_hash:
        return _reject_identity("Hub user creation requires a password hash.")
    if creating:
        user = User(pk=record_pk, username=username)

    object.__setattr__(user, "_from_sync_materializer", True)
    user.username = username
    user.email = email
    user.first_name = str(data.get("first_name") or "")
    user.last_name = str(data.get("last_name") or "")
    if "is_active" in data:
        user.is_active = bool(data.get("is_active"))
    elif creating:
        user.is_active = True
    if password_hash:
        user.password = password_hash
    if creating:
        user.is_staff = False
        user.is_superuser = False
    user.save()
    return {"success": True}


def _get_scoped_role(role_id, installation):
    """Return a role if it is global or scoped to the hub installation."""
    from hmis.apps.core.models import Role

    role = Role.objects.filter(pk=role_id).first()
    if role is None:
        return None
    role_organization_id = getattr(role, "organization_id", None)
    role_facility_id = getattr(role, "facility_id", None)
    if role_organization_id and role_organization_id != installation.organization_id:
        return None
    if role_facility_id and role_facility_id != installation.facility_id:
        return None
    return role


def _get_scoped_department(department_id, installation):
    """Return a department only when it belongs to the hub installation."""
    from hmis.apps.core.models import Department

    return Department.objects.filter(
        pk=department_id,
        organization=installation.organization,
        facility=installation.facility,
    ).first()


def _upsert_hub_staff_profile(*, record_id, data: dict, installation):
    """Create/update a staff profile forced into the hub installation scope."""
    if installation.facility is None:
        return _reject_identity("Hub staff profile sync requires an installation facility.")

    validation = _validate_hub_identity_fields(
        table="hub staff profile sync",
        data=data,
        allowed_fields=HUB_STAFF_PROFILE_ALLOWED_FIELDS,
    )
    if not validation["ok"]:
        return _reject_identity(validation["reason"])
    data = validation["cleaned_data"]

    record_pk = _record_id_to_int(record_id or data.get("id"))
    if record_pk is None:
        return _reject_identity("Hub staff profile sync requires a numeric record_id.")

    user_id = _record_id_to_int(data.get("user") or data.get("user_id"))
    if user_id is None:
        return _reject_identity("Hub staff profile sync requires a user id.")

    User = get_user_model()
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        # Fall back to username — the cloud may have a different PK for the
        # same canonical user (see ``_upsert_hub_user`` soft-link logic).
        username = str(data.get("username") or "").strip()
        if username:
            user = User.objects.filter(username=username).first()
        if user is None:
            # Soft failure so the hub keeps the entry PENDING and retries
            # after the auth.User push (priority 3) lands in a later cycle.
            return _reject_identity(
                "Hub staff profile user does not exist in the cloud.",
                code=SOFT_FAILURE_DEPENDENCY_MISSING,
            )

    role_id = _record_id_to_int(data.get("primary_role") or data.get("primary_role_id"))
    role = _get_scoped_role(role_id, installation) if role_id is not None else None
    if role is None:
        # Fallback: use any active role within the organization scope
        from hmis.apps.core.models import Role

        role = (
            Role.objects.filter(is_active=True)
            .filter(
                models.Q(organization=installation.organization)
                | models.Q(organization__isnull=True)
            )
            .order_by("hierarchy_level")
            .first()
        )
    if role is None:
        return _reject_identity("Hub staff profile primary role is not available to this hub.")

    department_id = _record_id_to_int(
        data.get("primary_department") or data.get("primary_department_id")
    )
    department = (
        _get_scoped_department(department_id, installation) if department_id is not None else None
    )
    if department is None:
        # Fallback: use any active department within the installation scope
        from hmis.apps.core.models import Department

        department = Department.objects.filter(
            is_active=True,
            organization=installation.organization,
            facility=installation.facility,
        ).first()
    if department is None:
        return _reject_identity(
            "Hub staff profile primary department is not available to this hub."
        )

    date_joined = parse_date(str(data.get("date_joined") or ""))
    if date_joined is None:
        return _reject_identity("Hub staff profile sync requires date_joined in YYYY-MM-DD format.")

    date_left = parse_date(str(data.get("date_left") or "")) if data.get("date_left") else None

    from hmis.apps.core.models import StaffProfile

    existing_by_pk = StaffProfile.objects.filter(pk=record_pk).first()
    existing_by_user = StaffProfile.objects.filter(user=user).first()
    employee_id = str(data.get("employee_id") or "").strip()
    existing_by_employee = (
        StaffProfile.objects.filter(employee_id=employee_id).first() if employee_id else None
    )

    candidates = [item for item in (existing_by_pk, existing_by_user, existing_by_employee) if item]
    if candidates and len({item.pk for item in candidates}) > 1:
        return _reject_identity("Hub staff profile sync would collide with an existing profile.")

    profile = candidates[0] if candidates else None
    if profile and getattr(profile, "organization_id", None) != installation.organization_id:
        return _reject_identity("Hub staff profile belongs to a different organization.")

    if profile is None:
        profile = StaffProfile(pk=record_pk, user=user)

    object.__setattr__(profile, "_from_sync_materializer", True)
    profile.employee_id = employee_id
    profile.title = str(data.get("title") or "")
    profile.middle_name = str(data.get("middle_name") or "")
    profile.primary_role = role
    profile.primary_department = department
    profile.organization = installation.organization
    profile.primary_facility = installation.facility
    profile.hwr_id = str(data.get("hwr_id") or "")
    profile.license_number = str(data.get("license_number") or "")
    profile.license_expiry = (
        parse_date(str(data.get("license_expiry") or "")) if data.get("license_expiry") else None
    )
    profile.license_verified = bool(data.get("license_verified", False))
    profile.licensing_body = str(data.get("licensing_body") or "")
    profile.specialization = str(data.get("specialization") or "")
    profile.employment_status = str(data.get("employment_status") or "ACTIVE")
    profile.employment_type = str(data.get("employment_type") or "PERMANENT")
    profile.date_joined = date_joined
    profile.date_left = date_left
    profile.save()
    return {"success": True}


def _upsert_hub_role(*, record_id, data: dict, installation):
    """Create/update a hub-originated Role, forced into the installation scope.

    Roles are dedup'd by ``code`` (which is unique on the model). The hub's
    PK is preserved when the cloud has no other record at that PK; otherwise
    the existing cloud row matched by code wins and the hub's PK is ignored.
    """
    if installation.facility is None:
        return _reject_identity("Hub role sync requires an installation facility.")

    validation = _validate_hub_identity_fields(
        table="hub role sync",
        data=data,
        allowed_fields=HUB_ROLE_ALLOWED_FIELDS,
    )
    if not validation["ok"]:
        return _reject_identity(validation["reason"])
    data = validation["cleaned_data"]

    record_pk = _record_id_to_int(record_id or data.get("id"))
    if record_pk is None:
        return _reject_identity("Hub role sync requires a numeric record_id.")

    code = str(data.get("code") or "").strip()
    if not code:
        return _reject_identity("Hub role sync requires a code.")

    name = str(data.get("name") or "").strip()
    if not name:
        return _reject_identity("Hub role sync requires a name.")

    scope = str(data.get("scope") or "ORG").upper()
    if scope not in {"ORG", "FACILITY"}:
        return _reject_identity(f"Hub role sync got invalid scope '{scope}'.")

    from hmis.apps.core.models import Role

    existing_by_pk = Role.objects.filter(pk=record_pk).first()
    existing_by_code = Role.objects.filter(code=code).first()

    candidates = [item for item in (existing_by_pk, existing_by_code) if item]
    if candidates and len({item.pk for item in candidates}) > 1:
        return _reject_identity(
            "Hub role sync would collide with two different existing cloud roles."
        )

    role = candidates[0] if candidates else None
    # Guard against PK collisions: an existing cloud row at the hub's PK that
    # represents a different role (different ``code``) must NOT be overwritten.
    if existing_by_pk is not None and existing_by_code is None and existing_by_pk.code != code:
        return _reject_identity(
            "Hub role sync hub-PK collides with a different cloud role at the same PK."
        )
    # Roles with org=NULL are system-wide and managed centrally on cloud; hubs
    # may not overwrite them.
    if role is not None and role.organization_id is None:
        return _reject_identity("Hub role sync cannot modify a system-wide role.")
    if (
        role is not None
        and role.organization_id is not None
        and role.organization_id != installation.organization_id
    ):
        return _reject_identity("Hub role belongs to a different organization.")

    if role is None:
        role = Role(pk=record_pk, code=code)

    object.__setattr__(role, "_from_sync_materializer", True)
    role.code = code
    role.name = name
    role.category = str(data.get("category") or "ADMINISTRATIVE")
    role.description = str(data.get("description") or "")
    role.scope = scope
    role.organization = installation.organization
    role.facility = installation.facility if scope == "FACILITY" else None
    role.permissions_matrix = data.get("permissions_matrix") or {}
    role.hierarchy_level = int(data.get("hierarchy_level") or 0)
    if hasattr(role, "is_active"):
        role.is_active = bool(data.get("is_active", True))
    role.save()
    return {"success": True}


def _upsert_hub_department(*, record_id, data: dict, installation):
    """Create/update a hub-originated Department, forced into installation scope.

    Departments are dedup'd by ``(facility, code)`` (the model's unique
    constraint). The cloud rewrites ``organization``/``facility`` so a hub can
    never assign a department to a foreign facility.
    """
    if installation.facility is None:
        return _reject_identity("Hub department sync requires an installation facility.")

    validation = _validate_hub_identity_fields(
        table="hub department sync",
        data=data,
        allowed_fields=HUB_DEPARTMENT_ALLOWED_FIELDS,
    )
    if not validation["ok"]:
        return _reject_identity(validation["reason"])
    data = validation["cleaned_data"]

    record_pk = _record_id_to_int(record_id or data.get("id"))
    if record_pk is None:
        return _reject_identity("Hub department sync requires a numeric record_id.")

    code = str(data.get("code") or "").strip()
    if not code:
        return _reject_identity("Hub department sync requires a code.")

    name = str(data.get("name") or "").strip()
    if not name:
        return _reject_identity("Hub department sync requires a name.")

    from hmis.apps.core.models import Department

    existing_by_pk = Department.objects.filter(pk=record_pk).first()
    existing_by_code = Department.objects.filter(facility=installation.facility, code=code).first()

    candidates = [item for item in (existing_by_pk, existing_by_code) if item]
    if candidates and len({item.pk for item in candidates}) > 1:
        return _reject_identity(
            "Hub department sync would collide with two different existing cloud departments."
        )

    department = candidates[0] if candidates else None
    # Guard against PK collisions: an existing cloud row at the hub's PK that
    # represents a different department (different ``code``/``facility``) must
    # NOT be overwritten.
    if (
        existing_by_pk is not None
        and existing_by_code is None
        and (existing_by_pk.code != code or existing_by_pk.facility_id != installation.facility_id)
    ):
        return _reject_identity(
            "Hub department sync hub-PK collides with a different cloud department at the same PK."
        )
    if department is not None and department.organization_id != installation.organization_id:
        return _reject_identity("Hub department belongs to a different organization.")
    if department is not None and department.facility_id != installation.facility_id:
        return _reject_identity("Hub department belongs to a different facility.")

    if department is None:
        department = Department(pk=record_pk, code=code)

    object.__setattr__(department, "_from_sync_materializer", True)
    department.code = code
    department.name = name
    department.description = str(data.get("description") or "")
    department.department_type = str(data.get("department_type") or "ADMINISTRATIVE")
    department.organization = installation.organization
    department.facility = installation.facility
    department.is_active = bool(data.get("is_active", True))
    # Parent/head FKs are intentionally not propagated from the hub: parent
    # hierarchy and head assignments should be configured on the cloud to
    # avoid PK-collision and cyclic-update issues. The hub keeps its own
    # parent/head locally; cloud admins can re-assign on cloud.
    department.save()
    return {"success": True}


def _upsert_hub_org_membership(*, record_id, data: dict, installation):
    """Create/update a hub-originated OrgMembership.

    Memberships are dedup'd by ``(staff_profile, organization)`` (the model's
    unique constraint). The organization is forced to ``installation.organization``
    so a hub can only manage memberships within its own org. The ``facilities``
    M2M is rewritten to the (filtered) list the hub sent.
    """
    if installation.facility is None:
        return _reject_identity("Hub membership sync requires an installation facility.")

    validation = _validate_hub_identity_fields(
        table="hub membership sync",
        data=data,
        allowed_fields=HUB_ORG_MEMBERSHIP_ALLOWED_FIELDS,
    )
    if not validation["ok"]:
        return _reject_identity(validation["reason"])
    data = validation["cleaned_data"]

    record_pk = _record_id_to_int(record_id or data.get("id"))
    if record_pk is None:
        return _reject_identity("Hub membership sync requires a numeric record_id.")

    staff_profile_id = _record_id_to_int(data.get("staff_profile") or data.get("staff_profile_id"))
    if staff_profile_id is None:
        return _reject_identity("Hub membership sync requires a staff_profile id.")

    from hmis.apps.core.models import OrgMembership, StaffProfile

    staff_profile = StaffProfile.objects.filter(pk=staff_profile_id).first()
    if staff_profile is None:
        # Soft failure so the hub retries after the StaffProfile push lands.
        return _reject_identity(
            "Hub membership staff_profile does not exist in the cloud.",
            code=SOFT_FAILURE_DEPENDENCY_MISSING,
        )
    if (
        staff_profile.organization_id
        and staff_profile.organization_id != installation.organization_id
    ):
        return _reject_identity("Hub membership staff_profile belongs to a different org.")

    role_id = _record_id_to_int(data.get("role") or data.get("role_id"))
    role = _get_scoped_role(role_id, installation) if role_id is not None else None
    if role is None:
        # Reuse the StaffProfile's primary role as a safe fallback.
        role = staff_profile.primary_role
    if role is None:
        return _reject_identity("Hub membership role is not available to this hub.")

    department_id = _record_id_to_int(data.get("department") or data.get("department_id"))
    department = (
        _get_scoped_department(department_id, installation) if department_id is not None else None
    )

    existing_by_pk = OrgMembership.objects.filter(pk=record_pk).first()
    existing_by_unique = OrgMembership.objects.filter(
        staff_profile=staff_profile, organization=installation.organization
    ).first()
    candidates = [item for item in (existing_by_pk, existing_by_unique) if item]
    if candidates and len({item.pk for item in candidates}) > 1:
        return _reject_identity(
            "Hub membership sync would collide with two different existing memberships."
        )

    membership = candidates[0] if candidates else None
    if membership is None:
        membership = OrgMembership(pk=record_pk, staff_profile=staff_profile)

    object.__setattr__(membership, "_from_sync_materializer", True)
    membership.staff_profile = staff_profile
    membership.organization = installation.organization
    membership.role = role
    membership.department = department
    membership.is_primary = bool(data.get("is_primary", False))
    membership.status = str(data.get("status") or "ACTIVE")
    membership.save()

    # Rewrite facilities M2M: keep only facilities that belong to the hub's
    # installation. We never let a hub assign a member to a facility outside
    # its own scope.
    from hmis.apps.core.models import Facility

    requested_facility_ids = data.get("facility_ids") or []
    allowed_ids: list[int] = []
    for fid in requested_facility_ids:
        fid_int = _record_id_to_int(fid)
        if fid_int is None:
            continue
        if Facility.objects.filter(pk=fid_int, organization=installation.organization).exists():
            allowed_ids.append(fid_int)
    if (
        installation.facility_id
        and installation.facility_id not in allowed_ids
        and membership.is_primary
    ):
        # Always include the installation's own facility for primary memberships.
        allowed_ids.append(installation.facility_id)
    membership.facilities.set(allowed_ids)
    return {"success": True}


def _get_model_for_table(table_name: str):
    """Resolve a Django model class from a table name like 'app_model'."""
    try:
        for model in apps.get_models():
            if model._meta.db_table == table_name:
                return model
    except LookupError:
        pass
    return None


def _resolve_facility(user):
    """Resolve facility from the authenticated user's staff profile."""
    profile = getattr(user, "staff_profile", None)
    if profile:
        return profile.primary_facility
    return None


def _resolve_organization(user):
    """Resolve organization from the authenticated user's staff profile."""
    profile = getattr(user, "staff_profile", None)
    if profile:
        return profile.organization
    return None


def _resolve_facility_from_request(request):
    """Resolve facility from either hub license identity or authenticated user."""
    installation = getattr(request, "_hub_installation", None)
    if installation:
        return installation.facility
    return _resolve_facility(request.user)


def _resolve_organization_from_request(request):
    """Resolve organization from either hub license identity or authenticated user."""
    installation = getattr(request, "_hub_installation", None)
    if installation:
        return installation.organization
    return _resolve_organization(request.user)


def _model_label_to_model(model_label: str):
    """Resolve a registry label like patients.Patient to a model class."""
    app_label, model_name = model_label.split(".", 1)
    return apps.get_model(app_label, model_name)


def _scope_snapshot_queryset(model_label: str, qs, *, facility, organization):
    """Scope a full cloud-to-hub snapshot query to the hub tenant."""
    if model_label == "core.Organization":
        return qs.filter(pk=organization.pk) if organization else qs.none()
    if model_label == "core.Facility":
        return qs.filter(organization=organization) if organization else qs.none()
    if model_label == "auth.User":
        if not organization:
            return qs.none()

        scoped_filters = models.Q(staff_profile__organization=organization)
        if facility:
            # Include users referenced by facility-scoped clinical rows even when
            # they do not have a staff profile (legacy/imported users).
            scoped_filters |= models.Q(diagnoses_made__encounter__facility=facility)
            scoped_filters |= models.Q(lab_orders__facility=facility)
            scoped_filters |= models.Q(created_encounters__facility=facility)
            scoped_filters |= models.Q(imaging_orders__encounter__facility=facility)
            scoped_filters |= models.Q(
                radiology_reports__imaging_order__encounter__facility=facility
            )
            scoped_filters |= models.Q(entered_results__order_item__lab_order__facility=facility)
            scoped_filters |= models.Q(invoices_created__facility=facility)
            scoped_filters |= models.Q(payments_received__invoice__facility=facility)
            scoped_filters |= models.Q(admissions_processed__facility=facility)
            scoped_filters |= models.Q(assigned_clinic_visits__facility=facility)
            scoped_filters |= models.Q(registered_clinic_visits__facility=facility)

        return qs.filter(scoped_filters).distinct()

    if model_label in {
        "encounters.ICD10Code",
        "pharmacy.Drug",
        "billing.ServiceCategory",
        "billing.Service",
        "clinical_templates.ClinicalTemplate",
    }:
        # Global/reference datasets are intentionally shared across tenants.
        return qs
    if model_label == "patients.EmergencyContact":
        if organization:
            return qs.filter(patient__organization=organization)
        return qs.none()
    parent_filters = {
        "encounters.Diagnosis": "encounter__facility",
        "encounters.TreatmentPlan": "encounter__facility",
        # Medication's parent is TreatmentPlan (no direct ``encounter`` FK), so
        # the scope hop is treatment_plan -> encounter -> facility.
        "encounters.Medication": "treatment_plan__encounter__facility",
        "triage.TriageAssessment": "encounter__facility",
        "clinics.ClinicRoom": "clinic__facility",
        "clinics.ClinicSchedule": "clinic__facility",
        "clinics.ClinicStaff": "clinic__facility",
        "clinics.ClinicEnrollment": "clinic__facility",
        "scheduling.Schedule": "resource__facility",
        "scheduling.ScheduleBreak": "schedule__resource__facility",
        "scheduling.StaffConstraint": "staff_resource__facility",
        "pharmacy.PrescriptionItem": "prescription__facility",
        "laboratory.LabOrderItem": "lab_order__facility",
        "laboratory.LabResult": "order_item__lab_order__facility",
        "billing.InvoiceItem": "invoice__facility",
        "billing.Payment": "invoice__facility",
        "inpatient.Bed": "ward__facility",
        "imaging.ImagingOrder": "encounter__facility",
        "imaging.RadiologyReport": "imaging_order__encounter__facility",
    }
    parent_filter = parent_filters.get(model_label)
    if parent_filter and facility:
        return qs.filter(**{parent_filter: facility})

    model = qs.model
    if hasattr(model, "organization") and organization:
        return qs.filter(organization=organization)
    if hasattr(model, "facility") and facility:
        return qs.filter(facility=facility)
    if hasattr(model, "registered_at_facility") and organization:
        return qs.filter(organization=organization)
    return qs.none()


def _ordered_snapshot_tables(tables: set[str]) -> list[str]:
    """Return snapshot tables in dependency order."""

    def sort_key(model_label: str):
        entry = get_registry_entry(model_label)
        return (entry.priority if entry else 999, model_label)

    ordered = sorted(tables, key=sort_key)
    remaining = set(ordered)
    topo_sorted: list[str] = []

    while remaining:
        progressed = False
        for model_label in ordered:
            if model_label not in remaining:
                continue
            dependencies = FULL_PULL_DEPENDENCIES.get(model_label, set())
            unmet = dependencies & remaining
            if unmet:
                continue
            topo_sorted.append(model_label)
            remaining.remove(model_label)
            progressed = True

        if progressed:
            continue

        # Cycle or unknown dependency chain among selected tables.
        # Fall back to deterministic priority order for the remaining nodes.
        topo_sorted.extend(sorted(remaining, key=sort_key))
        break

    return topo_sorted


def _build_downward_snapshot_changes(
    *, tables: set[str], facility, organization, limit: int, cursor: int = 0
):
    """Build a current-state snapshot for full cloud-to-hub sync pulls."""
    items = []
    now = timezone.now()
    skipped = 0

    logger.info(
        "Building downward full-pull snapshot (cursor=%s, limit=%s, tables=%s).",
        cursor,
        limit,
        len(tables),
    )

    for model_label in _ordered_snapshot_tables(tables):
        model_started_at = time.perf_counter()
        entry = get_registry_entry(model_label)
        if entry is None:
            continue

        try:
            model = _model_label_to_model(model_label)
        except LookupError:
            logger.warning("Skipping unresolvable sync model %s.", model_label)
            continue

        pk_name = model._meta.pk.name if model._meta.pk is not None else "pk"

        try:
            qs = _scope_snapshot_queryset(
                model_label,
                model.objects.all(),
                facility=facility,
                organization=organization,
            ).order_by(pk_name)

            # Eagerly load FK relations used by serialize_instance_for_sync /
            # _with_relation_hints. Without this, serializing 1000 rows can
            # trigger thousands of individual SELECTs (N+1) and easily
            # exceed the hub's HTTP read timeout.
            fk_fields = [
                f.name
                for f in model._meta.concrete_fields
                if getattr(f, "many_to_one", False) or getattr(f, "one_to_one", False)
            ]
            if fk_fields:
                qs = qs.select_related(*fk_fields)
        except (DatabaseError, LookupError, TypeError, ValueError):
            logger.exception("Failed to build queryset for %s; skipping model.", model_label)
            continue

        # Cheaply count the rows for this model so we can skip entire tables
        # without fetching their rows from the database. This is critical for
        # cursor-based resumption — without it, a request at cursor=10000
        # would refetch and deserialize 10000 rows just to discard them.
        table_count = None
        try:
            table_count = qs.count()
        except DatabaseError:
            # Some tenant-scoped tables (notably auth.User with many reverse
            # relation predicates) can trigger expensive COUNT plans that spill
            # to Postgres temp files. Falling back to streaming traversal keeps
            # the pull functional under tight DB temp-disk quotas.
            logger.warning(
                "Failed to count %s for downward snapshot; falling back to streaming pagination.",
                model_label,
            )

        logger.info(
            "Full-pull snapshot table %s count=%s skipped=%s cursor=%s.",
            model_label,
            table_count if table_count is not None else "streaming",
            skipped,
            cursor,
        )

        use_streaming_fallback = table_count is None
        if use_streaming_fallback:
            offset_in_table = max(0, cursor - skipped)
            qs_to_emit = qs
        else:
            if skipped + table_count <= cursor:
                # Entire table lies before the cursor; advance and move on.
                skipped += table_count
                continue

            # Slice past any prefix of this table that the cursor has already
            # consumed. After this, every row we touch should be emitted.
            offset_in_table = max(0, cursor - skipped)
            skipped = max(skipped, cursor)
            qs_to_emit = qs[offset_in_table:] if offset_in_table else qs

        # Iterate defensively: a single corrupt row (bad JSONField, invalid
        # DateField, missing FK target) raised here would otherwise crash the
        # entire /api/sync/pull/ endpoint with a 500.
        iterator = qs_to_emit.iterator() if use_streaming_fallback else iter(qs_to_emit)

        streamed_rows = 0
        while True:
            try:
                instance = next(iterator)
            except StopIteration:
                break
            except DatabaseError:
                logger.exception(
                    "Failed to fetch next %s row for downward snapshot; aborting model.",
                    model_label,
                )
                break

            streamed_rows += 1
            if use_streaming_fallback and streamed_rows <= offset_in_table:
                continue

            try:
                data = serialize_instance_for_sync(instance, exclude_fields=entry.exclude_fields)
                data = add_sync_meta(data, direction=entry.direction, priority=entry.priority)
            except (TypeError, ValueError, AttributeError):
                logger.exception(
                    "Failed to serialize %s pk=%s for downward snapshot; skipping.",
                    model_label,
                    getattr(instance, "pk", None),
                )
                continue

            timestamp = (
                getattr(instance, "updated_at", None)
                or getattr(instance, "created_at", None)
                or now
            )
            items.append(
                {
                    "table": model_label,
                    "operation": "CREATE",
                    "record_id": instance.pk,
                    "data": data,
                    "timestamp": timestamp,
                    "server_sequence": cursor + len(items) + 1,
                }
            )
            if len(items) > limit:
                logger.info(
                    "Full-pull snapshot page filled at %s after %.2fs (items=%s).",
                    model_label,
                    time.perf_counter() - model_started_at,
                    len(items),
                )
                return items[:limit], True

        if use_streaming_fallback and skipped < cursor:
            skipped += min(streamed_rows, cursor - skipped)

        logger.info(
            "Full-pull snapshot table %s processed in %.2fs (items=%s).",
            model_label,
            time.perf_counter() - model_started_at,
            len(items),
        )

    return items[:limit], len(items) > limit


def _broadcast_sync_changes(facility_id: int, changes: list, client_id: str):
    """
    Broadcast accepted sync changes to all WebSocket clients in the facility group.

    This is fire-and-forget: failures are logged but never block the HTTP response.
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        group_name = f"sync_{facility_id}"
        broadcast_payload = {
            "type": "sync_broadcast",
            "source_client_id": client_id,
            "changes": [
                {
                    "table": c.get("table"),
                    "operation": c.get("operation"),
                    "record_id": c.get("record_id"),
                    "data": c.get("data"),
                }
                for c in changes
            ],
            "server_timestamp": timezone.now().isoformat(),
        }

        async_to_sync(channel_layer.group_send)(group_name, broadcast_payload)
    except (RuntimeError, TypeError, ValueError):
        logger.exception("Failed to broadcast sync changes to facility %s", facility_id)


@extend_schema(
    request=SyncPushRequestSerializer,
    responses={
        200: inline_serializer(
            name="SyncPushResponse",
            fields={
                "accepted": serializers.IntegerField(),
                "rejected": serializers.IntegerField(),
                "conflicts": serializers.ListField(child=serializers.DictField()),
                "rejections": serializers.ListField(child=serializers.DictField()),
                "server_timestamp": serializers.DateTimeField(),
            },
        )
    },
)
@api_view(["POST"])
@authentication_classes([HubLicenseOrJWTAuthentication])
@permission_classes([IsAuthenticatedOrHubLicense])
@throttle_classes([])
def sync_push(request):
    """
    Accept a batch of changes from a client device.

    Each change is validated, checked for conflicts, and queued.
    Returns counts of accepted/rejected/conflicted entries.
    """
    serializer = SyncPushRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    changes = serializer.validated_data["changes"]
    client_id = serializer.validated_data["client_id"]

    facility = _resolve_facility_from_request(request)
    organization = _resolve_organization_from_request(request)

    accepted = 0
    rejections = []
    conflicts = []
    broadcast_changes = []

    batch_size = getattr(settings, "SYNC_BATCH_SIZE", 100)
    if len(changes) > batch_size:
        return Response(
            {"detail": f"Batch size exceeds maximum of {batch_size}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        for idx, change in enumerate(changes):
            table = change["table"]
            operation = change["operation"]
            record_id = change.get("record_id")
            data = change["data"]
            timestamp = change["timestamp"]

            if table in HUB_IDENTITY_TABLES:
                result = _apply_hub_identity_change(
                    table=table,
                    operation=operation,
                    record_id=record_id,
                    data=data,
                    installation=getattr(request, "_hub_installation", None),
                )
                if result.get("success"):
                    accepted += 1
                else:
                    rejection = {
                        "index": idx,
                        "table": table,
                        "record_id": record_id,
                        "reason": result.get("reason", "Identity sync failed."),
                    }
                    # Propagate soft-failure code so the hub keeps the entry
                    # PENDING and retries on the next push cycle.
                    if result.get("code"):
                        rejection["code"] = result["code"]
                    rejections.append(rejection)
                continue

            # Validate table is syncable
            if table not in SYNCABLE_TABLES and not is_upward_sync_model(table):
                rejections.append(
                    {
                        "index": idx,
                        "table": table,
                        "record_id": record_id,
                        "reason": f"Table '{table}' is not syncable.",
                    }
                )
                continue

            # For UPDATE/DELETE, check for conflicts
            if operation in ("UPDATE", "DELETE") and record_id:
                existing_entry = (
                    SyncQueue.objects.filter(
                        model_name=table,
                        record_id=record_id,
                        status="SYNCED",
                    )
                    .order_by("-synced_at")
                    .first()
                )

                if (
                    existing_entry
                    and existing_entry.synced_at
                    and existing_entry.synced_at > timestamp
                ):
                    # Conflict: server has newer data
                    conflict = SyncConflict.objects.create(
                        model_name=table,
                        record_id=record_id,
                        local_data=data,
                        remote_data=existing_entry.data,
                        resolution_strategy="LAST_WRITE_WINS",
                        status="PENDING",
                    )
                    conflicts.append(
                        {
                            "index": idx,
                            "table": table,
                            "record_id": record_id,
                            "conflict_id": conflict.pk,
                            "local_data": data,
                            "remote_data": existing_entry.data,
                        }
                    )
                    continue

            # Queue the change
            SyncQueue.objects.create(
                operation=operation,
                model_name=table,
                record_id=int(record_id) if record_id and record_id.isdigit() else None,
                data={
                    **data,
                    "_client_id": client_id,
                    "_client_timestamp": timestamp.isoformat(),
                },
                status="PENDING",
                facility=facility,
                organization=organization,
            )
            accepted += 1
            broadcast_changes.append(change)

    # Broadcast accepted changes to other LAN clients via WebSocket
    if broadcast_changes and facility:
        _broadcast_sync_changes(
            facility_id=facility.pk,
            changes=broadcast_changes,
            client_id=client_id,
        )

    response_data = {
        "accepted": accepted,
        "rejected": len(rejections),
        "conflicts": conflicts,
        "rejections": rejections,
        "server_timestamp": timezone.now(),
    }
    return Response(response_data, status=status.HTTP_200_OK)


@extend_schema(
    request=None,
    responses={
        200: inline_serializer(
            name="SyncPullResponse",
            fields={
                "changes": serializers.ListField(child=serializers.DictField()),
                "entries": serializers.ListField(child=serializers.DictField()),
                "server_timestamp": serializers.DateTimeField(),
                "has_more": serializers.BooleanField(),
                "next_cursor": serializers.CharField(allow_null=True, required=False),
            },
        )
    },
)
@api_view(["GET"])
@authentication_classes([HubLicenseOrJWTAuthentication])
@permission_classes([IsAuthenticatedOrHubLicense])
@throttle_classes([])
def sync_pull(request):
    """
    Return changes since a given timestamp for the client's facility.

    Query parameters:
    - since: ISO timestamp (required unless full=true)
    - full: If 'true', return all records (for full re-sync)
    - tables: Comma-separated list of tables to pull (optional, defaults to all)
    - limit: Max records to return (default 500)
    """
    facility = _resolve_facility_from_request(request)
    organization = _resolve_organization_from_request(request)

    since = request.query_params.get("since")
    full = request.query_params.get("full", "").lower() == "true"
    direction = request.query_params.get("direction", "").lower()
    tables_param = request.query_params.get("tables", "")
    requested_limit = min(int(request.query_params.get("limit", "500")), 1000)
    limit = (
        min(requested_limit, DOWNWARD_FULL_PULL_PAGE_LIMIT)
        if direction == "down" and full
        else requested_limit
    )
    cursor = max(int(request.query_params.get("cursor", "0")), 0)

    if not since and not full:
        return Response(
            {"detail": "Either 'since' parameter or 'full=true' is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Filter to requested tables (or all syncable)
    allowed_tables = downward_sync_models() if direction == "down" else SYNCABLE_TABLES
    requested_tables = {table.strip() for table in tables_param.split(",") if table.strip()}
    tables = requested_tables & allowed_tables if requested_tables else allowed_tables

    if direction == "down" and full:
        changes, has_more = _build_downward_snapshot_changes(
            tables=tables,
            facility=facility,
            organization=organization,
            limit=limit,
            cursor=cursor,
        )
        return Response(
            {
                "changes": changes,
                "entries": changes,
                "server_timestamp": timezone.now(),
                "has_more": has_more,
                "next_cursor": str(cursor + len(changes)) if has_more and changes else None,
            },
            status=status.HTTP_200_OK,
        )

    # Build queryset
    qs = SyncQueue.objects.filter(
        model_name__in=tables,
        status="SYNCED",
    )

    # Scope to facility/org
    if facility:
        qs = qs.filter(facility=facility)
    elif organization:
        qs = qs.filter(organization=organization)

    # Filter by time
    if since and not full:
        from django.utils.dateparse import parse_datetime

        since_dt = parse_datetime(since)
        if not since_dt:
            return Response(
                {"detail": "Invalid 'since' timestamp format. Use ISO 8601."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = qs.filter(synced_at__gt=since_dt)

    # Order and paginate
    qs = qs.order_by("id")
    entries = list(qs[: limit + 1])
    has_more = len(entries) > limit
    entries = entries[:limit]

    changes = []
    for entry in entries:
        record_id = entry.record_id if direction == "down" else str(entry.record_id)
        changes.append(
            {
                "table": entry.model_name,
                "operation": entry.operation,
                "record_id": record_id if entry.record_id else None,
                "data": entry.data,
                "timestamp": entry.synced_at or entry.created_at,
                "server_sequence": entry.pk,
            }
        )

    response_data = {
        "changes": changes,
        "entries": changes,
        "server_timestamp": timezone.now(),
        "has_more": has_more,
        "next_cursor": str(entries[-1].pk) if has_more and entries else None,
    }
    return Response(response_data, status=status.HTTP_200_OK)


@extend_schema(
    request=None,
    responses={
        200: inline_serializer(
            name="SyncStatusResponse",
            fields={
                "last_sync": serializers.DateTimeField(allow_null=True, required=False),
                "pending_changes": serializers.IntegerField(),
                "failed_changes": serializers.IntegerField(),
                "conflicts": serializers.IntegerField(),
                "server_timestamp": serializers.DateTimeField(),
            },
        )
    },
)
@api_view(["GET"])
@authentication_classes([HubLicenseOrJWTAuthentication])
@permission_classes([IsAuthenticatedOrHubLicense])
@throttle_classes([])
def sync_status(request):
    """Return sync health/status for the client's facility."""
    facility = _resolve_facility_from_request(request)
    organization = _resolve_organization_from_request(request)

    qs = SyncQueue.objects.all()
    if facility:
        qs = qs.filter(facility=facility)
    elif organization:
        qs = qs.filter(organization=organization)

    last_synced = qs.filter(status="SYNCED").order_by("-synced_at").first()
    pending_count = qs.filter(status="PENDING").count()
    failed_count = qs.filter(status="FAILED").count()

    conflict_count = SyncConflict.objects.filter(status="PENDING").count()

    response_data = {
        "last_sync": last_synced.synced_at if last_synced else None,
        "pending_changes": pending_count,
        "failed_changes": failed_count,
        "conflicts": conflict_count,
        "server_timestamp": timezone.now(),
    }
    return Response(response_data, status=status.HTTP_200_OK)


@extend_schema(request=SyncConflictResolveSerializer, responses={200: SyncConflictDetailSerializer})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_resolve_conflict(request):
    """
    Resolve a sync conflict.

    Body: { conflict_id, resolution: "local_wins"|"remote_wins"|"merge", merged_data?: {} }
    """
    serializer = SyncConflictResolveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    conflict_id = serializer.validated_data["conflict_id"]
    resolution = serializer.validated_data["resolution"]
    merged_data = serializer.validated_data.get("merged_data", {})

    try:
        conflict = SyncConflict.objects.get(pk=conflict_id, status="PENDING")
    except SyncConflict.DoesNotExist:
        return Response(
            {"detail": "Conflict not found or already resolved."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Map resolution to strategy
    strategy_map = {
        "local_wins": "LOCAL_WINS",
        "remote_wins": "REMOTE_WINS",
        "merge": "MERGED",
    }

    if resolution == "local_wins":
        resolved_data = conflict.local_data
    elif resolution == "remote_wins":
        resolved_data = conflict.remote_data
    else:
        if not merged_data:
            return Response(
                {"detail": "merged_data is required for 'merge' resolution."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        resolved_data = merged_data

    conflict.resolve(
        resolved_data=resolved_data,
        strategy=strategy_map[resolution],
        user=request.user,
    )

    return Response(
        SyncConflictDetailSerializer(conflict).data,
        status=status.HTTP_200_OK,
    )


@extend_schema(
    request=None,
    responses={
        200: inline_serializer(
            name="SyncConflictsListResponse",
            fields={
                "results": SyncConflictDetailSerializer(many=True),
                "count": serializers.IntegerField(),
                "limit": serializers.IntegerField(),
                "offset": serializers.IntegerField(),
            },
        )
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sync_conflicts_list(request):
    """List unresolved sync conflicts."""
    conflicts = SyncConflict.objects.filter(status="PENDING").order_by("-detected_at")

    # Pagination
    limit = min(int(request.query_params.get("limit", "50")), 200)
    offset = int(request.query_params.get("offset", "0"))

    total = conflicts.count()
    page = conflicts[offset : offset + limit]

    return Response(
        {
            "results": SyncConflictDetailSerializer(page, many=True).data,
            "count": total,
            "limit": limit,
            "offset": offset,
        }
    )


@extend_schema(
    request=None,
    responses={
        200: inline_serializer(
            name="SyncDashboardResponse",
            fields={
                "queue_summary": serializers.DictField(),
                "throughput": serializers.DictField(),
                "health": serializers.DictField(),
                "conflicts": serializers.DictField(),
                "server_timestamp": serializers.DateTimeField(),
            },
        )
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sync_dashboard(request):
    """
    Sync health dashboard for admin UI.

    Returns:
    - queue_summary: counts by status (PENDING, SYNCING, SYNCED, FAILED, CONFLICT)
    - conflict_summary: counts by model_name, top unresolved conflicts
    - throughput: entries synced in last hour/day
    - stale_entries: entries stuck in PENDING > 1 hour
    """
    from datetime import timedelta

    from django.db.models import Count

    facility = _resolve_facility(request.user)
    organization = _resolve_organization(request.user)

    qs = SyncQueue.objects.all()
    if facility:
        qs = qs.filter(facility=facility)
    elif organization:
        qs = qs.filter(organization=organization)

    now = timezone.now()
    one_hour_ago = now - timedelta(hours=1)
    one_day_ago = now - timedelta(days=1)

    # Queue summary by status
    queue_summary = dict(
        qs.values("status").annotate(count=Count("id")).values_list("status", "count")
    )

    # Throughput
    synced_last_hour = qs.filter(status="SYNCED", synced_at__gte=one_hour_ago).count()
    synced_last_day = qs.filter(status="SYNCED", synced_at__gte=one_day_ago).count()

    # Stale entries (pending > 1 hour)
    stale_count = qs.filter(status="PENDING", created_at__lt=one_hour_ago).count()

    # High-retry entries (retry_count >= 5)
    high_retry = qs.filter(
        status__in=["PENDING", "FAILED"],
        retry_count__gte=5,
    ).count()

    # Conflict summary by model
    conflict_qs = SyncConflict.objects.filter(status="PENDING")
    conflict_by_model = list(
        conflict_qs.values("model_name").annotate(count=Count("id")).order_by("-count")[:10]
    )

    # Recent conflicts (last 10)
    recent_conflicts = SyncConflictDetailSerializer(
        conflict_qs.order_by("-detected_at")[:10], many=True
    ).data

    return Response(
        {
            "queue_summary": {
                "PENDING": queue_summary.get("PENDING", 0),
                "SYNCING": queue_summary.get("SYNCING", 0),
                "SYNCED": queue_summary.get("SYNCED", 0),
                "FAILED": queue_summary.get("FAILED", 0),
                "CONFLICT": queue_summary.get("CONFLICT", 0),
            },
            "throughput": {
                "synced_last_hour": synced_last_hour,
                "synced_last_day": synced_last_day,
            },
            "health": {
                "stale_entries": stale_count,
                "high_retry_entries": high_retry,
            },
            "conflicts": {
                "total_pending": conflict_qs.count(),
                "by_model": conflict_by_model,
                "recent": recent_conflicts,
            },
            "server_timestamp": now,
        }
    )
