import pytest

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
