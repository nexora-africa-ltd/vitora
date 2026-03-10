"""Tests for labour partograph API and realtime updates."""

from datetime import date

import pytest  # type: ignore
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.urls import reverse


@pytest.fixture
def anc_clinic(db):
    """Create a sample ANC clinic for partograph tests."""
    from hmis.apps.clinics.models import Clinic

    return Clinic.objects.create(
        name="ANC Clinic",
        clinic_type="ANC",
        code="ANC-PTG-001",
        status="ACTIVE",
    )


@pytest.fixture
def anc_enrollment(db, anc_clinic, sample_patient, test_user):
    """Create an ANC enrollment for partograph tests."""
    from datetime import timedelta

    from hmis.apps.clinics.models import ClinicEnrollment

    return ClinicEnrollment.objects.create(
        clinic=anc_clinic,
        patient=sample_patient,
        enrollment_date=date.today(),
        enrolled_by=test_user,
        gravida=2,
        para=1,
        lmp=date.today() - timedelta(days=273),
    )


@pytest.fixture
def sample_mch_registration(sample_patient, anc_enrollment):
    """Create a sample MCH registration for labour monitoring tests."""
    from hmis.apps.mch.models import MCHRegistration

    return MCHRegistration.objects.create(
        mother=sample_patient,
        anc_enrollment=anc_enrollment,
        registration_date=date.today(),
    )


@pytest.mark.django_db
class TestLabourPartographAPI:
    """Tests for labour partograph resources."""

    def test_create_labour_partograph(self, authenticated_client, sample_mch_registration):
        """Should create a labour partograph for an active MCH registration."""
        payload = {
            "registration": sample_mch_registration.id,
            "status": "ACTIVE",
            "parity": 1,
            "gestation_weeks": 39,
            "notes": "Spontaneous labour established",
        }

        response = authenticated_client.post(
            reverse("mch:mch-labour-partograph-list"), payload, format="json"
        )

        assert response.status_code == 201
        assert response.data["registration"] == sample_mch_registration.id
        assert response.data["status"] == "ACTIVE"

    def test_record_partograph_observation(self, authenticated_client, sample_mch_registration):
        """Should add chartable labour observations to a partograph."""
        from hmis.apps.mch.models import LabourPartograph

        partograph = LabourPartograph.objects.create(
            registration=sample_mch_registration,
            status="ACTIVE",
            parity=1,
            gestation_weeks=39,
        )

        payload = {
            "partograph": partograph.id,
            "observation_time": "2026-03-07T09:30:00Z",
            "fetal_heart_rate": 144,
            "cervical_dilation_cm": "4.0",
            "descent_fifths": 4,
            "contractions_per_10_min": 3,
            "contraction_duration_seconds": 45,
            "maternal_pulse": 92,
            "maternal_temperature": "37.0",
            "urine_volume_ml": 250,
            "urine_protein": "NEGATIVE",
        }

        response = authenticated_client.post(
            reverse("mch:mch-labour-partograph-observation-list"), payload, format="json"
        )

        assert response.status_code == 201
        assert response.data["partograph"] == partograph.id
        assert response.data["fetal_heart_rate"] == 144
        assert response.data["cervical_dilation_cm"] == "4.0"


@database_sync_to_async
def create_partograph_with_observation_context(registration):
    """Create a partograph instance in an async-safe manner."""
    from hmis.apps.mch.models import LabourPartograph

    return LabourPartograph.objects.create(
        registration=registration,
        status="ACTIVE",
        parity=1,
        gestation_weeks=39,
    )


@database_sync_to_async
def create_partograph_registration(sample_patient, anc_enrollment):
    """Create a registration in async-safe context."""
    from hmis.apps.mch.models import MCHRegistration

    return MCHRegistration.objects.create(
        mother=sample_patient,
        anc_enrollment=anc_enrollment,
        registration_date=date.today(),
    )


@database_sync_to_async
def create_partograph_observation(partograph, recorded_by):
    """Create an observation and trigger websocket broadcast."""
    from hmis.apps.mch.models import LabourPartographObservation

    return LabourPartographObservation.objects.create(
        partograph=partograph,
        observation_time="2026-03-07T10:00:00Z",
        fetal_heart_rate=136,
        cervical_dilation_cm="5.0",
        contractions_per_10_min=4,
        contraction_duration_seconds=50,
        maternal_pulse=90,
        urine_volume_ml=200,
        recorded_by=recorded_by,
    )


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestLabourPartographWebSocket:
    """Tests for realtime partograph updates."""

    async def test_partograph_socket_receives_observation_updates(
        self,
        sample_patient,
        anc_enrollment,
        test_user,
    ):
        """Should push newly recorded observations to connected clients."""
        from hmis.asgi import application

        registration = await create_partograph_registration(sample_patient, anc_enrollment)
        partograph = await create_partograph_with_observation_context(registration)

        communicator = WebsocketCommunicator(
            application,
            f"/ws/mch/partographs/{partograph.id}/",
        )
        connected, _ = await communicator.connect()

        assert connected is True

        await create_partograph_observation(partograph, test_user)

        response = await communicator.receive_json_from()
        assert response["event"] == "partograph.observation_recorded"
        assert response["data"]["partograph_id"] == partograph.id
        assert response["data"]["fetal_heart_rate"] == 136
        assert response["data"]["cervical_dilation_cm"] == "5.0"

        await communicator.disconnect()
