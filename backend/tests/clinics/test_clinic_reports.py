"""TDD Tests for Monthly Clinic Reports (Priority 3).

RED phase: these tests define the expected contract for monthly clinic reporting.
They should fail until the MonthlyClinicReport model, reporting service, API endpoints,
and monthly aggregation task are implemented.

Spec reference: docs/clinics-module-completion-plan.md (Priority 3)
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from tests.conftest import ensure_staff_profile

User = get_user_model()


def _get_monthly_report_model():
    """Return the MonthlyClinicReport model or fail with a clear message."""
    try:
        return apps.get_model("clinics", "MonthlyClinicReport")
    except LookupError:  # pragma: no cover (expected until GREEN)
        pytest.fail("MonthlyClinicReport model is missing (clinics.MonthlyClinicReport)")


def _import_reporting_service():
    """Import reporting service functions or fail with a clear message."""
    try:
        from hmis.apps.clinics.services.reporting import (  # type: ignore
            generate_all_clinic_reports,
            generate_monthly_report,
        )

        return generate_monthly_report, generate_all_clinic_reports
    except Exception as exc:  # pragma: no cover (expected until GREEN)
        pytest.fail(f"Reporting service missing or not importable: {exc!r}")


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def clinic_user(db):
    return User.objects.create_user(
        username="clinic_reports_user",
        email="clinic-reports@example.com",
        password="testpass123",
        first_name="Report",
        last_name="User",
    )


@pytest.fixture
def authenticated_client(api_client, clinic_user, sample_organization, sample_facility):
    ensure_staff_profile(clinic_user, sample_organization, sample_facility)
    api_client.force_authenticate(user=clinic_user)
    return api_client


@pytest.fixture
def sample_clinic(db, sample_facility, sample_organization):
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="General OPD",
        clinic_type="GENERAL_OPD",
        code="OPD-REPORT-001",
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def session_in_month(db, sample_clinic, clinic_user, sample_facility, sample_organization):
    from hmis.apps.clinics.models import ClinicSession

    today = timezone.now().date()
    return ClinicSession.objects.create(
        clinic=sample_clinic,
        session_date=today,
        status="OPEN",
        opened_at=timezone.now(),
        opened_by=clinic_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def session_outside_month(db, sample_clinic, clinic_user, sample_facility, sample_organization):
    from hmis.apps.clinics.models import ClinicSession

    outside = timezone.now().date() - timedelta(days=40)
    return ClinicSession.objects.create(
        clinic=sample_clinic,
        session_date=outside,
        status="OPEN",
        opened_at=timezone.now(),
        opened_by=clinic_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def male_patient(db, sample_county, sample_sub_county, sample_organization):
    from hmis.apps.patients.models import Patient

    return Patient.objects.create(
        first_name="John",
        last_name="Male",
        date_of_birth=date(1990, 1, 1),
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
        organization=sample_organization,
    )


@pytest.fixture
def female_patient(sample_patient):
    # Uses the shared conftest fixture (gender="F")
    return sample_patient


@pytest.fixture
def visits_in_month(db, session_in_month, male_patient, female_patient, clinic_user, sample_facility, sample_organization):
    from hmis.apps.clinics.models import ClinicVisit

    visit_new = ClinicVisit.objects.create(
        session=session_in_month,
        patient=female_patient,
        status="COMPLETED",
        priority="STANDARD",
        visit_type="NEW",
        source="DIRECT",
        chief_complaint="Headache",
        registered_by=clinic_user,
        facility=sample_facility,
        organization=sample_organization,
    )
    visit_return = ClinicVisit.objects.create(
        session=session_in_month,
        patient=male_patient,
        status="COMPLETED",
        priority="STANDARD",
        visit_type="RETURN",
        source="DIRECT",
        chief_complaint="Follow up",
        registered_by=clinic_user,
        facility=sample_facility,
        organization=sample_organization,
    )

    return visit_new, visit_return


@pytest.fixture
def visit_outside_month(db, session_outside_month, female_patient, clinic_user, sample_facility, sample_organization):
    from hmis.apps.clinics.models import ClinicVisit

    return ClinicVisit.objects.create(
        session=session_outside_month,
        patient=female_patient,
        status="COMPLETED",
        priority="STANDARD",
        visit_type="NEW",
        source="DIRECT",
        chief_complaint="Old visit",
        registered_by=clinic_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def paid_invoice_for_visit(db, visits_in_month, clinic_user, sample_facility, sample_organization):
    """Create a paid invoice linked to the first visit (clinic_visit).

    This is used to validate revenue aggregation.
    """

    from hmis.apps.billing.models import Invoice, InvoiceItem

    (visit_new, _) = visits_in_month
    today = timezone.now().date()

    invoice = Invoice.objects.create(
        patient=visit_new.patient,
        clinic_visit=visit_new,
        status=Invoice.Status.DRAFT,
        invoice_date=today,
        due_date=today,
        created_by=clinic_user,
        facility=sample_facility,
        organization=sample_organization,
    )

    InvoiceItem.objects.create(
        invoice=invoice,
        description="Consultation fee",
        quantity=Decimal("1.00"),
        unit_price=Decimal("500.00"),
        line_total=Decimal("500.00"),
    )

    invoice.calculate_totals()
    invoice.status = Invoice.Status.PAID
    invoice.amount_paid = invoice.total_amount
    invoice.save(
        update_fields=[
            "status",
            "amount_paid",
            "subtotal",
            "tax_amount",
            "total_amount",
            "balance_due",
            "updated_at",
        ]
    )

    return invoice


@pytest.fixture
def enrollments_for_reporting(db, sample_clinic, female_patient, clinic_user, sample_facility, sample_organization):
    """Create a mix of enrollments for aggregation tests."""

    from hmis.apps.clinics.models import ClinicEnrollment

    today = timezone.now().date()
    start = date(today.year, today.month, 1)
    end = date(today.year + 1, 1, 1) if today.month == 12 else date(today.year, today.month + 1, 1)
    reference_date = end - timedelta(days=1)

    # New enrollment within reporting month
    new_active = ClinicEnrollment.objects.create(
        clinic=sample_clinic,
        patient=female_patient,
        enrollment_date=start,
        status="ACTIVE",
        enrolled_by=clinic_user,
        appointment_interval_days=30,
        next_appointment=reference_date + timedelta(days=7),
    )

    # Existing active enrollment (not a defaulter)
    active_not_defaulter = ClinicEnrollment.objects.create(
        clinic=sample_clinic,
        patient=female_patient,
        enrollment_date=start - timedelta(days=10),
        status="ACTIVE",
        enrolled_by=clinic_user,
        appointment_interval_days=30,
        next_appointment=reference_date - timedelta(days=30),
    )

    # Existing active enrollment that is a defaulter (>= 2 cycles overdue)
    active_defaulter = ClinicEnrollment.objects.create(
        clinic=sample_clinic,
        patient=female_patient,
        enrollment_date=start - timedelta(days=20),
        status="ACTIVE",
        enrolled_by=clinic_user,
        appointment_interval_days=30,
        next_appointment=reference_date - timedelta(days=61),
    )

    return new_active, active_not_defaulter, active_defaulter


@pytest.mark.django_db
class TestMonthlyClinicReportModelContract:
    def test_monthly_clinic_report_model_exists(self):
        """clinics.MonthlyClinicReport model must exist."""
        model = _get_monthly_report_model()
        assert model.__name__ == "MonthlyClinicReport"

    def test_monthly_clinic_report_has_expected_fields(self):
        """Model must include the fields specified in the completion plan."""
        model = _get_monthly_report_model()

        field_names = {f.name for f in model._meta.get_fields()}
        for required in [
            "clinic",
            "year",
            "month",
            "total_visits",
            "new_visits",
            "revisits",
            "total_revenue",
            "sha_claims_amount",
            "cash_amount",
            "dhis2_submitted",
            "dhis2_response",
        ]:
            assert required in field_names

    def test_month_validator_rejects_invalid_month(self, sample_clinic):
        """month must be in [1, 12]."""
        model = _get_monthly_report_model()

        report = model(clinic=sample_clinic, year=2026, month=13)
        with pytest.raises(ValidationError):
            report.full_clean()

    def test_unique_constraint_prevents_duplicate_month(self, sample_clinic):
        """There must be a unique constraint on (clinic, year, month)."""
        model = _get_monthly_report_model()

        # Meta.unique_together is explicitly specified in the plan.
        assert ("clinic", "year", "month") in (model._meta.unique_together or ())


@pytest.mark.django_db
class TestMonthlyClinicReportService:
    def test_generate_monthly_report_aggregates_visits_and_revenue(
        self,
        sample_clinic,
        visits_in_month,
        visit_outside_month,
        paid_invoice_for_visit,
        enrollments_for_reporting,
    ):
        """generate_monthly_report aggregates ClinicVisit + Invoice for the month."""
        generate_monthly_report, _generate_all = _import_reporting_service()

        today = timezone.now().date()
        report = generate_monthly_report(sample_clinic, year=today.year, month=today.month)

        assert report.clinic_id == sample_clinic.id
        assert report.year == today.year
        assert report.month == today.month

        assert report.total_visits == 2
        assert report.new_visits == 1
        assert report.revisits == 1

        assert report.total_revenue == Decimal("500.00")

        # Enrollment aggregation
        assert report.new_enrollments == 1
        assert report.active_enrollments == 3
        assert report.defaulters == 1

    def test_generate_monthly_report_is_idempotent(self, sample_clinic, visits_in_month):
        """Calling generate_monthly_report twice should update/return same record."""
        generate_monthly_report, _generate_all = _import_reporting_service()

        today = timezone.now().date()
        report1 = generate_monthly_report(sample_clinic, year=today.year, month=today.month)
        report2 = generate_monthly_report(sample_clinic, year=today.year, month=today.month)

        assert report1.pk == report2.pk


@pytest.mark.django_db
class TestMonthlyClinicReportAPI:
    def test_list_monthly_reports_endpoint(self, authenticated_client, sample_clinic):
        """GET /api/clinics/{id}/reports/monthly/ returns clinic monthly reports."""
        url = f"/api/clinics/{sample_clinic.id}/reports/monthly/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_get_monthly_report_detail_endpoint(self, authenticated_client, sample_clinic):
        """GET /api/clinics/{id}/reports/monthly/{year}/{month}/ returns a report."""
        today = timezone.now().date()
        url = f"/api/clinics/{sample_clinic.id}/reports/monthly/{today.year}/{today.month}/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_regenerate_monthly_report_endpoint(self, authenticated_client, sample_clinic):
        """POST regenerate endpoint recomputes report for (year, month)."""
        today = timezone.now().date()
        url = f"/api/clinics/{sample_clinic.id}/reports/monthly/{today.year}/{today.month}/regenerate/"
        response = authenticated_client.post(url)
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)


@pytest.mark.django_db
class TestMonthlyClinicAggregationTask:
    def test_generate_all_clinic_reports_creates_reports_for_each_clinic(self, sample_clinic):
        """generate_all_clinic_reports(year, month) generates reports for all clinics."""
        _generate_monthly_report, generate_all_clinic_reports = _import_reporting_service()

        today = timezone.now().date()
        reports = generate_all_clinic_reports(year=today.year, month=today.month)

        # Contract: should return an iterable of reports (at least for existing clinic)
        assert len(list(reports)) >= 1
