from __future__ import annotations

import logging

import pytest

from hmis.apps.billing.facility_identifiers import resolve_fr_code
from hmis.apps.billing.models import FacilityBillingConfig


@pytest.mark.django_db
class TestResolveFRCode:
    def test_prefers_billing_config_over_dha_cache(self, sample_facility):
        sample_facility.dha_fr_code = "FID-DHA-001"
        sample_facility.save(update_fields=["dha_fr_code"])
        FacilityBillingConfig.objects.create(
            facility=sample_facility,
            sha_facility_fr_code="FID-BILLING-999",
        )

        resolved = resolve_fr_code(sample_facility)

        assert resolved.value == "FID-BILLING-999"
        assert resolved.source == "billing_config"

    def test_falls_back_to_facility_dha_cache(self, sample_facility):
        sample_facility.dha_fr_code = "FID-DHA-002"
        sample_facility.save(update_fields=["dha_fr_code"])

        resolved = resolve_fr_code(sample_facility)

        assert resolved.value == "FID-DHA-002"
        assert resolved.source == "facility_dha_cache"

    def test_falls_back_to_settings_when_enabled(self, sample_facility, settings):
        sample_facility.dha_fr_code = ""
        sample_facility.save(update_fields=["dha_fr_code"])
        settings.SHA_FACILITY_FR_CODE = "FID-SETTINGS-003"

        resolved = resolve_fr_code(sample_facility)

        assert resolved.value == "FID-SETTINGS-003"
        assert resolved.source == "settings"

    def test_no_settings_fallback_when_disabled(self, sample_facility, settings):
        sample_facility.dha_fr_code = ""
        sample_facility.save(update_fields=["dha_fr_code"])
        settings.SHA_FACILITY_FR_CODE = "FID-SETTINGS-004"

        resolved = resolve_fr_code(sample_facility, allow_settings_fallback=False)

        assert resolved.value == ""
        assert resolved.source == "none"

    def test_logs_warning_when_billing_config_lookup_is_invalid(self, caplog):
        class BrokenBillingConfig:
            @property
            def sha_facility_fr_code(self):
                raise ValueError("invalid fr value")

        class FacilityWithBrokenBillingConfig:
            dha_fr_code = "FID-DHA-777"

            @property
            def billing_config(self):
                return BrokenBillingConfig()

        caplog.set_level(logging.WARNING)

        resolved = resolve_fr_code(FacilityWithBrokenBillingConfig())

        assert resolved.value == "FID-DHA-777"
        assert resolved.source == "facility_dha_cache"
        assert any("billing-config FR code" in record.message for record in caplog.records)

    def test_unexpected_billing_config_error_is_not_swallowed(self):
        class FacilityWithExplodingBillingConfig:
            dha_fr_code = "FID-DHA-888"

            @property
            def billing_config(self):
                raise RuntimeError("unexpected object failure")

        with pytest.raises(RuntimeError, match="unexpected object failure"):
            resolve_fr_code(FacilityWithExplodingBillingConfig())
