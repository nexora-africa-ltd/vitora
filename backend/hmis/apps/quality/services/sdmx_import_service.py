# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
SDMX-ML Import Service for Vitora HMIS.

Parses inbound SDMX 2.1 StructureSpecificData messages and stores
benchmark observations for facility comparison and national statistics.

Implements Gap #8 of the interoperability audit: SDMX inbound consumption.
"""

import logging
from dataclasses import dataclass, field
from xml.etree.ElementTree import Element  # nosec B405 — type annotation only

from defusedxml import ElementTree as DefusedET
from django.utils import timezone

logger = logging.getLogger(__name__)

# SDMX 2.1 Namespaces
NS = {
    "message": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message",
    "common": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common",
    "data": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/structurespecific",
    "generic": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic",
}


@dataclass
class SDMXObservation:
    """A single parsed SDMX observation (data point)."""

    time_period: str = ""
    obs_value: str = ""
    indicator_code: str = ""
    facility_code: str = ""
    dimensions: dict[str, str] = field(default_factory=dict)
    attributes: dict[str, str] = field(default_factory=dict)


@dataclass
class SDMXDataset:
    """A parsed SDMX dataset with metadata."""

    dataset_id: str = ""
    structure_ref: str = ""
    action: str = ""  # Replace, Append, Delete
    sender_id: str = ""
    sender_name: str = ""
    receiver_id: str = ""
    prepared: str = ""
    observations: list[SDMXObservation] = field(default_factory=list)


class SDMXImportService:
    """Service for importing SDMX-ML 2.1 data into Vitora HMIS."""

    def parse_xml(self, xml_content: str) -> SDMXDataset:
        """
        Parse an SDMX-ML 2.1 StructureSpecificData message.

        Args:
            xml_content: Raw XML string (SDMX-ML 2.1 format)

        Returns:
            SDMXDataset with extracted observations.

        Raises:
            ValueError: If XML is invalid or not SDMX format.
        """
        try:
            root = DefusedET.fromstring(xml_content)
        except (DefusedET.ParseError, AttributeError, TypeError, ValueError) as e:
            raise ValueError(f"Invalid XML: {e}") from e

        dataset = SDMXDataset()

        # Parse header
        header = self._find_element(root, "Header")
        if header is not None:
            self._parse_header(header, dataset)

        # Parse DataSet (StructureSpecific format)
        data_set = self._find_element(root, "DataSet")
        if data_set is not None:
            dataset.structure_ref = data_set.get("structureRef", "")
            dataset.action = data_set.get("action", "")
            self._parse_structure_specific_dataset(data_set, dataset)
        else:
            # Try generic format
            data_set = self._find_element(root, "DataSet", ns="generic")
            if data_set is not None:
                self._parse_generic_dataset(data_set, dataset)

        return dataset

    def import_benchmark_data(self, dataset: SDMXDataset, source: str = "KNBS") -> int:
        """
        Store parsed SDMX observations as benchmark data for facility comparison.

        Args:
            dataset: Parsed SDMXDataset
            source: Data source identifier (e.g., "KNBS", "KHIS", "WHO")

        Returns:
            Number of observations stored.
        """
        from hmis.apps.quality.models import BenchmarkObservation

        stored = 0
        for obs in dataset.observations:
            BenchmarkObservation.objects.update_or_create(
                indicator_code=obs.indicator_code,
                time_period=obs.time_period,
                facility_code=obs.facility_code or "",
                source=source,
                defaults={
                    "value": obs.obs_value,
                    "dimensions": obs.dimensions,
                    "attributes": obs.attributes,
                    "dataset_id": dataset.dataset_id,
                    "imported_at": timezone.now(),
                },
            )
            stored += 1

        logger.info(f"Imported {stored} SDMX observations from {source}")
        return stored

    # --- Internal parsing methods ---

    def _find_element(self, root: Element, local_name: str, _ns: str = "message") -> Element | None:
        """Find element by local name across known namespaces."""
        # Try with namespace
        for _prefix, uri in NS.items():
            el = root.find(f"{{{uri}}}{local_name}")
            if el is not None:
                return el
        # Try without namespace
        for child in root:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if tag == local_name:
                return child
        return None

    def _parse_header(self, header: Element, dataset: SDMXDataset):
        """Parse SDMX message header."""
        for child in header:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if tag == "ID":
                dataset.dataset_id = child.text or ""
            elif tag == "Prepared":
                dataset.prepared = child.text or ""
            elif tag == "Sender":
                dataset.sender_id = child.get("id", "")
                for name_el in child:
                    name_tag = name_el.tag.split("}")[-1] if "}" in name_el.tag else name_el.tag
                    if name_tag == "Name":
                        dataset.sender_name = name_el.text or ""
            elif tag == "Receiver":
                dataset.receiver_id = child.get("id", "")

    def _parse_structure_specific_dataset(self, data_set: Element, dataset: SDMXDataset):
        """Parse StructureSpecific format observations."""
        for child in data_set:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if tag == "Series":
                self._parse_series(child, dataset)
            elif tag == "Obs":
                obs = self._parse_obs_element(child)
                dataset.observations.append(obs)

    def _parse_series(self, series_el: Element, dataset: SDMXDataset):
        """Parse a Series element with its observations."""
        # Series-level dimensions become shared across all Obs in this series
        series_dims = dict(series_el.attrib)

        for child in series_el:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if tag == "Obs":
                obs = self._parse_obs_element(child)
                # Merge series dimensions
                obs.dimensions.update(series_dims)
                # Extract common dimension mappings
                obs.indicator_code = obs.indicator_code or series_dims.get("INDICATOR", "")
                obs.facility_code = obs.facility_code or series_dims.get("FACILITY", "")
                dataset.observations.append(obs)

    def _parse_obs_element(self, obs_el: Element) -> SDMXObservation:
        """Parse a single Obs element."""
        obs = SDMXObservation()
        attrs = dict(obs_el.attrib)

        obs.time_period = attrs.pop("TIME_PERIOD", "")
        obs.obs_value = attrs.pop("OBS_VALUE", "")
        obs.indicator_code = attrs.pop("INDICATOR", "")
        obs.facility_code = attrs.pop("FACILITY", "")

        # Remaining attributes become dimensions
        obs.dimensions = attrs
        return obs

    def _parse_generic_dataset(self, data_set: Element, dataset: SDMXDataset):
        """Parse generic SDMX format (less common but supported)."""
        for child in data_set:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if tag == "Series":
                self._parse_generic_series(child, dataset)

    def _parse_generic_series(self, series_el: Element, dataset: SDMXDataset):
        """Parse generic format Series."""
        series_dims: dict[str, str] = {}
        for child in series_el:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if tag == "SeriesKey":
                for value_el in child:
                    key_id = value_el.get("id", "")
                    key_val = value_el.get("value", "")
                    if key_id:
                        series_dims[key_id] = key_val
            elif tag == "Obs":
                obs = SDMXObservation(dimensions=dict(series_dims))
                for obs_child in child:
                    obs_tag = (
                        obs_child.tag.split("}")[-1] if "}" in obs_child.tag else obs_child.tag
                    )
                    if obs_tag == "ObsDimension":
                        obs.time_period = obs_child.get("value", "")
                    elif obs_tag == "ObsValue":
                        obs.obs_value = obs_child.get("value", "")
                obs.indicator_code = series_dims.get("INDICATOR", "")
                obs.facility_code = series_dims.get("FACILITY", "")
                dataset.observations.append(obs)
