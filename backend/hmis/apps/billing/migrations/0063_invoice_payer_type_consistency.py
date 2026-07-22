from django.db import migrations, models


def backfill_invoice_payer_type(apps, schema_editor):
    Invoice = apps.get_model("billing", "Invoice")
    SHAClaim = apps.get_model("billing", "SHAClaim")

    sha_invoice_ids = set(
        SHAClaim.objects.filter(invoice_id__isnull=False).values_list("invoice_id", flat=True)
    )

    for invoice in Invoice.objects.all().iterator(chunk_size=1000):
        has_sha_link = invoice.id in sha_invoice_ids or bool((invoice.sha_claim_number or "").strip())
        provider = (invoice.insurance_provider or "").strip().upper()
        payment_type = (invoice.payment_type or "").strip().lower()

        if has_sha_link:
            payer_type = "sha"
        elif payment_type == "corporate":
            payer_type = "corporate"
        elif payment_type == "insurance":
            payer_type = "sha" if provider in {"SHA", "SOCIAL HEALTH AUTHORITY"} else "private_insurance"
        elif payment_type == "mixed":
            payer_type = "mixed"
        else:
            payer_type = "cash"

        if invoice.payer_type != payer_type:
            Invoice.objects.filter(pk=invoice.pk).update(payer_type=payer_type)


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0062_shaclaimitem_allocation_status_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoice",
            name="payer_type",
            field=models.CharField(
                choices=[
                    ("cash", "Cash / Self-Pay"),
                    ("sha", "SHA (Social Health Authority)"),
                    ("private_insurance", "Private Insurance"),
                    ("corporate", "Corporate Account"),
                    ("mixed", "Mixed / Split Responsibility"),
                ],
                default="cash",
                max_length=24,
            ),
        ),
        migrations.RunPython(backfill_invoice_payer_type, migrations.RunPython.noop),
    ]
