"""Custom Prometheus metrics for the billing app."""

from prometheus_client import REGISTRY, Gauge

from hmis.apps.billing.services.icd11_status import (
    get_icd11_local_code_count_value,
    get_icd11_local_ready_value,
)


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
