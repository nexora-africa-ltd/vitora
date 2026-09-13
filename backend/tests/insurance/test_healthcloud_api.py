"""HealthCloud insurance API contract and negative-path tests."""

from datetime import datetime, timedelta

import pytest
from django.utils import timezone

from hmis.apps.insurance.models import InsuranceProvider, InsuranceVisitAuthorization
from hmis.apps.insurance.payer_mappings import infer_healthcloud_payer_slade_code
from hmis.apps.insurance.services.insurance_services import (
    HealthCloudWorkflowService,
    InsuranceEligibilityService,
)
from hmis.apps.insurance.services.results import EligibilityResult
from hmis.apps.patients.models import EmergencyContact


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
def test_healthcloud_session_start_expires_stale_session_before_restart(
    admin_client,
    monkeypatch,
    patient_insurance,
    provider_config,
    sample_facility,
    sample_organization,
):
    _enable_provider_config(provider_config)
    stale_session = InsuranceVisitAuthorization.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        enrollment=patient_insurance,
        provider_config=provider_config,
        patient=patient_insurance.patient,
        member_number=patient_insurance.member_number,
        status=InsuranceVisitAuthorization.Status.VALIDATED,
        authorization_guid="expired-guid",
        raw_payload={"auth_expiry": (timezone.now() - timedelta(days=1)).isoformat()},
    )

    def _mock_verify(self, enrollment, *, facility=None):
        return EligibilityResult(
            eligible=True,
            status="ACTIVE",
            member_number=enrollment.member_number,
            plan_name="Gold",
            annual_balance=1000,
            message="Eligibility refreshed",
            raw_response={"member": {"id": 123}},
        )

    def _mock_start_session(self, *, enrollment, facility, organization, eligibility_result):
        return InsuranceVisitAuthorization.objects.create(
            facility=facility,
            organization=organization,
            enrollment=enrollment,
            provider_config=provider_config,
            patient=enrollment.patient,
            member_number=enrollment.member_number,
            status=InsuranceVisitAuthorization.Status.PENDING,
            workflow_step="eligibility_verified",
            eligibility_payload=eligibility_result.raw_response,
        )

    monkeypatch.setattr(
        "hmis.apps.insurance.views_core.InsuranceEligibilityService.verify", _mock_verify
    )
    monkeypatch.setattr(
        "hmis.apps.insurance.views_core.HealthCloudWorkflowService.start_session",
        _mock_start_session,
    )

    response = admin_client.post(
        f"/api/insurance/enrollments/{patient_insurance.pk}/healthcloud-session/start/",
        format="json",
    )

    assert response.status_code == 200
    assert response.data["session"]["id"] != stale_session.id
    stale_session.refresh_from_db()
    assert stale_session.status == InsuranceVisitAuthorization.Status.EXPIRED


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
def test_healthcloud_session_start_contract_success(
    admin_client,
    monkeypatch,
    patient_insurance,
    provider_config,
    sample_facility,
    sample_organization,
):
    _enable_provider_config(provider_config)

    def _mock_verify(self, enrollment, *, facility=None):
        assert enrollment.pk == patient_insurance.pk
        assert facility == sample_facility
        return EligibilityResult(
            eligible=True,
            status="LIVE",
            member_number=patient_insurance.member_number,
            plan_name="Muungano",
            annual_balance=1000,
            message="Eligibility retrieved from HealthCloud",
            raw_response={"member": {"id": 636561}},
        )

    session = InsuranceVisitAuthorization.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        enrollment=patient_insurance,
        provider_config=provider_config,
        patient=patient_insurance.patient,
        member_number=patient_insurance.member_number,
        status=InsuranceVisitAuthorization.Status.PENDING,
        workflow_step="eligibility_verified",
    )

    def _mock_start_session(
        self,
        *,
        enrollment,
        facility,
        organization,
        eligibility_result,
    ):
        assert enrollment.pk == patient_insurance.pk
        assert facility == sample_facility
        assert organization == sample_organization
        assert eligibility_result.eligible is True
        return session

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.InsuranceEligibilityService.verify",
        _mock_verify,
    )
    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.HealthCloudWorkflowService.start_session",
        _mock_start_session,
    )

    url = f"/api/insurance/enrollments/{patient_insurance.pk}/healthcloud-session/start/"
    response = admin_client.post(url, {}, format="json")

    assert response.status_code == 200
    assert response.data["session"]["id"] == session.pk
    assert response.data["eligibility"]["eligible"] is True
    assert response.data["eligibility"]["member_number"] == patient_insurance.member_number


@pytest.mark.django_db
def test_healthcloud_session_request_otp_contract_success(
    admin_client,
    monkeypatch,
    patient_insurance,
    provider_config,
    sample_facility,
    sample_organization,
):
    _enable_provider_config(provider_config)
    session = InsuranceVisitAuthorization.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        enrollment=patient_insurance,
        provider_config=provider_config,
        patient=patient_insurance.patient,
        member_number=patient_insurance.member_number,
        status=InsuranceVisitAuthorization.Status.PENDING,
        workflow_step="eligibility_verified",
    )

    def _mock_request_for_session(self, *, authorization, facility, organization, contact_id):
        assert authorization.pk == session.pk
        assert facility == sample_facility
        assert organization == sample_organization
        assert contact_id == 5531
        authorization.status = InsuranceVisitAuthorization.Status.OTP_REQUESTED
        authorization.workflow_step = "otp_requested"
        authorization.selected_beneficiary_contact_id = 5531
        authorization.save(
            update_fields=[
                "status",
                "workflow_step",
                "selected_beneficiary_contact_id",
                "updated_at",
            ]
        )
        return authorization

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.HealthCloudWorkflowService.request_otp_for_session",
        _mock_request_for_session,
    )

    url = f"/api/insurance/enrollments/{patient_insurance.pk}/healthcloud-session/request-otp/"
    response = admin_client.post(url, {"session_id": session.pk, "contact_id": 5531}, format="json")

    assert response.status_code == 200
    assert response.data["id"] == session.pk
    assert response.data["status"] == "otp_requested"
    assert response.data["selected_beneficiary_contact_id"] == 5531


@pytest.mark.django_db
def test_healthcloud_session_start_visit_contract_success(
    admin_client,
    monkeypatch,
    patient_insurance,
    provider_config,
    sample_facility,
    sample_organization,
):
    _enable_provider_config(provider_config)
    session = InsuranceVisitAuthorization.objects.create(
        facility=sample_facility,
        organization=sample_organization,
        enrollment=patient_insurance,
        provider_config=provider_config,
        patient=patient_insurance.patient,
        member_number=patient_insurance.member_number,
        status=InsuranceVisitAuthorization.Status.OTP_REQUESTED,
        workflow_step="otp_requested",
    )

    def _mock_start_visit_for_session(
        self,
        *,
        authorization,
        facility,
        organization,
        payload,
        encounter=None,
    ):
        assert authorization.pk == session.pk
        assert facility == sample_facility
        assert organization == sample_organization
        assert payload["benefit_code"] == "BEN/001"
        assert encounter is None
        authorization.status = InsuranceVisitAuthorization.Status.AUTHORIZED
        authorization.workflow_step = "visit_authorized"
        authorization.auth_token = "AUTH-123"
        authorization.save(update_fields=["status", "workflow_step", "auth_token", "updated_at"])
        return authorization

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.HealthCloudWorkflowService.start_visit_for_session",
        _mock_start_visit_for_session,
    )

    url = f"/api/insurance/enrollments/{patient_insurance.pk}/healthcloud-session/start-visit/"
    response = admin_client.post(
        url,
        {
            "session_id": session.pk,
            "beneficiary_id": 636561,
            "benefit_type": "OUTPATIENT",
            "benefit_code": "BEN/001",
            "policy_number": "POL/001",
            "policy_effective_date": "2026-08-08T00:00:00Z",
            "otp": "123456",
            "beneficiary_contact": 5531,
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["id"] == session.pk
    assert response.data["status"] == "authorized"
    assert response.data["auth_token"] == "AUTH-123"


@pytest.mark.django_db
def test_healthcloud_post_profile_contract_success(
    admin_client,
    monkeypatch,
    patient_insurance,
    provider_config,
    sample_facility,
    sample_organization,
):
    _enable_provider_config(provider_config)

    def _mock_post_profile_to_crm(
        self,
        *,
        enrollment,
        facility,
        organization,
        payload=None,
    ):
        assert enrollment.pk == patient_insurance.pk
        assert facility == sample_facility
        assert organization == sample_organization
        assert isinstance(payload, dict)
        return {
            "id": "85979e5f-3c20-4f5f-bf52-eec658bd27e9",
            "profile_id": str(enrollment.pk),
            "service_account_number": "GH-53847234",
            "service_name": payload.get("service_name", "SLADE_ADVANTAGE"),
        }

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.HealthCloudWorkflowService.post_profile_to_crm",
        _mock_post_profile_to_crm,
    )

    url = f"/api/insurance/enrollments/{patient_insurance.pk}/healthcloud/post-profile/"
    response = admin_client.post(
        url,
        {
            "service_name": "SLADE_ADVANTAGE",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["identity"]["id"] == "85979e5f-3c20-4f5f-bf52-eec658bd27e9"
    assert response.data["identity"]["service_account_number"] == "GH-53847234"


@pytest.mark.django_db
def test_healthcloud_get_health_id_contract_success(
    admin_client,
    monkeypatch,
    patient_insurance,
    provider_config,
    sample_facility,
    sample_organization,
):
    _enable_provider_config(provider_config)

    def _mock_get_health_id(
        self,
        *,
        enrollment,
        facility,
        organization,
        profile_id=None,
    ):
        assert enrollment.pk == patient_insurance.pk
        assert facility == sample_facility
        assert organization == sample_organization
        assert profile_id == "85979e5f-3c20-4f5f-bf52-eec658bd27e9"
        return {
            "profile_id": profile_id,
            "health_id": 1234010000000013,
        }

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.HealthCloudWorkflowService.get_health_id",
        _mock_get_health_id,
    )

    url = f"/api/insurance/enrollments/{patient_insurance.pk}/healthcloud/get-health-id/"
    response = admin_client.post(
        url,
        {
            "profile_id": "85979e5f-3c20-4f5f-bf52-eec658bd27e9",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["identity"]["health_id"] == 1234010000000013


@pytest.mark.django_db
def test_healthcloud_post_profile_defaults_use_patient_identity_payload(
    monkeypatch,
    patient_insurance,
    provider_config,
    sample_facility,
    sample_organization,
):
    _enable_provider_config(provider_config)

    patient = patient_insurance.patient
    patient.phone_number = "+254712345678"
    patient.email = "john.doe@example.com"
    patient.identification_type = "national_id"
    patient.identification_number = "12345678"
    patient.national_id = "12345678"
    patient.save(
        update_fields=[
            "phone_number_encrypted",
            "phone_number_hmac",
            "email_encrypted",
            "identification_type",
            "identification_number_encrypted",
            "identification_number_hmac",
            "national_id_encrypted",
            "national_id_hmac",
            "updated_at",
        ]
    )
    EmergencyContact.objects.create(
        patient=patient,
        full_name="Jane Doe",
        relationship="spouse",
        phone_number="+254700000001",
    )

    captured: dict = {}

    class _Adapter:
        def post_profile_to_crm(self, payload):
            captured["payload"] = payload
            return {"id": "85979e5f-3c20-4f5f-bf52-eec658bd27e9"}

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.get_adapter",
        lambda _config: _Adapter(),
    )

    service = HealthCloudWorkflowService()
    service.post_profile_to_crm(
        enrollment=patient_insurance,
        facility=sample_facility,
        organization=sample_organization,
        payload={"service_name": "SLADE_ADVANTAGE"},
    )

    identity_payload = captured["payload"]
    assert identity_payload["profile_id"] == str(patient.public_id)
    assert any(item.get("contactValue") == "+254712345678" for item in identity_payload["contacts"])
    assert any(
        item.get("contactValue") == "john.doe@example.com" for item in identity_payload["contacts"]
    )
    assert any(item.get("identifierType") == "MRN" for item in identity_payload["identifiers"])


@pytest.mark.django_db
def test_eligibility_verify_preserves_health_identity_snapshot(
    monkeypatch,
    patient_insurance,
    provider_config,
    sample_facility,
):
    _enable_provider_config(provider_config)
    patient_insurance.last_eligibility_payload = {
        "health_identity": {
            "profile_request_id": "85979e5f-3c20-4f5f-bf52-eec658bd27e9",
            "health_id": "1234010000000013",
        }
    }
    patient_insurance.save(update_fields=["last_eligibility_payload", "updated_at"])

    class _Adapter:
        def verify_eligibility(self, enrollment):
            assert enrollment.pk == patient_insurance.pk
            return EligibilityResult(
                eligible=True,
                status="ACTIVE",
                member_number=patient_insurance.member_number,
                plan_name="Gold",
                annual_balance=1000,
                message="ok",
                raw_response={"member": {"id": 636561}},
            )

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.get_adapter",
        lambda _config: _Adapter(),
    )

    service = InsuranceEligibilityService()
    service.verify(patient_insurance, facility=sample_facility)

    patient_insurance.refresh_from_db()
    payload = patient_insurance.last_eligibility_payload
    assert isinstance(payload, dict)
    assert payload.get("member", {}).get("id") == 636561
    assert payload.get("health_identity", {}).get("health_id") == "1234010000000013"


@pytest.mark.django_db
def test_health_id_webhook_updates_enrollment_snapshot(
    admin_client,
    patient_insurance,
):
    patient_insurance.last_eligibility_payload = {
        "health_identity": {
            "profile_request_id": "85979e5f-3c20-4f5f-bf52-eec658bd27e9",
        }
    }
    patient_insurance.save(update_fields=["last_eligibility_payload", "updated_at"])

    response = admin_client.post(
        "/api/insurance/healthcloud/webhooks/health-id/",
        {
            "profile_id": "85979e5f-3c20-4f5f-bf52-eec658bd27e9",
            "health_id": "1234010000000013",
        },
        format="json",
    )

    assert response.status_code == 200
    patient_insurance.refresh_from_db()
    snapshot = patient_insurance.last_eligibility_payload.get("health_identity", {})
    assert str(snapshot.get("health_id")) == "1234010000000013"


@pytest.mark.django_db
def test_remittance_claims_drilldown_contract_success(
    admin_client,
    monkeypatch,
    insurance_remittance,
):
    def _mock_get_remittance_claims(self, *, remittance, facility, organization):
        assert remittance.pk == insurance_remittance.pk
        return {
            "remittance_reference": "BR-001",
            "claims": [
                {
                    "claim_number": "IC-20260813-0001",
                    "approved_amount": "2000.00",
                    "balanced_paid_amount": "1500.00",
                }
            ],
            "processed": 1,
            "local_lines": 1,
        }

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.HealthCloudWorkflowService.get_remittance_claims",
        _mock_get_remittance_claims,
    )

    response = admin_client.get(
        f"/api/insurance/remittances/{insurance_remittance.pk}/claims-drilldown/"
    )

    assert response.status_code == 200
    assert response.data["drilldown"]["remittance_reference"] == "BR-001"
    assert len(response.data["drilldown"]["claims"]) == 1


@pytest.mark.django_db
def test_healthcloud_preauth_submit_routes_to_service(
    admin_client,
    monkeypatch,
    insurance_preauth,
    provider_config,
):
    _enable_provider_config(provider_config)

    class _Result:
        success = True
        raw_response = {"id": "preauth-123", "status": "SUBMITTED"}

    def _mock_submit(self, preauth, *, user=None):
        assert preauth.pk == insurance_preauth.pk
        preauth.status = "submitted"
        preauth.external_preauth_id = "preauth-123"
        preauth.save(update_fields=["status", "external_preauth_id", "updated_at"])
        return _Result()

    monkeypatch.setattr(
        "hmis.apps.insurance.services.insurance_services.InsurancePreauthService.submit",
        _mock_submit,
    )

    response = admin_client.post(
        f"/api/insurance/preauths/{insurance_preauth.pk}/submit/", format="json"
    )

    assert response.status_code == 200
    assert response.data["preauth"]["status"] == "submitted"
    assert response.data["upstream"]["id"] == "preauth-123"


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
