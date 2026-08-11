from django.db import migrations, models
import django.db.models.deletion


def backfill_pki_organization(apps, schema_editor):
    UserCertificate = apps.get_model("core", "UserCertificate")
    CertificateAuthority = apps.get_model("core", "CertificateAuthority")

    # Backfill user certificate organization from the user's staff profile first,
    # then from the issuing CA if available.
    certs = UserCertificate.objects.select_related("user", "certificate_authority").all()
    for cert in certs.iterator():
        org_id = None

        user = getattr(cert, "user", None)
        if user is not None:
            profile = getattr(user, "staff_profile", None)
            if profile is not None:
                org_id = getattr(profile, "organization_id", None)

        if org_id is None:
            org_id = getattr(cert.certificate_authority, "organization_id", None)

        if org_id is not None and cert.organization_id != org_id:
            cert.organization_id = org_id
            cert.save(update_fields=["organization"])

    # Backfill intermediate CA organization where all issued certs point
    # to the same organization.
    intermediates = CertificateAuthority.objects.filter(is_root=False, organization__isnull=True)
    for ca in intermediates.iterator():
        org_ids = list(
            UserCertificate.objects.filter(
                certificate_authority_id=ca.id,
                organization__isnull=False,
            )
            .values_list("organization_id", flat=True)
            .distinct()[:2]
        )
        if len(org_ids) == 1:
            ca.organization_id = org_ids[0]
            ca.save(update_fields=["organization"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0083_facility_hdu_nbu_flags"),
    ]

    operations = [
        migrations.AddField(
            model_name="certificateauthority",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Owning organization for tenant-scoped intermediate CAs. Root CAs remain global with organization unset.",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="certificate_authorities",
                to="core.organization",
            ),
        ),
        migrations.AddField(
            model_name="usercertificate",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Owning organization (tenant) for this certificate.",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="user_certificates",
                to="core.organization",
            ),
        ),
        migrations.RunPython(backfill_pki_organization, migrations.RunPython.noop),
        migrations.AddIndex(
            model_name="usercertificate",
            index=models.Index(fields=["organization", "is_revoked"], name="core_userce_organiz_4f466f_idx"),
        ),
        migrations.AddConstraint(
            model_name="certificateauthority",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("is_active", True),
                    ("is_root", False),
                    ("organization__isnull", False),
                ),
                fields=("organization",),
                name="unique_active_intermediate_ca_per_organization",
            ),
        ),
    ]
