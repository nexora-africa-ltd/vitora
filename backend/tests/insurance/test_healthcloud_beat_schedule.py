"""HealthCloud insurance Celery beat schedule tests."""


def test_healthcloud_insurance_tasks_exist_in_beat_schedule():
    from hmis.celery import app

    schedule = app.conf.beat_schedule

    assert "insurance-poll-claim-statuses" in schedule
    assert schedule["insurance-poll-claim-statuses"]["task"] == (
        "hmis.apps.insurance.tasks.check_pending_claims_status"
    )

    assert "insurance-fetch-remittances" in schedule
    assert schedule["insurance-fetch-remittances"]["task"] == (
        "hmis.apps.insurance.tasks.fetch_remittances"
    )

    assert "insurance-poll-claim-remittances" in schedule
    assert schedule["insurance-poll-claim-remittances"]["task"] == (
        "hmis.apps.insurance.tasks.poll_claim_remittance_statuses"
    )

    assert "insurance-sweep-healthcloud-expiry" in schedule
    assert schedule["insurance-sweep-healthcloud-expiry"]["task"] == (
        "hmis.apps.insurance.tasks.sweep_healthcloud_authorizations_and_reservations"
    )

    assert "insurance-check-expiring-enrollments" in schedule
    assert schedule["insurance-check-expiring-enrollments"]["task"] == (
        "hmis.apps.insurance.tasks.check_expiring_enrollments"
    )
