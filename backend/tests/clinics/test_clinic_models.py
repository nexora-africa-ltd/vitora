"""
Tests for Clinic models - RED PHASE (TDD).

These tests define the expected behavior of the Clinics module data models.
All tests should FAIL initially as models have not been implemented yet.

Following TDD guidelines from docs/tdd-guidelines.md:
1. RED - Write failing tests that define expected behavior
2. GREEN - Write minimal code to make tests pass
3. REFACTOR - Improve code while keeping tests green

Test Organization:
- TestClinicModel: Tests for Clinic model (organizational unit)
- TestClinicScheduleModel: Tests for ClinicSchedule model (operating hours)
- TestClinicStaffModel: Tests for ClinicStaff model (staff assignments)
- TestClinicSessionModel: Tests for ClinicSession model (daily operations)
- TestClinicVisitModel: Tests for ClinicVisit model (queue entry)
- TestClinicEnrollmentModel: Tests for ClinicEnrollment model (chronic care)
"""

from datetime import date, time, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone

User = get_user_model()


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def clinic_user(db):
    """Create a user for clinic staff tests."""
    return User.objects.create_user(
        username="clinic_doctor",
        email="doctor@clinic.test",
        password="testpass123",
        first_name="John",
        last_name="Doctor",
    )


@pytest.fixture
def another_clinic_user(db):
    """Create another user for clinic staff tests."""
    return User.objects.create_user(
        username="clinic_nurse",
        email="nurse@clinic.test",
        password="testpass123",
        first_name="Jane",
        last_name="Nurse",
    )


@pytest.fixture
def sample_clinic(db, sample_facility, sample_organization):
    """Create a sample clinic for testing."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="General OPD",
        clinic_type="GENERAL_OPD",
        code="OPD-001",
        description="General outpatient department",
        location="Block A, Room 1",
        floor="Ground Floor",
        capacity=3,
        status="ACTIVE",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def ccc_clinic(db, sample_facility, sample_organization):
    """Create a CCC (HIV) clinic for sensitive access tests."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="Comprehensive Care Clinic",
        clinic_type="CCC",
        code="CCC-001",
        description="HIV comprehensive care clinic",
        location="Block B, Room 5",
        is_sensitive=True,
        required_permission="clinics.view_ccc_clinic",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def sample_clinic_session(db, sample_clinic, clinic_user, sample_facility, sample_organization):
    """Create a sample clinic session for testing."""
    from hmis.apps.clinics.models import ClinicSession

    return ClinicSession.objects.create(
        clinic=sample_clinic,
        session_date=date.today(),
        status="OPEN",
        opened_at=timezone.now(),
        opened_by=clinic_user,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def sample_clinic_visit(
    db, sample_clinic_session, sample_patient, clinic_user, sample_facility, sample_organization
):
    """Create a sample clinic visit for testing."""
    from hmis.apps.clinics.models import ClinicVisit

    return ClinicVisit.objects.create(
        session=sample_clinic_session,
        patient=sample_patient,
        status="WAITING",
        priority="STANDARD",
        visit_type="NEW",
        source="TRIAGE",
        chief_complaint="Headache for 2 days",
        registered_by=clinic_user,
        facility=sample_facility,
        organization=sample_organization,
    )


# ============================================================================
# TestClinicModel - Tests for Clinic model
# ============================================================================


@pytest.mark.django_db
class TestClinicModel:
    """Test suite for Clinic model."""

    def test_create_clinic_with_required_fields(self, db):
        """Clinic can be created with minimum required fields."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic.objects.create(
            name="Eye Clinic",
            clinic_type="EYE",
            code="EYE-001",
        )

        assert clinic.id is not None
        assert clinic.name == "Eye Clinic"
        assert clinic.clinic_type == "EYE"
        assert clinic.code == "EYE-001"
        assert clinic.created_at is not None
        assert clinic.updated_at is not None

    def test_clinic_code_must_be_unique(self, sample_clinic):
        """Clinic code must be unique across all clinics."""
        from hmis.apps.clinics.models import Clinic

        with pytest.raises(IntegrityError):
            Clinic.objects.create(
                name="Duplicate Clinic",
                clinic_type="GENERAL_OPD",
                code="OPD-001",  # Same code as sample_clinic
            )

    def test_clinic_type_choices_validation(self, db):
        """Clinic type must be a valid choice."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic(
            name="Invalid Clinic",
            clinic_type="INVALID_TYPE",  # Invalid choice
            code="INV-001",
        )

        with pytest.raises(ValidationError):
            clinic.full_clean()

    def test_clinic_status_choices_validation(self, db):
        """Clinic status must be a valid choice."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic(
            name="Test Clinic",
            clinic_type="GENERAL_OPD",
            code="TEST-001",
            status="INVALID_STATUS",  # Invalid choice
        )

        with pytest.raises(ValidationError):
            clinic.full_clean()

    def test_clinic_default_status_is_active(self, db):
        """Clinic default status should be ACTIVE."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic.objects.create(
            name="Default Status Clinic",
            clinic_type="DENTAL",
            code="DENT-001",
        )

        assert clinic.status == "ACTIVE"

    def test_clinic_default_capacity_is_one(self, db):
        """Clinic default capacity should be 1."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic.objects.create(
            name="Capacity Test Clinic",
            clinic_type="EYE",
            code="CAP-001",
        )

        assert clinic.capacity == 1

    def test_clinic_default_accepts_walk_ins_is_true(self, db):
        """Clinic default accepts_walk_ins should be True."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic.objects.create(
            name="Walk-in Test Clinic",
            clinic_type="GENERAL_OPD",
            code="WALK-001",
        )

        assert clinic.accepts_walk_ins is True

    def test_clinic_default_triage_required_is_true(self, db):
        """Clinic default triage_required should be True."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic.objects.create(
            name="Triage Test Clinic",
            clinic_type="GENERAL_OPD",
            code="TRIAGE-001",
        )

        assert clinic.triage_required is True

    def test_clinic_string_representation(self, sample_clinic):
        """Clinic string representation should include name and type."""
        str_repr = str(sample_clinic)
        assert "General OPD" in str_repr

    def test_clinic_is_scheduled_today_with_schedule(self, sample_clinic):
        """is_scheduled_today returns True when clinic has schedule for today."""
        from hmis.apps.clinics.models import ClinicSchedule

        today_weekday = date.today().weekday()
        ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=today_weekday,
            start_time=time(8, 0),
            end_time=time(17, 0),
            is_active=True,
        )

        assert sample_clinic.is_scheduled_today() is True

    def test_clinic_is_scheduled_today_without_schedule(self, sample_clinic):
        """is_scheduled_today returns False when clinic has no schedule for today."""
        # No schedule created for today
        assert sample_clinic.is_scheduled_today() is False

    def test_clinic_is_open_today_without_open_session(self, sample_clinic):
        """is_open_today returns False when clinic has no OPEN session."""
        from hmis.apps.clinics.models import ClinicSchedule

        today_weekday = date.today().weekday()
        ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=today_weekday,
            start_time=time(8, 0),
            end_time=time(17, 0),
            is_active=True,
        )

        # Has schedule but no open session
        assert sample_clinic.is_open_today() is False

    def test_clinic_is_open_today_with_open_session(self, sample_clinic):
        """is_open_today returns True when clinic has an OPEN session today."""
        from hmis.apps.clinics.models import ClinicSession

        ClinicSession.objects.create(
            clinic=sample_clinic,
            session_date=date.today(),
            status="OPEN",
        )

        assert sample_clinic.is_open_today() is True

    def test_clinic_is_open_today_with_closed_session(self, sample_clinic):
        """is_open_today returns False when session exists but is CLOSED."""
        from hmis.apps.clinics.models import ClinicSession

        ClinicSession.objects.create(
            clinic=sample_clinic,
            session_date=date.today(),
            status="CLOSED",
        )

        assert sample_clinic.is_open_today() is False

    def test_clinic_get_current_session_creates_new_session(self, sample_clinic):
        """get_current_session creates session for today if not exists."""
        from hmis.apps.clinics.models import ClinicSession

        # Ensure no session exists for today
        ClinicSession.objects.filter(
            clinic=sample_clinic,
            session_date=date.today(),
        ).delete()

        session = sample_clinic.get_current_session()

        assert session is not None
        assert session.clinic == sample_clinic
        assert session.session_date == date.today()
        assert session.status == "OPEN"

    def test_clinic_get_current_session_returns_existing_session(
        self, sample_clinic, sample_clinic_session
    ):
        """get_current_session returns existing session for today."""
        session = sample_clinic.get_current_session()

        assert session.id == sample_clinic_session.id

    def test_clinic_sensitive_flag(self, ccc_clinic):
        """Sensitive clinics should have is_sensitive=True."""
        assert ccc_clinic.is_sensitive is True
        assert ccc_clinic.required_permission == "clinics.view_ccc_clinic"

    def test_clinic_eligibility_rules_json_field(self, db):
        """Clinic can store eligibility rules as JSON."""
        from hmis.apps.clinics.models import Clinic

        eligibility = {
            "min_age": 0,
            "max_age": 5,
            "gender": ["F"],
            "conditions": ["pregnancy"],
        }

        clinic = Clinic.objects.create(
            name="CWC Test",
            clinic_type="CWC",
            code="CWC-001",
            eligibility_rules=eligibility,
        )

        assert clinic.eligibility_rules == eligibility
        assert clinic.eligibility_rules["max_age"] == 5

    def test_clinic_billing_fields(self, db):
        """Clinic can have billing fields set."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic.objects.create(
            name="Billing Test Clinic",
            clinic_type="DENTAL",
            code="BILL-001",
            default_service_fee=Decimal("500.00"),
            sha_service_code="DENT-CONSULT-001",
        )

        assert clinic.default_service_fee == Decimal("500.00")
        assert clinic.sha_service_code == "DENT-CONSULT-001"

    def test_clinic_dhis2_fields(self, db):
        """Clinic can have DHIS2 integration fields set."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic.objects.create(
            name="DHIS2 Test Clinic",
            clinic_type="ANC",
            code="DHIS-001",
            dhis2_org_unit_id="abc123xyz",
            moh_code="MOH-711",
        )

        assert clinic.dhis2_org_unit_id == "abc123xyz"
        assert clinic.moh_code == "MOH-711"

    @pytest.mark.parametrize(
        "clinic_type",
        [
            "GENERAL_OPD",
            "FILTER_CLINIC",
            "ANC",
            "PNC",
            "FP",
            "CWC",
            "IMMUNIZATION",
            "NUTRITION",
            "DENTAL",
            "EYE",
            "ENT",
            "SURGICAL",
            "ORTHO",
            "PHYSIO",
            "DERM",
            "CCC",
            "TB",
            "DIABETIC",
            "HYPERTENSION",
            "MENTAL_HEALTH",
            "ONCOLOGY",
            "DIALYSIS",
            "PROCEDURE",
            "DRESSING",
            "INJECTION",
            "OTHER",
        ],
    )
    def test_clinic_type_valid_choices(self, db, clinic_type):
        """All defined clinic types should be valid."""
        from hmis.apps.clinics.models import Clinic

        clinic = Clinic.objects.create(
            name=f"{clinic_type} Test",
            clinic_type=clinic_type,
            code=f"{clinic_type}-TEST-001",
        )

        assert clinic.clinic_type == clinic_type


# ============================================================================
# TestClinicScheduleModel - Tests for ClinicSchedule model
# ============================================================================


@pytest.mark.django_db
class TestClinicScheduleModel:
    """Test suite for ClinicSchedule model."""

    def test_create_clinic_schedule(self, sample_clinic):
        """ClinicSchedule can be created with required fields."""
        from hmis.apps.clinics.models import ClinicSchedule

        schedule = ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=0,  # Monday
            start_time=time(8, 0),
            end_time=time(17, 0),
        )

        assert schedule.id is not None
        assert schedule.clinic == sample_clinic
        assert schedule.day_of_week == 0
        assert schedule.start_time == time(8, 0)
        assert schedule.end_time == time(17, 0)

    def test_clinic_schedule_default_max_patients(self, sample_clinic):
        """ClinicSchedule default max_patients should be 50."""
        from hmis.apps.clinics.models import ClinicSchedule

        schedule = ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=1,  # Tuesday
            start_time=time(8, 0),
            end_time=time(12, 0),
        )

        assert schedule.max_patients == 50

    def test_clinic_schedule_default_is_active(self, sample_clinic):
        """ClinicSchedule default is_active should be True."""
        from hmis.apps.clinics.models import ClinicSchedule

        schedule = ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=2,  # Wednesday
            start_time=time(9, 0),
            end_time=time(15, 0),
        )

        assert schedule.is_active is True

    def test_clinic_schedule_unique_together(self, sample_clinic):
        """Same clinic cannot have duplicate schedule for same day and time."""
        from hmis.apps.clinics.models import ClinicSchedule

        ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=3,  # Thursday
            start_time=time(8, 0),
            end_time=time(17, 0),
        )

        with pytest.raises(IntegrityError):
            ClinicSchedule.objects.create(
                clinic=sample_clinic,
                day_of_week=3,  # Same day
                start_time=time(8, 0),  # Same start time
                end_time=time(12, 0),
            )

    def test_clinic_schedule_string_representation(self, sample_clinic):
        """ClinicSchedule string representation should include clinic and day."""
        from hmis.apps.clinics.models import ClinicSchedule

        schedule = ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=0,  # Monday
            start_time=time(8, 0),
            end_time=time(17, 0),
        )

        str_repr = str(schedule)
        assert sample_clinic.name in str_repr
        assert "Monday" in str_repr

    @pytest.mark.parametrize(
        "day_of_week,day_name",
        [
            (0, "Monday"),
            (1, "Tuesday"),
            (2, "Wednesday"),
            (3, "Thursday"),
            (4, "Friday"),
            (5, "Saturday"),
            (6, "Sunday"),
        ],
    )
    def test_clinic_schedule_day_choices(self, sample_clinic, day_of_week, day_name):
        """ClinicSchedule should accept valid day_of_week values 0-6."""
        from hmis.apps.clinics.models import ClinicSchedule

        schedule = ClinicSchedule.objects.create(
            clinic=sample_clinic,
            day_of_week=day_of_week,
            start_time=time(9, 0),
            end_time=time(16, 0),
        )

        assert schedule.get_day_of_week_display() == day_name


# ============================================================================
# TestClinicStaffModel - Tests for ClinicStaff model
# ============================================================================


@pytest.mark.django_db
class TestClinicStaffModel:
    """Test suite for ClinicStaff model."""

    def test_create_clinic_staff_assignment(self, sample_clinic, clinic_user):
        """ClinicStaff assignment can be created."""
        from hmis.apps.clinics.models import ClinicStaff

        assignment = ClinicStaff.objects.create(
            clinic=sample_clinic,
            user=clinic_user,
            role="DOCTOR",
            start_date=date.today(),
        )

        assert assignment.id is not None
        assert assignment.clinic == sample_clinic
        assert assignment.user == clinic_user
        assert assignment.role == "DOCTOR"

    def test_clinic_staff_default_role_is_doctor(self, sample_clinic, clinic_user):
        """ClinicStaff default role should be DOCTOR."""
        from hmis.apps.clinics.models import ClinicStaff

        assignment = ClinicStaff.objects.create(
            clinic=sample_clinic,
            user=clinic_user,
            start_date=date.today(),
        )

        assert assignment.role == "DOCTOR"

    def test_clinic_staff_default_is_active(self, sample_clinic, clinic_user):
        """ClinicStaff default is_active should be True."""
        from hmis.apps.clinics.models import ClinicStaff

        assignment = ClinicStaff.objects.create(
            clinic=sample_clinic,
            user=clinic_user,
            start_date=date.today(),
        )

        assert assignment.is_active is True

    def test_clinic_staff_unique_together(self, sample_clinic, clinic_user):
        """Same user cannot have duplicate role in same clinic."""
        from hmis.apps.clinics.models import ClinicStaff

        ClinicStaff.objects.create(
            clinic=sample_clinic,
            user=clinic_user,
            role="DOCTOR",
            start_date=date.today(),
        )

        with pytest.raises(IntegrityError):
            ClinicStaff.objects.create(
                clinic=sample_clinic,
                user=clinic_user,
                role="DOCTOR",  # Same role
                start_date=date.today(),
            )

    def test_clinic_staff_same_user_different_roles(self, sample_clinic, clinic_user):
        """Same user can have different roles in same clinic."""
        from hmis.apps.clinics.models import ClinicStaff

        assignment1 = ClinicStaff.objects.create(
            clinic=sample_clinic,
            user=clinic_user,
            role="DOCTOR",
            start_date=date.today(),
        )

        assignment2 = ClinicStaff.objects.create(
            clinic=sample_clinic,
            user=clinic_user,
            role="LEAD",  # Different role
            start_date=date.today(),
        )

        assert assignment1.id != assignment2.id

    def test_clinic_staff_string_representation(self, sample_clinic, clinic_user):
        """ClinicStaff string representation should include user and clinic."""
        from hmis.apps.clinics.models import ClinicStaff

        assignment = ClinicStaff.objects.create(
            clinic=sample_clinic,
            user=clinic_user,
            role="DOCTOR",
            start_date=date.today(),
        )

        str_repr = str(assignment)
        assert sample_clinic.name in str_repr
        assert "Doctor" in str_repr  # Role display name

    @pytest.mark.parametrize(
        "role",
        ["LEAD", "DOCTOR", "NURSE", "COUNSELOR", "NUTRITIONIST", "CLERK", "OTHER"],
    )
    def test_clinic_staff_valid_roles(self, sample_clinic, clinic_user, role):
        """All defined staff roles should be valid."""
        # Delete any existing assignment to avoid unique constraint
        from hmis.apps.clinics.models import ClinicStaff
        from hmis.apps.clinics.models import ClinicStaff as CS

        CS.objects.filter(clinic=sample_clinic, user=clinic_user).delete()

        assignment = ClinicStaff.objects.create(
            clinic=sample_clinic,
            user=clinic_user,
            role=role,
            start_date=date.today(),
        )

        assert assignment.role == role


# ============================================================================
# TestClinicSessionModel - Tests for ClinicSession model
# ============================================================================


@pytest.mark.django_db
class TestClinicSessionModel:
    """Test suite for ClinicSession model."""

    def test_create_clinic_session(self, sample_clinic):
        """ClinicSession can be created with required fields."""
        from hmis.apps.clinics.models import ClinicSession

        session = ClinicSession.objects.create(
            clinic=sample_clinic,
            session_date=date.today(),
        )

        assert session.id is not None
        assert session.clinic == sample_clinic
        assert session.session_date == date.today()

    def test_clinic_session_default_status_is_scheduled(self, sample_clinic):
        """ClinicSession default status should be SCHEDULED."""
        from hmis.apps.clinics.models import ClinicSession

        session = ClinicSession.objects.create(
            clinic=sample_clinic,
            session_date=date.today() + timedelta(days=1),
        )

        assert session.status == "SCHEDULED"

    def test_clinic_session_unique_together(self, sample_clinic):
        """Same clinic cannot have duplicate sessions for same date."""
        from hmis.apps.clinics.models import ClinicSession

        session_date = date.today() + timedelta(days=7)

        ClinicSession.objects.create(
            clinic=sample_clinic,
            session_date=session_date,
        )

        with pytest.raises(IntegrityError):
            ClinicSession.objects.create(
                clinic=sample_clinic,
                session_date=session_date,  # Same date
            )

    def test_clinic_session_open_session(self, sample_clinic, clinic_user):
        """open_session method should update status and timestamps."""
        from hmis.apps.clinics.models import ClinicSession

        session = ClinicSession.objects.create(
            clinic=sample_clinic,
            session_date=date.today() + timedelta(days=2),
        )

        session.open_session(clinic_user)

        assert session.status == "OPEN"
        assert session.opened_at is not None
        assert session.opened_by == clinic_user

    def test_clinic_session_close_session(self, sample_clinic_session, clinic_user):
        """close_session method should update status and timestamps."""
        sample_clinic_session.close_session(clinic_user)

        assert sample_clinic_session.status == "CLOSED"
        assert sample_clinic_session.closed_at is not None
        assert sample_clinic_session.closed_by == clinic_user

    def test_clinic_session_update_statistics(
        self, sample_clinic_session, sample_patient, clinic_user
    ):
        """update_statistics should correctly count visits by status."""
        from hmis.apps.clinics.models import ClinicVisit

        # Create visits with different statuses
        ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            status="WAITING",
            priority="STANDARD",
            visit_type="NEW",
            source="TRIAGE",
            registered_by=clinic_user,
        )

        sample_clinic_session.update_statistics()

        assert sample_clinic_session.patients_registered >= 1
        assert sample_clinic_session.patients_waiting >= 1

    def test_clinic_session_string_representation(self, sample_clinic_session):
        """ClinicSession string representation should include clinic and date."""
        str_repr = str(sample_clinic_session)
        assert sample_clinic_session.clinic.name in str_repr

    def test_clinic_session_statistics_default_to_zero(self, sample_clinic):
        """ClinicSession statistics should default to 0."""
        from hmis.apps.clinics.models import ClinicSession

        session = ClinicSession.objects.create(
            clinic=sample_clinic,
            session_date=date.today() + timedelta(days=3),
        )

        assert session.patients_registered == 0
        assert session.patients_seen == 0
        assert session.patients_waiting == 0

    @pytest.mark.parametrize(
        "status",
        ["SCHEDULED", "OPEN", "CLOSED", "CANCELLED"],
    )
    def test_clinic_session_valid_statuses(self, sample_clinic, status):
        """All defined session statuses should be valid."""
        from hmis.apps.clinics.models import ClinicSession

        session = ClinicSession.objects.create(
            clinic=sample_clinic,
            session_date=date.today() + timedelta(days=10 + hash(status) % 100),
            status=status,
        )

        assert session.status == status


# ============================================================================
# TestClinicVisitModel - Tests for ClinicVisit model
# ============================================================================


@pytest.mark.django_db
class TestClinicVisitModel:
    """Test suite for ClinicVisit model."""

    def test_create_clinic_visit(self, sample_clinic_session, sample_patient, clinic_user):
        """ClinicVisit can be created with required fields."""
        from hmis.apps.clinics.models import ClinicVisit

        visit = ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            chief_complaint="Test complaint",
            registered_by=clinic_user,
        )

        assert visit.id is not None
        assert visit.session == sample_clinic_session
        assert visit.patient == sample_patient
        assert visit.queue_number is not None  # Auto-assigned

    def test_clinic_visit_auto_queue_number(
        self,
        sample_clinic_session,
        sample_patient,
        clinic_user,
        sample_organization,
    ):
        """ClinicVisit should auto-assign queue number if not set."""
        from hmis.apps.clinics.models import ClinicVisit

        visit1 = ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            chief_complaint="First visit",
            registered_by=clinic_user,
        )

        # Create another patient for second visit
        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        county = County.objects.first() or County.objects.create(code=99, name="Test")
        sub_county = SubCounty.objects.first() or SubCounty.objects.create(
            county=county, name="Test Sub"
        )

        patient2 = Patient.objects.create(
            first_name="Second",
            last_name="Patient",
            date_of_birth="1990-01-01",
            gender="M",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        visit2 = ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=patient2,
            chief_complaint="Second visit",
            registered_by=clinic_user,
        )

        assert visit1.queue_number == 1 or visit1.queue_number >= 1
        assert visit2.queue_number > visit1.queue_number

    def test_clinic_visit_unique_queue_number_per_session(
        self,
        sample_clinic_session,
        sample_patient,
        clinic_user,
        sample_organization,
    ):
        """Queue number must be unique within a session."""
        from hmis.apps.clinics.models import ClinicVisit

        ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            queue_number=999,
            chief_complaint="Test",
            registered_by=clinic_user,
        )

        from hmis.apps.core.models import County, SubCounty
        from hmis.apps.patients.models import Patient

        county = County.objects.first() or County.objects.create(code=98, name="Test2")
        sub_county = SubCounty.objects.first() or SubCounty.objects.create(
            county=county, name="Test Sub2"
        )

        patient2 = Patient.objects.create(
            first_name="Another",
            last_name="Patient",
            date_of_birth="1985-05-15",
            gender="F",
            county=county,
            sub_county=sub_county,
            organization=sample_organization,
        )

        with pytest.raises(IntegrityError):
            ClinicVisit.objects.create(
                session=sample_clinic_session,
                patient=patient2,
                queue_number=999,  # Same queue number
                chief_complaint="Duplicate queue number",
                registered_by=clinic_user,
            )

    def test_clinic_visit_default_status_is_registered(
        self, sample_clinic_session, sample_patient, clinic_user
    ):
        """ClinicVisit default status should be REGISTERED."""
        from hmis.apps.clinics.models import ClinicVisit

        visit = ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            chief_complaint="Default status test",
            registered_by=clinic_user,
        )

        assert visit.status == "REGISTERED"

    def test_clinic_visit_default_priority_is_standard(
        self, sample_clinic_session, sample_patient, clinic_user
    ):
        """ClinicVisit default priority should be STANDARD."""
        from hmis.apps.clinics.models import ClinicVisit

        visit = ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            chief_complaint="Default priority test",
            registered_by=clinic_user,
        )

        assert visit.priority == "STANDARD"

    def test_clinic_visit_call_patient(self, sample_clinic_visit, clinic_user):
        """call_patient method should update status and timestamps."""
        sample_clinic_visit.call_patient(clinic_user)

        assert sample_clinic_visit.status == "CALLED"
        assert sample_clinic_visit.called_at is not None
        assert sample_clinic_visit.assigned_clinician == clinic_user

    def test_clinic_visit_start_consultation_creates_encounter(self, sample_clinic_visit):
        """start_consultation should create an Encounter if not exists."""
        encounter = sample_clinic_visit.start_consultation()

        assert sample_clinic_visit.status == "IN_CONSULTATION"
        assert sample_clinic_visit.consultation_started_at is not None
        assert sample_clinic_visit.encounter is not None
        assert encounter.patient == sample_clinic_visit.patient

    def test_clinic_visit_complete_visit(self, sample_clinic_visit):
        """complete_visit should update status and timestamps."""
        sample_clinic_visit.complete_visit()

        assert sample_clinic_visit.status == "COMPLETED"
        assert sample_clinic_visit.completed_at is not None

    def test_clinic_visit_refer_to_clinic(self, sample_clinic_visit, ccc_clinic, clinic_user):
        """refer_to_clinic should create new visit in target clinic."""
        new_visit = sample_clinic_visit.refer_to_clinic(
            target_clinic=ccc_clinic,
            reason="Needs HIV testing",
            user=clinic_user,
        )

        assert sample_clinic_visit.status == "REFERRED"
        assert sample_clinic_visit.referred_to_clinic == ccc_clinic
        assert new_visit is not None
        assert new_visit.patient == sample_clinic_visit.patient
        assert new_visit.visit_type == "REFERRAL"
        assert new_visit.source == "REFERRAL"
        assert new_visit.referred_from == sample_clinic_visit

    def test_clinic_visit_wait_time_calculation(self, sample_clinic_visit):
        """wait_time_minutes should calculate time since registration."""
        wait_time = sample_clinic_visit.wait_time_minutes

        assert isinstance(wait_time, int)
        assert wait_time >= 0

    def test_clinic_visit_string_representation(self, sample_clinic_visit):
        """ClinicVisit string representation should include patient and clinic."""
        str_repr = str(sample_clinic_visit)
        assert (
            str(sample_clinic_visit.patient) in str_repr
            or sample_clinic_visit.session.clinic.name in str_repr
        )

    @pytest.mark.parametrize(
        "status",
        [
            "REGISTERED",
            "WAITING",
            "CALLED",
            "IN_CONSULTATION",
            "COMPLETED",
            "REFERRED",
            "NO_SHOW",
            "CANCELLED",
        ],
    )
    def test_clinic_visit_valid_statuses(
        self, sample_clinic_session, sample_patient, clinic_user, status
    ):
        """All defined visit statuses should be valid."""
        from hmis.apps.clinics.models import ClinicVisit

        visit = ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            status=status,
            chief_complaint=f"Status test: {status}",
            registered_by=clinic_user,
        )

        assert visit.status == status

    @pytest.mark.parametrize(
        "priority",
        ["EMERGENCY", "URGENT", "PRIORITY", "STANDARD", "NON_URGENT"],
    )
    def test_clinic_visit_valid_priorities(
        self, sample_clinic_session, sample_patient, clinic_user, priority
    ):
        """All defined visit priorities should be valid."""
        from hmis.apps.clinics.models import ClinicVisit

        visit = ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            priority=priority,
            chief_complaint=f"Priority test: {priority}",
            registered_by=clinic_user,
        )

        assert visit.priority == priority

    @pytest.mark.parametrize(
        "visit_type",
        ["NEW", "RETURN", "FOLLOW_UP", "REFERRAL", "SCHEDULED", "EMERGENCY"],
    )
    def test_clinic_visit_valid_types(
        self, sample_clinic_session, sample_patient, clinic_user, visit_type
    ):
        """All defined visit types should be valid."""
        from hmis.apps.clinics.models import ClinicVisit

        visit = ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            visit_type=visit_type,
            chief_complaint=f"Visit type test: {visit_type}",
            registered_by=clinic_user,
        )

        assert visit.visit_type == visit_type

    @pytest.mark.parametrize(
        "source",
        ["TRIAGE", "DIRECT", "REFERRAL", "APPOINTMENT", "INPATIENT"],
    )
    def test_clinic_visit_valid_sources(
        self, sample_clinic_session, sample_patient, clinic_user, source
    ):
        """All defined visit sources should be valid."""
        from hmis.apps.clinics.models import ClinicVisit

        visit = ClinicVisit.objects.create(
            session=sample_clinic_session,
            patient=sample_patient,
            source=source,
            chief_complaint=f"Source test: {source}",
            registered_by=clinic_user,
        )

        assert visit.source == source


# ============================================================================
# TestClinicEnrollmentModel - Tests for ClinicEnrollment model
# ============================================================================


@pytest.mark.django_db
class TestClinicEnrollmentModel:
    """Test suite for ClinicEnrollment model."""

    def test_create_clinic_enrollment(self, ccc_clinic, sample_patient, clinic_user):
        """ClinicEnrollment can be created with required fields."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        assert enrollment.id is not None
        assert enrollment.clinic == ccc_clinic
        assert enrollment.patient == sample_patient
        assert enrollment.enrollment_date == date.today()

    def test_clinic_enrollment_default_status_is_active(
        self, ccc_clinic, sample_patient, clinic_user
    ):
        """ClinicEnrollment default status should be ACTIVE."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        assert enrollment.status == "ACTIVE"

    def test_clinic_enrollment_default_appointment_interval(
        self, ccc_clinic, sample_patient, clinic_user
    ):
        """ClinicEnrollment default appointment_interval_days should be 30."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        assert enrollment.appointment_interval_days == 30

    def test_clinic_enrollment_unique_together(self, ccc_clinic, sample_patient, clinic_user):
        """Same patient cannot have duplicate enrollment in same clinic on same date."""
        from hmis.apps.clinics.models import ClinicEnrollment

        ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        with pytest.raises(IntegrityError):
            ClinicEnrollment.objects.create(
                clinic=ccc_clinic,
                patient=sample_patient,
                enrollment_date=date.today(),  # Same date
                enrolled_by=clinic_user,
            )

    def test_clinic_enrollment_ccc_data(self, ccc_clinic, sample_patient, clinic_user):
        """ClinicEnrollment can store CCC-specific enrollment data."""
        from hmis.apps.clinics.models import ClinicEnrollment

        ccc_data = {
            "art_start_date": "2024-01-15",
            "current_regimen": "TDF/3TC/DTG",
            "who_stage": 2,
            "cd4_baseline": 350,
        }

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrollment_number="CCC-12345",
            enrollment_data=ccc_data,
            enrolled_by=clinic_user,
        )

        assert enrollment.enrollment_data == ccc_data
        assert enrollment.enrollment_data["current_regimen"] == "TDF/3TC/DTG"

    def test_clinic_enrollment_anc_data(self, sample_patient, clinic_user):
        """ClinicEnrollment can store ANC-specific enrollment data."""
        from hmis.apps.clinics.models import Clinic, ClinicEnrollment

        anc_clinic = Clinic.objects.create(
            name="ANC Clinic",
            clinic_type="ANC",
            code="ANC-TEST-001",
        )

        anc_data = {
            "lmp": "2025-09-01",
            "edd": "2026-06-08",
            "gravida": 2,
            "parity": 1,
        }

        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrollment_number="ANC-12345",
            enrollment_data=anc_data,
            enrolled_by=clinic_user,
        )

        assert enrollment.enrollment_data == anc_data
        assert enrollment.enrollment_data["gravida"] == 2

    def test_clinic_enrollment_is_overdue_true(self, ccc_clinic, sample_patient, clinic_user):
        """is_overdue returns True when next_appointment is in the past."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=60),
            next_appointment=date.today() - timedelta(days=7),  # Past date
            enrolled_by=clinic_user,
        )

        assert enrollment.is_overdue() is True

    def test_clinic_enrollment_is_overdue_false(self, ccc_clinic, sample_patient, clinic_user):
        """is_overdue returns False when next_appointment is in the future."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            next_appointment=date.today() + timedelta(days=7),  # Future date
            enrolled_by=clinic_user,
        )

        assert enrollment.is_overdue() is False

    def test_clinic_enrollment_is_overdue_none(self, ccc_clinic, sample_patient, clinic_user):
        """is_overdue returns False when next_appointment is None."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            next_appointment=None,
            enrolled_by=clinic_user,
        )

        assert enrollment.is_overdue() is False

    def test_clinic_enrollment_days_since_last_visit(self, ccc_clinic, sample_patient, clinic_user):
        """days_since_last_visit calculates correct number of days."""
        from hmis.apps.clinics.models import ClinicEnrollment

        last_visit = date.today() - timedelta(days=15)

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=60),
            last_visit_date=last_visit,
            enrolled_by=clinic_user,
        )

        days = enrollment.days_since_last_visit()
        assert days == 15

    def test_clinic_enrollment_days_since_last_visit_none(
        self, ccc_clinic, sample_patient, clinic_user
    ):
        """days_since_last_visit returns None when last_visit_date is None."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            last_visit_date=None,
            enrolled_by=clinic_user,
        )

        assert enrollment.days_since_last_visit() is None

    def test_clinic_enrollment_record_visit(self, ccc_clinic, sample_patient, clinic_user):
        """record_visit updates last_visit_date, total_visits, and next_appointment."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=60),
            total_visits=5,
            appointment_interval_days=30,
            enrolled_by=clinic_user,
        )

        enrollment.record_visit()

        assert enrollment.last_visit_date == date.today()
        assert enrollment.total_visits == 6
        assert enrollment.next_appointment == date.today() + timedelta(days=30)

    def test_clinic_enrollment_string_representation(self, ccc_clinic, sample_patient, clinic_user):
        """ClinicEnrollment string representation should include patient and clinic."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrollment_number="CCC-99999",
            enrolled_by=clinic_user,
        )

        str_repr = str(enrollment)
        assert ccc_clinic.name in str_repr or "CCC-99999" in str_repr

    @pytest.mark.parametrize(
        "status",
        [
            "ACTIVE",
            "COMPLETED",
            "TRANSFERRED_OUT",
            "LOST_TO_FOLLOW_UP",
            "DECEASED",
            "SUSPENDED",
        ],
    )
    def test_clinic_enrollment_valid_statuses(
        self, ccc_clinic, sample_patient, clinic_user, status
    ):
        """All defined enrollment statuses should be valid."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=hash(status) % 100),
            status=status,
            enrolled_by=clinic_user,
        )

        assert enrollment.status == status


# ============================================================================
# Test Class: CCC (HIV) Enrollment Features
# ============================================================================


@pytest.mark.django_db
class TestCCCEnrollmentFeatures:
    """Tests for CCC (HIV) specific enrollment features."""

    def test_ccc_enrollment_art_fields(self, ccc_clinic, sample_patient, clinic_user):
        """CCC enrollment should store ART-specific fields."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrollment_number="CCC-12345",
            enrolled_by=clinic_user,
            # CCC specific fields
            art_start_date=date.today() - timedelta(days=365),
            current_art_regimen="TDF/3TC/DTG",
            art_regimen_line="FIRST_LINE",
            who_clinical_stage=2,
            baseline_cd4_count=350,
        )

        assert enrollment.art_start_date == date.today() - timedelta(days=365)
        assert enrollment.current_art_regimen == "TDF/3TC/DTG"
        assert enrollment.art_regimen_line == "FIRST_LINE"
        assert enrollment.who_clinical_stage == 2
        assert enrollment.baseline_cd4_count == 350

    def test_ccc_enrollment_viral_load_update(self, ccc_clinic, sample_patient, clinic_user):
        """update_viral_load should update viral load and suppression status."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        # Update with suppressed viral load (<1000)
        enrollment.update_viral_load(50)

        assert enrollment.latest_viral_load == 50
        assert enrollment.latest_viral_load_date == date.today()
        assert enrollment.viral_load_suppressed is True

    def test_ccc_enrollment_viral_load_unsuppressed(self, ccc_clinic, sample_patient, clinic_user):
        """Viral load >= 1000 should be marked as unsuppressed."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        enrollment.update_viral_load(5000)

        assert enrollment.latest_viral_load == 5000
        assert enrollment.viral_load_suppressed is False

    def test_ccc_enrollment_cd4_update(self, ccc_clinic, sample_patient, clinic_user):
        """update_cd4_count should update CD4 count."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        enrollment.update_cd4_count(450)

        assert enrollment.latest_cd4_count == 450
        assert enrollment.latest_cd4_date == date.today()

    def test_ccc_enrollment_is_virally_suppressed(self, ccc_clinic, sample_patient, clinic_user):
        """is_virally_suppressed should return correct status."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            latest_viral_load=200,
            viral_load_suppressed=True,
        )

        assert enrollment.is_virally_suppressed() is True

    def test_ccc_enrollment_viral_load_due(self, ccc_clinic, sample_patient, clinic_user):
        """viral_load_due should return True if > 6 months since last test."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # Never tested
        enrollment1 = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=365),
            enrolled_by=clinic_user,
        )
        assert enrollment1.viral_load_due() is True

        # Tested 7 months ago (different enrollment date to avoid unique constraint)
        enrollment2 = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=364),
            enrolled_by=clinic_user,
            latest_viral_load_date=date.today() - timedelta(days=210),
        )
        assert enrollment2.viral_load_due() is True

        # Tested 3 months ago (different enrollment date to avoid unique constraint)
        enrollment3 = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=180),
            enrolled_by=clinic_user,
            latest_viral_load_date=date.today() - timedelta(days=90),
        )
        assert enrollment3.viral_load_due() is False

    def test_ccc_enrollment_days_on_art(self, ccc_clinic, sample_patient, clinic_user):
        """days_on_art should calculate correct duration."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=365),
            enrolled_by=clinic_user,
            art_start_date=date.today() - timedelta(days=100),
        )

        assert enrollment.days_on_art() == 100

    def test_ccc_enrollment_days_on_art_none(self, ccc_clinic, sample_patient, clinic_user):
        """days_on_art should return None if art_start_date not set."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        assert enrollment.days_on_art() is None

    def test_ccc_enrollment_clinic_specific_summary(self, ccc_clinic, sample_patient, clinic_user):
        """get_clinic_specific_summary should return CCC data."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            art_start_date=date.today() - timedelta(days=365),
            current_art_regimen="TDF/3TC/DTG",
            latest_viral_load=50,
            viral_load_suppressed=True,
        )

        summary = enrollment.get_clinic_specific_summary()

        assert summary["type"] == "CCC"
        assert summary["current_regimen"] == "TDF/3TC/DTG"
        assert summary["viral_load_suppressed"] is True


# ============================================================================
# Test Class: ANC (Antenatal) Enrollment Features
# ============================================================================


@pytest.mark.django_db
class TestANCEnrollmentFeatures:
    """Tests for ANC (Antenatal) specific enrollment features."""

    @pytest.fixture
    def anc_clinic(self, db, sample_facility, sample_organization):
        """Create an ANC clinic for testing."""
        from hmis.apps.clinics.models import Clinic

        return Clinic.objects.create(
            name="Antenatal Clinic",
            clinic_type="ANC",
            code="ANC-001",
            description="Antenatal care clinic",
            facility=sample_facility,
            organization=sample_organization,
        )

    def test_anc_enrollment_fields(self, anc_clinic, sample_patient, clinic_user):
        """ANC enrollment should store ANC-specific fields."""
        from hmis.apps.clinics.models import ClinicEnrollment

        lmp_date = date.today() - timedelta(days=140)  # 20 weeks

        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            gravida=2,
            para=1,
            lmp=lmp_date,
            blood_group="O+",
            rhesus_factor="POSITIVE",
            hiv_status="NEGATIVE",
        )

        assert enrollment.gravida == 2
        assert enrollment.para == 1
        assert enrollment.lmp == lmp_date
        assert enrollment.blood_group == "O+"

    def test_anc_enrollment_calculate_edd(self, anc_clinic, sample_patient, clinic_user):
        """calculate_edd should compute EDD from LMP (Naegele's rule: LMP + 280 days)."""
        from hmis.apps.clinics.models import ClinicEnrollment

        lmp_date = date.today() - timedelta(days=100)

        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            lmp=lmp_date,
        )

        enrollment.calculate_edd()

        assert enrollment.edd == lmp_date + timedelta(days=280)

    def test_anc_enrollment_gestation_weeks(self, anc_clinic, sample_patient, clinic_user):
        """gestation_weeks should calculate weeks from LMP."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # 21 weeks (147 days)
        lmp_date = date.today() - timedelta(days=147)

        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            lmp=lmp_date,
        )

        assert enrollment.gestation_weeks() == 21

    def test_anc_enrollment_gestation_display(self, anc_clinic, sample_patient, clinic_user):
        """gestation_display should return 'X weeks Y days' format."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # 21 weeks 3 days (150 days)
        lmp_date = date.today() - timedelta(days=150)

        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            lmp=lmp_date,
        )

        display = enrollment.gestation_display()
        assert display == "21 weeks 3 days"

    def test_anc_enrollment_trimester(self, anc_clinic, sample_patient, clinic_user):
        """trimester should return correct trimester based on gestation."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # First trimester (8 weeks)
        enrollment1 = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=56),
            enrolled_by=clinic_user,
            lmp=date.today() - timedelta(days=56),
        )
        assert enrollment1.trimester() == 1

        # Second trimester (20 weeks)
        enrollment2 = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=140),
            enrolled_by=clinic_user,
            lmp=date.today() - timedelta(days=140),
        )
        assert enrollment2.trimester() == 2

        # Third trimester (32 weeks)
        enrollment3 = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=224),
            enrolled_by=clinic_user,
            lmp=date.today() - timedelta(days=224),
        )
        assert enrollment3.trimester() == 3

    def test_anc_enrollment_is_term(self, anc_clinic, sample_patient, clinic_user):
        """is_term should return True when >= 37 weeks."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # 38 weeks (266 days)
        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=266),
            enrolled_by=clinic_user,
            lmp=date.today() - timedelta(days=266),
        )

        assert enrollment.is_term() is True

    def test_anc_enrollment_days_to_edd(self, anc_clinic, sample_patient, clinic_user):
        """days_to_edd should calculate days remaining."""
        from hmis.apps.clinics.models import ClinicEnrollment

        edd_date = date.today() + timedelta(days=60)

        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            edd=edd_date,
        )

        assert enrollment.days_to_edd() == 60

    def test_anc_enrollment_clinic_specific_summary(self, anc_clinic, sample_patient, clinic_user):
        """get_clinic_specific_summary should return ANC data."""
        from hmis.apps.clinics.models import ClinicEnrollment

        lmp_date = date.today() - timedelta(days=140)

        enrollment = ClinicEnrollment.objects.create(
            clinic=anc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            gravida=2,
            para=1,
            lmp=lmp_date,
            hiv_status="NEGATIVE",
        )
        enrollment.calculate_edd()

        summary = enrollment.get_clinic_specific_summary()

        assert summary["type"] == "ANC"
        assert summary["gravida"] == 2
        assert summary["para"] == 1
        assert summary["gestation_weeks"] == 20
        assert summary["hiv_status"] == "NEGATIVE"


# ============================================================================
# Test Class: Diabetic Enrollment Features
# ============================================================================


@pytest.mark.django_db
class TestDiabeticEnrollmentFeatures:
    """Tests for Diabetic clinic specific enrollment features."""

    @pytest.fixture
    def diabetic_clinic(self, db, sample_facility, sample_organization):
        """Create a Diabetic clinic for testing."""
        from hmis.apps.clinics.models import Clinic

        return Clinic.objects.create(
            name="Diabetic Clinic",
            clinic_type="DIABETIC",
            code="DM-001",
            description="Diabetes management clinic",
            facility=sample_facility,
            organization=sample_organization,
        )

    def test_diabetic_enrollment_fields(self, diabetic_clinic, sample_patient, clinic_user):
        """Diabetic enrollment should store diabetes-specific fields."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=diabetic_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            diabetes_type="TYPE_2",
            diabetes_diagnosis_date=date.today() - timedelta(days=1825),  # 5 years
            on_insulin=True,
            diabetes_complications="Retinopathy",
        )

        assert enrollment.diabetes_type == "TYPE_2"
        assert enrollment.on_insulin is True
        assert "Retinopathy" in enrollment.diabetes_complications

    def test_diabetic_enrollment_update_hba1c(self, diabetic_clinic, sample_patient, clinic_user):
        """update_hba1c should update HbA1c value."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=diabetic_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        enrollment.update_hba1c(6.5)

        assert float(enrollment.latest_hba1c) == 6.5
        assert enrollment.latest_hba1c_date == date.today()

    def test_diabetic_enrollment_hba1c_controlled(
        self, diabetic_clinic, sample_patient, clinic_user
    ):
        """hba1c_controlled should return True if < 7%."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # Controlled
        enrollment1 = ClinicEnrollment.objects.create(
            clinic=diabetic_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=1),
            enrolled_by=clinic_user,
            latest_hba1c=Decimal("6.5"),
        )
        assert enrollment1.hba1c_controlled() is True

        # Not controlled
        enrollment2 = ClinicEnrollment.objects.create(
            clinic=diabetic_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=2),
            enrolled_by=clinic_user,
            latest_hba1c=Decimal("8.5"),
        )
        assert enrollment2.hba1c_controlled() is False

    def test_diabetic_enrollment_update_fbs(self, diabetic_clinic, sample_patient, clinic_user):
        """update_fbs should update FBS value."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=diabetic_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        enrollment.update_fbs(5.8)

        assert float(enrollment.latest_fbs) == 5.8
        assert enrollment.latest_fbs_date == date.today()

    def test_diabetic_enrollment_hba1c_due(self, diabetic_clinic, sample_patient, clinic_user):
        """hba1c_due should return True if > 3 months since last test."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # Never tested
        enrollment1 = ClinicEnrollment.objects.create(
            clinic=diabetic_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=180),
            enrolled_by=clinic_user,
        )
        assert enrollment1.hba1c_due() is True

        # Tested 4 months ago (different enrollment date to avoid unique constraint)
        enrollment2 = ClinicEnrollment.objects.create(
            clinic=diabetic_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=179),
            enrolled_by=clinic_user,
            latest_hba1c_date=date.today() - timedelta(days=120),
        )
        assert enrollment2.hba1c_due() is True

        # Tested 2 months ago (different enrollment date to avoid unique constraint)
        enrollment3 = ClinicEnrollment.objects.create(
            clinic=diabetic_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=90),
            enrolled_by=clinic_user,
            latest_hba1c_date=date.today() - timedelta(days=60),
        )
        assert enrollment3.hba1c_due() is False


# ============================================================================
# Test Class: Defaulter Tracking Features
# ============================================================================


@pytest.mark.django_db
class TestDefaulterTracking:
    """Tests for defaulter tracking functionality."""

    def test_enrollment_is_defaulter_true(self, ccc_clinic, sample_patient, clinic_user):
        """is_defaulter should return True when overdue by 2+ appointment cycles."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # 30 day appointment interval, 65 days overdue (> 2x30)
        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=180),
            enrolled_by=clinic_user,
            appointment_interval_days=30,
            next_appointment=date.today() - timedelta(days=65),
        )

        assert enrollment.is_defaulter() is True

    def test_enrollment_is_defaulter_false(self, ccc_clinic, sample_patient, clinic_user):
        """is_defaulter should return False when overdue by < 2 appointment cycles."""
        from hmis.apps.clinics.models import ClinicEnrollment

        # 30 day appointment interval, 45 days overdue (< 2x30)
        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=180),
            enrolled_by=clinic_user,
            appointment_interval_days=30,
            next_appointment=date.today() - timedelta(days=45),
        )

        assert enrollment.is_defaulter() is False

    def test_enrollment_days_overdue(self, ccc_clinic, sample_patient, clinic_user):
        """days_overdue should calculate correct number of days."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today() - timedelta(days=180),
            enrolled_by=clinic_user,
            next_appointment=date.today() - timedelta(days=10),
        )

        assert enrollment.days_overdue() == 10

    def test_enrollment_days_overdue_not_overdue(self, ccc_clinic, sample_patient, clinic_user):
        """days_overdue should return 0 when not overdue."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            next_appointment=date.today() + timedelta(days=10),
        )

        assert enrollment.days_overdue() == 0

    def test_enrollment_type_detection(self, ccc_clinic, sample_patient, clinic_user):
        """enrollment_type should detect type from clinic."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
        )

        assert enrollment.enrollment_type() == "CCC"

    def test_alert_tracking_fields(self, ccc_clinic, sample_patient, clinic_user):
        """Alert tracking fields should be stored correctly."""
        from hmis.apps.clinics.models import ClinicEnrollment

        enrollment = ClinicEnrollment.objects.create(
            clinic=ccc_clinic,
            patient=sample_patient,
            enrollment_date=date.today(),
            enrolled_by=clinic_user,
            last_reminder_sent=timezone.now() - timedelta(days=7),
            missed_appointment_alerts=3,
        )

        assert enrollment.missed_appointment_alerts == 3
        assert enrollment.last_reminder_sent is not None
