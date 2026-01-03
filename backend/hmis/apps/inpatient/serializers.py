"""
Serializers for the inpatient app.
"""

from rest_framework import serializers

from .models import (
    Ward,
    Bed,
    AdmissionRecommendation,
    Admission,
    WardRound,
    NursingKardex,
    KardexShiftNote,
    KardexHandoverNote,
    ShiftHandover,
    Transfer,
    Discharge,
)


class WardSerializer(serializers.ModelSerializer):
    """Serializer for Ward model."""
    
    available_beds = serializers.ReadOnlyField()
    occupancy_rate = serializers.ReadOnlyField()
    ward_type_display = serializers.CharField(source='get_ward_type_display', read_only=True)
    
    class Meta:
        model = Ward
        fields = [
            'id',
            'name',
            'code',
            'ward_type',
            'ward_type_display',
            'floor',
            'capacity',
            'description',
            'is_active',
            'daily_rate',
            'available_beds',
            'occupancy_rate',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class BedSerializer(serializers.ModelSerializer):
    """Serializer for Bed model."""
    
    ward_name = serializers.CharField(source='ward.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    status_changed_by_username = serializers.CharField(
        source='status_changed_by.username',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = Bed
        fields = [
            'id',
            'ward',
            'ward_name',
            'bed_number',
            'status',
            'status_display',
            'notes',
            'status_changed_by',
            'status_changed_by_username',
            'status_changed_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'status_changed_at', 'created_at', 'updated_at']


class AdmissionRecommendationSerializer(serializers.ModelSerializer):
    """Serializer for AdmissionRecommendation model."""
    
    recommended_by_username = serializers.CharField(
        source='recommended_by.username',
        read_only=True
    )
    resolved_by_username = serializers.CharField(
        source='resolved_by.username',
        read_only=True,
        allow_null=True
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    urgency_display = serializers.CharField(source='get_urgency_display', read_only=True)
    is_expired = serializers.ReadOnlyField()
    
    class Meta:
        model = AdmissionRecommendation
        fields = [
            'id',
            'encounter',
            'recommended_by',
            'recommended_by_username',
            'reason',
            'provisional_diagnosis',
            'provisional_diagnosis_text',
            'urgency',
            'urgency_display',
            'preferred_ward_type',
            'status',
            'status_display',
            'expires_at',
            'resolved_at',
            'resolved_by',
            'resolved_by_username',
            'decline_reason',
            'is_expired',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'status',
            'resolved_at',
            'resolved_by',
            'created_at',
            'updated_at',
        ]


class AdmissionSerializer(serializers.ModelSerializer):
    """Serializer for Admission model."""
    
    patient_name = serializers.SerializerMethodField()
    admitting_officer_username = serializers.CharField(
        source='admitting_officer.username',
        read_only=True
    )
    attending_doctor_username = serializers.CharField(
        source='attending_doctor.username',
        read_only=True
    )
    ward_name = serializers.CharField(source='ward.name', read_only=True)
    bed_number = serializers.CharField(source='bed.bed_number', read_only=True)
    admission_status_display = serializers.CharField(
        source='get_admission_status_display',
        read_only=True
    )
    payer_type_display = serializers.CharField(
        source='get_payer_type_display',
        read_only=True
    )
    length_of_stay = serializers.ReadOnlyField()
    
    class Meta:
        model = Admission
        fields = [
            'id',
            'admission_number',
            'patient',
            'patient_name',
            'opd_encounter',
            'ipd_encounter',
            'recommendation',
            'admission_date',
            'admitting_diagnosis',
            'admitting_diagnosis_text',
            'admitting_officer',
            'admitting_officer_username',
            'attending_doctor',
            'attending_doctor_username',
            'ward',
            'ward_name',
            'bed',
            'bed_number',
            'admission_status',
            'admission_status_display',
            'payer_type',
            'payer_type_display',
            'insurance_details',
            'length_of_stay',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'admission_number',
            'admission_status',
            'created_at',
            'updated_at',
        ]
    
    def get_patient_name(self, obj):
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"
