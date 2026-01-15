"""
Tests for RBAC settings configuration.

Sprint 1.1-1.2 Track C: RBAC Foundation - Phase 6
"""

from django.conf import settings


class TestRBACSettings:
    """Tests for RBAC configuration settings."""

    def test_rbac_enabled_setting(self):
        """Should have RBAC_ENABLED setting."""
        assert hasattr(settings, 'RBAC_ENABLED')
        assert settings.RBAC_ENABLED is True

    def test_rbac_strict_mode_setting(self):
        """Should have RBAC_STRICT_MODE setting."""
        assert hasattr(settings, 'RBAC_STRICT_MODE')
        assert settings.RBAC_STRICT_MODE is True

    def test_rbac_cache_timeout_setting(self):
        """Should have RBAC_CACHE_TIMEOUT setting."""
        assert hasattr(settings, 'RBAC_CACHE_TIMEOUT')
        assert settings.RBAC_CACHE_TIMEOUT == 300

    def test_kenya_license_bodies_setting(self):
        """Should have KENYA_LICENSE_BODIES dictionary."""
        assert hasattr(settings, 'KENYA_LICENSE_BODIES')
        assert isinstance(settings.KENYA_LICENSE_BODIES, dict)

        # Verify all required license bodies
        required_bodies = ['KMPDB', 'NCK', 'KMLTTB', 'PPB', 'COC']
        for body in required_bodies:
            assert body in settings.KENYA_LICENSE_BODIES
            assert isinstance(settings.KENYA_LICENSE_BODIES[body], str)
            assert len(settings.KENYA_LICENSE_BODIES[body]) > 0

    def test_kenya_license_bodies_content(self):
        """Should have correct Kenya license body names."""
        bodies = settings.KENYA_LICENSE_BODIES

        assert bodies['KMPDB'] == 'Kenya Medical Practitioners and Dentists Board'
        assert bodies['NCK'] == 'Nursing Council of Kenya'
        assert bodies['KMLTTB'] == 'Kenya Medical Laboratory Technicians and Technologists Board'
        assert bodies['PPB'] == 'Pharmacy and Poisons Board'
        assert bodies['COC'] == 'Clinical Officers Council'

    def test_rbac_hierarchy_levels_setting(self):
        """Should have RBAC_HIERARCHY_LEVELS dictionary."""
        assert hasattr(settings, 'RBAC_HIERARCHY_LEVELS')
        assert isinstance(settings.RBAC_HIERARCHY_LEVELS, dict)

        # Verify all hierarchy levels
        expected_levels = [
            'ADMIN', 'MANAGEMENT', 'CLINICAL_SENIOR',
            'CLINICAL', 'TECHNICAL', 'ADMINISTRATIVE', 'COMMUNITY'
        ]
        for level in expected_levels:
            assert level in settings.RBAC_HIERARCHY_LEVELS

    def test_rbac_hierarchy_levels_ordering(self):
        """Should have proper hierarchy ordering (lower = higher authority)."""
        levels = settings.RBAC_HIERARCHY_LEVELS

        # Verify order: ADMIN < MANAGEMENT < CLINICAL_SENIOR, etc.
        assert levels['ADMIN'] == 0
        assert levels['MANAGEMENT'] == 1
        assert levels['CLINICAL_SENIOR'] == 2
        assert levels['CLINICAL'] == 3
        assert levels['TECHNICAL'] == 4
        assert levels['ADMINISTRATIVE'] == 5
        assert levels['COMMUNITY'] == 6

        # Verify ascending order
        assert levels['ADMIN'] < levels['MANAGEMENT']
        assert levels['MANAGEMENT'] < levels['CLINICAL_SENIOR']
        assert levels['CLINICAL_SENIOR'] < levels['CLINICAL']
        assert levels['CLINICAL'] < levels['TECHNICAL']
        assert levels['TECHNICAL'] < levels['ADMINISTRATIVE']
        assert levels['ADMINISTRATIVE'] < levels['COMMUNITY']

    def test_settings_are_accessible(self):
        """Should be able to access all RBAC settings from code."""
        # This verifies settings can be imported and used
        from django.conf import settings as django_settings

        assert django_settings.RBAC_ENABLED is True
        assert django_settings.RBAC_STRICT_MODE is True
        assert django_settings.RBAC_CACHE_TIMEOUT == 300
        assert len(django_settings.KENYA_LICENSE_BODIES) == 5
        assert len(django_settings.RBAC_HIERARCHY_LEVELS) == 7
