from django.apps import AppConfig


class ImmunizationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.immunizations"
    verbose_name = "Immunizations"

    def ready(self):
        from django.db.models.signals import post_save

        from hmis.apps.immunizations.signals import (
            handle_aefi_surveillance_alert,
            handle_appointment_status_sync,
        )

        # Appointment completion → ImmunizationRecord status sync
        from hmis.apps.scheduling.models import Appointment

        post_save.connect(
            handle_appointment_status_sync,
            sender=Appointment,
            dispatch_uid="immunizations_appointment_sync",
        )

        # Severe AEFI → Surveillance alert
        from hmis.apps.immunizations.models import AEFI

        post_save.connect(
            handle_aefi_surveillance_alert,
            sender=AEFI,
            dispatch_uid="immunizations_aefi_surveillance",
        )
