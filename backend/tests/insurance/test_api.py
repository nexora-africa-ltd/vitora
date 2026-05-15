"""Tests for insurance API endpoints."""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from rest_framework import status


# ===================================================================
# InsuranceProvider API
# ===================================================================
class TestInsuranceProviderAPI:
    def test_list_providers(self, authenticated_client, insurance_provider):
        response = authenticated_client.get("/api/insurance/providers/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_provider(self, authenticated_client):
        data = {
            "name": "CIC Group",
            "code": "CIC",
            "provider_type": "private",
            "status": "active",
            "contact_email": "claims@cic.co.ke",
        }
        response = authenticated_client.post("/api/insurance/providers/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "CIC Group"
        assert response.data["code"] == "CIC"

    def test_retrieve_provider(self, authenticated_client, insurance_provider):
        response = authenticated_client.get(f"/api/insurance/providers/{insurance_provider.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Jubilee Health Insurance"

    def test_update_provider(self, authenticated_client, insurance_provider):
        response = authenticated_client.patch(
            f"/api/insurance/providers/{insurance_provider.pk}/",
            {"contact_person": "John Doe"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["contact_person"] == "John Doe"

    def test_search_providers(self, authenticated_client, insurance_provider):
        response = authenticated_client.get("/api/insurance/providers/?search=Jubilee")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1

    def test_filter_by_status(self, authenticated_client, insurance_provider):
        response = authenticated_client.get("/api/insurance/providers/?status=active")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_unauthenticated_fails(self, api_client):
        response = api_client.get("/api/insurance/providers/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ===================================================================
# InsurancePlan API
# ===================================================================
class TestInsurancePlanAPI:
    def test_list_plans(self, authenticated_client, insurance_plan):
        response = authenticated_client.get("/api/insurance/plans/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_plan(self, authenticated_client, insurance_provider):
        data = {
            "provider": insurance_provider.pk,
            "name": "Silver Plan",
            "code": "SILVER",
            "plan_type": "individual",
            "coverage_type": "outpatient",
            "default_copay_percent": "30.00",
            "status": "active",
        }
        response = authenticated_client.post("/api/insurance/plans/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Silver Plan"

    def test_filter_by_provider(self, authenticated_client, insurance_plan):
        response = authenticated_client.get(
            f"/api/insurance/plans/?provider={insurance_plan.provider_id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1


# ===================================================================
# PatientInsurance API
# ===================================================================
class TestPatientInsuranceAPI:
    def test_list_enrollments(self, authenticated_client, patient_insurance):
        response = authenticated_client.get("/api/insurance/enrollments/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_enrollment(self, authenticated_client, sample_patient, insurance_plan):
        data = {
            "patient": sample_patient.pk,
            "plan": insurance_plan.pk,
            "member_number": "NEW-5678",
            "member_type": "principal",
            "status": "active",
            "valid_from": str(date.today()),
            "valid_to": str(date.today() + timedelta(days=365)),
            "is_primary": True,
        }
        response = authenticated_client.post("/api/insurance/enrollments/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["member_number"] == "NEW-5678"
        assert response.data["provider"] is not None  # Auto-set from plan

    def test_retrieve_enrollment(self, authenticated_client, patient_insurance):
        response = authenticated_client.get(f"/api/insurance/enrollments/{patient_insurance.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_valid"] is True
        assert "copay_percent" in response.data

    def test_filter_by_patient(self, authenticated_client, patient_insurance):
        response = authenticated_client.get(
            f"/api/insurance/enrollments/?patient={patient_insurance.patient_id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_verify_action(self, authenticated_client, patient_insurance):
        patient_insurance.status = "pending_verification"
        patient_insurance.save(update_fields=["status"])
        response = authenticated_client.post(
            f"/api/insurance/enrollments/{patient_insurance.pk}/verify/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "active"
        assert response.data["verified_at"] is not None


# ===================================================================
# InsuranceClaim API
# ===================================================================
class TestInsuranceClaimAPI:
    def test_list_claims(self, authenticated_client, insurance_claim):
        response = authenticated_client.get("/api/insurance/claims/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_claim(self, authenticated_client, patient_insurance, sample_patient):
        data = {
            "patient_insurance": patient_insurance.pk,
            "patient": sample_patient.pk,
            "claim_type": "outpatient",
            "total_amount": "3000.00",
            "diagnosis_codes": ["J06.9"],
            "service_date": str(date.today()),
        }
        response = authenticated_client.post("/api/insurance/claims/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["claim_number"].startswith("IC-")
        assert response.data["status"] == "draft"

    def test_create_claim_with_items(self, authenticated_client, patient_insurance, sample_patient):
        data = {
            "patient_insurance": patient_insurance.pk,
            "patient": sample_patient.pk,
            "claim_type": "outpatient",
            "total_amount": "5000.00",
            "diagnosis_codes": ["J06.9"],
            "service_date": str(date.today()),
            "items": [
                {
                    "service_description": "Consultation",
                    "service_code": "CONS-001",
                    "quantity": 1,
                    "unit_price": "2000.00",
                    "claimed_amount": "2000.00",
                },
                {
                    "service_description": "Lab - CBC",
                    "service_code": "LAB-CBC",
                    "quantity": 1,
                    "unit_price": "3000.00",
                    "claimed_amount": "3000.00",
                },
            ],
        }
        response = authenticated_client.post("/api/insurance/claims/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data["items"]) == 2

    def test_retrieve_claim(self, authenticated_client, insurance_claim):
        response = authenticated_client.get(f"/api/insurance/claims/{insurance_claim.pk}/")
        assert response.status_code == status.HTTP_200_OK
        assert "provider_name" in response.data
        assert "is_overdue" in response.data

    def test_submit_action(self, authenticated_client, insurance_claim):
        response = authenticated_client.post(f"/api/insurance/claims/{insurance_claim.pk}/submit/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "submitted"

    def test_approve_action(self, authenticated_client, insurance_claim):
        insurance_claim.submit()
        response = authenticated_client.post(
            f"/api/insurance/claims/{insurance_claim.pk}/approve/",
            {"approved_amount": "4500.00"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "approved"
        assert response.data["approved_amount"] == "4500.00"

    def test_reject_action(self, authenticated_client, insurance_claim):
        insurance_claim.submit()
        response = authenticated_client.post(
            f"/api/insurance/claims/{insurance_claim.pk}/reject/",
            {"reason": "Invalid diagnosis"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "rejected"

    def test_query_action(self, authenticated_client, insurance_claim):
        insurance_claim.submit()
        response = authenticated_client.post(
            f"/api/insurance/claims/{insurance_claim.pk}/query/",
            {"details": "Need lab results"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "query"

    def test_respond_to_query_action(self, authenticated_client, insurance_claim):
        insurance_claim.submit()
        insurance_claim.query_claim(details="Need X-ray report")
        response = authenticated_client.post(
            f"/api/insurance/claims/{insurance_claim.pk}/respond-to-query/",
            {"response": "X-ray report attached"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "submitted"

    def test_mark_paid_action(self, authenticated_client, insurance_claim):
        insurance_claim.submit()
        insurance_claim.approve(approved_amount=Decimal("5000.00"))
        response = authenticated_client.post(
            f"/api/insurance/claims/{insurance_claim.pk}/mark-paid/",
            {"paid_amount": "5000.00"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "paid"

    def test_appeal_action(self, authenticated_client, insurance_claim):
        insurance_claim.submit()
        insurance_claim.reject(reason="Denied")
        response = authenticated_client.post(
            f"/api/insurance/claims/{insurance_claim.pk}/appeal/",
            {"notes": "Requesting reconsideration"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "appealed"

    def test_cancel_action(self, authenticated_client, insurance_claim):
        response = authenticated_client.post(
            f"/api/insurance/claims/{insurance_claim.pk}/cancel/",
            {"reason": "Patient cancelled"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "cancelled"

    def test_write_off_action(self, authenticated_client, insurance_claim):
        response = authenticated_client.post(
            f"/api/insurance/claims/{insurance_claim.pk}/write-off/",
            {"reason": "Uncollectable"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "written_off"

    def test_filter_by_status(self, authenticated_client, insurance_claim):
        response = authenticated_client.get("/api/insurance/claims/?status=draft")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_search_claims(self, authenticated_client, insurance_claim):
        response = authenticated_client.get(
            f"/api/insurance/claims/?search={insurance_claim.claim_number}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1


# ===================================================================
# InsurancePreauth API
# ===================================================================
class TestInsurancePreauthAPI:
    def test_list_preauths(self, authenticated_client, insurance_preauth):
        response = authenticated_client.get("/api/insurance/preauths/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_preauth(self, authenticated_client, patient_insurance, sample_patient):
        data = {
            "patient_insurance": patient_insurance.pk,
            "patient": sample_patient.pk,
            "preauth_type": "admission",
            "estimated_cost": "50000.00",
            "diagnosis_codes": ["K35.8"],
            "requested_services": [
                {
                    "description": "Appendectomy",
                    "code": "47600",
                    "quantity": 1,
                    "estimated_cost": 50000,
                }
            ],
            "clinical_notes": "Acute appendicitis, surgical intervention needed",
        }
        response = authenticated_client.post("/api/insurance/preauths/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["preauth_number"].startswith("IPA-")

    def test_submit_action(self, authenticated_client, insurance_preauth):
        response = authenticated_client.post(
            f"/api/insurance/preauths/{insurance_preauth.pk}/submit/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "submitted"

    def test_approve_action(self, authenticated_client, insurance_preauth):
        insurance_preauth.submit()
        response = authenticated_client.post(
            f"/api/insurance/preauths/{insurance_preauth.pk}/approve/",
            {"approved_amount": "45000.00", "validity_days": 14},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "approved"
        assert response.data["approved_amount"] == "45000.00"
        assert response.data["expires_at"] is not None

    def test_deny_action(self, authenticated_client, insurance_preauth):
        insurance_preauth.submit()
        response = authenticated_client.post(
            f"/api/insurance/preauths/{insurance_preauth.pk}/deny/",
            {"reason": "Not medically necessary"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "denied"

    def test_cancel_action(self, authenticated_client, insurance_preauth):
        response = authenticated_client.post(
            f"/api/insurance/preauths/{insurance_preauth.pk}/cancel/",
            {"reason": "Patient request"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "cancelled"


# ===================================================================
# InsuranceRemittance API
# ===================================================================
class TestInsuranceRemittanceAPI:
    def test_list_remittances(self, authenticated_client, insurance_remittance):
        response = authenticated_client.get("/api/insurance/remittances/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_remittance(self, authenticated_client, insurance_provider):
        data = {
            "provider": insurance_provider.pk,
            "remittance_number": "REM-NEW-001",
            "remittance_date": str(date.today()),
            "total_amount": "200000.00",
        }
        response = authenticated_client.post("/api/insurance/remittances/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED

    def test_reconcile_action(self, authenticated_client, insurance_remittance):
        response = authenticated_client.post(
            f"/api/insurance/remittances/{insurance_remittance.pk}/reconcile/"
        )
        assert response.status_code == status.HTTP_200_OK


# ===================================================================
# PayerTariff API
# ===================================================================
class TestPayerTariffAPI:
    def test_list_tariffs(self, authenticated_client, payer_tariff):
        response = authenticated_client.get("/api/insurance/tariffs/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_create_tariff(self, authenticated_client, insurance_provider):
        data = {
            "provider": insurance_provider.pk,
            "service_code": "LAB-001",
            "payer_code": "JUB-LAB-001",
            "payer_description": "Complete Blood Count",
            "tariff_amount": "800.00",
            "effective_from": str(date.today()),
        }
        response = authenticated_client.post("/api/insurance/tariffs/", data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["payer_code"] == "JUB-LAB-001"

    def test_filter_by_provider(self, authenticated_client, payer_tariff):
        response = authenticated_client.get(
            f"/api/insurance/tariffs/?provider={payer_tariff.provider_id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1
