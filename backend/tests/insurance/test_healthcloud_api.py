"""HealthCloud insurance API contract and negative-path tests."""

from datetime import datetime

import pytest

from hmis.apps.insurance.models import InsuranceProvider, InsuranceVisitAuthorization
from hmis.apps.insurance.payer_mappings import infer_healthcloud_payer_slade_code
from hmis.apps.insurance.services.results import EligibilityResult


def _enable_provider_config(provider_config):
    provider_config.api_enabled = True
    provider_config.healthcloud_enabled = True
    provider_config.payer_slade_code = 457
    provider_config.save(
        update_fields=["api_enabled", "healthcloud_enabled", "payer_slade_code", "updated_at"]
    )


@pytest.mark.django_db
def test_request_otp_rejected_when_provider_config_disabled(
    admin_client,
    patient_insurance,
):
    url = f"/api/insurance/enrollments/{patient_insurance.pk}/request-otp/"
    response = admin_client.post(url, {"contact_id": 5531}, format="json")
    assert response.status_code == 400
    assert "not enabled for this provider/facility configuration" in str(response.data).lower()


@pytest.mark.django_db
def test_request_otp_contract_success(
    admin_client,
    monkeypatch,
    patient_insurance,
    provider_config,
    sample_facility,
    sample_organization,
):
    _enable_provider_config(provider_config)

    def _mock_request_otp(self, *, enrollment, facility, organization, contact_id):
        return InsuranceVisitAuthorization.objects.create(
            facility=facility,
            organization=organization,
            enrollment=enrollment,
            provider_config=provider_config,
            patient=enrollment.patient,
            member_number=enrollment.member_number,
            payer_slade_code=457,
            status=InsuranceVisitAuthorization.Status.OTP_REQUESTED,
            beneficiary_contact_id=contact_id,
        )

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.HealthCloudWorkflowService.request_otp",
        _mock_request_otp,
    )

    url = f"/api/insurance/enrollments/{patient_insurance.pk}/request-otp/"
    response = admin_client.post(url, {"contact_id": 5531}, format="json")
    assert response.status_code == 200
    assert response.data["status"] == "otp_requested"
    assert response.data["beneficiary_contact_id"] == 5531


@pytest.mark.django_db
def test_validate_token_contract_success(
    admin_client,
    monkeypatch,
    patient_insurance,
    provider_config,
    sample_facility,
    sample_organization,
):
    _enable_provider_config(provider_config)
    auth = InsuranceVisitAuthorization.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        enrollment=patient_insurance,
        provider_config=provider_config,
        patient=patient_insurance.patient,
        member_number=patient_insurance.member_number,
        status=InsuranceVisitAuthorization.Status.AUTHORIZED,
    )

    def _mock_validate(self, *, authorization, facility, organization, payload):
        return {
            "status": "Success",
            "authorization_guid": "guid-123",
            "auth_status": "AUTHORIZED",
            "authorization_date": datetime.utcnow().isoformat(),
            "member_number": payload["member_number"],
        }

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.HealthCloudWorkflowService.validate_authorization",
        _mock_validate,
    )

    url = f"/api/insurance/authorizations/{auth.pk}/validate-token/"
    response = admin_client.post(
        url,
        {
            "first_name": "John",
            "last_name": "Doe",
            "member_number": patient_insurance.member_number,
            "auth_token": "OTP-123",
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.data["status"] == "Success"
    assert response.data["authorization_guid"] == "guid-123"


@pytest.mark.django_db
def test_submit_to_healthcloud_requires_visit_auth_when_provider_requires_it(
    admin_client,
    insurance_claim,
    provider_config,
):
    _enable_provider_config(provider_config)
    provider_config.require_visit_authorization = True
    provider_config.save(update_fields=["require_visit_authorization", "updated_at"])

    url = f"/api/insurance/claims/{insurance_claim.pk}/submit-to-healthcloud/"
    response = admin_client.post(url, {}, format="json")
    assert response.status_code == 400
    assert "visit authorization is required" in str(response.data).lower()


@pytest.mark.django_db
def test_credit_note_contract_success(
    admin_client,
    monkeypatch,
    insurance_claim,
    provider_config,
    sample_facility,
    sample_organization,
):
    _enable_provider_config(provider_config)

    def _mock_submit_credit_note(self, *, claim, facility, organization, payload):
        assert claim.pk == insurance_claim.pk
        assert facility == sample_facility
        assert organization == sample_organization
        return {"status": "accepted", "id": "cn-123", "invoice_number": payload["invoice_number"]}

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.HealthCloudWorkflowService.submit_credit_note",
        _mock_submit_credit_note,
    )

    url = f"/api/insurance/claims/{insurance_claim.pk}/submit-credit-note/"
    response = admin_client.post(
        url,
        {
            "invoice_number": "INV-001",
            "invoice_date": datetime.utcnow().isoformat(),
            "lines": [{"item_code": "SVC", "item_name": "svc", "quantity": 1, "unit_price": 10}],
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.data["status"] == "accepted"


@pytest.mark.django_db
def test_verify_enrollment_preview_contract_success(
    admin_client,
    monkeypatch,
    provider_config,
    sample_organization,
):
    from hmis.apps.insurance.models import InsurancePlan

    _enable_provider_config(provider_config)
    plan = InsurancePlan.objects.create(
        organization=sample_organization,
        provider=provider_config.provider,
        name="Preview Plan",
        code="PRV-001",
        plan_type=InsurancePlan.PlanType.INDIVIDUAL,
        coverage_type=InsurancePlan.CoverageType.OUTPATIENT,
        default_copay_percent="10.00",
    )

    class _Adapter:
        def verify_eligibility(self, enrollment):
            assert enrollment.member_number == "MEM-123"
            return EligibilityResult(
                eligible=True,
                status="ACTIVE",
                member_number="MEM-123",
                plan_name="Gold",
                annual_balance=1000,
                copay_percent=10,
                message="ok",
                raw_response={"member": {"beneficiaryCode": "MEM-123"}},
            )

    monkeypatch.setattr("hmis.apps.insurance.views.get_adapter", lambda cfg: _Adapter())

    response = admin_client.post(
        "/api/insurance/enrollments/verify-via-healthcloud-preview/",
        {
            "plan": plan.pk,
            "member_number": "MEM-123",
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.data["eligible"] is True
    assert response.data["member_number"] == "MEM-123"


@pytest.mark.django_db
def test_verify_enrollment_preview_accepts_provider_without_plan(
    admin_client,
    monkeypatch,
    provider_config,
):
    _enable_provider_config(provider_config)

    class _Adapter:
        def verify_eligibility(self, enrollment):
            assert enrollment.member_number == "MEM-456"
            return EligibilityResult(
                eligible=True,
                status="ACTIVE",
                member_number="MEM-456",
                plan_name="",
                annual_balance=500,
                copay_percent=5,
                message="ok",
                raw_response={"member": {"beneficiaryCode": "MEM-456"}},
            )

    monkeypatch.setattr("hmis.apps.insurance.views.get_adapter", lambda cfg: _Adapter())

    response = admin_client.post(
        "/api/insurance/enrollments/verify-via-healthcloud-preview/",
        {
            "provider": provider_config.provider_id,
            "member_number": "MEM-456",
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.data["eligible"] is True
    assert response.data["member_number"] == "MEM-456"


@pytest.mark.django_db
def test_infer_healthcloud_payer_slade_code_for_known_provider(sample_organization):
    provider = InsuranceProvider.objects.create(
        organization=sample_organization,
        name="Jubilee Health Insurance Limited",
        code="JUBILEE",
        provider_type=InsuranceProvider.ProviderType.PRIVATE,
        status=InsuranceProvider.Status.ACTIVE,
    )
    assert infer_healthcloud_payer_slade_code(provider) == 457
