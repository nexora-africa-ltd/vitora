import pytest
from django.test import override_settings

pytestmark = pytest.mark.django_db


class TestHealthCheckICD11Status:
    def test_health_reports_icd11_fallback_empty(self, api_client):
        response = api_client.get("/api/health/")

        assert response.status_code == 200
        assert response.json()["icd11_local_fallback"] == {
            "ready": False,
            "code_count": 0,
            "source": "database",
        }
        assert response.json()["status"] in {"healthy", "degraded", "unhealthy"}
        assert "checks" in response.json()
        assert "database" in response.json()["checks"]

    def test_health_reports_icd11_fallback_ready(self, api_client):
        from hmis.apps.billing.models import ICD11CodeReference

        ICD11CodeReference.objects.create(
            code="1A00",
            title="Cholera",
            chapter="1",
            chapter_no="1",
            class_kind="category",
            is_leaf=True,
            is_active=True,
        )

        response = api_client.get("/api/health/")

        assert response.status_code == 200
        assert response.json()["icd11_local_fallback"] == {
            "ready": True,
            "code_count": 1,
            "source": "database",
        }


class TestHealthCheckExpandedPayload:
    def test_health_includes_runtime_and_component_checks(self, api_client):
        response = api_client.get("/api/health/")

        assert response.status_code == 200
        payload = response.json()

        assert payload["service"] == "vitora-hmis"
        assert "timestamp" in payload
        assert "uptime_seconds" in payload
        assert "environment" in payload
        assert "checks" in payload
        assert "database" in payload["checks"]
        assert "cache" in payload["checks"]
        assert "migrations" in payload["checks"]
        assert "websocket" in payload["checks"]
        assert "kms" in payload["checks"]
        assert "media_storage" in payload["checks"]
        assert "tibabot" in payload["checks"]
        assert "tibabot_status" in payload
        assert isinstance(payload["checks"]["database"]["name"], str)

    def test_health_reports_media_storage_healthy_for_blob_backend(self, api_client, mocker):
        mocker.patch("hmis.urls.settings.MEDIA_BACKEND", "azure_blob")

        fake_storage = mocker.MagicMock()
        fake_storage.save.return_value = "health/probe/test.txt"
        fake_storage.open.return_value.__enter__.return_value.read.return_value = (
            b"vitora-media-probe:123"
        )

        mocker.patch("django.core.files.storage.default_storage", fake_storage)
        mocker.patch("uuid.uuid4", return_value=mocker.Mock(hex="abc"))
        mocker.patch("time.time", return_value=123)

        response = api_client.get("/api/health/")

        assert response.status_code == 200
        payload = response.json()
        assert payload["checks"]["media_storage"]["status"] == "healthy"
        fake_storage.save.assert_called_once()
        fake_storage.delete.assert_called_once_with("health/probe/test.txt")

    def test_health_reports_media_storage_skipped_for_non_blob_backend(self, api_client, mocker):
        mocker.patch("hmis.urls.settings.MEDIA_BACKEND", "local")

        response = api_client.get("/api/health/")

        assert response.status_code == 200
        payload = response.json()
        assert payload["checks"]["media_storage"]["status"] == "skipped"

    def test_health_reports_unhealthy_when_database_check_fails(self, api_client, mocker):
        mocker.patch(
            "hmis.urls._check_database_health",
            return_value={
                "status": "unhealthy",
                "engine": "django.db.backends.sqlite3",
                "name": "test",
                "latency_ms": 1.0,
                "error": "simulated db failure",
            },
        )

        response = api_client.get("/api/health/")

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "unhealthy"
        assert payload["checks"]["database"]["status"] == "unhealthy"

    def test_health_lite_mode_returns_minimal_payload(self, api_client):
        response = api_client.get("/api/health/?lite=1")

        assert response.status_code == 200
        payload = response.json()

        assert payload["mode"] == "lite"
        assert "environment" not in payload
        assert "build" not in payload
        assert "icd11_local_fallback" not in payload
        assert set(payload["checks"].keys()) == {"database"}

    @override_settings(TIBABOT_ENABLED=False)
    def test_health_reports_tibabot_disabled(self, api_client):
        response = api_client.get("/api/health/")

        assert response.status_code == 200
        payload = response.json()
        assert payload["tibabot_status"] == "disabled"
        assert payload["checks"]["tibabot"]["enabled"] is False


class TestPrometheusICD11Metrics:
    def test_metrics_expose_icd11_local_fallback_gauges(self, api_client):
        from hmis.apps.billing.models import ICD11CodeReference

        ICD11CodeReference.objects.create(
            code="1A00",
            title="Cholera",
            chapter="1",
            chapter_no="1",
            class_kind="category",
            is_leaf=True,
            is_active=True,
        )

        response = api_client.get("/metrics")

        assert response.status_code == 200
        content = response.content.decode("utf-8")
        assert "vitora_icd11_local_db_ready 1.0" in content
        assert "vitora_icd11_local_db_codes_total 1.0" in content
