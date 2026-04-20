import pytest  # type: ignore


@pytest.mark.django_db
class TestClaimedEncountersApi:
    def test_my_claimed_returns_lightweight_claimed_serializer_fields(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
    ):
        sample_encounter.assigned_clinician = test_user
        sample_encounter.claimed_at = sample_encounter.created_at
        sample_encounter.status = "IN_PROGRESS"
        sample_encounter.save(update_fields=["assigned_clinician", "claimed_at", "status"])

        response = authenticated_client.get("/api/encounters/my_claimed/")

        assert response.status_code == 200
        assert response.data["count"] == 1

        item = response.data["results"][0]
        assert item["id"] == sample_encounter.id
        assert item["assigned_clinician"] == test_user.id
        assert item["assigned_clinician_username"] == test_user.username
        assert item["assigned_clinician_name"] == (test_user.get_full_name() or test_user.username)
        assert item["claimed_at"] is not None
        assert "cds_alerts" not in item
        assert "alerts" not in item
        assert "patient_age" not in item

    def test_my_claimed_excludes_closed_and_cancelled_by_default(
        self,
        authenticated_client,
        sample_encounter,
        test_user,
    ):
        sample_encounter.assigned_clinician = test_user
        sample_encounter.claimed_at = sample_encounter.created_at
        sample_encounter.status = "CLOSED"
        sample_encounter.save(update_fields=["assigned_clinician", "claimed_at", "status"])

        response = authenticated_client.get("/api/encounters/my_claimed/")

        assert response.status_code == 200
        assert response.data["count"] == 0
        assert response.data["results"] == []
