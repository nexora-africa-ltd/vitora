import uuid

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0079_facility_level_subtype"),
        ("inpatient", "0046_dischargedraft"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="InterFacilityTransfer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "public_id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        help_text="Stable UUID for transfer workflow references.",
                        unique=True,
                    ),
                ),
                (
                    "transfer_number",
                    models.CharField(
                        blank=True,
                        db_index=True,
                        help_text="Auto-generated transfer number (IFT-YYYYMMDD-XXXX).",
                        max_length=30,
                        unique=True,
                    ),
                ),
                (
                    "destination_facility_name",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="Fallback destination facility name when not mapped in-system.",
                        max_length=255,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "Draft"),
                            ("PENDING_ACCEPTANCE", "Pending Acceptance"),
                            ("ACCEPTED", "Accepted"),
                            ("REJECTED", "Rejected"),
                            ("IN_TRANSIT", "In Transit"),
                            ("ARRIVED", "Arrived"),
                            ("CANCELLED", "Cancelled"),
                        ],
                        default="DRAFT",
                        max_length=24,
                    ),
                ),
                (
                    "priority",
                    models.CharField(
                        choices=[("ROUTINE", "Routine"), ("URGENT", "Urgent"), ("STAT", "STAT")],
                        default="ROUTINE",
                        max_length=12,
                    ),
                ),
                (
                    "reason_code",
                    models.CharField(
                        choices=[
                            ("HIGHER_LEVEL_CARE", "Higher-level Care"),
                            ("SPECIALIST_INPUT", "Specialist Input"),
                            ("NO_CAPACITY", "No Bed/Service Capacity"),
                            ("EQUIPMENT_LIMITATION", "Equipment Limitation"),
                            ("PATIENT_REQUEST", "Patient/Family Request"),
                            ("OTHER", "Other"),
                        ],
                        max_length=32,
                    ),
                ),
                ("reason_details", models.TextField(blank=True, default="")),
                ("clinical_summary", models.TextField(blank=True, default="")),
                ("handover_notes", models.TextField(blank=True, default="")),
                (
                    "transport_mode",
                    models.CharField(
                        choices=[
                            ("AMBULANCE", "Ambulance"),
                            ("PRIVATE", "Private Vehicle"),
                            ("OTHER", "Other"),
                        ],
                        default="AMBULANCE",
                        max_length=20,
                    ),
                ),
                ("escort_required", models.BooleanField(default=False)),
                ("escort_name", models.CharField(blank=True, default="", max_length=255)),
                ("accepted_at", models.DateTimeField(blank=True, null=True)),
                ("dispatched_at", models.DateTimeField(blank=True, null=True)),
                ("arrived_at", models.DateTimeField(blank=True, null=True)),
                ("cancelled_at", models.DateTimeField(blank=True, null=True)),
                ("rejection_reason", models.TextField(blank=True, default="")),
                ("cancellation_reason", models.TextField(blank=True, default="")),
                (
                    "accepted_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="interfacility_transfer_acceptances",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "arrived_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="interfacility_transfer_arrivals",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "cancelled_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="interfacility_transfer_cancellations",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "destination_facility",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.PROTECT,
                        related_name="incoming_interfacility_transfers",
                        to="core.facility",
                    ),
                ),
                (
                    "dispatched_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="interfacility_transfer_dispatches",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=models.PROTECT,
                        related_name="interfacility_transfers",
                        to="patients.patient",
                    ),
                ),
                (
                    "requested_by",
                    models.ForeignKey(
                        on_delete=models.PROTECT,
                        related_name="interfacility_transfer_requests",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "source_admission",
                    models.ForeignKey(
                        help_text="Admission being transferred out.",
                        on_delete=models.CASCADE,
                        related_name="interfacility_transfers",
                        to="inpatient.admission",
                    ),
                ),
                (
                    "source_discharge",
                    models.OneToOneField(
                        blank=True,
                        help_text="Linked discharge event once transfer-out is finalized.",
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="interfacility_transfer",
                        to="inpatient.discharge",
                    ),
                ),
                (
                    "source_facility",
                    models.ForeignKey(
                        on_delete=models.PROTECT,
                        related_name="outgoing_interfacility_transfers",
                        to="core.facility",
                    ),
                ),
            ],
            options={
                "verbose_name": "Inter-facility Transfer",
                "verbose_name_plural": "Inter-facility Transfers",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="interfacilitytransfer",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    status__in=["DRAFT", "PENDING_ACCEPTANCE", "ACCEPTED", "IN_TRANSIT"]
                ),
                fields=("source_admission",),
                name="unique_open_interfacility_transfer_per_admission",
            ),
        ),
    ]
