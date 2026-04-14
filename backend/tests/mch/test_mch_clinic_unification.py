from datetime import date, timedelta
from unittest.mock import patch

import pytest  # type: ignore
from django.urls import reverse


@pytest.fixture
def anc_clinic(db, sample_facility, sample_organization):
    """Create an active ANC clinic."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="ANC Clinic",
        clinic_type="ANC",
        code="ANC-001",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def pnc_clinic(db, sample_facility, sample_organization):
    """Create an active PNC clinic."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="PNC Clinic",
        clinic_type="PNC",
        code="PNC-001",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def anc_enrollment(db, anc_clinic, sample_patient, test_user, sample_facility, sample_organization):
    """Create a linked ANC enrollment for MCH registration tests."""
    from hmis.apps.clinics.models import ClinicEnrollment

    return ClinicEnrollment.objects.create(
        clinic=anc_clinic,
        patient=sample_patient,
        enrollment_date=date.today(),
        enrolled_by=test_user,
        gravida=2,
        para=1,
        lmp=date.today() - timedelta(days=140),
    )


@pytest.fixture
def mch_registration(db, sample_patient, anc_enrollment, test_user, sample_facility, sample_organization):
    """Create an active MCH registration with ANC enrollment."""
    from hmis.apps.mch.models import MCHRegistration

    return MCHRegistration.objects.create(
        mother=sample_patient,
        anc_enrollment=anc_enrollment,
        registration_date=date.today(),
        registered_by=test_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def unification_flags(db):
    """Enable live MCH-clinic unification feature flags."""
    from hmis.apps.core.models import FeatureFlag

    FeatureFlag.objects.create(
        name="MCH_LINK_CLINIC_VISITS",
        description="Link new MCH visits to clinic visits",
        is_enabled=True,
    )
    FeatureFlag.objects.create(
        name="MCH_DERIVE_ENROLLMENT_FROM_CLINIC_VISITS",
        description="Derive ANC attendance from linked clinic visits",
        is_enabled=True,
    )


@pytest.mark.django_db
class TestMCHClinicUnification:
    def test_create_anc_visit_links_or_creates_canonical_clinic_visit(
        self,
        authenticated_client,
        mch_registration,
        anc_enrollment,
        unification_flags,
    ):
        """ANC visit creation should create a linked canonical clinic visit."""
        from hmis.apps.mch.models import ANCVisit

        response = authenticated_client.post(
            reverse("mch:mch-anc-visit-list"),
            {
                "registration": mch_registration.id,
                "visit_number": 1,
                "visit_date": date.today().isoformat(),
                "blood_pressure": "120/80",
                "next_visit_date": (date.today() + timedelta(days=28)).isoformat(),
            },
            format="json",
        )

        assert response.status_code == 201

        visit = ANCVisit.objects.select_related("clinic_visit", "conducted_by").get(pk=response.data["id"])
        anc_enrollment.refresh_from_db()

        assert visit.clinic_visit is not None
        assert visit.clinic_visit.patient_id == mch_registration.mother_id
        assert visit.clinic_visit.session.clinic_id == anc_enrollment.clinic_id
        assert visit.clinic_visit.status == "COMPLETED"
        assert visit.clinic_visit.source == "DIRECT"
        assert visit.clinic_visit.source_module == "MCH_ANC"
        assert visit.clinic_visit.source_record_id == visit.id
        assert visit.conducted_by_id is not None
        assert anc_enrollment.total_visits == 1
        assert anc_enrollment.last_visit_date == visit.visit_date
        assert anc_enrollment.next_appointment == visit.next_visit_date

    def test_anc_visit_update_does_not_double_count_enrollment_attendance(
        self,
        authenticated_client,
        mch_registration,
        anc_enrollment,
        unification_flags,
    ):
        """Updating the same linked ANC visit should remain idempotent for attendance counts."""
        create_response = authenticated_client.post(
            reverse("mch:mch-anc-visit-list"),
            {
                "registration": mch_registration.id,
                "visit_number": 1,
                "visit_date": date.today().isoformat(),
                "blood_pressure": "120/80",
            },
            format="json",
        )

        assert create_response.status_code == 201

        update_response = authenticated_client.patch(
            reverse("mch:mch-anc-visit-detail", args=[create_response.data["id"]]),
            {"notes": "Updated after review."},
            format="json",
        )

        assert update_response.status_code == 200

        anc_enrollment.refresh_from_db()
        assert anc_enrollment.total_visits == 1

    def test_create_pnc_visit_links_or_creates_canonical_clinic_visit(
        self,
        authenticated_client,
        mch_registration,
        pnc_clinic,
        unification_flags,
    ):
        """PNC visit creation should create a linked canonical clinic visit."""
        from hmis.apps.mch.models import PNCVisit

        response = authenticated_client.post(
            reverse("mch:mch-pnc-visit-list"),
            {
                "registration": mch_registration.id,
                "visit_number": 1,
                "visit_date": date.today().isoformat(),
                "breastfeeding_status": "EXCLUSIVE",
            },
            format="json",
        )

        assert response.status_code == 201

        visit = PNCVisit.objects.select_related("clinic_visit", "conducted_by").get(pk=response.data["id"])

        assert visit.clinic_visit is not None
        assert visit.clinic_visit.patient_id == mch_registration.mother_id
        assert visit.clinic_visit.session.clinic_id == pnc_clinic.id
        assert visit.clinic_visit.status == "COMPLETED"
        assert visit.clinic_visit.source_module == "MCH_PNC"
        assert visit.clinic_visit.source_record_id == visit.id
        assert visit.conducted_by_id is not None

    def test_create_anc_visit_reuses_explicit_clinic_visit_when_consistent(
        self,
        authenticated_client,
        mch_registration,
        anc_clinic,
        test_user,
        unification_flags,
    ):
        """ANC visit should reuse an explicit clinic visit from the queue flow."""
        from hmis.apps.clinics.models import ClinicVisit

        session = anc_clinic.get_current_session()
        clinic_visit = ClinicVisit.objects.create(
            session=session,
            patient=mch_registration.mother,
            status="IN_CONSULTATION",
            visit_type="FOLLOW_UP",
            source="DIRECT",
            registered_by=test_user,
            chief_complaint="ANC follow-up",
        )

        response = authenticated_client.post(
            reverse("mch:mch-anc-visit-list"),
            {
                "registration": mch_registration.id,
                "visit_number": 1,
                "visit_date": date.today().isoformat(),
                "clinic_visit": clinic_visit.id,
            },
            format="json",
        )

        assert response.status_code == 201

        clinic_visit.refresh_from_db()
        assert response.data["clinic_visit"] == clinic_visit.id
        assert clinic_visit.status == "COMPLETED"

    def test_route_to_pnc_creates_pnc_clinic_visit(
        self,
        authenticated_client,
        mch_registration,
        pnc_clinic,
    ):
        """MCH registration should support routing to the PNC queue."""
        response = authenticated_client.post(
            reverse("mch:mch-registration-route-to-pnc", args=[mch_registration.id]),
            {},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["clinic"] == pnc_clinic.name
        assert response.data["clinic_visit_id"] is not None

    def test_create_pnc_visit_uses_request_user_for_billing_fallback(
        self,
        authenticated_client,
        mch_registration,
        pnc_clinic,
        test_user,
        unification_flags,
    ):
        """Live PNC writes should supply a non-null billing creator via the service fallback."""
        with patch("hmis.apps.mch.services.billing.create_pnc_visit_invoice") as mock_billing:
            mock_billing.return_value = None

            response = authenticated_client.post(
                reverse("mch:mch-pnc-visit-list"),
                {
                    "registration": mch_registration.id,
                    "visit_number": 1,
                    "visit_date": date.today().isoformat(),
                    "breastfeeding_status": "EXCLUSIVE",
                },
                format="json",
            )

        assert response.status_code == 201
        assert mock_billing.call_count == 1
        assert mock_billing.call_args.kwargs["created_by"] == test_user
