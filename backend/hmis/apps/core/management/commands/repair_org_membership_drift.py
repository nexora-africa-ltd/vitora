# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Repair StaffProfile <-> OrgMembership drift.

This command detects staff profiles that have ``StaffProfile.organization`` set
but are missing a corresponding ``OrgMembership`` row for that organization,
then optionally creates the missing memberships.

It can also repair inverse drift where a staff profile has active memberships
but ``StaffProfile.organization`` is null or points to an organization that is
not represented by the active memberships.

Usage:
    python manage.py repair_org_membership_drift
    python manage.py repair_org_membership_drift --apply
    python manage.py repair_org_membership_drift --mode inverse --apply
    python manage.py repair_org_membership_drift --mode both --apply
    python manage.py repair_org_membership_drift --apply --organization-id 12
    python manage.py repair_org_membership_drift --staff-profile-id 345

Arguments:
    --apply              Persist repairs. Without this flag, command runs in dry-run mode.
    --mode               forward|inverse|both (default: forward).
    --organization-id    Restrict detection/repair to a single organization ID.
    --staff-profile-id   Restrict detection/repair to one staff profile ID.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F

from hmis.apps.core.models import OrgMembership, StaffProfile


class Command(BaseCommand):
    help = (
        "Detect and repair StaffProfile.organization records that are missing "
        "matching OrgMembership rows."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write changes to DB. Default is dry-run.",
        )
        parser.add_argument(
            "--mode",
            choices=["forward", "inverse", "both"],
            default="forward",
            help="Repair mode: forward (default), inverse, or both.",
        )
        parser.add_argument(
            "--organization-id",
            type=int,
            help="Only process staff profiles for the given organization ID.",
        )
        parser.add_argument(
            "--staff-profile-id",
            type=int,
            help="Only process a single staff profile ID.",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options["apply"])
        mode = options["mode"]
        organization_id = options.get("organization_id")
        staff_profile_id = options.get("staff_profile_id")

        mode_label = "APPLY" if apply_changes else "DRY-RUN"
        self.stdout.write(self.style.WARNING(f"Running in {mode_label} mode"))
        self.stdout.write(f"Repair mode: {mode}")

        if mode in ("forward", "both"):
            self._repair_forward(
                apply_changes=apply_changes,
                organization_id=organization_id,
                staff_profile_id=staff_profile_id,
            )

        if mode in ("inverse", "both"):
            self._repair_inverse(
                apply_changes=apply_changes,
                organization_id=organization_id,
                staff_profile_id=staff_profile_id,
            )

    def _repair_forward(
        self, *, apply_changes: bool, organization_id: int | None, staff_profile_id: int | None
    ):
        self.stdout.write(
            self.style.NOTICE("\n[Forward] StaffProfile.organization -> missing OrgMembership")
        )

        profiles_qs = (
            StaffProfile.objects.select_related(
                "user",
                "organization",
                "primary_role",
                "primary_department",
                "primary_facility",
            )
            .prefetch_related("secondary_facilities")
            .filter(organization__isnull=False)
        )
        if organization_id:
            profiles_qs = profiles_qs.filter(organization_id=organization_id)
        if staff_profile_id:
            profiles_qs = profiles_qs.filter(id=staff_profile_id)

        missing_qs = profiles_qs.exclude(
            memberships__organization_id=F("organization_id")
        ).distinct()

        total_candidates = profiles_qs.count()
        missing_profiles = list(missing_qs)
        missing_count = len(missing_profiles)

        self.stdout.write(
            f"Scanned {total_candidates} staff profiles with organization set. "
            f"Found {missing_count} profile(s) missing OrgMembership."
        )

        if missing_count == 0:
            self.stdout.write(self.style.SUCCESS("No drift detected."))
            return

        would_create = 0
        created = 0
        skipped = 0

        for profile in missing_profiles:
            role = profile.primary_role
            if role is None:
                skipped += 1
                self.stdout.write(
                    self.style.ERROR(
                        f"Skip staff_profile={profile.id}: missing primary_role; cannot create membership."
                    )
                )
                continue

            department = profile.primary_department
            if department and department.organization_id != profile.organization_id:
                department = None

            has_existing_primary = profile.memberships.filter(is_primary=True).exists()
            is_primary = not has_existing_primary

            facility_ids = set()
            if (
                profile.primary_facility_id
                and profile.primary_facility
                and profile.primary_facility.organization_id == profile.organization_id
            ):
                facility_ids.add(profile.primary_facility_id)
            for facility in profile.secondary_facilities.all():
                if facility.organization_id == profile.organization_id:
                    facility_ids.add(facility.id)

            message = (
                f"staff_profile={profile.id} user={profile.user.username!s} "
                f"org={profile.organization_id} role={role.code} "
                f"department={department.id if department else 'None'} "
                f"is_primary={is_primary} facilities={sorted(facility_ids)}"
            )

            if not apply_changes:
                would_create += 1
                self.stdout.write(f"Would create OrgMembership: {message}")
                continue

            with transaction.atomic():
                membership = OrgMembership.objects.create(
                    staff_profile=profile,
                    organization=profile.organization,
                    role=role,
                    department=department,
                    is_primary=is_primary,
                    status=OrgMembership.MembershipStatus.ACTIVE,
                )
                if facility_ids:
                    membership.facilities.set(facility_ids)

            created += 1
            self.stdout.write(self.style.SUCCESS(f"Created OrgMembership: {message}"))

        if apply_changes:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Forward done. Created {created}, skipped {skipped}, total missing {missing_count}."
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"Forward dry-run complete. Would create {would_create}, skipped {skipped}, total missing {missing_count}."
                )
            )

    def _repair_inverse(
        self, *, apply_changes: bool, organization_id: int | None, staff_profile_id: int | None
    ):
        self.stdout.write(
            self.style.NOTICE(
                "\n[Inverse] OrgMembership -> StaffProfile.organization null/mismatched"
            )
        )

        profiles_qs = StaffProfile.objects.select_related("user", "organization").prefetch_related(
            "memberships__organization"
        )
        if staff_profile_id:
            profiles_qs = profiles_qs.filter(id=staff_profile_id)

        scanned = 0
        drifted = 0
        would_update = 0
        updated = 0
        skipped = 0

        for profile in profiles_qs:
            active_memberships = [
                m
                for m in profile.memberships.all()
                if m.status == OrgMembership.MembershipStatus.ACTIVE
            ]
            if not active_memberships:
                continue

            if organization_id and not any(
                m.organization_id == organization_id for m in active_memberships
            ):
                continue

            scanned += 1
            active_org_ids = {m.organization_id for m in active_memberships}
            current_org_id = profile.organization_id

            if current_org_id is not None and current_org_id in active_org_ids:
                continue

            drifted += 1

            primary = next((m for m in active_memberships if m.is_primary), None)
            target_membership = primary or active_memberships[0]
            target_org_id = target_membership.organization_id

            message = (
                f"staff_profile={profile.id} user={profile.user.username!s} "
                f"current_org={current_org_id} -> target_org={target_org_id}"
            )

            if not apply_changes:
                would_update += 1
                self.stdout.write(f"Would update StaffProfile.organization: {message}")
                continue

            try:
                with transaction.atomic():
                    profile.organization_id = target_org_id
                    profile.save(update_fields=["organization"])
                updated += 1
                self.stdout.write(
                    self.style.SUCCESS(f"Updated StaffProfile.organization: {message}")
                )
            except (
                AttributeError,
                TypeError,
                RuntimeError,
                OSError,
                AssertionError,
            ) as exc:  # pragma: no cover - defensive safety path
                skipped += 1
                self.stdout.write(self.style.ERROR(f"Skip {message}; error={exc!s}"))

        if drifted == 0:
            self.stdout.write(self.style.SUCCESS("No inverse drift detected."))
            return

        if apply_changes:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Inverse done. Scanned {scanned}, drifted {drifted}, updated {updated}, skipped {skipped}."
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"Inverse dry-run complete. Scanned {scanned}, drifted {drifted}, would update {would_update}, skipped {skipped}."
                )
            )
