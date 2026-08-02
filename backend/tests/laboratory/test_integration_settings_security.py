import pytest
from django.contrib.auth.models import Permission
from rest_framework import status


@pytest.mark.django_db
class TestLabIntegrationSettingsSecurity:
    def test_instrument_list_requires_explicit_view_permission(
        self, authenticated_client, test_user, sample_facility
    ):
        from hmis.apps.laboratory.models import Instrument

        Instrument.objects.create(
            code="LAB-INS-1",
            name="Chem Analyzer",
            interface_type="HL7_MLLP",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        test_user.user_permissions.remove(Permission.objects.get(codename="view_instrument"))

        response = authenticated_client.get("/api/lab/instruments/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_barcode_settings_requires_explicit_view_permission(
        self, authenticated_client, test_user
    ):
        test_user.user_permissions.remove(Permission.objects.get(codename="view_labbarcodeconfig"))

        response = authenticated_client.get("/api/lab/settings/barcode-config/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_instrument_retrieve_cross_tenant_denied(
        self,
        authenticated_client,
        sample_county,
        sample_sub_county,
        sample_organization,
    ):
        from hmis.apps.core.models import Facility
        from hmis.apps.laboratory.models import Instrument

        foreign_facility = Facility.objects.create(
            organization=sample_organization,
            name="Foreign Lab Facility",
            mfl_code="LAB-FOREIGN-001",
            level="3",
            county=sample_county,
            sub_county=sample_sub_county,
            is_active=True,
            has_laboratory=True,
        )

        foreign_instrument = Instrument.objects.create(
            code="LAB-FOREIGN-INS",
            name="Foreign Analyzer",
            interface_type="HL7_MLLP",
            facility=foreign_facility,
            organization=sample_organization,
        )

        response = authenticated_client.get(f"/api/lab/instruments/{foreign_instrument.id}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND
