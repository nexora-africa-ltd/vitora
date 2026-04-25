"""Health and readiness helpers for the local ICD-11 fallback catalog."""

import logging

from django.db import OperationalError, ProgrammingError

logger = logging.getLogger(__name__)


def get_icd11_local_fallback_status() -> dict[str, int | bool | str]:
    """Return local ICD-11 fallback readiness and active code count."""
    code_count = get_icd11_local_code_count()
    return {
        "ready": code_count > 0,
        "code_count": code_count,
        "source": "database",
    }


def get_icd11_local_code_count() -> int:
    """Return the number of active ICD-11 codes available locally."""
    try:
        from hmis.apps.billing.models import ICD11CodeReference

        return ICD11CodeReference.objects.filter(is_active=True).count()
    except (OperationalError, ProgrammingError):
        return 0
    except Exception as exc:
        logger.warning("Unable to determine ICD-11 local fallback count: %s", exc)
        return 0


def get_icd11_local_ready_value() -> float:
    """Return Prometheus-ready readiness value for the ICD-11 local DB."""
    return 1.0 if get_icd11_local_code_count() > 0 else 0.0


def get_icd11_local_code_count_value() -> float:
    """Return Prometheus-ready code count value for the ICD-11 local DB."""
    return float(get_icd11_local_code_count())
