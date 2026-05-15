"""Abstract base class for private insurance API adapters.

Each insurer (or insurer type) provides a concrete subclass. The adapter
translates between Vitora's internal models and the insurer's API shape.
"""

from __future__ import annotations

import abc
from datetime import date
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from hmis.apps.insurance.models import (
        InsuranceClaim,
        InsurancePreauth,
        InsuranceProviderConfig,
        PatientInsurance,
    )

from .results import ClaimResult, EligibilityResult, PreauthResult, RemittanceResult, TariffEntry


class InsuranceApiAdapter(abc.ABC):
    """Protocol that every insurer adapter MUST implement.

    An adapter is instantiated with the facility-level ``InsuranceProviderConfig``
    which contains the API base URL, auth credentials, and submission format.
    """

    def __init__(self, config: InsuranceProviderConfig) -> None:
        self.config = config

    # -------- eligibility --------------------------------------------------

    @abc.abstractmethod
    def verify_eligibility(self, enrollment: PatientInsurance) -> EligibilityResult:
        """Check whether a patient's insurance membership is valid."""

    # -------- preauthorization ---------------------------------------------

    @abc.abstractmethod
    def submit_preauth(self, preauth: InsurancePreauth) -> PreauthResult:
        """Submit a preauthorization request to the insurer."""

    @abc.abstractmethod
    def check_preauth_status(self, preauth: InsurancePreauth) -> PreauthResult:
        """Poll the current status of a previously submitted preauth."""

    # -------- claims -------------------------------------------------------

    @abc.abstractmethod
    def submit_claim(self, claim: InsuranceClaim) -> ClaimResult:
        """Submit a claim to the insurer."""

    @abc.abstractmethod
    def check_claim_status(self, claim: InsuranceClaim) -> ClaimResult:
        """Poll the current status of a previously submitted claim."""

    # -------- remittances --------------------------------------------------

    @abc.abstractmethod
    def fetch_remittances(
        self,
        date_from: date,
        date_to: date,
    ) -> list[RemittanceResult]:
        """Fetch remittance/payment advice for a date range."""

    # -------- tariffs ------------------------------------------------------

    @abc.abstractmethod
    def get_tariff_schedule(self) -> list[TariffEntry]:
        """Retrieve the insurer's tariff/price list."""
