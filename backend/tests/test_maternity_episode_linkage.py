from __future__ import annotations

from datetime import date, timedelta

import pytest
from django.urls import reverse
from django.utils import timezone


@pytest.fixture
def anc_clinic(db):
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="ANC Maternity Link Clinic",
        clinic_type="ANC",
        code="ANC-MAT-001",
        status="ACTIVE",
    )


@pytest.fixture
def anc_enrollment(db, anc_clinic, sample_patient, test_user):
    from hmis.apps.clinics.models import ClinicEnrollment

    return ClinicEnrollment.objects.create(
        clinic=anc_clinic,
        patient=sample_patient,
        enrollment_date=date.today(),
        enrolled_by=test_user,
        gravida=3,
        para=2,
        lmp=date.today() - timedelta(days=266),
    )


@pytest.fixture
def mch_registration(db, sample_patient, anc_enrollment):
    from hmis.apps.mch.models import MCHRegistration

    return MCHRegistration.objects.create(
        mother=sample_patient,
        anc_enrollment=anc_enrollment,
        registration_date=date.today(),
    )


@pytest.fixture
def maternity_ward(db):
    from decimal import Decimal

    from hmis.apps.inpatient.models import Ward

    return Ward.objects.create(
        name="Maternity Ward A",
        code="MAT-A",
        ward_type="MATERNITY",
        capacity=10,
        daily_rate=Decimal("750.00"),
        is_active=True,
    )


@pytest.fixture
def maternity_bed(db, maternity_ward):
    from hmis.apps.inpatient.models import Bed

    return Bed.objects.create(
        ward=maternity_ward,
        bed_number="MAT-01",
        bed_type="STANDARD",
        status="AVAILABLE",
    )


@pytest.mark.django_db
class TestMaternityEpisodeLinkage:
    def test_create_maternity_admission_requires_mch_registration(
        self,
        authenticated_client,
        test_user,
        sample_patient,
        sample_encounter,
        maternity_ward,
        maternity_bed,
    ):
        response = authenticated_client.post(
            reverse("inpatient:admission-list"),
            {
                "patient": sample_patient.id,
                "opd_encounter": sample_encounter.id,
                "admission_date": timezone.now().isoformat(),
                "admitting_diagnosis": "O80",
                "admitting_diagnosis_text": "Normal delivery admission",
                "admitting_officer": test_user.id,
                "attending_doctor": test_user.id,
                "ward": maternity_ward.id,
                "bed": maternity_bed.id,
                "payer_type": "SHA",
            },
            format="json",
        )

        assert response.status_code == 400
        assert "mch_registration" in response.data

    def test_create_maternity_admission_with_matching_registration(
        self,
        authenticated_client,
        test_user,
        sample_patient,
        sample_encounter,
        mch_registration,
        maternity_ward,
        maternity_bed,
    ):
        response = authenticated_client.post(
            reverse("inpatient:admission-list"),
            {
                "patient": sample_patient.id,
                "opd_encounter": sample_encounter.id,
                "mch_registration": mch_registration.id,
                "admission_date": timezone.now().isoformat(),
                "admitting_diagnosis": "O80",
                "admitting_diagnosis_text": "Normal delivery admission",
                "admitting_officer": test_user.id,
                "attending_doctor": test_user.id,
                "ward": maternity_ward.id,
                "bed": maternity_bed.id,
                "payer_type": "SHA",
            },
            format="json",
        )

        assert response.status_code == 201
        assert response.data["mch_registration"] == mch_registration.id

    def test_create_labour_partograph_rejects_admission_for_different_registration(
        self,
        authenticated_client,
        another_user,
        sample_county,
        sample_sub_county,
        test_user,
        sample_encounter,
        mch_registration,
        maternity_ward,
        maternity_bed,
    ):
        from hmis.apps.clinics.models import Clinic, ClinicEnrollment
        from hmis.apps.mch.models import MCHRegistration
        from hmis.apps.patients.models import Patient
        from hmis.apps.inpatient.models import Admission
        from hmis.apps.encounters.models import Encounter

        other_patient = Patient.objects.create(
            first_name="Akinyi",
            last_name="Otieno",
            date_of_birth="1992-02-10",
            gender="F",
            county=sample_county,
            sub_county=sample_sub_county,
        )
        other_clinic = Clinic.objects.create(
            name="ANC Secondary Clinic",
            clinic_type="ANC",
            code="ANC-MAT-002",
            status="ACTIVE",
        )
        other_enrollment = ClinicEnrollment.objects.create(
            clinic=other_clinic,
            patient=other_patient,
            enrollment_date=date.today(),
            enrolled_by=test_user,
            gravida=1,
            para=0,
            lmp=date.today() - timedelta(days=250),
        )
        other_registration = MCHRegistration.objects.create(
            mother=other_patient,
            anc_enrollment=other_enrollment,
            registration_date=date.today(),
        )
        other_opd = Encounter.objects.create(
            patient=other_patient,
            encounter_type="OPD",
            chief_complaint="Labour pains",
        )
        other_ipd = Encounter.objects.create(
            patient=other_patient,
            encounter_type="IPD",
            chief_complaint="Maternity admission",
        )
        admission = Admission.objects.create(
            patient=other_patient,
            opd_encounter=other_opd,
            ipd_encounter=other_ipd,
            mch_registration=other_registration,
            admission_date=timezone.now(),
            admitting_diagnosis="O80",
            admitting_diagnosis_text="Normal delivery admission",
            admitting_officer=test_user,
            attending_doctor=test_user,
            ward=maternity_ward,
            bed=maternity_bed,
            payer_type="SHA",
        )

        response = authenticated_client.post(
            reverse("mch:mch-labour-partograph-list"),
            {
                "registration": mch_registration.id,
                "encounter": sample_encounter.id,
                "admission": admission.id,
                "status": "ACTIVE",
                "parity": 2,
                "gestation_weeks": 38,
            },
            format="json",
        )

        assert response.status_code == 400
        assert "admission" in response.data

    def test_create_delivery_uses_partograph_admission_and_links_both(
        self,
        authenticated_client,
        test_user,
        sample_patient,
        sample_encounter,
        mch_registration,
        maternity_ward,
        maternity_bed,
    ):
        from hmis.apps.encounters.models import Encounter
        from hmis.apps.inpatient.models import Admission
        from hmis.apps.mch.models import Delivery, LabourPartograph

        ipd_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Labour admission",
        )
        admission = Admission.objects.create(
            patient=sample_patient,
            opd_encounter=sample_encounter,
            ipd_encounter=ipd_encounter,
            mch_registration=mch_registration,
            admission_date=timezone.now(),
            admitting_diagnosis="O80",
            admitting_diagnosis_text="Normal delivery admission",
            admitting_officer=test_user,
            attending_doctor=test_user,
            ward=maternity_ward,
            bed=maternity_bed,
            payer_type="SHA",
        )
        partograph = LabourPartograph.objects.create(
            registration=mch_registration,
            encounter=sample_encounter,
            admission=admission,
            status="ACTIVE",
            parity=2,
            gestation_weeks=39,
            created_by=test_user,
        )

        response = authenticated_client.post(
            reverse("mch:mch-delivery-list"),
            {
                "registration": mch_registration.id,
                "partograph": partograph.id,
                "delivery_date": str(date.today()),
                "delivery_type": "SVD",
                "delivery_outcome": "LIVE_BIRTH",
                "status": "COMPLETED",
                "baby_gender": "F",
                "birth_weight": "3.20",
            },
            format="json",
        )

        assert response.status_code == 201
        delivery = Delivery.objects.get(pk=response.data["id"])
        assert delivery.partograph_id == partograph.id
        assert delivery.admission_id == admission.id
