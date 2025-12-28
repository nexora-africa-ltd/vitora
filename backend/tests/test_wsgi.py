"""
Tests for WSGI configuration.

Sprint 0.6: Coverage improvement tests for wsgi.py
"""

import os
import pytest


class TestWSGIConfiguration:
    """Tests for WSGI application configuration."""

    def test_django_settings_module_set(self):
        """DJANGO_SETTINGS_MODULE should be set correctly."""
        # The settings module should be set
        settings_module = os.environ.get("DJANGO_SETTINGS_MODULE", "")
        assert "hmis.settings" in settings_module

    def test_wsgi_module_structure(self):
        """The wsgi module should have proper structure."""
        # Read the wsgi.py file and verify its content
        import hmis
        wsgi_path = os.path.join(os.path.dirname(hmis.__file__), 'wsgi.py')
        
        with open(wsgi_path, 'r') as f:
            content = f.read()
        
        # Verify expected content
        assert 'get_wsgi_application' in content
        assert 'DJANGO_SETTINGS_MODULE' in content
        assert 'application' in content

    def test_wsgi_setdefault_present(self):
        """wsgi.py should set default settings module."""
        import hmis
        wsgi_path = os.path.join(os.path.dirname(hmis.__file__), 'wsgi.py')
        
        with open(wsgi_path, 'r') as f:
            content = f.read()
        
        # Should have os.environ.setdefault call
        assert 'os.environ.setdefault' in content
        assert 'hmis.settings' in content
