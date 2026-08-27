# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Custom Prometheus metrics for the billing app."""

import logging

from prometheus_client import REGISTRY, Gauge

from hmis.apps.billing.services.icd11_status import (
    get_icd11_local_code_count_value,
    get_icd11_local_ready_value,
)

logger = logging.getLogger(__name__)


def _get_or_create_gauge(name: str, documentation: str) -> Gauge:
    existing = REGISTRY._names_to_collectors.get(name)
    if existing is not None:
        return existing
    return Gauge(name, documentation)


ICD11_LOCAL_DB_READY = _get_or_create_gauge(
    "vitora_icd11_local_db_ready",
    "Whether the local ICD-11 fallback database is populated and ready.",
)
ICD11_LOCAL_DB_READY.set_function(get_icd11_local_ready_value)

ICD11_LOCAL_DB_CODES_TOTAL = _get_or_create_gauge(
    "vitora_icd11_local_db_codes_total",
    "Number of active ICD-11 codes available in the local fallback database.",
)
ICD11_LOCAL_DB_CODES_TOTAL.set_function(get_icd11_local_code_count_value)


# =============================================================================
# PII Encryption Health
# =============================================================================
# Gauges report whether KMS can encrypt/decrypt and whether stored PII data
# can be decrypted successfully.  Used by Prometheus alerting to detect
# encryption-key drift across deployments.


def _pii_encryption_healthy() -> int:
    """Lightweight PII encryption health check.

    Returns 1 if KMS is operational AND a sample encrypted PII field can be
    decrypted.  Returns 0 on any failure so Prometheus can alert.
    """
    from hmis.apps.core.kms import get_kms_provider

    # 1. KMS provider health (encrypt/decrypt round-trip)
    try:
        kms = get_kms_provider()
        if not kms.is_healthy():
            logger.warning("PII gauge: KMS health check failed")
            return 0
    except (AttributeError, TypeError, RuntimeError, OSError, AssertionError) as exc:
        logger.warning("PII gauge: KMS unavailable (%s)", exc)
        return 0

    # 2. Sample decrypt — pick the first Facility with encrypted PII data
    try:
        from hmis.apps.core.models import Facility

        sample = (
            Facility.objects.exclude(biometrics_agent_national_id_encrypted="")
            .values_list("pk", "biometrics_agent_national_id_encrypted")
            .first()
        )
        if sample is not None:
            pk, encrypted = sample
            decrypted = kms.decrypt_string(encrypted)
            if not decrypted:
                logger.warning("PII gauge: decryption returned empty for Facility pk=%s", pk)
                return 0
    except (AttributeError, TypeError, RuntimeError, OSError, AssertionError) as exc:
        logger.warning("PII gauge: sample decryption failed (%s)", exc)
        return 0

    return 1


PII_ENCRYPTION_HEALTHY = _get_or_create_gauge(
    "vitora_pii_encryption_healthy",
    "1 if KMS is operational and stored PII data can be decrypted, 0 otherwise.",
)
PII_ENCRYPTION_HEALTHY.set_function(_pii_encryption_healthy)
