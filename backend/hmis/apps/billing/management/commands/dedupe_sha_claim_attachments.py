# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove duplicate SHA claim attachments using checksum/content signatures.

How to run:
    python manage.py dedupe_sha_claim_attachments [--claim-id ID] [--commit]

Arguments:
    None.

Options:
    --claim-id (int): Limit processing to a single ``SHAClaim`` ID.
    --commit: Apply deletions. If omitted, command runs in dry-run mode.

Behavior notes:
- Duplicate detection prefers stored checksum, then file-content hash, then
  filename/mime/size fallback signature.
- Default mode is dry-run and prints what would be deleted.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment


@dataclass
class _Candidate:
    attachment: SHAClaimAttachment
    signature: str


class Command(BaseCommand):
    """Django command entrypoint for SHA attachment deduplication."""

    help = "Remove duplicate SHA claim attachments (checksum/content-based dedupe)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--claim-id",
            type=int,
            default=None,
            help="Only process a single SHA claim ID",
        )
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Apply deletion (default is dry-run)",
        )

    def handle(self, *args, **options):
        claim_id = options.get("claim_id")
        commit = bool(options.get("commit"))

        claims_qs = SHAClaim.objects.all().order_by("id")
        if claim_id is not None:
            claims_qs = claims_qs.filter(id=claim_id)
            if not claims_qs.exists():
                raise CommandError(f"Claim {claim_id} not found")

        mode = "COMMIT" if commit else "DRY-RUN"
        self.stdout.write(f"SHA attachment dedupe mode: {mode}")

        total_claims = 0
        total_attachments = 0
        total_duplicates = 0
        total_deleted = 0

        for claim in claims_qs.iterator(chunk_size=200):
            total_claims += 1
            attachments = list(claim.attachments.all().order_by("created_at", "id"))
            if not attachments:
                continue

            total_attachments += len(attachments)

            seen: set[str] = set()
            duplicates: list[SHAClaimAttachment] = []
            for attachment in attachments:
                signature = self._signature_for_attachment(attachment)
                candidate = _Candidate(attachment=attachment, signature=signature)
                if candidate.signature in seen:
                    duplicates.append(candidate.attachment)
                else:
                    seen.add(candidate.signature)

            if not duplicates:
                continue

            total_duplicates += len(duplicates)
            self.stdout.write(
                f"Claim {claim.id} ({claim.claim_number}): {len(duplicates)} duplicate attachment(s)"
            )

            if not commit:
                continue

            for duplicate in duplicates:
                file_name = str(getattr(duplicate.file, "name", "") or "")
                if file_name:
                    duplicate.file.delete(save=False)
                duplicate.delete()
                total_deleted += 1

        self.stdout.write("")
        self.stdout.write(f"Claims scanned: {total_claims}")
        self.stdout.write(f"Attachments scanned: {total_attachments}")
        self.stdout.write(f"Duplicates found: {total_duplicates}")
        if commit:
            self.stdout.write(self.style.SUCCESS(f"Duplicates deleted: {total_deleted}"))
        else:
            self.stdout.write(
                self.style.WARNING(
                    "Dry-run only. Re-run with --commit to delete detected duplicates."
                )
            )

    def _signature_for_attachment(self, attachment: SHAClaimAttachment) -> str:
        checksum = str(getattr(attachment, "checksum", "") or "").strip().lower()
        if checksum:
            return checksum

        file_obj = getattr(attachment, "file", None)
        if file_obj:
            try:
                file_obj.open("rb")
                try:
                    content = file_obj.read()
                finally:
                    file_obj.close()
                if content:
                    return hashlib.sha256(content).hexdigest()
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
                pass

        filename = str(getattr(attachment, "original_filename", "") or "").strip().lower()
        if not filename:
            filename = str(getattr(file_obj, "name", "") or "").strip().lower()
        mime = str(getattr(attachment, "mime_type", "") or "").strip().lower()
        size = str(getattr(attachment, "file_size", "") or "")
        return f"{filename}:{mime}:{size}".strip(":")
