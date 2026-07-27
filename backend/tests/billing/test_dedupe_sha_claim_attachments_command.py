from __future__ import annotations

from datetime import date
from decimal import Decimal
from io import StringIO

import pytest
from django.core.files.base import ContentFile
from django.core.management import call_command


def _create_claim(
    sample_patient, sample_encounter, sample_facility, sample_organization, test_user
):
    from hmis.apps.billing.models import SHAClaim, SHAMember

    member = SHAMember.objects.create(
        patient=sample_patient,
        sha_number=f"SHA-CMD-{sample_patient.id}",
        national_id="12345678",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        created_by=test_user,
    )

    return SHAClaim.objects.create(
        patient=sample_patient,
        sha_member=member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today(),
        primary_diagnosis_code="A00",
        primary_diagnosis_description="Cholera",
        claimed_amount=Decimal("5000.00"),
        facility_code=sample_facility.mfl_code,
        organization=sample_organization,
        facility=sample_facility,
        created_by=test_user,
    )


@pytest.mark.django_db
class TestDedupeShaClaimAttachmentsCommand:
    def test_dry_run_does_not_delete_duplicates(
        self,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        test_user,
    ):
        from hmis.apps.billing.models import SHAClaimAttachment

        claim = _create_claim(
            sample_patient,
            sample_encounter,
            sample_facility,
            sample_organization,
            test_user,
        )

        for name in ("dup-a.pdf", "dup-b.pdf"):
            SHAClaimAttachment.objects.create(
                claim=claim,
                attachment_type=SHAClaimAttachment.AttachmentType.CLINICAL_NOTES,
                name=name,
                file=ContentFile(b"same file payload", name=name),
                mime_type="application/pdf",
                checksum="same-checksum",
                uploaded_by=test_user,
            )

        out = StringIO()
        call_command("dedupe_sha_claim_attachments", "--claim-id", str(claim.id), stdout=out)

        assert SHAClaimAttachment.objects.filter(claim=claim).count() == 2
        assert "DRY-RUN" in out.getvalue()
        assert "Duplicates found: 1" in out.getvalue()

    def test_commit_deletes_duplicates(
        self,
        sample_patient,
        sample_encounter,
        sample_facility,
        sample_organization,
        test_user,
    ):
        from hmis.apps.billing.models import SHAClaimAttachment

        claim = _create_claim(
            sample_patient,
            sample_encounter,
            sample_facility,
            sample_organization,
            test_user,
        )

        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type=SHAClaimAttachment.AttachmentType.CLINICAL_NOTES,
            name="dup-a.pdf",
            file=ContentFile(b"same file payload", name="dup-a.pdf"),
            mime_type="application/pdf",
            checksum="same-checksum",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type=SHAClaimAttachment.AttachmentType.CLINICAL_NOTES,
            name="dup-b.pdf",
            file=ContentFile(b"same file payload", name="dup-b.pdf"),
            mime_type="application/pdf",
            checksum="same-checksum",
            uploaded_by=test_user,
        )
        SHAClaimAttachment.objects.create(
            claim=claim,
            attachment_type=SHAClaimAttachment.AttachmentType.MEDICAL_REPORT,
            name="unique.pdf",
            file=ContentFile(b"different payload", name="unique.pdf"),
            mime_type="application/pdf",
            checksum="unique-checksum",
            uploaded_by=test_user,
        )

        out = StringIO()
        call_command(
            "dedupe_sha_claim_attachments",
            "--claim-id",
            str(claim.id),
            "--commit",
            stdout=out,
        )

        remaining = SHAClaimAttachment.objects.filter(claim=claim).order_by("id")
        assert remaining.count() == 2
        assert "Duplicates found: 1" in out.getvalue()
        assert "Duplicates deleted: 1" in out.getvalue()
