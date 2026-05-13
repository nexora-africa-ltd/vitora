"""Tests for L4 Microbiology module — Culture & Sensitivity, Antibiogram, WHONET export."""

import pytest
from django.utils import timezone
from rest_framework import status

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def organism(db):
    """Create a sample organism."""
    from hmis.apps.laboratory.microbiology.models import Organism

    return Organism.objects.create(
        code="ECO",
        name="Escherichia coli",
        genus="Escherichia",
        species="coli",
        gram_stain="NEGATIVE",
        organism_type="BACTERIA",
    )


@pytest.fixture
def organism2(db):
    """Create a second sample organism."""
    from hmis.apps.laboratory.microbiology.models import Organism

    return Organism.objects.create(
        code="SAU",
        name="Staphylococcus aureus",
        genus="Staphylococcus",
        species="aureus",
        gram_stain="POSITIVE",
        organism_type="BACTERIA",
    )


@pytest.fixture
def antibiotic(db):
    """Create a sample antibiotic."""
    from hmis.apps.laboratory.microbiology.models import Antibiotic

    return Antibiotic.objects.create(
        code="AMP",
        name="Ampicillin",
        antibiotic_class="Penicillins",
        disk_content="10µg",
    )


@pytest.fixture
def antibiotic2(db):
    """Create a second sample antibiotic."""
    from hmis.apps.laboratory.microbiology.models import Antibiotic

    return Antibiotic.objects.create(
        code="GEN",
        name="Gentamicin",
        antibiotic_class="Aminoglycosides",
        disk_content="10µg",
    )


@pytest.fixture
def culture_result(db, sample_lab_result, sample_facility, sample_organization):
    """Create a sample culture result in INOCULATED status."""
    from hmis.apps.laboratory.microbiology.models import CultureResult

    return CultureResult.objects.create(
        lab_result=sample_lab_result,
        status="INOCULATED",
        culture_medium="Blood Agar",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def incubating_culture(db, culture_result, test_user):
    """Culture in INCUBATING status."""
    culture_result.start_incubation(
        user=test_user, temperature=37.0, atmosphere="AEROBIC", hours=48
    )
    return culture_result


@pytest.fixture
def reading_culture(db, incubating_culture, test_user, organism):
    """Culture in READING status with organism identified."""
    incubating_culture.start_reading(user=test_user)
    incubating_culture.organism = organism
    incubating_culture.colony_count = ">100,000 CFU/ml"
    incubating_culture.save()
    return incubating_culture


@pytest.fixture
def final_culture(db, reading_culture):
    """Culture in FINAL status."""
    reading_culture.report_final("E. coli isolated. See sensitivities.")
    return reading_culture


@pytest.fixture
def sensitivity(db, reading_culture, antibiotic, sample_facility, sample_organization, test_user):
    """Create a sample antibiotic sensitivity."""
    from hmis.apps.laboratory.microbiology.models import AntibioticSensitivity

    return AntibioticSensitivity.objects.create(
        culture=reading_culture,
        antibiotic=antibiotic,
        zone_diameter=18.0,
        interpretation="R",
        test_method="DISK",
        breakpoint_standard="CLSI",
        tested_by=test_user,
        tested_at=timezone.now(),
        facility=sample_facility,
        organization=sample_organization,
    )


# ============================================================================
# Model Tests
# ============================================================================


class TestOrganismModel:
    """Tests for Organism model."""

    def test_create_organism(self, organism):
        assert organism.pk
        assert organism.code == "ECO"
        assert organism.name == "Escherichia coli"
        assert organism.gram_stain == "NEGATIVE"
        assert organism.organism_type == "BACTERIA"

    def test_organism_str(self, organism):
        assert str(organism) == "Escherichia coli"

    def test_organism_unique_code(self, db, organism):
        from django.db import IntegrityError

        from hmis.apps.laboratory.microbiology.models import Organism

        with pytest.raises(IntegrityError):
            Organism.objects.create(code="ECO", name="Duplicate")


class TestAntibioticModel:
    """Tests for Antibiotic model."""

    def test_create_antibiotic(self, antibiotic):
        assert antibiotic.pk
        assert antibiotic.code == "AMP"
        assert antibiotic.name == "Ampicillin"

    def test_antibiotic_str(self, antibiotic):
        assert str(antibiotic) == "Ampicillin (AMP)"


class TestCultureResultModel:
    """Tests for CultureResult model lifecycle."""

    def test_create_culture(self, culture_result):
        assert culture_result.pk
        assert culture_result.status == "INOCULATED"
        assert culture_result.culture_medium == "Blood Agar"

    def test_start_incubation(self, culture_result, test_user):
        culture_result.start_incubation(
            user=test_user, temperature=37.0, atmosphere="AEROBIC", hours=48
        )
        culture_result.refresh_from_db()
        assert culture_result.status == "INCUBATING"
        assert culture_result.inoculated_by == test_user
        assert culture_result.inoculated_at is not None
        assert culture_result.incubation_temperature == 37.0

    def test_start_reading(self, incubating_culture, test_user):
        incubating_culture.start_reading(user=test_user)
        incubating_culture.refresh_from_db()
        assert incubating_culture.status == "READING"
        assert incubating_culture.read_by == test_user
        assert incubating_culture.read_at is not None

    def test_report_preliminary(self, reading_culture):
        reading_culture.report_preliminary("Gram negative bacilli isolated, sensitivities pending")
        reading_culture.refresh_from_db()
        assert reading_culture.status == "PRELIMINARY"
        assert "Gram negative" in reading_culture.preliminary_report
        assert reading_culture.preliminary_reported_at is not None

    def test_report_final(self, reading_culture):
        reading_culture.report_final("E. coli confirmed. See AST.")
        reading_culture.refresh_from_db()
        assert reading_culture.status == "FINAL"
        assert "E. coli" in reading_culture.final_report
        assert reading_culture.final_reported_at is not None
        assert reading_culture.is_complete is True

    def test_mark_no_growth(self, incubating_culture, test_user):
        incubating_culture.mark_no_growth(user=test_user)
        incubating_culture.refresh_from_db()
        assert incubating_culture.status == "NO_GROWTH"
        assert incubating_culture.is_significant is False
        assert incubating_culture.is_complete is True

    def test_cancel(self, culture_result):
        culture_result.cancel()
        culture_result.refresh_from_db()
        assert culture_result.status == "CANCELLED"

    def test_days_incubating(self, incubating_culture):
        # Just created, should be 0 days
        assert incubating_culture.days_incubating == 0

    def test_is_complete_false(self, culture_result):
        assert culture_result.is_complete is False

    def test_is_complete_no_growth(self, incubating_culture, test_user):
        incubating_culture.mark_no_growth(user=test_user)
        assert incubating_culture.is_complete is True


class TestAntibioticSensitivityModel:
    """Tests for AntibioticSensitivity model."""

    def test_create_sensitivity(self, sensitivity):
        assert sensitivity.pk
        assert sensitivity.interpretation == "R"
        assert sensitivity.zone_diameter == 18.0
        assert sensitivity.test_method == "DISK"

    def test_sensitivity_str(self, sensitivity):
        assert "AMP" in str(sensitivity)
        assert "Resistant" in str(sensitivity)

    def test_unique_together(self, db, sensitivity, sample_facility, sample_organization):
        from django.db import IntegrityError

        from hmis.apps.laboratory.microbiology.models import AntibioticSensitivity

        with pytest.raises(IntegrityError):
            AntibioticSensitivity.objects.create(
                culture=sensitivity.culture,
                antibiotic=sensitivity.antibiotic,
                interpretation="S",
                facility=sample_facility,
                organization=sample_organization,
            )


class TestAntibiogramModel:
    """Tests for Antibiogram generation."""

    def test_generate_for_facility(self, db, final_culture, sensitivity, sample_facility):
        """Test antibiogram generation aggregates data correctly."""
        # The culture must be FINAL and significant for antibiogram
        # final_culture is already FINAL, sensitivity.culture is reading_culture (not final)
        # We need a sensitivity on the final_culture
        from hmis.apps.laboratory.microbiology.models import (
            Antibiogram,
            Antibiotic,
            AntibioticSensitivity,
        )

        ab = Antibiotic.objects.create(
            code="CIP", name="Ciprofloxacin", antibiotic_class="Fluoroquinolones"
        )
        AntibioticSensitivity.objects.create(
            culture=final_culture,
            antibiotic=ab,
            interpretation="S",
            test_method="DISK",
            zone_diameter=25.0,
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        year = timezone.now().year
        results = Antibiogram.generate_for_facility(sample_facility, year)
        assert len(results) >= 1

        # Check the generated record
        entry = Antibiogram.objects.get(
            facility=sample_facility, year=year, organism=final_culture.organism, antibiotic=ab
        )
        assert entry.total_isolates == 1
        assert entry.sensitive_count == 1
        assert entry.percent_sensitive == 100.0


# ============================================================================
# API Tests
# ============================================================================


class TestOrganismAPI:
    """Tests for Organism CRUD API."""

    def test_list_organisms(self, authenticated_client, organism):
        response = authenticated_client.get("/api/lab/microbiology/organisms/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_create_organism(self, authenticated_client):
        data = {
            "code": "KPN",
            "name": "Klebsiella pneumoniae",
            "genus": "Klebsiella",
            "species": "pneumoniae",
            "gram_stain": "NEGATIVE",
            "organism_type": "BACTERIA",
        }
        response = authenticated_client.post("/api/lab/microbiology/organisms/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "KPN"

    def test_filter_by_gram_stain(self, authenticated_client, organism, organism2):
        response = authenticated_client.get("/api/lab/microbiology/organisms/?gram_stain=POSITIVE")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1
        assert response.data["results"][0]["code"] == "SAU"

    def test_search_organisms(self, authenticated_client, organism, organism2):
        response = authenticated_client.get("/api/lab/microbiology/organisms/?search=Escherichia")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1


class TestAntibioticAPI:
    """Tests for Antibiotic CRUD API."""

    def test_list_antibiotics(self, authenticated_client, antibiotic):
        response = authenticated_client.get("/api/lab/microbiology/antibiotics/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_create_antibiotic(self, authenticated_client):
        data = {
            "code": "CRO",
            "name": "Ceftriaxone",
            "antibiotic_class": "Cephalosporins",
            "disk_content": "30µg",
        }
        response = authenticated_client.post("/api/lab/microbiology/antibiotics/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["code"] == "CRO"


class TestCultureResultAPI:
    """Tests for CultureResult CRUD + workflow API."""

    def test_list_cultures(self, authenticated_client, culture_result):
        response = authenticated_client.get("/api/lab/microbiology/cultures/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_create_culture(self, authenticated_client, sample_lab_result):
        data = {
            "lab_result": sample_lab_result.pk,
            "specimen": None,
            "culture_medium": "MacConkey Agar",
            "incubation_temperature": 37.0,
            "incubation_atmosphere": "AEROBIC",
            "incubation_hours": 24,
        }
        response = authenticated_client.post("/api/lab/microbiology/cultures/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["culture_medium"] == "MacConkey Agar"
        assert response.data["status"] == "INOCULATED"

    def test_incubate_action(self, authenticated_client, culture_result):
        data = {"temperature": 37.0, "atmosphere": "AEROBIC", "hours": 48}
        response = authenticated_client.post(
            f"/api/lab/microbiology/cultures/{culture_result.pk}/incubate/", data
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "INCUBATING"

    def test_incubate_invalid_status(self, authenticated_client, incubating_culture):
        data = {"temperature": 37.0}
        response = authenticated_client.post(
            f"/api/lab/microbiology/cultures/{incubating_culture.pk}/incubate/", data
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_read_action(self, authenticated_client, incubating_culture, organism):
        data = {
            "colony_count": ">100,000 CFU/ml",
            "morphology": "Large, round, mucoid colonies",
            "gram_stain_result": "Gram-negative bacilli",
            "organism": organism.pk,
            "identification_method": "MANUAL",
        }
        response = authenticated_client.post(
            f"/api/lab/microbiology/cultures/{incubating_culture.pk}/read/", data
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "READING"
        assert response.data["organism_name"] == "Escherichia coli"

    def test_no_growth_action(self, authenticated_client, incubating_culture):
        response = authenticated_client.post(
            f"/api/lab/microbiology/cultures/{incubating_culture.pk}/no-growth/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "NO_GROWTH"

    def test_report_preliminary(self, authenticated_client, reading_culture):
        data = {"report_text": "Preliminary: GNB isolated, sensitivities pending"}
        response = authenticated_client.post(
            f"/api/lab/microbiology/cultures/{reading_culture.pk}/report-preliminary/", data
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "PRELIMINARY"

    def test_report_final(self, authenticated_client, reading_culture):
        data = {"report_text": "E. coli confirmed. Resistant to ampicillin."}
        response = authenticated_client.post(
            f"/api/lab/microbiology/cultures/{reading_culture.pk}/report-final/", data
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "FINAL"

    def test_cancel_action(self, authenticated_client, culture_result):
        response = authenticated_client.post(
            f"/api/lab/microbiology/cultures/{culture_result.pk}/cancel/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_cancel_final_fails(self, authenticated_client, final_culture):
        response = authenticated_client.post(
            f"/api/lab/microbiology/cultures/{final_culture.pk}/cancel/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_add_sensitivity_via_nested_action(
        self, authenticated_client, reading_culture, antibiotic
    ):
        data = {
            "antibiotic": antibiotic.pk,
            "zone_diameter": 22.0,
            "interpretation": "S",
            "test_method": "DISK",
            "breakpoint_standard": "CLSI",
        }
        response = authenticated_client.post(
            f"/api/lab/microbiology/cultures/{reading_culture.pk}/sensitivities/", data
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["interpretation"] == "S"
        assert response.data["antibiotic_name"] == "Ampicillin"

    def test_list_sensitivities_nested(self, authenticated_client, reading_culture, sensitivity):
        response = authenticated_client.get(
            f"/api/lab/microbiology/cultures/{reading_culture.pk}/sensitivities/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_unauthenticated_access_denied(self, api_client, culture_result):
        response = api_client.get("/api/lab/microbiology/cultures/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestAntibioticSensitivityAPI:
    """Tests for standalone sensitivity endpoint."""

    def test_list_sensitivities(self, authenticated_client, sensitivity):
        response = authenticated_client.get("/api/lab/microbiology/sensitivities/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

    def test_filter_by_interpretation(self, authenticated_client, sensitivity):
        response = authenticated_client.get("/api/lab/microbiology/sensitivities/?interpretation=R")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 1

        response = authenticated_client.get("/api/lab/microbiology/sensitivities/?interpretation=S")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) == 0


class TestAntibiogramAPI:
    """Tests for antibiogram read + generate endpoint."""

    def test_list_antibiograms(self, authenticated_client):
        response = authenticated_client.get("/api/lab/microbiology/antibiogram/")
        assert response.status_code == status.HTTP_200_OK

    def test_generate_antibiogram(self, authenticated_client, final_culture, sample_facility):
        """Generate antibiogram with final cultures."""
        from hmis.apps.laboratory.microbiology.models import Antibiotic, AntibioticSensitivity

        ab = Antibiotic.objects.create(code="MER", name="Meropenem", antibiotic_class="Carbapenems")
        AntibioticSensitivity.objects.create(
            culture=final_culture,
            antibiotic=ab,
            interpretation="S",
            test_method="MIC_ETEST",
            mic=0.5,
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        year = timezone.now().year
        response = authenticated_client.post(
            "/api/lab/microbiology/antibiogram/generate/", {"year": year}
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["generated"] >= 1
        assert response.data["year"] == year


class TestWHONETExportAPI:
    """Tests for WHONET CSV export."""

    def test_whonet_export(self, authenticated_client, final_culture, sample_facility):
        """Test WHONET export produces CSV."""
        from hmis.apps.laboratory.microbiology.models import Antibiotic, AntibioticSensitivity

        ab = Antibiotic.objects.create(
            code="AMK", name="Amikacin", antibiotic_class="Aminoglycosides"
        )
        AntibioticSensitivity.objects.create(
            culture=final_culture,
            antibiotic=ab,
            interpretation="S",
            zone_diameter=20.0,
            test_method="DISK",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        year = timezone.now().year
        response = authenticated_client.get(f"/api/lab/microbiology/whonet-export/?year={year}")
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "text/csv"
        assert "whonet" in response["Content-Disposition"]

        content = response.content.decode()
        lines = content.strip().split("\n")
        assert len(lines) == 2  # header + 1 data row
        assert "PATIENT_ID" in lines[0]
        assert "AMK" in lines[1]

    def test_whonet_export_requires_year(self, authenticated_client):
        response = authenticated_client.get("/api/lab/microbiology/whonet-export/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_whonet_export_unauthenticated(self, api_client):
        response = api_client.get("/api/lab/microbiology/whonet-export/?year=2026")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Signal / Domain Event Tests
# ============================================================================


class TestMicrobiologySignals:
    """Tests for domain event publishing."""

    def test_culture_created_publishes_event(
        self, db, mocker, sample_lab_result, sample_facility, sample_organization
    ):
        mock_publish = mocker.patch("hmis.apps.laboratory.microbiology.signals.publish_event")
        from hmis.apps.laboratory.microbiology.models import CultureResult

        CultureResult.objects.create(
            lab_result=sample_lab_result,
            status="INOCULATED",
            facility=sample_facility,
            organization=sample_organization,
        )
        mock_publish.assert_called_once()
        call_args = mock_publish.call_args
        assert call_args[0][0] == "laboratory.culture.created"
        assert call_args[1]["aggregate_type"] == "CultureResult"

    def test_culture_updated_publishes_event(self, db, mocker, culture_result, test_user):
        mock_publish = mocker.patch("hmis.apps.laboratory.microbiology.signals.publish_event")
        culture_result.start_incubation(user=test_user)
        mock_publish.assert_called()
        call_args = mock_publish.call_args
        assert call_args[0][0] == "laboratory.culture.updated"

    def test_sensitivity_created_publishes_event(
        self, db, mocker, reading_culture, antibiotic, sample_facility, sample_organization
    ):
        mock_publish = mocker.patch("hmis.apps.laboratory.microbiology.signals.publish_event")
        from hmis.apps.laboratory.microbiology.models import AntibioticSensitivity

        AntibioticSensitivity.objects.create(
            culture=reading_culture,
            antibiotic=antibiotic,
            interpretation="S",
            test_method="DISK",
            facility=sample_facility,
            organization=sample_organization,
        )
        mock_publish.assert_called_once()
        call_args = mock_publish.call_args
        assert call_args[0][0] == "laboratory.sensitivity.created"
