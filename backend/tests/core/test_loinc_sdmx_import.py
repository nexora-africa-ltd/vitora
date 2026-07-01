# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for LOINC Terminology Service and SDMX Import Service.

Covers Gap #5 (LOINC validation) and Gap #6 (SDMX inbound) from the
interoperability audit.
"""

import pytest  # type: ignore

from hmis.apps.laboratory.services.loinc_service import LOINCTerminologyService
from hmis.apps.quality.services.sdmx_import_service import (
    SDMXDataset,
    SDMXImportService,
    SDMXObservation,
)


class TestLOINCTerminologyService:
    """Tests for LOINC Terminology Service (local fallback)."""

    def test_init_defaults(self):
        """Should initialize with default settings."""
        service = LOINCTerminologyService()
        assert service.base_url == "https://fhir.loinc.org"
        assert service.timeout == 10

    def test_external_not_available_without_credentials(self):
        """Should report external as unavailable without credentials."""
        service = LOINCTerminologyService()
        # Default has empty credentials
        assert service.is_external_available is False

    @pytest.mark.django_db
    def test_lookup_local_existing_code(self):
        """Should find existing LOINC code in local cache."""
        from hmis.apps.laboratory.models import LOINCCode

        LOINCCode.objects.create(
            code="718-7",
            component="Hemoglobin",
            property="MCnc",
            time_aspect="Pt",
            system="Bld",
            scale_type="Qn",
        )

        service = LOINCTerminologyService()
        result = service.lookup("718-7")

        assert result is not None
        assert result["code"] == "718-7"
        assert result["component"] == "Hemoglobin"

    @pytest.mark.django_db
    def test_lookup_local_nonexistent_code(self):
        """Should return None for nonexistent LOINC code."""
        service = LOINCTerminologyService()
        result = service.lookup("99999-9")
        assert result is None

    @pytest.mark.django_db
    def test_validate_code_exists(self):
        """Should return True for valid code."""
        from hmis.apps.laboratory.models import LOINCCode

        LOINCCode.objects.create(
            code="8867-4",
            component="Heart rate",
            property="NRat",
            time_aspect="Pt",
            system="XXX",
            scale_type="Qn",
        )

        service = LOINCTerminologyService()
        assert service.validate_code("8867-4") is True

    @pytest.mark.django_db
    def test_validate_code_not_exists(self):
        """Should return False for invalid code."""
        service = LOINCTerminologyService()
        assert service.validate_code("99999-9") is False

    @pytest.mark.django_db
    def test_search_local(self):
        """Should search local LOINC codes by component name."""
        from hmis.apps.laboratory.models import LOINCCode

        LOINCCode.objects.create(
            code="718-7",
            component="Hemoglobin",
            property="MCnc",
            time_aspect="Pt",
            system="Bld",
            scale_type="Qn",
        )
        LOINCCode.objects.create(
            code="4544-3",
            component="Hematocrit",
            property="VFr",
            time_aspect="Pt",
            system="Bld",
            scale_type="Qn",
        )

        service = LOINCTerminologyService()
        results = service.search("Hemo")

        assert len(results) >= 1
        codes = [r["code"] for r in results]
        assert "718-7" in codes

    def test_search_empty_query(self):
        """Should return empty for short queries."""
        service = LOINCTerminologyService()
        assert service.search("") == []
        assert service.search("a") == []


class TestSDMXImportService:
    """Tests for SDMX-ML 2.1 import service."""

    SAMPLE_SDMX = """<?xml version="1.0" encoding="UTF-8"?>
<message:StructureSpecificData
    xmlns:message="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message"
    xmlns:common="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"
    xmlns:data="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/structurespecific">
  <message:Header>
    <message:ID>KNBS_HEALTH_2025Q1</message:ID>
    <message:Test>false</message:Test>
    <message:Prepared>2025-04-15T10:00:00</message:Prepared>
    <message:Sender id="KNBS">
      <common:Name xml:lang="en">Kenya National Bureau of Statistics</common:Name>
    </message:Sender>
    <message:Receiver id="VITORA_HMIS">
      <common:Name xml:lang="en">Vitora HMIS</common:Name>
    </message:Receiver>
  </message:Header>
  <message:DataSet structureRef="DSD_FACILITY_STATS" action="Replace">
    <Series INDICATOR="TOTAL_VISITS" FACILITY="12345">
      <Obs TIME_PERIOD="2025-Q1" OBS_VALUE="1500"/>
      <Obs TIME_PERIOD="2025-Q2" OBS_VALUE="1650"/>
    </Series>
    <Series INDICATOR="MMR" FACILITY="">
      <Obs TIME_PERIOD="2025" OBS_VALUE="362"/>
    </Series>
  </message:DataSet>
</message:StructureSpecificData>"""

    def test_parse_header(self):
        """Should parse SDMX message header."""
        service = SDMXImportService()
        dataset = service.parse_xml(self.SAMPLE_SDMX)

        assert dataset.dataset_id == "KNBS_HEALTH_2025Q1"
        assert dataset.sender_id == "KNBS"
        assert dataset.sender_name == "Kenya National Bureau of Statistics"
        assert dataset.receiver_id == "VITORA_HMIS"
        assert dataset.prepared == "2025-04-15T10:00:00"

    def test_parse_dataset_metadata(self):
        """Should parse dataset structure reference and action."""
        service = SDMXImportService()
        dataset = service.parse_xml(self.SAMPLE_SDMX)

        assert dataset.structure_ref == "DSD_FACILITY_STATS"
        assert dataset.action == "Replace"

    def test_parse_observations(self):
        """Should parse all observations from series."""
        service = SDMXImportService()
        dataset = service.parse_xml(self.SAMPLE_SDMX)

        assert len(dataset.observations) == 3

        # First observation: facility-specific
        obs1 = dataset.observations[0]
        assert obs1.indicator_code == "TOTAL_VISITS"
        assert obs1.facility_code == "12345"
        assert obs1.time_period == "2025-Q1"
        assert obs1.obs_value == "1500"

        # Second observation
        obs2 = dataset.observations[1]
        assert obs2.time_period == "2025-Q2"
        assert obs2.obs_value == "1650"

        # Third observation: national aggregate (no facility)
        obs3 = dataset.observations[2]
        assert obs3.indicator_code == "MMR"
        assert obs3.facility_code == ""
        assert obs3.time_period == "2025"
        assert obs3.obs_value == "362"

    def test_parse_invalid_xml(self):
        """Should raise ValueError for invalid XML."""
        service = SDMXImportService()
        with pytest.raises(ValueError, match="Invalid XML"):
            service.parse_xml("<not>valid<xml")

    @pytest.mark.django_db
    def test_import_benchmark_data(self):
        """Should store observations as BenchmarkObservation records."""
        from hmis.apps.quality.models import BenchmarkObservation

        service = SDMXImportService()
        dataset = service.parse_xml(self.SAMPLE_SDMX)

        stored = service.import_benchmark_data(dataset, source="KNBS")
        assert stored == 3

        # Verify stored in DB
        assert BenchmarkObservation.objects.count() == 3
        obs = BenchmarkObservation.objects.get(
            indicator_code="TOTAL_VISITS",
            time_period="2025-Q1",
            facility_code="12345",
        )
        assert obs.value == "1500"
        assert obs.source == "KNBS"
        assert obs.dataset_id == "KNBS_HEALTH_2025Q1"

    @pytest.mark.django_db
    def test_import_benchmark_data_upsert(self):
        """Should update existing observations on re-import."""
        from hmis.apps.quality.models import BenchmarkObservation

        service = SDMXImportService()
        dataset = service.parse_xml(self.SAMPLE_SDMX)

        # First import
        service.import_benchmark_data(dataset, source="KNBS")
        assert BenchmarkObservation.objects.count() == 3

        # Modify a value
        dataset.observations[0].obs_value = "1600"

        # Re-import should upsert
        service.import_benchmark_data(dataset, source="KNBS")
        assert BenchmarkObservation.objects.count() == 3

        obs = BenchmarkObservation.objects.get(
            indicator_code="TOTAL_VISITS",
            time_period="2025-Q1",
            facility_code="12345",
        )
        assert obs.value == "1600"
