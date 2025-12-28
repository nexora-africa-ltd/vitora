"""
Tests for EmergencyContact model - Sprint 0.7

Following TDD principles: Write tests FIRST, then implement.
These tests define the expected behavior of the EmergencyContact model.
"""

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError


@pytest.mark.django_db
class TestEmergencyContactModel:
    """Test suite for EmergencyContact model."""

    def test_create_emergency_contact(self, sample_patient):
        """Test creating an emergency contact linked to a patient."""
        from hmis.apps.patients.models import EmergencyContact

        contact = EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="Jane Doe",
            relationship="spouse",
            phone_number="+254712345678",
        )

        assert contact.id is not None
        assert contact.patient == sample_patient
        assert contact.full_name == "Jane Doe"
        assert contact.relationship == "spouse"
        assert contact.phone_number == "+254712345678"
        assert contact.alternative_phone == ""  # Default empty

    def test_emergency_contact_str_representation(self, sample_patient):
        """Test string representation of EmergencyContact."""
        from hmis.apps.patients.models import EmergencyContact

        contact = EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="John Smith",
            relationship="parent",
            phone_number="+254700111222",
        )

        expected = f"John Smith (parent) - {sample_patient.mrn}"
        assert str(contact) == expected

    def test_emergency_contact_with_alternative_phone(self, sample_patient):
        """Test creating contact with alternative phone number."""
        from hmis.apps.patients.models import EmergencyContact

        contact = EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="Mary Johnson",
            relationship="sibling",
            phone_number="+254712345678",
            alternative_phone="+254722345678",
        )

        assert contact.alternative_phone == "+254722345678"

    def test_emergency_contact_requires_patient(self):
        """Test that emergency contact requires a patient."""
        from hmis.apps.patients.models import EmergencyContact

        with pytest.raises(IntegrityError):
            EmergencyContact.objects.create(
                full_name="Test Contact",
                relationship="friend",
                phone_number="+254700000000",
            )

    def test_emergency_contact_requires_full_name(self, sample_patient):
        """Test that emergency contact requires full name."""
        from hmis.apps.patients.models import EmergencyContact

        contact = EmergencyContact(
            patient=sample_patient,
            full_name="",
            relationship="spouse",
            phone_number="+254712345678",
        )

        with pytest.raises(ValidationError) as exc_info:
            contact.full_clean()

        assert "full_name" in str(exc_info.value)

    def test_emergency_contact_requires_relationship(self, sample_patient):
        """Test that emergency contact requires relationship."""
        from hmis.apps.patients.models import EmergencyContact

        contact = EmergencyContact(
            patient=sample_patient,
            full_name="Test Person",
            relationship="",
            phone_number="+254712345678",
        )

        with pytest.raises(ValidationError) as exc_info:
            contact.full_clean()

        assert "relationship" in str(exc_info.value)

    def test_emergency_contact_requires_phone_number(self, sample_patient):
        """Test that emergency contact requires phone number."""
        from hmis.apps.patients.models import EmergencyContact

        contact = EmergencyContact(
            patient=sample_patient,
            full_name="Test Person",
            relationship="spouse",
            phone_number="",
        )

        with pytest.raises(ValidationError) as exc_info:
            contact.full_clean()

        assert "phone_number" in str(exc_info.value)

    def test_patient_can_have_multiple_emergency_contacts(self, sample_patient):
        """Test that a patient can have multiple emergency contacts."""
        from hmis.apps.patients.models import EmergencyContact

        contact1 = EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="Contact One",
            relationship="spouse",
            phone_number="+254711111111",
        )
        contact2 = EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="Contact Two",
            relationship="parent",
            phone_number="+254722222222",
        )

        assert sample_patient.emergency_contacts.count() == 2
        assert contact1 in sample_patient.emergency_contacts.all()
        assert contact2 in sample_patient.emergency_contacts.all()

    def test_emergency_contact_deleted_when_patient_deleted(self, sample_patient):
        """Test that emergency contacts are deleted when patient is deleted."""
        from hmis.apps.patients.models import EmergencyContact

        EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="Test Contact",
            relationship="spouse",
            phone_number="+254712345678",
        )

        patient_id = sample_patient.id
        sample_patient.delete()

        assert EmergencyContact.objects.filter(patient_id=patient_id).count() == 0

    def test_relationship_choices(self, sample_patient):
        """Test that relationship field accepts valid choices."""
        from hmis.apps.patients.models import EmergencyContact

        valid_relationships = ["spouse", "parent", "child", "sibling", "friend", "other"]

        for relationship in valid_relationships:
            contact = EmergencyContact(
                patient=sample_patient,
                full_name=f"Contact {relationship}",
                relationship=relationship,
                phone_number="+254712345678",
            )
            # Should not raise
            contact.full_clean()

    def test_emergency_contact_timestamps(self, sample_patient):
        """Test that emergency contacts have created_at and updated_at."""
        from hmis.apps.patients.models import EmergencyContact

        contact = EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="Test Contact",
            relationship="spouse",
            phone_number="+254712345678",
        )

        assert contact.created_at is not None
        assert contact.updated_at is not None


@pytest.mark.django_db
class TestEmergencyContactAPI:
    """Test suite for EmergencyContact API endpoints."""

    def test_list_emergency_contacts(self, authenticated_client, sample_patient):
        """Test listing emergency contacts for a patient."""
        from hmis.apps.patients.models import EmergencyContact

        EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="Contact One",
            relationship="spouse",
            phone_number="+254711111111",
        )

        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/emergency-contacts/"
        )

        assert response.status_code == 200
        # API returns paginated results
        assert response.data["count"] == 1
        assert response.data["results"][0]["full_name"] == "Contact One"

    def test_create_emergency_contact_via_api(self, authenticated_client, sample_patient):
        """Test creating an emergency contact via API."""
        data = {
            "full_name": "New Contact",
            "relationship": "parent",
            "phone_number": "+254733333333",
            "alternative_phone": "+254744444444",
        }

        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/emergency-contacts/",
            data,
            format="json",
        )

        assert response.status_code == 201
        assert response.data["full_name"] == "New Contact"
        assert response.data["relationship"] == "parent"

    def test_update_emergency_contact_via_api(self, authenticated_client, sample_patient):
        """Test updating an emergency contact via API."""
        from hmis.apps.patients.models import EmergencyContact

        contact = EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="Original Name",
            relationship="spouse",
            phone_number="+254712345678",
        )

        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/emergency-contacts/{contact.id}/",
            {"full_name": "Updated Name"},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["full_name"] == "Updated Name"

    def test_delete_emergency_contact_via_api(self, authenticated_client, sample_patient):
        """Test deleting an emergency contact via API."""
        from hmis.apps.patients.models import EmergencyContact

        contact = EmergencyContact.objects.create(
            patient=sample_patient,
            full_name="To Delete",
            relationship="friend",
            phone_number="+254712345678",
        )

        response = authenticated_client.delete(
            f"/api/patients/{sample_patient.id}/emergency-contacts/{contact.id}/"
        )

        assert response.status_code == 204
        assert not EmergencyContact.objects.filter(id=contact.id).exists()

    def test_cannot_create_contact_without_auth(self, api_client, sample_patient):
        """Test that unauthenticated users cannot create contacts."""
        data = {
            "full_name": "Test Contact",
            "relationship": "spouse",
            "phone_number": "+254712345678",
        }

        response = api_client.post(
            f"/api/patients/{sample_patient.id}/emergency-contacts/",
            data,
            format="json",
        )

        assert response.status_code == 401
