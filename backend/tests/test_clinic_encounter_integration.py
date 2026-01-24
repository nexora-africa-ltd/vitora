"""
TDD Tests for Encounter ↔ ClinicVisit Integration.

RED Phase: These tests define expected behavior for linking
Encounter and ClinicVisit models bidirectionally.

Per Priority 1 in clinics-module-completion-plan.md:
- Encounters should have a clinic_visit FK for traceability
- ClinicVisit.start_consultation() should set encounter.clinic_visit
- EncounterSerializer should expose clinic_visit_id, clinic_name, clinic_type

Sprint: 2.5 (Integration & Reporting)
"""

from datetime import date
from decimal import Decimal

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit
from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient

User = get_user_model()


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def integration_user(db):
    """Create a test user for integration tests."""
    return User.objects.create_user(
        username="integrationuser",
        email="integration@example.com",
        password="testpass123",
    )


@pytest.fixture
def integration_patient(db):
    """Create a sample patient for integration tests."""
    from hmis.apps.core.models import County, SubCounty

    county, _ = County.objects.get_or_create(code=47, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(name="Westlands", defaults={"county": county})
    return Patient.objects.create(
        first_name="Integration",
        last_name="TestPatient",
        date_of_birth="1990-01-15",
        gender="F",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def eye_clinic(db):
    """Create an Eye clinic for testing."""
    return Clinic.objects.create(
        name="Eye Clinic",
        code="EYE-001",
        clinic_type="EYE",
        status="ACTIVE",
        location="Block B, Room 5",
        default_service_fee=Decimal("300.00"),
    )


@pytest.fixture
def ccc_clinic(db):
    """Create a CCC (HIV) clinic for testing."""
    return Clinic.objects.create(
        name="Comprehensive Care Clinic",
        code="CCC-001",
        clinic_type="CCC",
        status="ACTIVE",
        location="Block C, Room 10",
        default_service_fee=Decimal("200.00"),
    )


@pytest.fixture
def eye_clinic_session(db, eye_clinic):
    """Create a clinic session for the Eye clinic."""
    return ClinicSession.objects.create(
        clinic=eye_clinic,
        session_date=date.today(),
        status="OPEN",
    )


@pytest.fixture
def ccc_clinic_session(db, ccc_clinic):
    """Create a clinic session for the CCC clinic."""
    return ClinicSession.objects.create(
        clinic=ccc_clinic,
        session_date=date.today(),
        status="OPEN",
    )


@pytest.fixture
def eye_clinic_visit(db, integration_patient, eye_clinic_session, integration_user):
    """Create a clinic visit in WAITING status for Eye clinic."""
    return ClinicVisit.objects.create(
        session=eye_clinic_session,
        patient=integration_patient,
        status="WAITING",
        chief_complaint="Blurred vision",
        registered_by=integration_user,
    )


@pytest.fixture
def ccc_clinic_visit(db, integration_patient, ccc_clinic_session, integration_user):
    """Create a clinic visit in WAITING status for CCC clinic."""
    return ClinicVisit.objects.create(
        session=ccc_clinic_session,
        patient=integration_patient,
        status="WAITING",
        chief_complaint="Routine HIV follow-up",
        registered_by=integration_user,
    )


@pytest.fixture
def authenticated_client(db, integration_user):
    """Create an authenticated API client."""
    client = APIClient()
    client.force_authenticate(user=integration_user)
    return client


# =============================================================================
# Test Class: Encounter Model - clinic_visit FK
# =============================================================================


@pytest.mark.django_db
class TestEncounterClinicVisitFK:
    """Tests for Encounter.clinic_visit FK."""

    def test_encounter_model_has_clinic_visit_field(self):
        """Encounter model should have a clinic_visit FK field."""
        # Check that the reverse accessor exists on the model
        field_names = [f.name for f in Encounter._meta.get_fields()]
        assert (
            "clinic_visit" in field_names
        ), "Encounter model must have a 'clinic_visit' FK to clinics.ClinicVisit"

    def test_encounter_clinic_visit_field_is_optional(self, integration_patient):
        """clinic_visit accessor should return None/raise for encounters not linked to a visit."""
        # Create encounter without clinic_visit - should succeed
        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="OPD",
            chief_complaint="Direct OPD visit - no clinic routing",
        )
        assert encounter.id is not None
        assert encounter.clinic_visit is None

    def test_encounter_can_reference_clinic_visit(self, integration_patient, eye_clinic_visit):
        """Encounter should be accessible from ClinicVisit via OneToOne."""
        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Eye examination",
            clinic_visit=eye_clinic_visit,
        )
        # Link via the ClinicVisit's OneToOne field (optional legacy link)
        eye_clinic_visit.encounter = encounter
        eye_clinic_visit.save()

        encounter.refresh_from_db()
        assert encounter.clinic_visit == eye_clinic_visit
        assert encounter.clinic_visit.session.clinic.name == "Eye Clinic"

    def test_encounter_clinic_visit_on_delete_set_null(self, integration_patient, eye_clinic_visit):
        """Deleting ClinicVisit should set the relationship to NULL (via OneToOne SET_NULL)."""
        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Eye examination",
            clinic_visit=eye_clinic_visit,
        )
        eye_clinic_visit.encounter = encounter
        eye_clinic_visit.save()
        visit_id = eye_clinic_visit.id

        eye_clinic_visit.delete()

        encounter.refresh_from_db()
        assert encounter.clinic_visit is None
        assert not ClinicVisit.objects.filter(id=visit_id).exists()

    def test_encounter_clinic_visit_related_name(self, integration_patient, eye_clinic_visit):
        """ClinicVisit should be able to access encounter via the OneToOne field."""
        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Eye examination",
        )
        # Link via the ClinicVisit's OneToOne field
        eye_clinic_visit.encounter = encounter
        eye_clinic_visit.save()

        # Access via the OneToOne field
        eye_clinic_visit.refresh_from_db()
        assert eye_clinic_visit.encounter == encounter


# =============================================================================
# Test Class: ClinicVisit.start_consultation() Integration
# =============================================================================


@pytest.mark.django_db
class TestStartConsultationEncounterLink:
    """Tests for ClinicVisit.start_consultation() creating linked encounters."""

    def test_start_consultation_creates_encounter_with_clinic_visit_reference(
        self, eye_clinic_visit, integration_user
    ):
        """start_consultation() should create Encounter with clinic_visit FK set."""
        # Pre-condition: no encounter exists
        assert eye_clinic_visit.encounter is None

        # Act: start consultation
        encounter = eye_clinic_visit.start_consultation(user=integration_user)

        # Assert: encounter has clinic_visit reference back to the visit
        assert encounter is not None
        encounter.refresh_from_db()
        assert encounter.clinic_visit == eye_clinic_visit

    def test_start_consultation_encounter_has_correct_clinic_context(
        self, eye_clinic_visit, integration_user
    ):
        """Encounter created via start_consultation should have clinic info accessible."""
        encounter = eye_clinic_visit.start_consultation(user=integration_user)

        # Verify clinic context is accessible through the FK
        assert encounter.clinic_visit is not None
        assert encounter.clinic_visit.session.clinic.name == "Eye Clinic"
        assert encounter.clinic_visit.session.clinic.clinic_type == "EYE"

    def test_start_consultation_preserves_existing_encounter_clinic_visit(
        self, integration_patient, eye_clinic_visit, integration_user
    ):
        """If encounter already exists, ensure clinic_visit is still set."""
        # Pre-create encounter linked to visit
        existing_encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Pre-existing encounter",
        )
        eye_clinic_visit.encounter = existing_encounter
        eye_clinic_visit.save()

        # Act: start consultation (should update existing encounter)
        result_encounter = eye_clinic_visit.start_consultation(user=integration_user)

        # Assert: should return the same encounter with clinic_visit set
        result_encounter.refresh_from_db()
        assert result_encounter.clinic_visit == eye_clinic_visit

    def test_start_consultation_sets_correct_encounter_type_mapping(
        self, ccc_clinic_visit, integration_user
    ):
        """CCC clinic should map to CHRONIC_STABLE encounter type."""
        encounter = ccc_clinic_visit.start_consultation(user=integration_user)

        # CCC clinic type maps to CHRONIC_STABLE (see _map_clinic_to_encounter_type)
        assert encounter.encounter_type == "CHRONIC_STABLE"
        assert encounter.clinic_visit == ccc_clinic_visit


# =============================================================================
# Test Class: EncounterSerializer clinic fields
# =============================================================================


@pytest.mark.django_db
class TestEncounterSerializerClinicFields:
    """Tests for EncounterSerializer including clinic context fields."""

    def test_serializer_includes_clinic_visit_id(self, integration_patient, eye_clinic_visit):
        """EncounterSerializer should include clinic_visit_id field."""
        from hmis.apps.encounters.serializers import EncounterSerializer

        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Eye check",
            clinic_visit=eye_clinic_visit,
        )
        eye_clinic_visit.encounter = encounter
        eye_clinic_visit.save()

        serializer = EncounterSerializer(encounter)
        data = serializer.data

        assert "clinic_visit_id" in data
        assert data["clinic_visit_id"] == eye_clinic_visit.id

    def test_serializer_includes_clinic_name(self, integration_patient, eye_clinic_visit):
        """EncounterSerializer should include clinic_name computed field."""
        from hmis.apps.encounters.serializers import EncounterSerializer

        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Eye check",
            clinic_visit=eye_clinic_visit,
        )
        eye_clinic_visit.encounter = encounter
        eye_clinic_visit.save()

        serializer = EncounterSerializer(encounter)
        data = serializer.data

        assert "clinic_name" in data
        assert data["clinic_name"] == "Eye Clinic"

    def test_serializer_includes_clinic_type(self, integration_patient, eye_clinic_visit):
        """EncounterSerializer should include clinic_type computed field."""
        from hmis.apps.encounters.serializers import EncounterSerializer

        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Eye check",
            clinic_visit=eye_clinic_visit,
        )
        eye_clinic_visit.encounter = encounter
        eye_clinic_visit.save()

        serializer = EncounterSerializer(encounter)
        data = serializer.data

        assert "clinic_type" in data
        assert data["clinic_type"] == "EYE"

    def test_serializer_clinic_fields_null_when_no_clinic_visit(self, integration_patient):
        """Clinic fields should be null when encounter has no clinic_visit."""
        from hmis.apps.encounters.serializers import EncounterSerializer

        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="OPD",
            chief_complaint="Direct visit",
        )

        serializer = EncounterSerializer(encounter)
        data = serializer.data

        assert "clinic_visit_id" in data
        assert data["clinic_visit_id"] is None
        assert "clinic_name" in data
        assert data["clinic_name"] is None
        assert "clinic_type" in data
        assert data["clinic_type"] is None

    def test_serializer_clinic_visit_id_is_read_only(self):
        """clinic_visit_id should be read-only (not writable via serializer)."""
        from hmis.apps.encounters.serializers import EncounterSerializer

        serializer = EncounterSerializer()
        read_only_fields = serializer.Meta.read_only_fields

        # The clinic_visit_id computed field should be read-only
        assert "clinic_visit_id" in read_only_fields or (
            "clinic_visit_id" not in serializer.get_fields()
            or serializer.get_fields()["clinic_visit_id"].read_only
        )


# =============================================================================
# Test Class: API Response with clinic fields
# =============================================================================


@pytest.mark.django_db
class TestEncounterAPIClinicFields:
    """Tests for Encounter API endpoints including clinic context."""

    def test_get_encounter_includes_clinic_fields(
        self, authenticated_client, integration_patient, eye_clinic_visit
    ):
        """GET /api/encounters/{id}/ should include clinic context fields."""
        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Eye examination",
            clinic_visit=eye_clinic_visit,
        )
        eye_clinic_visit.encounter = encounter
        eye_clinic_visit.save()

        response = authenticated_client.get(f"/api/encounters/{encounter.id}/")

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # Verify clinic fields are present in API response
        assert "clinic_visit_id" in data
        assert data["clinic_visit_id"] == eye_clinic_visit.id
        assert "clinic_name" in data
        assert data["clinic_name"] == "Eye Clinic"
        assert "clinic_type" in data
        assert data["clinic_type"] == "EYE"

    def test_list_encounters_includes_clinic_fields(
        self, authenticated_client, integration_patient, eye_clinic_visit
    ):
        """GET /api/encounters/ should include clinic context in list items."""
        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Eye examination",
            clinic_visit=eye_clinic_visit,
        )
        eye_clinic_visit.encounter = encounter
        eye_clinic_visit.save()

        response = authenticated_client.get("/api/encounters/")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

        # Find our encounter in the results
        encounter_data = next((e for e in results if e["id"] == encounter.id), None)
        assert encounter_data is not None
        assert "clinic_visit_id" in encounter_data
        assert "clinic_name" in encounter_data
        assert "clinic_type" in encounter_data

    def test_filter_encounters_by_clinic_id(
        self, authenticated_client, integration_patient, eye_clinic_visit, ccc_clinic_visit
    ):
        """Should be able to filter encounters by clinic ID."""
        # Create encounters for different clinics
        eye_encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Eye examination",
            clinic_visit=eye_clinic_visit,
        )
        eye_clinic_visit.encounter = eye_encounter
        eye_clinic_visit.save()

        ccc_encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="CHRONIC_STABLE",
            chief_complaint="HIV follow-up",
            clinic_visit=ccc_clinic_visit,
        )
        ccc_clinic_visit.encounter = ccc_encounter
        ccc_clinic_visit.save()

        # Filter by eye clinic
        eye_clinic = eye_clinic_visit.session.clinic
        response = authenticated_client.get(f"/api/encounters/?clinic={eye_clinic.id}")

        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        # Should only include eye clinic encounter
        encounter_ids = [e["id"] for e in results]

        # Verify the filter worked - only eye_encounter should be returned
        assert eye_encounter.id in encounter_ids
        assert ccc_encounter.id not in encounter_ids


# =============================================================================
# Test Class: Backward Compatibility
# =============================================================================


@pytest.mark.django_db
class TestBackwardCompatibility:
    """Tests ensuring backward compatibility with existing encounters."""

    def test_existing_encounters_without_clinic_visit_still_work(self, integration_patient):
        """Existing encounters without clinic_visit should continue working."""
        # Simulate pre-existing encounter (direct OPD, not from clinic queue)
        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="OPD",
            chief_complaint="Headache",
        )

        # Should be queryable and serializable
        from hmis.apps.encounters.serializers import EncounterSerializer

        serializer = EncounterSerializer(encounter)
        data = serializer.data

        assert data["id"] == encounter.id
        assert data["clinic_visit_id"] is None
        assert data["clinic_name"] is None
        assert data["clinic_type"] is None

    def test_existing_clinic_visit_encounter_relationship_preserved(
        self, integration_patient, eye_clinic_visit
    ):
        """
        The existing OneToOne ClinicVisit.encounter relationship should still work.

        ClinicVisit has: encounter = OneToOneField('encounters.Encounter', related_name='clinic_visit')
        This creates a reverse accessor: encounter.clinic_visit

        Both directions of the relationship should work.
        """
        # Create encounter and link via existing OneToOne
        encounter = Encounter.objects.create(
            patient=integration_patient,
            encounter_type="SPECIALIST_CLINIC",
            chief_complaint="Eye check",
        )
        eye_clinic_visit.encounter = encounter
        eye_clinic_visit.save()

        # The existing relationship should still work
        eye_clinic_visit.refresh_from_db()
        assert eye_clinic_visit.encounter == encounter
        # New FK should be set for traceability
        encounter.refresh_from_db()
        assert encounter.clinic_visit == eye_clinic_visit
