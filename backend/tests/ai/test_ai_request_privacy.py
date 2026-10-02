# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Verify AI transport minimization without calling an external provider.

Run: poetry run pytest tests/ai/test_ai_request_privacy.py --no-cov
Inputs: synthetic payloads and mocked requests.Session responses.
"""

from copy import deepcopy
from unittest.mock import MagicMock

import pytest
import requests

from hmis.apps.ai.client import TibaBotClient, TibaBotError
from hmis.apps.ai.sanitizer import sanitize_clinical_text


def test_email_labeled_names_and_addresses_are_removed():
    text = "Patient name: Jane Doe\nAddress: 12 Test Street\nContact jane@example.org; fever 38.5 C"
    sanitized = sanitize_clinical_text(text)
    assert "Jane Doe" not in sanitized
    assert "12 Test Street" not in sanitized
    assert "jane@example.org" not in sanitized
    assert "fever 38.5 C" in sanitized


def test_clinical_measurements_dates_and_codes_are_preserved():
    text = "BP 120/80, Hb 12.5, ICD B50.9; review 2026-10-02; amoxicillin 500 mg."
    assert sanitize_clinical_text(text) == text


@pytest.mark.parametrize("stream", [False, True])
def test_transport_scrubs_nested_identifiers_without_mutating_record(stream):
    client = TibaBotClient()
    client.session = MagicMock()
    response = MagicMock()
    response.json.return_value = {"ok": True}
    response.iter_lines.return_value = []
    client.session.request.return_value = response
    response.__enter__.return_value = response
    payload = {
        "patient_context": {"name": "Jane Doe", "email": "jane@example.org", "age": 42},
        "history": [{"content": "Jane Doe reports fever. Email jane@example.org"}],
        "medications": [{"name": "Amoxicillin", "dose": "500 mg"}],
        "vitals": {"spo2": 96, "temperature": 38.5},
    }
    original = deepcopy(payload)
    if stream:
        list(client._request_sse("POST", "/clinical/chat", data=payload))
    else:
        client._request("POST", "/clinical/assist", data=payload)
    sent = client.session.request.call_args.kwargs["json"]
    assert "Jane Doe" not in str(sent)
    assert "jane@example.org" not in str(sent)
    assert sent["patient_context"]["age"] == 42
    assert sent["medications"] == original["medications"]
    assert sent["vitals"] == original["vitals"]
    assert payload == original


@pytest.mark.parametrize("stream", [False, True])
def test_provider_error_body_never_reaches_logs_or_exception(stream, caplog):
    client = TibaBotClient()
    client.session = MagicMock()
    response = MagicMock()
    response.status_code = 502
    response.text = "Jane Doe HIV result: positive; jane@example.org"
    response.raise_for_status.side_effect = requests.HTTPError(
        "upstream failure", response=response
    )
    response.__enter__.return_value = response
    client.session.request.return_value = response
    with pytest.raises(TibaBotError) as exc:
        if stream:
            list(client._request_sse("POST", "/clinical/chat", data={}))
        else:
            client._request("POST", "/clinical/chat", data={})
    assert exc.value.status_code == 502
    assert "Jane Doe" not in caplog.text + str(exc.value)
    assert "HIV" not in caplog.text + str(exc.value)


def test_pdf_report_uses_same_payload_minimization():
    client = TibaBotClient()
    client.session = MagicMock()
    client.ecg_report({"patient_name": "Jane Doe", "interpretation": "Jane Doe: sinus rhythm"})
    assert "Jane Doe" not in str(client.session.post.call_args.kwargs["json"])


@pytest.mark.parametrize("method", ["ecg_upload", "upload_to_facility_kb"])
def test_file_upload_hides_original_filename_and_error_body(method, caplog):
    client = TibaBotClient()
    client.session = MagicMock()
    response = MagicMock(status_code=400, text="Jane Doe HIV report")
    response.raise_for_status.side_effect = requests.HTTPError("failed", response=response)
    client.session.post.return_value = response
    with pytest.raises(TibaBotError) as exc:
        getattr(client, method)(b"synthetic upload", "Jane Doe.pdf", "application/pdf")
    filename = client.session.post.call_args.kwargs["files"]["file"][0]
    assert filename == "upload.pdf"
    assert "Jane Doe" not in caplog.text + str(exc.value)
