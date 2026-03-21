from django.apps import AppConfig


class BillingConfig(AppConfig):
    """Configuration for the Billing app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.billing"
    verbose_name = "Billing"

    def ready(self):
        """Import signals and connect cross-app billing signals."""
        import hmis.apps.billing.signals  # noqa: F401

        from django.db.models.signals import post_save

        from hmis.apps.billing.signals import (
            handle_admission_billing,
            handle_discharge_billing,
        )

        # Connect billing signals to inpatient models using lazy references.
        # This avoids circular imports and ensures the sender is the actual
        # model class, not a string that @receiver can't resolve.
        post_save.connect(
            handle_discharge_billing,
            sender="inpatient.Discharge",
            dispatch_uid="billing_handle_discharge",
        )
        post_save.connect(
            handle_admission_billing,
            sender="inpatient.Admission",
            dispatch_uid="billing_handle_admission",
        )
