"""Tests for applying pulled cloud sync entries on a hub."""

from datetime import date

import pytest  # type: ignore

pytestmark = pytest.mark.django_db


class TestSyncMaterializer:
    """Tests for local application of cloud-to-hub entries."""

    def test_materialize_one_to_one_fk_from_cloud(self, sample_facility):
        """One-to-one relation values should materialize through *_id fields."""
        from hmis.apps.ai.models import TibaBotFacilityKey
        from hmis.apps.core.sync_materializer import materialize_entry

        result = materialize_entry(
            {
                "table": "ai.TibaBotFacilityKey",
                "operation": "CREATE",
                "record_id": 77,
                "data": {
                    "id": 77,
                    "facility": sample_facility.pk,
                    "api_key": "tb_test_full_pull",
                    "key_hash": "hash77",
                    "tibabot_facility_id": "facility-77",
                    "scopes": ["chat", "clinical"],
                },
            }
        )

        assert result == {"success": True}
        key = TibaBotFacilityKey.objects.get(pk=77)
        assert key.facility == sample_facility
        assert key.api_key == "tb_test_full_pull"

    def test_materialize_user_skips_duplicate_email_on_existing_local_user(self):
        """A cloud user update should not fail when another local row already owns the email."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.sync_materializer import materialize_entry

        User = get_user_model()
        target = User.objects.create_user(
            username="target_user",
            email="target@example.com",
            password="old-password",
        )
        User.objects.create_user(
            username="duplicate_user",
            email="cloud@example.com",
            password="duplicate-password",
        )

        new_hash = "pbkdf2_sha256$600000$salt$newhash123abc"
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "UPDATE",
                "record_id": target.pk,
                "data": {
                    "id": target.pk,
                    "username": "target_user",
                    "email": "cloud@example.com",
                    "password": new_hash,
                },
            }
        )

        assert result == {"success": True}
        target.refresh_from_db()
        assert target.email == "target@example.com"
        assert target.password == new_hash

    def test_materialize_user_create_updates_existing_username(self):
        """Cloud-created users should update a same-username local row instead of colliding."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.sync_materializer import materialize_entry

        User = get_user_model()
        local_user = User.objects.create_user(
            username="cloud_admin",
            email="local@example.com",
            password="old-password",
        )
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "CREATE",
                "record_id": local_user.pk + 100,
                "data": {
                    "id": local_user.pk + 100,
                    "username": "cloud_admin",
                    "email": "cloud@example.com",
                    "first_name": "Cloud",
                },
            }
        )

        assert result == {"success": True}
        assert User.objects.filter(username="cloud_admin").count() == 1
        local_user.refresh_from_db()
        assert local_user.first_name == "Cloud"

    def test_materialize_user_pk_collision_updates_existing_username(self):
        """Cloud users should reconcile by username even when the cloud PK exists locally."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.sync_materializer import materialize_entry

        User = get_user_model()
        local_pk_owner = User.objects.create_user(
            username="local_system",
            email="system.local@example.com",
            password="system-password",
        )
        local_cloud_user = User.objects.create_user(
            username="cloud_admin",
            email="admin.local@example.com",
            password="old-password",
        )

        new_hash = "pbkdf2_sha256$600000$salt$cloudadminhash"
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "CREATE",
                "record_id": local_pk_owner.pk,
                "data": {
                    "id": local_pk_owner.pk,
                    "username": "cloud_admin",
                    "email": "admin@cloud.example.com",
                    "first_name": "Cloud",
                    "password": new_hash,
                },
            }
        )

        assert result == {"success": True}
        local_pk_owner.refresh_from_db()
        local_cloud_user.refresh_from_db()
        assert local_pk_owner.username == "local_system"
        assert local_cloud_user.first_name == "Cloud"
        assert local_cloud_user.password == new_hash

    def test_materialize_update_creates_missing_user_from_full_payload(self):
        """Cloud UPDATE payloads should upsert when the local row is missing."""
        from django.contrib.auth import get_user_model

        from hmis.apps.core.sync_materializer import materialize_entry

        User = get_user_model()
        result = materialize_entry(
            {
                "table": "auth.User",
                "operation": "UPDATE",
                "record_id": 9001,
                "data": {
                    "id": 9001,
                    "username": "missing_cloud_user",
                    "email": "missing@example.com",
                    "password": "pbkdf2_sha256$600000$salt$missinghash",
                    "is_active": True,
                },
            }
        )

        assert result == {"success": True}
        user = User.objects.get(pk=9001)
        assert user.username == "missing_cloud_user"
        assert user.email == "missing@example.com"

    def test_materialize_staff_profile_create_updates_existing_user_profile(
        self, test_user, sample_organization, sample_facility, sample_department, sample_role
    ):
        """Cloud staff profiles should update an existing local profile for the same user."""
        from hmis.apps.core.models import StaffProfile
        from hmis.apps.core.sync_materializer import materialize_entry

        local_profile = StaffProfile.objects.create(
            user=test_user,
            employee_id="LOCAL-001",
            organization=sample_organization,
            primary_facility=sample_facility,
            primary_department=sample_department,
            primary_role=sample_role,
            date_joined=date(2026, 1, 1),
        )
        result = materialize_entry(
            {
                "table": "core.StaffProfile",
                "operation": "CREATE",
                "record_id": local_profile.pk + 100,
                "data": {
                    "id": local_profile.pk + 100,
                    "user": test_user.pk,
                    "employee_id": "CLOUD-001",
                    "organization": sample_organization.pk,
                    "primary_facility": sample_facility.pk,
                    "primary_department": sample_department.pk,
                    "primary_role": sample_role.pk,
                    "date_joined": "2026-01-01",
                    "employment_status": "ACTIVE",
                    "employment_type": "PERMANENT",
                },
            }
        )

        assert result == {"success": True}
        assert StaffProfile.objects.filter(user=test_user).count() == 1
        local_profile.refresh_from_db()
        assert local_profile.employee_id == "CLOUD-001"

    def test_materialize_staff_profile_pk_collision_updates_existing_user_profile(
        self,
        test_user,
        another_user,
        sample_organization,
        sample_facility,
        sample_department,
        sample_role,
    ):
        """Cloud staff profiles should reconcile by user before updating a colliding PK."""
        from hmis.apps.core.models import StaffProfile
        from hmis.apps.core.sync_materializer import materialize_entry

        local_pk_owner = StaffProfile.objects.create(
            user=another_user,
            employee_id="LOCAL-PK-OWNER",
            organization=sample_organization,
            primary_facility=sample_facility,
            primary_department=sample_department,
            primary_role=sample_role,
            date_joined=date(2026, 1, 1),
        )
        local_cloud_profile = StaffProfile.objects.create(
            user=test_user,
            employee_id="LOCAL-CLOUD-USER",
            organization=sample_organization,
            primary_facility=sample_facility,
            primary_department=sample_department,
            primary_role=sample_role,
            date_joined=date(2026, 1, 1),
        )

        result = materialize_entry(
            {
                "table": "core.StaffProfile",
                "operation": "CREATE",
                "record_id": local_pk_owner.pk,
                "data": {
                    "id": local_pk_owner.pk,
                    "user": test_user.pk,
                    "employee_id": "CLOUD-STAFF-001",
                    "organization": sample_organization.pk,
                    "primary_facility": sample_facility.pk,
                    "primary_department": sample_department.pk,
                    "primary_role": sample_role.pk,
                    "date_joined": "2026-01-01",
                    "employment_status": "ACTIVE",
                    "employment_type": "PERMANENT",
                },
            }
        )

        assert result == {"success": True}
        local_pk_owner.refresh_from_db()
        local_cloud_profile.refresh_from_db()
        assert local_pk_owner.user == another_user
        assert local_cloud_profile.employee_id == "CLOUD-STAFF-001"
        assert StaffProfile.objects.filter(user=test_user).count() == 1

    def test_materialize_staff_profile_remaps_cloud_identity_dependencies_by_natural_keys(
        self,
        test_user,
        sample_organization,
        sample_facility,
        sample_department,
        sample_role,
    ):
        """Full pulls should use local Role/Department PKs when cloud IDs differ."""
        from hmis.apps.core.models import StaffProfile
        from hmis.apps.core.sync_materializer import materialize_entry

        cloud_role_id = sample_role.pk + 1000
        cloud_department_id = sample_department.pk + 1000

        result = materialize_entry(
            {
                "table": "core.StaffProfile",
                "operation": "CREATE",
                "record_id": 88001,
                "data": {
                    "id": 88001,
                    "user_id": test_user.pk,
                    "username": test_user.username,
                    "employee_id": "CLOUD-NATURAL-001",
                    "organization_id": sample_organization.pk,
                    "organization_slug": sample_organization.slug,
                    "primary_facility_id": sample_facility.pk,
                    "primary_facility_mfl_code": sample_facility.mfl_code,
                    "primary_department_id": cloud_department_id,
                    "primary_department_code": sample_department.code,
                    "primary_role_id": cloud_role_id,
                    "primary_role_code": sample_role.code,
                    "date_joined": "2026-01-01",
                    "employment_status": "ACTIVE",
                    "employment_type": "PERMANENT",
                },
            }
        )

        assert result == {"success": True}
        profile = StaffProfile.objects.get(employee_id="CLOUD-NATURAL-001")
        assert profile.primary_role_id == sample_role.pk
        assert profile.primary_department_id == sample_department.pk
        assert profile.primary_facility_id == sample_facility.pk

    def test_materialize_role_create_reconciles_by_code(self, sample_role):
        """Cloud roles should update same-code local roles instead of failing uniqueness."""
        from hmis.apps.core.models import Role
        from hmis.apps.core.sync_materializer import materialize_entry

        result = materialize_entry(
            {
                "table": "core.Role",
                "operation": "CREATE",
                "record_id": sample_role.pk + 1000,
                "data": {
                    "id": sample_role.pk + 1000,
                    "code": sample_role.code,
                    "name": "Cloud Doctor",
                    "category": sample_role.category,
                    "scope": sample_role.scope,
                    "hierarchy_level": sample_role.hierarchy_level,
                    "is_active": True,
                },
            }
        )

        assert result == {"success": True}
        assert Role.objects.filter(code=sample_role.code).count() == 1
        sample_role.refresh_from_db()
        assert sample_role.name == "Cloud Doctor"

    def test_materialize_org_membership_remaps_identity_dependencies_by_natural_keys(
        self,
        test_staff_profile,
        sample_organization,
        sample_facility,
        sample_department,
        sample_role,
    ):
        """Org memberships should resolve cloud FK IDs to local identity rows."""
        from hmis.apps.core.models import OrgMembership
        from hmis.apps.core.sync_materializer import materialize_entry

        result = materialize_entry(
            {
                "table": "core.OrgMembership",
                "operation": "CREATE",
                "record_id": 99001,
                "data": {
                    "id": 99001,
                    "staff_profile_id": test_staff_profile.pk + 1000,
                    "staff_username": test_staff_profile.user.username,
                    "staff_profile_employee_id": test_staff_profile.employee_id,
                    "organization_id": sample_organization.pk + 1000,
                    "organization_slug": sample_organization.slug,
                    "role_id": sample_role.pk + 1000,
                    "role_code": sample_role.code,
                    "department_id": sample_department.pk + 1000,
                    "department_code": sample_department.code,
                    "facility_ids": [sample_facility.pk + 1000],
                    "facility_mfl_codes": [sample_facility.mfl_code],
                    "is_primary": True,
                    "status": "ACTIVE",
                },
            }
        )

        assert result == {"success": True}
        membership = OrgMembership.objects.get(staff_profile=test_staff_profile)
        assert membership.organization_id == sample_organization.pk
        assert membership.role_id == sample_role.pk
        assert membership.department_id == sample_department.pk
        assert list(membership.facilities.values_list("pk", flat=True)) == [sample_facility.pk]

    def test_materialize_resource_reconciles_by_facility_and_code(self, sample_facility):
        """Cloud resources should update same-code local resources when PKs differ."""
        from hmis.apps.core.sync_materializer import materialize_entry
        from hmis.apps.scheduling.models import Resource

        local_resource = Resource.objects.create(
            name="General OPD",
            resource_type="PLACE",
            code="CLINIC-GOPD-001",
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = materialize_entry(
            {
                "table": "scheduling.Resource",
                "operation": "CREATE",
                "record_id": local_resource.pk + 1000,
                "data": {
                    "id": local_resource.pk + 1000,
                    "name": "General OPD Updated",
                    "resource_type": "PLACE",
                    "code": local_resource.code,
                    "facility_id": sample_facility.pk + 1000,
                    "facility_mfl_code": sample_facility.mfl_code,
                    "organization_id": sample_facility.organization_id + 1000,
                    "organization_slug": sample_facility.organization.slug,
                    "is_active": True,
                    "capacity": 2,
                },
            }
        )

        assert result == {"success": True}
        assert (
            Resource.objects.filter(code="CLINIC-GOPD-001", facility=sample_facility).count() == 1
        )
        local_resource.refresh_from_db()
        assert local_resource.name == "General OPD Updated"
        assert local_resource.capacity == 2

    def test_materialize_clinic_remaps_scheduling_resource_by_code(self, sample_facility):
        """Full pulls should not assign a clinic to another clinic's resource by cloud PK."""
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.core.sync_materializer import materialize_entry
        from hmis.apps.scheduling.models import Resource

        other_resource = Resource.objects.create(
            name="Dental Clinic",
            resource_type="PLACE",
            code="CLINIC-DENTAL-001",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        Clinic.objects.create(
            name="Dental Clinic",
            clinic_type="DENTAL",
            code="DENTAL-001",
            facility=sample_facility,
            organization=sample_facility.organization,
            scheduling_resource=other_resource,
        )
        target_resource = Resource.objects.create(
            name="General OPD",
            resource_type="PLACE",
            code="CLINIC-GOPD-001",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        target_clinic = Clinic.objects.create(
            name="General OPD",
            clinic_type="GENERAL_OPD",
            code="GOPD-001",
            facility=sample_facility,
            organization=sample_facility.organization,
            scheduling_resource=target_resource,
        )

        result = materialize_entry(
            {
                "table": "clinics.Clinic",
                "operation": "CREATE",
                "record_id": target_clinic.pk + 1000,
                "data": {
                    "id": target_clinic.pk + 1000,
                    "name": "General OPD Cloud",
                    "clinic_type": "GENERAL_OPD",
                    "code": target_clinic.code,
                    "facility_id": sample_facility.pk + 1000,
                    "facility_mfl_code": sample_facility.mfl_code,
                    "organization_id": sample_facility.organization_id + 1000,
                    "organization_slug": sample_facility.organization.slug,
                    "scheduling_resource_id": other_resource.pk,
                    "scheduling_resource_code": target_resource.code,
                    "status": "ACTIVE",
                    "accepts_walk_ins": True,
                    "triage_required": True,
                    "requires_appointment": False,
                    "requires_referral": False,
                    "capacity": 1,
                    "is_sensitive": False,
                },
            }
        )

        assert result == {"success": True}
        target_clinic.refresh_from_db()
        assert target_clinic.name == "General OPD Cloud"
        assert target_clinic.scheduling_resource_id == target_resource.pk
        assert Clinic.objects.get(code="DENTAL-001").scheduling_resource_id == other_resource.pk

    def test_materialize_encounter_remaps_patient_facility_and_user_hints(
        self, sample_patient, sample_facility, test_user
    ):
        """Encounter full pulls should not depend on cloud Patient/User/Facility PKs."""
        from hmis.apps.core.sync_materializer import materialize_entry
        from hmis.apps.encounters.models import Encounter

        result = materialize_entry(
            {
                "table": "encounters.Encounter",
                "operation": "CREATE",
                "record_id": 77001,
                "data": {
                    "id": 77001,
                    "patient_id": sample_patient.pk + 1000,
                    "patient_mrn": sample_patient.mrn,
                    "facility_id": sample_facility.pk + 1000,
                    "facility_mfl_code": sample_facility.mfl_code,
                    "organization_id": sample_facility.organization_id + 1000,
                    "organization_slug": sample_facility.organization.slug,
                    "created_by_id": test_user.pk + 1000,
                    "created_by_username": test_user.username,
                    "encounter_type": "OPD",
                    "encounter_date": "2026-06-22",
                    "chief_complaint": "Cloud headache",
                    "status": "CREATED",
                },
            }
        )

        assert result == {"success": True}
        encounter = Encounter.objects.get(pk=77001)
        assert encounter.patient_id == sample_patient.pk
        assert encounter.facility_id == sample_facility.pk
        assert encounter.created_by_id == test_user.pk

    def test_materialize_invoice_remaps_created_by_and_encounter_by_natural_keys(
        self, sample_patient, sample_encounter, sample_facility, test_user
    ):
        """Invoices should remap cloud User and Encounter IDs before full_clean()."""
        from hmis.apps.billing.models import Invoice
        from hmis.apps.core.sync_materializer import materialize_entry

        result = materialize_entry(
            {
                "table": "billing.Invoice",
                "operation": "CREATE",
                "record_id": 43001,
                "data": {
                    "id": 43001,
                    "invoice_number": "INV-CLOUD-00043",
                    "patient_id": sample_patient.pk + 1000,
                    "patient_mrn": sample_patient.mrn,
                    "encounter_id": sample_encounter.pk + 1000,
                    "encounter_patient_mrn": sample_patient.mrn,
                    "encounter_facility_mfl_code": sample_facility.mfl_code,
                    "encounter_date": sample_encounter.encounter_date.isoformat(),
                    "encounter_type": sample_encounter.encounter_type,
                    "encounter_chief_complaint": sample_encounter.chief_complaint,
                    "created_by_id": test_user.pk + 1000,
                    "created_by_username": test_user.username,
                    "facility_id": sample_facility.pk + 1000,
                    "facility_mfl_code": sample_facility.mfl_code,
                    "organization_id": sample_facility.organization_id + 1000,
                    "organization_slug": sample_facility.organization.slug,
                    "status": "draft",
                    "payment_type": "cash",
                    "invoice_date": "2026-06-22",
                    "due_date": "2026-06-22",
                    "subtotal": "100.00",
                    "tax_amount": "0.00",
                    "discount_amount": "0.00",
                    "total_amount": "100.00",
                    "amount_paid": "0.00",
                    "balance_due": "100.00",
                },
            }
        )

        assert result == {"success": True}
        invoice = Invoice.objects.get(invoice_number="INV-CLOUD-00043")
        assert invoice.patient_id == sample_patient.pk
        assert invoice.encounter_id == sample_encounter.pk
        assert invoice.created_by_id == test_user.pk
        assert invoice.facility_id == sample_facility.pk

    def test_materialize_invoice_item_remaps_invoice_and_service_by_codes(
        self, sample_patient, sample_facility, test_user
    ):
        """Invoice items should remap parent invoice and service catalog IDs by natural keys."""
        from hmis.apps.billing.models import Invoice, InvoiceItem, Service, ServiceCategory
        from hmis.apps.core.sync_materializer import materialize_entry

        invoice = Invoice.objects.create(
            invoice_number="INV-CLOUD-ITEM-001",
            patient=sample_patient,
            facility=sample_facility,
            organization=sample_facility.organization,
            created_by=test_user,
            invoice_date=date(2026, 6, 22),
            due_date=date(2026, 6, 22),
            total_amount="100.00",
            balance_due="100.00",
        )
        category = ServiceCategory.objects.create(name="Consultation", code="CONS")
        service = Service.objects.create(
            category=category,
            code="CONS-001",
            name="Consultation",
            unit_price="100.00",
            created_by=test_user,
        )

        result = materialize_entry(
            {
                "table": "billing.InvoiceItem",
                "operation": "CREATE",
                "record_id": 44001,
                "data": {
                    "id": 44001,
                    "invoice_id": invoice.pk + 1000,
                    "invoice_invoice_number": invoice.invoice_number,
                    "invoice_facility_mfl_code": sample_facility.mfl_code,
                    "service_id": service.pk + 1000,
                    "service_code": service.code,
                    "item_type": "service",
                    "description": "Consultation",
                    "quantity": "1.00",
                    "unit_price": "100.00",
                    "line_total": "100.00",
                },
            }
        )

        assert result == {"success": True}
        item = InvoiceItem.objects.get(pk=44001)
        assert item.invoice_id == invoice.pk
        assert item.service_id == service.pk

    def test_materialize_payment_remaps_invoice_user_and_payment_point(
        self, sample_patient, sample_facility, test_user
    ):
        """Payments should remap invoice, cashier, and payment point natural keys."""
        from hmis.apps.billing.models import Invoice, Payment, PaymentPoint
        from hmis.apps.core.sync_materializer import materialize_entry

        invoice = Invoice.objects.create(
            invoice_number="INV-CLOUD-PAY-001",
            patient=sample_patient,
            facility=sample_facility,
            organization=sample_facility.organization,
            created_by=test_user,
            invoice_date=date(2026, 6, 22),
            due_date=date(2026, 6, 22),
            total_amount="100.00",
            balance_due="100.00",
        )
        payment_point = PaymentPoint.objects.create(
            name="Cashier 1",
            code="CASH-01",
            method="cash",
            facility=sample_facility,
            organization=sample_facility.organization,
            created_by=test_user,
        )

        result = materialize_entry(
            {
                "table": "billing.Payment",
                "operation": "CREATE",
                "record_id": 45001,
                "data": {
                    "id": 45001,
                    "payment_reference": "PAY-CLOUD-0001",
                    "invoice_id": invoice.pk + 1000,
                    "invoice_invoice_number": invoice.invoice_number,
                    "invoice_facility_mfl_code": sample_facility.mfl_code,
                    "payment_point_id": payment_point.pk + 1000,
                    "payment_point_code": payment_point.code,
                    "payment_point_facility_mfl_code": sample_facility.mfl_code,
                    "received_by_id": test_user.pk + 1000,
                    "received_by_username": test_user.username,
                    "method": "cash",
                    "amount": "50.00",
                    "currency": "KES",
                    "status": "pending",
                },
            }
        )

        assert result == {"success": True}
        payment = Payment.objects.get(payment_reference="PAY-CLOUD-0001")
        assert payment.invoice_id == invoice.pk
        assert payment.payment_point_id == payment_point.pk
        assert payment.received_by_id == test_user.pk

    def test_materialize_patient_remaps_location_hierarchy(
        self, sample_county, sample_sub_county, sample_ward, test_user
    ):
        """Patients should remap Kenya location IDs by stable county/sub-county/ward keys."""
        from hmis.apps.core.sync_materializer import materialize_entry
        from hmis.apps.patients.models import Patient

        result = materialize_entry(
            {
                "table": "patients.Patient",
                "operation": "CREATE",
                "record_id": 56001,
                "data": {
                    "id": 56001,
                    "first_name": "Cloud",
                    "last_name": "Patient",
                    "date_of_birth": "1990-01-01",
                    "gender": "F",
                    "county_id": sample_county.pk + 1000,
                    "county_code": sample_county.code,
                    "sub_county_id": sample_sub_county.pk + 1000,
                    "sub_county_name": sample_sub_county.name,
                    "sub_county_county_code": sample_county.code,
                    "ward_id": sample_ward.pk + 1000,
                    "ward_name": sample_ward.name,
                    "ward_sub_county_name": sample_sub_county.name,
                    "ward_county_code": sample_county.code,
                    "registered_by_id": test_user.pk + 1000,
                    "registered_by_username": test_user.username,
                    "consent_given": True,
                    "referral_source": "self",
                },
            }
        )

        assert result == {"success": True}
        patient = Patient.objects.get(pk=56001)
        assert patient.county_id == sample_county.pk
        assert patient.sub_county_id == sample_sub_county.pk
        assert patient.ward_id == sample_ward.pk
        assert patient.registered_by_id == test_user.pk

    def test_materialize_diagnosis_remaps_encounter_and_icd10(
        self, sample_patient, sample_encounter, sample_facility
    ):
        """Diagnosis rows should remap parent encounter and ICD code by natural keys."""
        from hmis.apps.core.sync_materializer import materialize_entry
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        code = ICD10Code.objects.create(
            code="A00",
            description="Cholera",
            category="Certain infectious and parasitic diseases",
            chapter=1,
        )
        result = materialize_entry(
            {
                "table": "encounters.Diagnosis",
                "operation": "CREATE",
                "record_id": 57001,
                "data": {
                    "id": 57001,
                    "encounter_id": sample_encounter.pk + 1000,
                    "encounter_patient_mrn": sample_patient.mrn,
                    "encounter_facility_mfl_code": sample_facility.mfl_code,
                    "encounter_date": sample_encounter.encounter_date.isoformat(),
                    "encounter_type": sample_encounter.encounter_type,
                    "encounter_chief_complaint": sample_encounter.chief_complaint,
                    "icd10_code_id": code.pk + 1000,
                    "icd10_code_code": code.code,
                    "diagnosis_type": "PRIMARY",
                    "certainty": "confirmed",
                },
            }
        )

        assert result == {"success": True}
        diagnosis = Diagnosis.objects.get(pk=57001)
        assert diagnosis.encounter_id == sample_encounter.pk
        assert diagnosis.icd10_code_id == code.pk

    def test_materialize_clinic_visit_remaps_session_encounter_and_staff(
        self, sample_patient, sample_encounter, sample_facility, test_user
    ):
        """Clinic visits should remap session, encounter, and staff references by hints."""
        from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit
        from hmis.apps.core.sync_materializer import materialize_entry

        clinic = Clinic.objects.create(
            name="General OPD Sync",
            code="GOPD-SYNC",
            clinic_type="GENERAL_OPD",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        session = ClinicSession.objects.create(
            clinic=clinic,
            session_date=date(2026, 6, 22),
            opened_by=test_user,
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = materialize_entry(
            {
                "table": "clinics.ClinicVisit",
                "operation": "CREATE",
                "record_id": 58001,
                "data": {
                    "id": 58001,
                    "patient_id": sample_patient.pk + 1000,
                    "patient_mrn": sample_patient.mrn,
                    "session_id": session.pk + 1000,
                    "session_clinic_code": clinic.code,
                    "session_session_date": "2026-06-22",
                    "encounter_id": sample_encounter.pk + 1000,
                    "encounter_patient_mrn": sample_patient.mrn,
                    "encounter_facility_mfl_code": sample_facility.mfl_code,
                    "encounter_date": sample_encounter.encounter_date.isoformat(),
                    "encounter_type": sample_encounter.encounter_type,
                    "encounter_chief_complaint": sample_encounter.chief_complaint,
                    "registered_by_id": test_user.pk + 1000,
                    "registered_by_username": test_user.username,
                    "queue_number": 7,
                    "visit_type": "WALK_IN",
                    "status": "WAITING",
                    "facility_id": sample_facility.pk + 1000,
                    "facility_mfl_code": sample_facility.mfl_code,
                    "organization_id": sample_facility.organization_id + 1000,
                    "organization_slug": sample_facility.organization.slug,
                },
            }
        )

        assert result == {"success": True}
        visit = ClinicVisit.objects.get(pk=58001)
        assert visit.session_id == session.pk
        assert visit.encounter_id == sample_encounter.pk
        assert visit.registered_by_id == test_user.pk

    def test_materialize_prescription_item_remaps_parent_and_drug(
        self, sample_patient, sample_encounter, sample_facility, test_user
    ):
        """Prescription items should remap prescription and drug catalog IDs by hints."""
        from hmis.apps.core.sync_materializer import materialize_entry
        from hmis.apps.pharmacy.models import Drug, Prescription, PrescriptionItem

        drug = Drug.objects.create(
            code="AMOX-500",
            generic_name="Amoxicillin",
            form="CAPSULE",
            strength="500mg",
            unit="capsule",
            categories=["ANTIBIOTIC"],
        )
        prescription = Prescription.objects.create(
            prescription_number="RX-SYNC-001",
            patient=sample_patient,
            encounter=sample_encounter,
            prescribed_by=test_user,
            valid_until=date(2026, 7, 22),
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        result = materialize_entry(
            {
                "table": "pharmacy.PrescriptionItem",
                "operation": "CREATE",
                "record_id": 59001,
                "data": {
                    "id": 59001,
                    "prescription_id": prescription.pk + 1000,
                    "prescription_prescription_number": prescription.prescription_number,
                    "drug_id": drug.pk + 1000,
                    "drug_code": drug.code,
                    "dosage": "500mg",
                    "frequency": "TDS",
                    "duration": "5 days",
                    "quantity": 15,
                },
            }
        )

        assert result == {"success": True}
        item = PrescriptionItem.objects.get(pk=59001)
        assert item.prescription_id == prescription.pk
        assert item.drug_id == drug.pk

    def test_lab_result_resolvers_remap_order_item_and_specimen(
        self, sample_patient, sample_encounter, sample_facility, test_user
    ):
        """Lab result dependencies should be resolvable by order/test/barcode hints."""
        from hmis.apps.core.sync_materializer import (
            resolve_lab_order_item_id_from_sync_data,
            resolve_specimen_id_from_sync_data,
        )
        from hmis.apps.laboratory.models import LabOrder, LabOrderItem, Specimen, TestCatalog

        test = TestCatalog.objects.create(
            code="CBC",
            name="Complete Blood Count",
            short_name="CBC",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="TEXT",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        lab_order = LabOrder.objects.create(
            order_number="LAB-SYNC-001",
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        order_item = LabOrderItem.objects.create(lab_order=lab_order, test=test, unit_cost="50.00")
        specimen = Specimen.objects.create(
            barcode="SPEC-SYNC-001",
            specimen_type="BLOOD",
            lab_order=lab_order,
        )

        raw_data = {
            "order_item_order_number": lab_order.order_number,
            "order_item_code": test.code,
            "order_item_facility_mfl_code": sample_facility.mfl_code,
            "specimen_barcode": specimen.barcode,
        }

        assert resolve_lab_order_item_id_from_sync_data(raw_data, "order_item") == order_item.pk
        assert resolve_specimen_id_from_sync_data(raw_data, "specimen") == specimen.pk

    def test_admission_resolvers_remap_ward_and_bed(self, sample_facility):
        """Admission dependencies should resolve local ward and bed IDs by ward/bed codes."""
        from hmis.apps.core.sync_materializer import (
            resolve_bed_id_from_sync_data,
            resolve_inpatient_ward_id_from_sync_data,
        )
        from hmis.apps.inpatient.models import Ward

        ward = Ward.objects.create(
            name="Medical Ward Sync",
            code="MED-SYNC",
            ward_type="MEDICAL",
            capacity=1,
            daily_rate="1000.00",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        bed = ward.beds.get(bed_number="B-001")
        raw_data = {
            "ward_code": ward.code,
            "bed_code": ward.code,
            "bed_bed_number": bed.bed_number,
        }

        assert resolve_inpatient_ward_id_from_sync_data(raw_data, "ward") == ward.pk
        assert resolve_bed_id_from_sync_data(raw_data, "bed") == bed.pk

    def test_materialize_facility_update(self, sample_facility):
        """A downward Facility update should change the local hub copy."""
        from hmis.apps.core.sync_materializer import materialize_entry

        sample_facility.has_laboratory = False
        sample_facility.save(update_fields=["has_laboratory"])

        result = materialize_entry(
            {
                "table": "core.Facility",
                "operation": "UPDATE",
                "record_id": sample_facility.id,
                "data": {"id": sample_facility.id, "has_laboratory": True},
            }
        )

        assert result == {"success": True}
        sample_facility.refresh_from_db()
        assert sample_facility.has_laboratory is True

    def test_materialize_rejects_unregistered_model(self):
        """Unknown models should be rejected without applying anything."""
        from hmis.apps.core.sync_materializer import materialize_entry

        result = materialize_entry(
            {
                "table": "unknown.Model",
                "operation": "UPDATE",
                "record_id": 1,
                "data": {"id": 1},
            }
        )

        assert result["success"] is False
        assert "Unknown table" in result["error"]

    def test_reference_config_conflict_prefers_cloud(self, sample_facility, sample_organization):
        """Downward/config models should apply cloud changes over local pending edits."""
        from hmis.apps.core.models import SyncConflict, SyncQueue
        from hmis.apps.core.sync_materializer import materialize_entry

        sample_facility.has_laboratory = False
        sample_facility.save(update_fields=["has_laboratory"])
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="core.Facility",
            record_id=sample_facility.id,
            data={"id": sample_facility.id, "has_laboratory": False},
            status="PENDING",
            organization=sample_organization,
            facility=sample_facility,
        )

        result = materialize_entry(
            {
                "table": "core.Facility",
                "operation": "UPDATE",
                "record_id": sample_facility.id,
                "data": {"id": sample_facility.id, "has_laboratory": True},
            }
        )

        assert result == {"success": True, "conflict": True, "strategy": "REMOTE_WINS"}
        sample_facility.refresh_from_db()
        assert sample_facility.has_laboratory is True
        conflict = SyncConflict.objects.get(
            model_name="core.Facility", record_id=sample_facility.id
        )
        assert conflict.status == "RESOLVED"
        assert conflict.resolution_strategy == "REMOTE_WINS"
        assert conflict.local_data["has_laboratory"] is False
        assert conflict.remote_data["has_laboratory"] is True

    def test_clinical_conflict_prefers_hub(self, sample_patient):
        """Upward/clinical models should keep local hub changes when cloud sends same record."""
        from hmis.apps.core.models import SyncConflict, SyncQueue
        from hmis.apps.core.sync_materializer import materialize_entry

        sample_patient.last_name = "HubVersion"
        sample_patient.save(update_fields=["last_name"])
        SyncQueue.objects.create(
            operation="UPDATE",
            model_name="patients.Patient",
            record_id=sample_patient.id,
            data={"id": sample_patient.id, "last_name": "HubVersion"},
            status="PENDING",
            organization=sample_patient.organization,
            facility=sample_patient.registered_at_facility,
        )

        result = materialize_entry(
            {
                "table": "patients.Patient",
                "operation": "UPDATE",
                "record_id": sample_patient.id,
                "data": {"id": sample_patient.id, "last_name": "CloudVersion"},
            }
        )

        assert result == {"success": True, "conflict": True, "strategy": "LOCAL_WINS"}
        sample_patient.refresh_from_db()
        assert sample_patient.last_name == "HubVersion"
        conflict = SyncConflict.objects.get(
            model_name="patients.Patient", record_id=sample_patient.id
        )
        assert conflict.status == "RESOLVED"
        assert conflict.resolution_strategy == "LOCAL_WINS"
        assert conflict.local_data["last_name"] == "HubVersion"
        assert conflict.remote_data["last_name"] == "CloudVersion"
