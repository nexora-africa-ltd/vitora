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
