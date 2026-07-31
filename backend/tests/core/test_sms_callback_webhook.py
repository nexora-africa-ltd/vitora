from django.test import override_settings


@override_settings(AT_SMS_CALLBACK_TOKEN="test-callback-token")
def test_africastalking_sms_callback_requires_valid_token(client):
    payload = {
        "id": "ATX-123",
        "status": "Success",
        "phoneNumber": "+254712345678",
    }

    response = client.post(
        "/api/core/sms/africastalking/callback/",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 403


@override_settings(AT_SMS_CALLBACK_TOKEN="test-callback-token")
def test_africastalking_sms_callback_persists_payload_when_token_valid(client):
    from hmis.apps.core.models import SMSDeliveryCallback

    payload = {
        "id": "ATX-456",
        "status": "Success",
        "phoneNumber": "+254799123456",
        "networkCode": "63902",
        "retryCount": 0,
    }

    response = client.post(
        "/api/core/sms/africastalking/callback/?token=test-callback-token",
        payload,
        content_type="application/json",
    )

    assert response.status_code == 200
    callback = SMSDeliveryCallback.objects.get(provider_message_id="ATX-456")
    assert callback.delivery_status == "DELIVERED"
    assert callback.phone_last4 == "3456"
    assert callback.token_valid is True


@override_settings(AT_SMS_CALLBACK_TOKEN="")
def test_africastalking_sms_callback_allows_unsecured_when_token_not_configured(client):
    from hmis.apps.core.models import SMSDeliveryCallback

    response = client.post(
        "/api/core/sms/africastalking/callback/",
        {
            "id": "ATX-789",
            "status": "Failed",
            "phoneNumber": "+254700000001",
            "failureReason": "Absent Subscriber",
        },
        content_type="application/json",
    )

    assert response.status_code == 200
    callback = SMSDeliveryCallback.objects.get(provider_message_id="ATX-789")
    assert callback.delivery_status == "FAILED"
    assert "Absent" in callback.failure_reason
