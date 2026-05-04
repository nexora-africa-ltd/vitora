from django.apps import AppConfig


class BloodBankConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.blood_bank"
    verbose_name = "Blood Bank"

    def ready(self):
        import hmis.apps.blood_bank.signals  # noqa: F401
