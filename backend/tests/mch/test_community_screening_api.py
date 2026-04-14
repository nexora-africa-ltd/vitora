from datetime import date, timedelta
from io import BytesIO

import pytest  # type: ignore
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

pytestmark = pytest.mark.django_db


@pytest.fixture
def community_screening_photo():
    return SimpleUploadedFile(
        'screening.jpg',
        b'fake-image-bytes',
        content_type='image/jpeg',
    )


@pytest.fixture
def community_screening_payload(sample_patient):
    return {
        'patient': sample_patient.id,
        'patient_name': 'Jane Smith',
        'patient_mrn': sample_patient.mrn,
        'screening_type': 'MALNUTRITION',
        'screening_date': date.today().isoformat(),
        'chu_name': 'Kayole CHU 4',
        'territory': 'Village A',
        'muac_mm': '110',
        'edema_present': 'true',
        'location': '{"latitude":-1.2921,"longitude":36.8219,"accuracy":8,"captured_at":"2026-03-13T08:00:00Z"}',
        'notes': 'Child referred for urgent nutrition review.',
    }


class TestCommunityScreeningAPI:
    def test_create_screening_with_photo_and_location(
        self,
        authenticated_client,
        community_screening_payload,
        community_screening_photo,
        test_user,
    ):
        url = reverse('mch:mch-community-screening-list')
        payload = {
            **community_screening_payload,
            'photo_upload': community_screening_photo,
        }

        response = authenticated_client.post(url, payload, format='multipart')

        assert response.status_code == 201
        assert response.data['screening_type'] == 'MALNUTRITION'
        assert response.data['chu_name'] == 'Kayole CHU 4'
        assert response.data['captured_by'] == test_user.id
        assert response.data['result_summary'] == 'MUAC 110 mm · edema present'
        assert response.data['location']['latitude'] == pytest.approx(-1.2921)
        assert response.data['photo'] is not None
        assert response.data['photo']['uri'].endswith('.jpg')

    def test_list_screenings_supports_modified_after_filter(
        self,
        authenticated_client,
        sample_patient,
        test_user,
    ):
        from hmis.apps.mch.models import CommunityScreening

        old_record = CommunityScreening.objects.create(
            patient=sample_patient,
            patient_name_snapshot='Jane Smith',
            patient_mrn_snapshot=sample_patient.mrn,
            screening_type='TB_CONTACT',
            screening_date=date.today() - timedelta(days=2),
            chu_name='Kayole CHU 4',
            territory='Zone A',
            household_contact_name='Household Alpha',
            cough_duration_days=5,
            tb_referral_made=True,
            captured_by=test_user,
        )
        CommunityScreening.objects.filter(pk=old_record.pk).update(
            updated_at='2026-03-10T08:00:00Z'
        )

        new_record = CommunityScreening.objects.create(
            patient=sample_patient,
            patient_name_snapshot='Jane Smith',
            patient_mrn_snapshot=sample_patient.mrn,
            screening_type='MALARIA_RDT',
            screening_date=date.today(),
            chu_name='Kayole CHU 4',
            territory='Zone B',
            fever_present=True,
            malaria_rdt_result='positive',
            malaria_treatment_referred=True,
            captured_by=test_user,
        )
        CommunityScreening.objects.filter(pk=new_record.pk).update(
            updated_at='2026-03-13T08:00:00Z'
        )

        url = reverse('mch:mch-community-screening-list')
        response = authenticated_client.get(
            url,
            {'modified_after': '2026-03-12T00:00:00Z'},
        )

        assert response.status_code == 200
        assert response.data['count'] == 1
        assert response.data['results'][0]['id'] == new_record.id

    def test_screening_requires_authentication(self, api_client, community_screening_payload):
        url = reverse('mch:mch-community-screening-list')

        response = api_client.post(url, community_screening_payload)

        assert response.status_code == 401
