from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0012_add_principal_fk_to_sha_member"),
    ]

    operations = [
        migrations.CreateModel(
            name="PaymentPoint",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("code", models.CharField(help_text="Short unique code (e.g. CASH-01, MPESA-02)", max_length=50, unique=True)),
                ("method", models.CharField(choices=[("cash", "Cash"), ("mpesa", "M-Pesa"), ("card", "Card"), ("bank_transfer", "Bank Transfer"), ("insurance", "Insurance Claim"), ("corporate", "Corporate Account"), ("cheque", "Cheque")], max_length=20)),
                ("till_number", models.CharField(blank=True, help_text="M-Pesa Till number (Buy Goods) for this payment point", max_length=30)),
                ("paybill_number", models.CharField(blank=True, help_text="M-Pesa PayBill number for this payment point", max_length=30)),
                ("paybill_account_number", models.CharField(blank=True, help_text="PayBill account/reference number (if applicable)", max_length=60)),
                ("bank_name", models.CharField(blank=True, max_length=120)),
                ("bank_account_name", models.CharField(blank=True, max_length=120)),
                ("bank_account_number", models.CharField(blank=True, max_length=60)),
                ("bank_branch", models.CharField(blank=True, max_length=120)),
                ("is_active", models.BooleanField(default=True)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=models.deletion.PROTECT,
                        related_name="payment_points_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["method", "name"],
            },
        ),
        migrations.AddIndex(
            model_name="paymentpoint",
            index=models.Index(fields=["method", "is_active"], name="billing_pay_method_7a4d2e_idx"),
        ),
        migrations.AddField(
            model_name="payment",
            name="payment_point",
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.PROTECT, related_name="payments", to="billing.paymentpoint"),
        ),
        migrations.AddIndex(
            model_name="payment",
            index=models.Index(fields=["payment_point"], name="billing_pay_payment_0b3a60_idx"),
        ),
    ]
