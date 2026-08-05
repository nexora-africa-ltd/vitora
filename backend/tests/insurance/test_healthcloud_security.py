"""Security-focused tests for HealthCloud insurance integrations."""


def test_healthcloud_pii_fields_are_redacted_in_outbound_audit_payloads():
    from hmis.apps.insurance.services.client import _redact

    payload = {
        "beneficiaryCode": "DEMO/001",
        "auth_token": "ABC123",
        "beneficiary_contact": "+254700000000",
        "nested": {
            "contactValue": "+254712345678",
            "member_number": "MEM-001",
            "safe": "ok",
        },
    }

    redacted = _redact(payload)

    assert redacted["beneficiaryCode"] == "***REDACTED***"
    assert redacted["auth_token"] == "***REDACTED***"
    assert redacted["beneficiary_contact"] == "***REDACTED***"
    assert redacted["nested"]["contactValue"] == "***REDACTED***"
    assert redacted["nested"]["member_number"] == "***REDACTED***"
    assert redacted["nested"]["safe"] == "ok"
