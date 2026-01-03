"""
Serializers for triage app.

Sprint 1.5-1.6 Track E: Triage Module MVP
"""

from rest_framework import serializers
from .models import TriageAssessment, TriageQueue, TriageVitalThreshold
from .services import TriageCategoryCalculator


class TriageVitalThresholdSerializer(serializers.ModelSerializer):
    """Serializer for vital thresholds."""

    class Meta:
        model = TriageVitalThreshold
        fields = '__all__'


class TriageAssessmentSerializer(serializers.ModelSerializer):
    """Serializer for TriageAssessment model."""

    patient_name = serializers.CharField(source='encounter.patient.full_name', read_only=True)
    patient_mrn = serializers.CharField(source='encounter.patient.mrn', read_only=True)
    patient_age = serializers.IntegerField(source='encounter.patient.age', read_only=True)
    vitals = serializers.SerializerMethodField()
    wait_time_minutes = serializers.SerializerMethodField()
    is_wait_time_exceeded = serializers.SerializerMethodField()
    triaged_by_name = serializers.CharField(source='triaged_by.get_full_name', read_only=True)

    class Meta:
        model = TriageAssessment
        fields = [
            'id', 'encounter', 'patient_name', 'patient_mrn', 'patient_age',
            'chief_complaint', 'chief_complaint_category', 'pain_score',
            'mental_status', 'mobility', 'arrival_mode', 'allergies_noted',
            'triage_category', 'auto_calculated_category', 'category_override_reason',
            'assigned_area', 'assigned_clinician',
            'arrival_time', 'triage_start_time', 'triage_end_time', 'seen_by_clinician_time',
            'alerts', 'vitals', 'wait_time_minutes', 'is_wait_time_exceeded',
            'triaged_by', 'triaged_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['auto_calculated_category', 'alerts', 'triaged_by']

    def get_vitals(self, obj):
        """Get vitals from associated encounter."""
        encounter = obj.encounter
        vitals = {}
        
        if hasattr(encounter, 'spo2') and encounter.spo2:
            vitals['spo2'] = str(encounter.spo2)
        if hasattr(encounter, 'pulse') and encounter.pulse:
            vitals['heart_rate'] = encounter.pulse
        if hasattr(encounter, 'blood_pressure') and encounter.blood_pressure:
            vitals['blood_pressure'] = encounter.blood_pressure
        if hasattr(encounter, 'temperature') and encounter.temperature:
            vitals['temperature'] = str(encounter.temperature)
        if hasattr(encounter, 'respiratory_rate') and encounter.respiratory_rate:
            vitals['respiratory_rate'] = encounter.respiratory_rate
        
        return vitals

    def get_wait_time_minutes(self, obj):
        """Get calculated wait time in minutes."""
        return obj.get_wait_time_minutes()

    def get_is_wait_time_exceeded(self, obj):
        """Check if wait time exceeded target."""
        return obj.is_wait_time_exceeded()


class TriageAssessmentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating triage assessments."""
    
    # Make triage_category optional - will be auto-calculated if not provided
    triage_category = serializers.ChoiceField(
        choices=TriageAssessment.TRIAGE_CATEGORY_CHOICES,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = TriageAssessment
        fields = [
            'encounter', 'chief_complaint', 'chief_complaint_category', 'pain_score',
            'mental_status', 'mobility', 'arrival_mode', 'allergies_noted',
            'triage_category', 'category_override_reason',
            'assigned_area', 'assigned_clinician',
            'arrival_time', 'triage_start_time', 'triage_end_time',
        ]

    def validate(self, data):
        """Ensure override reason provided if category differs from auto-calculated."""
        # Calculate what the category should be
        encounter = data.get('encounter')
        
        if encounter:
            # Get vitals from encounter
            vitals = {}
            if hasattr(encounter, 'spo2') and encounter.spo2:
                vitals['spo2'] = encounter.spo2
            if hasattr(encounter, 'pulse') and encounter.pulse:
                vitals['heart_rate'] = encounter.pulse
            if hasattr(encounter, 'blood_pressure') and encounter.blood_pressure:
                # Parse blood pressure
                bp_parts = encounter.blood_pressure.split('/')
                if len(bp_parts) == 2:
                    try:
                        vitals['systolic_bp'] = int(bp_parts[0])
                        vitals['diastolic_bp'] = int(bp_parts[1])
                    except ValueError:
                        pass
            
            # Calculate suggested category
            calculator = TriageCategoryCalculator()
            auto_category, _ = calculator.calculate(
                vitals=vitals,
                mental_status=data.get('mental_status'),
                chief_complaint_category=data.get('chief_complaint_category'),
                pain_score=data.get('pain_score'),
                mobility=data.get('mobility'),
            )
            
            # Check if user is overriding
            user_category = data.get('triage_category')
            if user_category and user_category != auto_category:
                # Override - require reason
                if not data.get('category_override_reason'):
                    raise serializers.ValidationError({
                        'category_override_reason': 'Override reason required when changing category from auto-calculated value.'
                    })
        
        return data

    def create(self, validated_data):
        """Auto-calculate category, generate alerts, add to queue."""
        # Get the encounter
        encounter = validated_data['encounter']
        
        # Get vitals from encounter
        vitals = {}
        if hasattr(encounter, 'spo2') and encounter.spo2:
            vitals['spo2'] = encounter.spo2
        if hasattr(encounter, 'pulse') and encounter.pulse:
            vitals['heart_rate'] = encounter.pulse
        if hasattr(encounter, 'blood_pressure') and encounter.blood_pressure:
            bp_parts = encounter.blood_pressure.split('/')
            if len(bp_parts) == 2:
                try:
                    vitals['systolic_bp'] = int(bp_parts[0])
                    vitals['diastolic_bp'] = int(bp_parts[1])
                except ValueError:
                    pass
        
        # Calculate category and alerts
        calculator = TriageCategoryCalculator()
        auto_category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status=validated_data.get('mental_status'),
            chief_complaint_category=validated_data.get('chief_complaint_category'),
            pain_score=validated_data.get('pain_score'),
            mobility=validated_data.get('mobility'),
        )
        
        # Set auto-calculated category and alerts
        validated_data['auto_calculated_category'] = auto_category
        validated_data['alerts'] = alerts
        
        # If user didn't specify category, use auto-calculated
        if 'triage_category' not in validated_data or not validated_data['triage_category']:
            validated_data['triage_category'] = auto_category
        
        # Set triaged_by from request
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['triaged_by'] = request.user
        
        # Create the assessment
        assessment = TriageAssessment.objects.create(**validated_data)
        
        # Add to queue
        from .models import TriageQueue
        TriageQueue.objects.create(
            triage_assessment=assessment,
            position=0,  # Will be recalculated by queue ordering
            status='WAITING',
        )
        
        return assessment


class TriageQueueSerializer(serializers.ModelSerializer):
    """Serializer for triage queue entries."""

    assessment = TriageAssessmentSerializer(source='triage_assessment', read_only=True)

    class Meta:
        model = TriageQueue
        fields = ['id', 'assessment', 'position', 'status', 'called_at', 'called_by', 'notes', 'created_at', 'updated_at']
        read_only_fields = ['position', 'created_at', 'updated_at']


class TriageCategoryCalculationSerializer(serializers.Serializer):
    """Serializer for category calculation request."""

    spo2 = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    systolic_bp = serializers.IntegerField(required=False, allow_null=True)
    diastolic_bp = serializers.IntegerField(required=False, allow_null=True)
    heart_rate = serializers.IntegerField(required=False, allow_null=True)
    temperature = serializers.DecimalField(max_digits=4, decimal_places=1, required=False, allow_null=True)
    respiratory_rate = serializers.IntegerField(required=False, allow_null=True)
    mental_status = serializers.ChoiceField(choices=['A', 'V', 'P', 'U'])
    chief_complaint_category = serializers.CharField()
    pain_score = serializers.IntegerField(min_value=0, max_value=10, required=False, allow_null=True)
    mobility = serializers.CharField(required=False, allow_null=True)

    def calculate_category(self):
        """Calculate triage category using the service."""
        vitals = {}
        
        if self.validated_data.get('spo2'):
            vitals['spo2'] = self.validated_data['spo2']
        if self.validated_data.get('systolic_bp'):
            vitals['systolic_bp'] = self.validated_data['systolic_bp']
        if self.validated_data.get('diastolic_bp'):
            vitals['diastolic_bp'] = self.validated_data['diastolic_bp']
        if self.validated_data.get('heart_rate'):
            vitals['heart_rate'] = self.validated_data['heart_rate']
        if self.validated_data.get('temperature'):
            vitals['temperature'] = self.validated_data['temperature']
        if self.validated_data.get('respiratory_rate'):
            vitals['respiratory_rate'] = self.validated_data['respiratory_rate']
        
        calculator = TriageCategoryCalculator()
        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status=self.validated_data['mental_status'],
            chief_complaint_category=self.validated_data['chief_complaint_category'],
            pain_score=self.validated_data.get('pain_score'),
            mobility=self.validated_data.get('mobility'),
        )
        
        return {
            'category': category,
            'alerts': alerts,
            'vitals': vitals,
        }
