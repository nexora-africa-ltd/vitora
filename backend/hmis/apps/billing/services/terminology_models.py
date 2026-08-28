# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: terminology dataclasses and domain errors used by TerminologyService.
How to use: imported by split terminology service modules and compatibility shim.
Supported inputs/args: data models and exception classes for terminology APIs.
"""

# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Terminology Service for Vitora HMIS.

This module handles integration with Kenya DHA Terminology APIs
for standardized medical coding. Implements remote-first approach
with local database fallback.

Reference: docs/dha-api-usage-analysis.md
Official Endpoints:
    - GET /v1/sha-interventions - SHA interventions catalog
    - GET /v1/icd-11 - ICD-11 disease classification
    - GET /v1/drug-products - Drug products catalog
    - GET /v1/active-component - Active pharmaceutical ingredients
    - GET /v1/loinc - LOINC lab observation codes
    - GET /v1/ichi - ICHI intervention classification
"""

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

import requests
from django.conf import settings
from django.db.models import Q

from .intervention_fallback import get_local_intervention, search_local_interventions
from .sha_auth import SHAAuthError, SHAAuthService

logger = logging.getLogger(__name__)


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class InterventionCode:
    """
    SHA Intervention code for reimbursement.

    Represents a standardized SHA intervention for billing and claims.

    Attributes:
        code: SHA intervention code (e.g., 'SHA-INT-001')
        name: Intervention name
        description: Detailed description
        category: Intervention category
        price: SHA reimbursement price
        facility_level: Minimum facility level (1-6)
        is_active: Whether intervention is currently valid
        effective_date: When this intervention became effective
        raw_data: Original API response
    """

    code: str
    name: str
    description: str | None = None
    category: str | None = None
    price: Decimal | None = None
    facility_level: int | None = None
    is_active: bool = True
    effective_date: date | None = None
    raw_data: dict = field(default_factory=dict)
    max_amount_per_test: str | None = None
    quantity_per_year: str | None = None
    requires_preauthorization: bool = False
    access_point: str | None = None
    payment_mechanism: str | None = None
    benefit_code: str | None = None

    @classmethod
    def from_api_response(cls, data: dict) -> "InterventionCode":
        """Create from DHA API response."""
        # Parse price
        price = data.get("price") or data.get("sha_price")
        if price is not None:
            price = Decimal(str(price))

        # Parse facility level from levels list or direct field
        level = data.get("facility_level") or data.get("min_facility_level")
        levels = data.get("levels", [])
        if not level and levels:
            # Extract minimum level from levels array: [{"2": "..."}, {"3": "..."}]
            level_nums = []
            for lvl in levels:
                if isinstance(lvl, dict):
                    level_nums.extend(int(k) for k in lvl if k.isdigit())
            level = min(level_nums) if level_nums else None
        if isinstance(level, str):
            level = int(level.replace("LEVEL ", "").strip())

        # Parse effective date
        eff_date = data.get("effective_date")
        if isinstance(eff_date, str):
            eff_date = datetime.strptime(eff_date, "%Y-%m-%d").date()

        return cls(
            code=data.get("intervention_code", "") or data.get("code", ""),
            name=data.get("intervention_name", "") or data.get("name", ""),
            description=data.get("description"),
            category=data.get("category"),
            price=price,
            facility_level=level,
            is_active=data.get("is_active", True),
            effective_date=eff_date,
            raw_data=data,
        )


@dataclass
class ICD11Code:
    """
    ICD-11 disease classification code.

    Represents a disease/condition code from the WHO ICD-11
    classification system.

    Attributes:
        code: ICD-11 code (e.g., '1A00')
        title: Disease/condition title
        description: Detailed description
        parent_code: Parent category code
        chapter: ICD-11 chapter
        is_leaf: Whether this is a leaf node (most specific)
        raw_data: Original API response
    """

    code: str
    title: str
    description: str | None = None
    parent_code: str | None = None
    chapter: str | None = None
    is_leaf: bool = True
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> "ICD11Code":
        """Create from DHA API response."""
        return cls(
            code=data.get("icd_11_code", "") or data.get("code", ""),
            title=data.get("description", "") or data.get("title", "") or data.get("name", ""),
            description=data.get("description"),
            parent_code=data.get("parent_code"),
            chapter=data.get("chapter"),
            is_leaf=data.get("is_leaf", True),
            raw_data=data,
        )


@dataclass
class DrugProduct:
    """
    Drug product from DHA HPT Registry.

    Maps to the DHA Terminology API response from
    GET /terminology/v1/product.

    Attributes:
        product_id: DHA unique product identifier (integer)
        brand_name: Commercial brand name
        generic_name: Generic/INN name
        brand_display_name: Full brand display (e.g., 'Glucodeal 500 mg Oral Tablet')
        generic_display_name: Full generic display (e.g., 'Metformin 500 mg Oral Tablet')
        generic_concept_id: DHA generic concept grouping ID
        strength_amount: Numeric strength (e.g., '500')
        strength_unit: Strength unit (e.g., 'mg')
        route_description: Administration route (e.g., 'Oral')
        form_description: Dosage form (e.g., 'Tablet')
        ppb_registration_code: Kenya PPB registration code
        etcd: ETCD identifier
        knhts_concept_id: KNHTS concept ID — primary HPT code (e.g., '10-03913-01')
        updation_date: Last update timestamp from DHA
        raw_data: Original API response
    """

    product_id: int
    brand_name: str
    generic_name: str = ""
    brand_display_name: str = ""
    generic_display_name: str = ""
    generic_concept_id: int | None = None
    strength_amount: str = ""
    strength_unit: str = ""
    route_description: str = ""
    form_description: str = ""
    ppb_registration_code: str = ""
    etcd: str = ""
    knhts_concept_id: str = ""
    updation_date: str = ""
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> "DrugProduct":
        """Create from DHA API response."""
        product_id = data.get("product_id", 0)
        if isinstance(product_id, str):
            product_id = int(product_id) if product_id.isdigit() else 0

        generic_concept_id = data.get("generic_concept_id")
        if isinstance(generic_concept_id, str):
            generic_concept_id = int(generic_concept_id) if generic_concept_id.isdigit() else None

        return cls(
            product_id=product_id,
            brand_name=data.get("brand_name", "") or data.get("name", ""),
            generic_name=data.get("generic_name", ""),
            brand_display_name=data.get("brand_display_name", ""),
            generic_display_name=data.get("generic_display_name", ""),
            generic_concept_id=generic_concept_id,
            strength_amount=data.get("strength_amount", ""),
            strength_unit=data.get("strength_unit", ""),
            route_description=data.get("route_description", ""),
            form_description=data.get("form_description", ""),
            ppb_registration_code=data.get("ppb_registration_code", ""),
            etcd=data.get("etcd", ""),
            knhts_concept_id=data.get("knhts_concept_id", ""),
            updation_date=data.get("updation_date", ""),
            raw_data=data,
        )


@dataclass
class ComponentLink:
    """
    Link between an active component and its ATC classification.

    From the DHA API nested 'component_links' array.
    """

    active_component_link_id: int
    active_component_line: int
    active_component_id: int
    component_name: str
    component_atc_code: str

    @classmethod
    def from_api_response(cls, data: dict) -> "ComponentLink":
        """Create from API response."""
        return cls(
            active_component_link_id=data.get("active_component_link_id", 0),
            active_component_line=data.get("active_component_line", 0),
            active_component_id=data.get("active_component_id", 0),
            component_name=data.get("component_name", ""),
            component_atc_code=data.get("component_atc_code", ""),
        )


@dataclass
class ActiveComponent:
    """
    Active pharmaceutical ingredient from DHA HPT Registry.

    Maps to the DHA Terminology API response from
    GET /terminology/v1/active-component.

    Attributes:
        component_id: DHA unique component identifier
        name: Component description / INN name (e.g., 'Metformin')
        component_links: List of ATC classification links
        raw_data: Original API response
    """

    component_id: int
    name: str
    component_links: list[ComponentLink] = field(default_factory=list)
    raw_data: dict = field(default_factory=dict)

    @property
    def atc_codes(self) -> list[str]:
        """Extract all ATC codes from component links."""
        return [link.component_atc_code for link in self.component_links if link.component_atc_code]

    @property
    def atc_code(self) -> str | None:
        """Primary ATC code (first link), for backward compatibility."""
        codes = self.atc_codes
        return codes[0] if codes else None

    @classmethod
    def from_api_response(cls, data: dict) -> "ActiveComponent":
        """Create from DHA API response."""
        component_id = data.get("active_component_id", 0) or data.get("component_id", 0)
        if isinstance(component_id, str):
            component_id = int(component_id) if component_id.isdigit() else 0

        # Parse nested component_links
        links_data = data.get("component_links", [])
        links = [ComponentLink.from_api_response(link) for link in links_data]

        return cls(
            component_id=component_id,
            name=data.get("component_description", "") or data.get("name", ""),
            component_links=links,
            raw_data=data,
        )


@dataclass
class RemoteLOINCCode:
    """
    LOINC observation code from remote API.

    Represents a laboratory observation code from Regenstrief's
    LOINC database, fetched from DHA API.

    Note: Falls back to local LOINCCode model if API unavailable.

    Attributes:
        loinc_num: LOINC code number (e.g., '2345-7')
        component: What is measured
        property: Kind of property
        time_aspect: Timing (Pt, 24H, etc.)
        system: Body system/specimen
        scale_type: Scale (Qn, Ord, etc.)
        method_type: Method used
        long_common_name: Full descriptive name
        short_name: Abbreviated name
        status: Active, deprecated, etc.
        raw_data: Original API response
    """

    loinc_num: str
    component: str
    property: str | None = None
    time_aspect: str | None = None
    system: str | None = None
    scale_type: str | None = None
    method_type: str | None = None
    long_common_name: str | None = None
    short_name: str | None = None
    status: str = "ACTIVE"
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> "RemoteLOINCCode":
        """Create from DHA API response."""
        return cls(
            loinc_num=data.get("loinc_num", "") or data.get("code", ""),
            component=data.get("component", "") or data.get("name", ""),
            property=data.get("property"),
            time_aspect=data.get("time_aspect"),
            system=data.get("system"),
            scale_type=data.get("scale_type"),
            method_type=data.get("method_type"),
            long_common_name=data.get("display_name") or data.get("long_common_name"),
            short_name=data.get("short_name"),
            status=data.get("status", "ACTIVE"),
            raw_data=data,
        )


@dataclass
class ICHICode:
    """
    ICHI intervention classification code.

    Represents an intervention from WHO's International
    Classification of Health Interventions.

    Attributes:
        code: ICHI code
        title: Intervention title
        definition: Intervention definition
        target: Target body system/entity
        action: Type of action
        means: Means of intervention
        raw_data: Original API response
    """

    code: str
    title: str
    definition: str | None = None
    target: str | None = None
    action: str | None = None
    means: str | None = None
    raw_data: dict = field(default_factory=dict)

    @classmethod
    def from_api_response(cls, data: dict) -> "ICHICode":
        """Create from DHA API response."""
        return cls(
            code=data.get("code", "") or data.get("id_code", ""),
            title=data.get("clean_title", "") or data.get("title", "") or data.get("name", ""),
            definition=data.get("definition"),
            target=data.get("target"),
            action=data.get("action"),
            means=data.get("mean") or data.get("means"),
            raw_data=data,
        )


# =============================================================================
# Custom Exceptions
# =============================================================================


class TerminologyError(Exception):
    """
    Base exception for Terminology operations.

    Attributes:
        message: Error description
        status_code: HTTP status code if applicable
        terminology_type: Which terminology system failed
    """

    def __init__(
        self,
        message: str,
        status_code: int = 0,
        terminology_type: str | None = None,
    ):
        self.message = message
        self.status_code = status_code
        self.terminology_type = terminology_type
        super().__init__(message)

    def __str__(self):
        parts = ["TerminologyError"]
        if self.terminology_type:
            parts.append(f"[{self.terminology_type}]")
        if self.status_code:
            parts.append(f"({self.status_code})")
        parts.append(f": {self.message}")
        return "".join(parts)


class CodeNotFoundError(TerminologyError):
    """Raised when a terminology code is not found."""

    def __init__(self, code: str, terminology: str):
        self.code = code
        super().__init__(
            message=f"Code '{code}' not found in {terminology}",
            status_code=404,
            terminology_type=terminology,
        )


# =============================================================================
# Service Class
# =============================================================================
