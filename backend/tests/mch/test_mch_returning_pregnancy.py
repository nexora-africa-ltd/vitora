"""
Tests for returning pregnancy (multi-gravida) features.

Covers:
- Multiple babies (twins/multiples) per registration
- Auto-suggested gravida/parity from history
- Pregnancy history API endpoint
- Inter-pregnancy interval tracking
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.urls import reverse

User = get_user_model()


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def anc_clinic(db, sample_facility, sample_organization):
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="ANC Clinic",
        clinic_type="ANC",
        code="ANC-TEST",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def anc_enrollment(db, anc_clinic, sample_patient, test_user, sample_facility, sample_organization):
    from hmis.apps.clinics.models import ClinicEnrollment

    return ClinicEnrollment.objects.create(
        clinic=anc_clinic,
        patient=sample_patient,
        enrollment_date=date.today(),
        enrolled_by=test_user,
        gravida=2,
        para=1,
        lmp=date.today() - timedelta(days=200),
    )


@pytest.fixture
def mch_registration(db, sample_patient, anc_enrollment, test_user, sample_facility, sample_organization):
    from hmis.apps.mch.models import MCHRegistration

    return MCHRegistration.objects.create(
        mother=sample_patient,
        anc_enrollment=anc_enrollment,
        registration_date=date.today() - timedelta(days=200),
        registered_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def completed_delivery(db, mch_registration, test_user):
    from hmis.apps.mch.models import Delivery

    return Delivery.objects.create(
        registration=mch_registration,
        delivery_date=date.today() - timedelta(days=10),
        delivery_type="SVD",
        delivery_outcome="LIVE_BIRTH",
        place_of_delivery="FACILITY",
        status="COMPLETED",
        delivered_by=test_user,
        baby_gender="F",
        birth_weight=Decimal("3.20"),
    )


@pytest.fixture
def older_registration(db, sample_patient, anc_clinic, test_user, sample_facility, sample_organization):
    """A previous pregnancy registration (already completed)."""
    from hmis.apps.clinics.models import ClinicEnrollment
    from hmis.apps.mch.models import Delivery, MCHRegistration

    enrollment = ClinicEnrollment.objects.create(
        clinic=anc_clinic,
        patient=sample_patient,
        enrollment_date=date.today() - timedelta(days=800),
        enrolled_by=test_user,
        gravida=1,
        para=0,
        lmp=date.today() - timedelta(days=800 + 200),
    )

    reg = MCHRegistration.objects.create(
        mother=sample_patient,
        anc_enrollment=enrollment,
        registration_date=date.today() - timedelta(days=800),
        status="COMPLETED",
        registered_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )

    Delivery.objects.create(
        registration=reg,
        delivery_date=date.today() - timedelta(days=530),
        delivery_type="SVD",
        delivery_outcome="LIVE_BIRTH",
        place_of_delivery="FACILITY",
        status="COMPLETED",
        delivered_by=test_user,
        baby_gender="M",
        birth_weight=Decimal("3.50"),
    )

    return reg


# =============================================================================
# MODEL PROPERTY TESTS
# =============================================================================


@pytest.mark.django_db
class TestMultipleBabies:
    """Tests for multiple baby support."""

    def test_baby_count_zero_when_no_deliveries(self, mch_registration):
        """Should return 0 baby_count when there are no deliveries."""
        assert mch_registration.baby_count == 0

    def test_baby_count_one_after_single_delivery(self, mch_registration, completed_delivery):
        """Should return 1 baby_count after a single completed delivery."""
        # Signal creates baby_patient on COMPLETED
        completed_delivery.refresh_from_db()
        assert completed_delivery.baby_patient is not None
        assert mch_registration.baby_count == 1

    def test_baby_count_two_for_twins(self, mch_registration, test_user):
        """Should return 2 baby_count when two deliveries exist (twins)."""
        from hmis.apps.mch.models import Delivery

        # First baby
        Delivery.objects.create(
            registration=mch_registration,
            delivery_date=date.today() - timedelta(days=5),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            status="COMPLETED",
            delivered_by=test_user,
            baby_gender="F",
            birth_weight=Decimal("2.80"),
        )

        # Second baby (twin)
        Delivery.objects.create(
            registration=mch_registration,
            delivery_date=date.today() - timedelta(days=5),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            status="COMPLETED",
            delivered_by=test_user,
            baby_gender="M",
            birth_weight=Decimal("2.60"),
        )

        assert mch_registration.baby_count == 2
        assert mch_registration.is_multiple_pregnancy is True

    def test_is_multiple_pregnancy_false_for_singleton(self, mch_registration, completed_delivery):
        """Should return False for a single-baby pregnancy."""
        assert mch_registration.is_multiple_pregnancy is False

    def test_all_babies_returns_patient_objects(self, mch_registration, test_user):
        """all_babies should return Patient queryset for all babies."""
        from hmis.apps.mch.models import Delivery

        Delivery.objects.create(
            registration=mch_registration,
            delivery_date=date.today() - timedelta(days=5),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            status="COMPLETED",
            delivered_by=test_user,
            baby_gender="F",
            birth_weight=Decimal("2.80"),
        )

        Delivery.objects.create(
            registration=mch_registration,
            delivery_date=date.today() - timedelta(days=5),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            status="COMPLETED",
            delivered_by=test_user,
            baby_gender="M",
            birth_weight=Decimal("2.60"),
        )

        babies = mch_registration.all_babies
        assert babies.count() == 2

    def test_signal_does_not_override_registration_baby(self, mch_registration, test_user):
        """Second delivery signal should not replace registration.baby (first-born)."""
        from hmis.apps.mch.models import Delivery

        d1 = Delivery.objects.create(
            registration=mch_registration,
            delivery_date=date.today() - timedelta(days=5),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            status="COMPLETED",
            delivered_by=test_user,
            baby_gender="F",
            birth_weight=Decimal("2.80"),
        )
        d1.refresh_from_db()
        first_baby = d1.baby_patient

        mch_registration.refresh_from_db()
        assert mch_registration.baby == first_baby

        # Second delivery
        Delivery.objects.create(
            registration=mch_registration,
            delivery_date=date.today() - timedelta(days=5),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            status="COMPLETED",
            delivered_by=test_user,
            baby_gender="M",
            birth_weight=Decimal("2.60"),
        )

        mch_registration.refresh_from_db()
        # registration.baby should still be the first-born
        assert mch_registration.baby == first_baby


# =============================================================================
# INTER-PREGNANCY INTERVAL TESTS
# =============================================================================


@pytest.mark.django_db
class TestInterPregnancyInterval:
    """Tests for inter-pregnancy interval tracking."""

    def test_no_interval_for_first_pregnancy(self, mch_registration):
        """Should return None for a first pregnancy."""
        assert mch_registration.inter_pregnancy_interval_days is None

    def test_interval_calculated_from_previous_delivery(
        self, older_registration, mch_registration
    ):
        """Should calculate days since the last delivery of the previous pregnancy."""
        # older_registration delivered 530 days ago
        # mch_registration registered 200 days ago
        # interval = 200 days ago - 530 days ago = 330 days
        interval = mch_registration.inter_pregnancy_interval_days
        assert interval is not None
        assert interval == 330

    def test_short_interval_flagged(self, older_registration, sample_patient, anc_clinic, test_user):
        """Inter-pregnancy interval < 730 days (24 months) should be detectable."""
        from hmis.apps.clinics.models import ClinicEnrollment
        from hmis.apps.mch.models import MCHRegistration

        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=100),
            enrolled_by=test_user,
            gravida=3,
            para=2,
            lmp=date.today() - timedelta(days=100 + 100),
        )

        new_reg = MCHRegistration.objects.create(
            mother=sample_patient,
            anc_enrollment=enrollment,
            registration_date=date.today() - timedelta(days=100),
            registered_by=test_user,
        )

        interval = new_reg.inter_pregnancy_interval_days
        assert interval is not None
        assert interval < 730  # Less than WHO recommended 24 months


# =============================================================================
# SUGGESTED OBSTETRIC HISTORY TESTS
# =============================================================================


@pytest.mark.django_db
class TestSuggestedObstetricHistory:
    """Tests for auto-calculated gravida/parity."""

    def test_first_pregnancy_suggests_gravida_1(self, sample_patient):
        """First-time mother should get gravida=1, parity=0."""
        from hmis.apps.mch.models import MCHRegistration

        result = MCHRegistration.suggested_obstetric_history(sample_patient.id)
        assert result["suggested_gravida"] == 1
        assert result["suggested_parity"] == 0
        assert result["previous_pregnancies"] == 0

    def test_second_pregnancy_after_delivery(self, older_registration, sample_patient):
        """After one completed pregnancy, gravida=2, parity=1."""
        from hmis.apps.mch.models import MCHRegistration

        result = MCHRegistration.suggested_obstetric_history(sample_patient.id)
        assert result["suggested_gravida"] == 2
        assert result["suggested_parity"] == 1
        assert result["previous_pregnancies"] == 1

    def test_with_active_and_completed(self, older_registration, mch_registration, sample_patient):
        """With one completed + one active, gravida should be total+1 for new reg."""
        from hmis.apps.mch.models import MCHRegistration

        result = MCHRegistration.suggested_obstetric_history(sample_patient.id)
        # 2 existing + 1 for new = 3
        assert result["suggested_gravida"] == 3
        assert result["suggested_parity"] == 1
        assert result["previous_pregnancies"] == 2


# =============================================================================
# API ENDPOINT TESTS
# =============================================================================


@pytest.mark.django_db
class TestPregnancyHistoryAPI:
    """Tests for the pregnancy_history endpoint."""

    def test_pregnancy_history_returns_past_registrations(
        self, authenticated_client, older_registration, mch_registration
    ):
        """GET /api/mch/registrations/{id}/pregnancy_history/ returns past pregnancies."""
        url = reverse(
            "mch:mch-registration-pregnancy-history",
            kwargs={"pk": mch_registration.id},
        )
        response = authenticated_client.get(url)

        assert response.status_code == 200
        data = response.data
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == older_registration.id
        assert data[0]["mch_number"] == older_registration.mch_number
        assert data[0]["status"] == "COMPLETED"
        assert data[0]["delivery_date"] is not None
        assert data[0]["delivery_outcome"] == "LIVE_BIRTH"

    def test_pregnancy_history_excludes_current(
        self, authenticated_client, mch_registration
    ):
        """Should not include the current registration in history."""
        url = reverse(
            "mch:mch-registration-pregnancy-history",
            kwargs={"pk": mch_registration.id},
        )
        response = authenticated_client.get(url)

        assert response.status_code == 200
        ids = [r["id"] for r in response.data]
        assert mch_registration.id not in ids

    def test_pregnancy_history_requires_auth(self, api_client, mch_registration):
        """Should reject unauthenticated requests."""
        url = reverse(
            "mch:mch-registration-pregnancy-history",
            kwargs={"pk": mch_registration.id},
        )
        response = api_client.get(url)

        assert response.status_code == 401


@pytest.mark.django_db
class TestSuggestedObstetricHistoryAPI:
    """Tests for the suggested_obstetric_history endpoint."""

    def test_suggested_obstetric_history_endpoint(
        self, authenticated_client, older_registration, sample_patient
    ):
        """GET /api/mch/registrations/suggested_obstetric_history/?mother={id}."""
        url = reverse("mch:mch-registration-suggested-obstetric-history")
        response = authenticated_client.get(url, {"mother": sample_patient.id})

        assert response.status_code == 200
        assert response.data["suggested_gravida"] == 2
        assert response.data["suggested_parity"] == 1
        assert response.data["previous_pregnancies"] == 1

    def test_suggested_obstetric_history_requires_mother_param(
        self, authenticated_client
    ):
        """Should return 400 without mother param."""
        url = reverse("mch:mch-registration-suggested-obstetric-history")
        response = authenticated_client.get(url)

        assert response.status_code == 400

    def test_suggested_obstetric_history_requires_auth(self, api_client, sample_patient):
        """Should reject unauthenticated requests."""
        url = reverse("mch:mch-registration-suggested-obstetric-history")
        response = api_client.get(url, {"mother": sample_patient.id})

        assert response.status_code == 401


@pytest.mark.django_db
class TestMultipleBabiesSerializer:
    """Tests that the detail serializer includes multiple baby fields."""

    def test_detail_includes_baby_count_and_all_babies(
        self, authenticated_client, mch_registration, test_user
    ):
        """GET /api/mch/registrations/{id}/ includes baby_count and all_babies_info."""
        from hmis.apps.mch.models import Delivery

        # Create twin deliveries
        Delivery.objects.create(
            registration=mch_registration,
            delivery_date=date.today() - timedelta(days=5),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            status="COMPLETED",
            delivered_by=test_user,
            baby_gender="F",
            birth_weight=Decimal("2.80"),
        )
        Delivery.objects.create(
            registration=mch_registration,
            delivery_date=date.today() - timedelta(days=5),
            delivery_type="SVD",
            delivery_outcome="LIVE_BIRTH",
            status="COMPLETED",
            delivered_by=test_user,
            baby_gender="M",
            birth_weight=Decimal("2.60"),
        )

        url = reverse("mch:mch-registration-detail", kwargs={"pk": mch_registration.id})
        response = authenticated_client.get(url)

        assert response.status_code == 200
        assert response.data["baby_count"] == 2
        assert response.data["is_multiple_pregnancy"] is True
        assert len(response.data["all_babies_info"]) == 2

        # Verify baby info structure
        baby_info = response.data["all_babies_info"][0]
        assert "id" in baby_info
        assert "name" in baby_info
        assert "mrn" in baby_info
        assert "gender" in baby_info
        assert "date_of_birth" in baby_info

    def test_detail_includes_inter_pregnancy_interval(
        self, authenticated_client, older_registration, mch_registration
    ):
        """GET /api/mch/registrations/{id}/ includes inter_pregnancy_interval_days."""
        url = reverse("mch:mch-registration-detail", kwargs={"pk": mch_registration.id})
        response = authenticated_client.get(url)

        assert response.status_code == 200
        assert response.data["inter_pregnancy_interval_days"] == 330

    def test_detail_inter_pregnancy_interval_null_for_first(
        self, authenticated_client, mch_registration
    ):
        """inter_pregnancy_interval_days should be null for first pregnancy."""
        url = reverse("mch:mch-registration-detail", kwargs={"pk": mch_registration.id})
        response = authenticated_client.get(url)

        assert response.status_code == 200
        assert response.data["inter_pregnancy_interval_days"] is None
