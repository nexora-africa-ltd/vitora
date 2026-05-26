# Generated for per-facility AI/CDS gating + quality/private_insurance cascade backfill.

from django.db import migrations, models


STANDALONE_MODES = [
    "STANDALONE_LAB",
    "STANDALONE_PHARMACY",
    "STANDALONE_IMAGING",
    "STANDALONE_DIAGNOSTIC",
]


def backfill_flags(apps, schema_editor):
    """
    1. Force has_quality, has_private_insurance, has_ai_assistant, has_cds to
       False for any facility in a standalone operating mode (cascade fix).
    2. For FULL_HMIS facilities whose org subscription plan includes the
       ai_assistant feature, enable has_ai_assistant + has_cds so existing
       installations don't lose AI access.
    """
    Facility = apps.get_model("core", "Facility")

    # 1) Standalone cascade backfill
    disabled = Facility.objects.filter(operating_mode__in=STANDALONE_MODES).update(
        has_quality=False,
        has_private_insurance=False,
        has_ai_assistant=False,
        has_cds=False,
    )
    if disabled:
        print(
            f"  Disabled quality/private_insurance/ai_assistant/cds for "
            f"{disabled} standalone facility(ies)"
        )

    # 2) Enable AI/CDS for FULL_HMIS facilities whose plan covers ai_assistant
    enabled = 0
    full_hmis = Facility.objects.filter(operating_mode="FULL_HMIS").select_related(
        "organization__subscription_plan"
    )
    for facility in full_hmis:
        org = facility.organization
        if org is None:
            continue
        plan = getattr(org, "subscription_plan", None)
        features = (plan.features if plan else {}) or {}
        if features.get("ai_assistant"):
            facility.has_ai_assistant = True
            facility.has_cds = True
            facility.save(update_fields=["has_ai_assistant", "has_cds"])
            enabled += 1
    if enabled:
        print(f"  Enabled ai_assistant/cds for {enabled} FULL_HMIS facility(ies)")


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0067_backfill_moh_reporting_for_standalone"),
    ]

    operations = [
        migrations.AddField(
            model_name="facility",
            name="has_ai_assistant",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "TibaBot AI assistant available at this facility "
                    "(requires plan ai_assistant feature)."
                ),
            ),
        ),
        migrations.AddField(
            model_name="facility",
            name="has_cds",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Clinical Decision Support (CDS) available at this facility "
                    "(requires plan ai_assistant feature)."
                ),
            ),
        ),
        migrations.RunPython(backfill_flags, noop),
    ]
