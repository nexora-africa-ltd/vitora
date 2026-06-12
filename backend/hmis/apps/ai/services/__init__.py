# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Local fallback services for clinical AI features.

Used when TibaBot is unavailable — provides basic rule-based results
without LLM enrichment. Responses include ``"mode": "fallback"`` to
signal degraded capability to the frontend.
"""
