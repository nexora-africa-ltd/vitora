"""Celery tasks for MOH report generation."""

from __future__ import annotations

import logging
from datetime import date

from celery import shared_task

from hmis.apps.core.models import Facility

from .services import MOH705Generator, MOH711Generator, MOH717Generator

logger = logging.getLogger(__name__)


def _previous_month() -> tuple[int, int]:
    """Return (year, month) for the previous calendar month."""
    today = date.today()
    if today.month == 1:
        return today.year - 1, 12
    return today.year, today.month - 1


@shared_task
def generate_moh705_monthly(year: int | None = None, month: int | None = None):
    """Generate MOH 705 for all active facilities."""
    if year is None or month is None:
        year, month = _previous_month()
    generated = 0
    for facility in Facility.objects.filter(is_active=True):
        try:
            MOH705Generator.generate(facility, year, month)
            generated += 1
        except Exception:
            logger.exception("MOH 705 generation failed for %s", facility.name)
    logger.info("MOH 705: generated %d reports for %04d-%02d", generated, year, month)


@shared_task
def generate_moh711_monthly(year: int | None = None, month: int | None = None):
    """Generate MOH 711 for all active facilities."""
    if year is None or month is None:
        year, month = _previous_month()
    generated = 0
    for facility in Facility.objects.filter(is_active=True):
        try:
            MOH711Generator.generate(facility, year, month)
            generated += 1
        except Exception:
            logger.exception("MOH 711 generation failed for %s", facility.name)
    logger.info("MOH 711: generated %d reports for %04d-%02d", generated, year, month)


@shared_task
def generate_moh717_monthly(year: int | None = None, month: int | None = None):
    """Generate MOH 717 for all active facilities."""
    if year is None or month is None:
        year, month = _previous_month()
    generated = 0
    for facility in Facility.objects.filter(is_active=True):
        try:
            MOH717Generator.generate(facility, year, month)
            generated += 1
        except Exception:
            logger.exception("MOH 717 generation failed for %s", facility.name)
    logger.info("MOH 717: generated %d reports for %04d-%02d", generated, year, month)
