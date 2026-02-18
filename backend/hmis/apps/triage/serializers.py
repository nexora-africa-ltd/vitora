"""
Serializers for triage app.

Sprint 1.5-1.6 Track E: Triage Module MVP
"""


from decimal import Decimal
from typing import Optional

from django.utils import timezone
from rest_framework import serializers

from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient

from .models import TriageAssessment, TriageQueue, TriageVitalThreshold, WaitingQueue
from .services import TriageCategoryCalculator

# =============================================================================
# WAITING QUEUE SERIALIZERS
# =============================================================================


class WaitingQueueSerializer(serializers.ModelSerializer):
    """Serializer for waiting queue entries (read)."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    patient_age = serializers.SerializerMethodField()
    patient_gender = serializers.CharField(source="patient.gender", read_only=True)
    wait_time_minutes = serializers.SerializerMethodField()

    class Meta:
        model = WaitingQueue
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_mrn",
            "patient_age",
            "patient_gender",
            "encounter",
            "check_in_time",
            "reason_for_visit",
            "status",
            "priority_hint",
            "notes",
            "wait_time_minutes",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_patient_age(self, obj) -> Optional[int]:
        if hasattr(obj.patient, "age"):
            return obj.patient.age
        return None

    def get_wait_time_minutes(self, obj) -> int:
        delta = timezone.now() - obj.check_in_time
        return int(delta.total_seconds() / 60)


class WaitingQueueCreateSerializer(serializers.ModelSerializer):
    """Serializer for checking in a patient (creating waiting queue entry)."""

    patient_id = serializers.IntegerField(write_only=True)
    reason_for_visit = serializers.CharField(required=False, allow_blank=True, default="")
    priority_hint = serializers.CharField(required=False, allow_blank=True, default="")
    create_encounter = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = WaitingQueue
        fields = ["patient_id", "reason_for_visit", "priority_hint", "create_encounter", "notes"]

    def validate_patient_id(self, value):
        try:
            patient = Patient.objects.get(pk=value)
        except Patient.DoesNotExist:
            raise serializers.ValidationError("Patient not found.")

        # Check if patient is already in waiting queue
        existing = WaitingQueue.objects.filter(
            patient=patient, status__in=["WAITING_TRIAGE", "IN_TRIAGE"]
        ).first()
        if existing:
            raise serializers.ValidationError(
                f"Patient is already in the waiting queue (checked in at {existing.check_in_time.strftime('%H:%M')})."
            )

        return value

    def create(self, validated_data):
        patient_id = validated_data.pop("patient_id")
        create_encounter = validated_data.pop("create_encounter", True)

        patient = Patient.objects.get(pk=patient_id)
        request = self.context.get("request")

        # Create encounter if requested
        encounter = None
        if create_encounter:
            encounter = Encounter.objects.create(
                patient=patient,
                encounter_type="OPD",  # Default to OPD
                encounter_date=timezone.now().date(),
                chief_complaint=validated_data.get("reason_for_visit", "Check-in"),
                status="CREATED",
            )

        # Create waiting queue entry
        waiting_entry = WaitingQueue.objects.create(
            patient=patient,
            encounter=encounter,
            check_in_time=timezone.now(),
            checked_in_by=request.user if request else None,
            **validated_data,
        )

        return waiting_entry


# =============================================================================
# TRIAGE VITAL THRESHOLD SERIALIZERS
# =============================================================================


class TriageVitalThresholdSerializer(serializers.ModelSerializer):
    """Serializer for vital thresholds."""

    class Meta:
        model = TriageVitalThreshold
        fields = "__all__"


class TriageAssessmentSerializer(serializers.ModelSerializer):
    """Serializer for TriageAssessment model."""

    patient_name = serializers.CharField(source="encounter.patient.full_name", read_only=True)
    patient_mrn = serializers.CharField(source="encounter.patient.mrn", read_only=True)
    patient_age = serializers.IntegerField(source="encounter.patient.age", read_only=True)
    vitals = serializers.SerializerMethodField()
    wait_time_minutes = serializers.SerializerMethodField()
    is_wait_time_exceeded = serializers.SerializerMethodField()
    triaged_by_name = serializers.CharField(source="triaged_by.get_full_name", read_only=True)

    class Meta:
        model = TriageAssessment
        fields = [
            "id",
            "encounter",
            "patient_name",
            "patient_mrn",
            "patient_age",
            "chief_complaint",
            "chief_complaint_category",
            "pain_score",
            "mental_status",
            "mobility",
            "arrival_mode",
            "allergies_noted",
            "spo2",
            "heart_rate",
            "systolic_bp",
            "diastolic_bp",
            "temperature",
            "respiratory_rate",
            "triage_category",
            "auto_calculated_category",
            "category_override_reason",
            "assigned_area",
            "assigned_clinician",
            "arrival_time",
            "triage_start_time",
            "triage_end_time",
            "seen_by_clinician_time",
            "alerts",
            "vitals",
            "wait_time_minutes",
            "is_wait_time_exceeded",
            "triaged_by",
            "triaged_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["auto_calculated_category", "alerts", "triaged_by"]

    def get_vitals(self, obj) -> dict:
        """Get vitals captured at triage (fallback to encounter vitals if needed)."""
        vitals = {}

        if obj.spo2 is not None:
            vitals["spo2"] = str(obj.spo2)
        if obj.heart_rate is not None:
            vitals["heart_rate"] = obj.heart_rate
        if obj.systolic_bp is not None and obj.diastolic_bp is not None:
            vitals["blood_pressure"] = f"{obj.systolic_bp}/{obj.diastolic_bp}"
        if obj.temperature is not None:
            vitals["temperature"] = str(obj.temperature)
        if obj.respiratory_rate is not None:
            vitals["respiratory_rate"] = obj.respiratory_rate
        if obj.weight is not None:
            vitals["weight"] = str(obj.weight)

        if vitals:
            return vitals

        encounter = obj.encounter
        if not encounter:
            return {}

        if hasattr(encounter, "spo2") and encounter.spo2 is not None:
            vitals["spo2"] = str(encounter.spo2)
        if hasattr(encounter, "pulse") and encounter.pulse is not None:
            vitals["heart_rate"] = encounter.pulse
        if hasattr(encounter, "blood_pressure") and encounter.blood_pressure:
            vitals["blood_pressure"] = encounter.blood_pressure
        if hasattr(encounter, "temperature") and encounter.temperature is not None:
            vitals["temperature"] = str(encounter.temperature)
        if hasattr(encounter, "respiratory_rate") and encounter.respiratory_rate is not None:
            vitals["respiratory_rate"] = encounter.respiratory_rate

        return vitals

    def get_wait_time_minutes(self, obj) -> int:
        """Get calculated wait time in minutes."""
        return obj.get_wait_time_minutes()

    def get_is_wait_time_exceeded(self, obj) -> bool:
        """Check if wait time exceeded target."""
        return obj.is_wait_time_exceeded()


class TriageAssessmentCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating triage assessments.

    Time fields behavior:
    - arrival_time: Set by frontend (when patient arrived/checked in)
    - triage_start_time: Auto-set to now when assessment is created
    - triage_end_time: Auto-set when triage is completed via complete action

    These time fields are read-only for regular users (only editable by admins).
    """

    # Make triage_category optional - will be auto-calculated if not provided
    triage_category = serializers.ChoiceField(
        choices=TriageAssessment.TRIAGE_CATEGORY_CHOICES,
        required=False,
        allow_null=True,
    )

    # Frontend-calculated category for comparison (not stored)
    # This allows frontend to send what it showed as "suggested" so we can
    # properly detect if user overrode it vs selected the suggestion
    auto_calculated_category = serializers.ChoiceField(
        choices=TriageAssessment.TRIAGE_CATEGORY_CHOICES,
        required=False,
        allow_null=True,
        write_only=True,
    )

    # Time fields - arrival_time comes from frontend, others are auto-set
    triage_start_time = serializers.DateTimeField(read_only=True)
    triage_end_time = serializers.DateTimeField(read_only=True)

    # Vitals (all optional but validated when provided)
    spo2 = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal("0"),
        max_value=Decimal("100"),
        coerce_to_string=False,
    )
    heart_rate = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=300
    )
    systolic_bp = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=300
    )
    diastolic_bp = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=200
    )
    temperature = serializers.DecimalField(
        max_digits=4,
        decimal_places=1,
        required=False,
        allow_null=True,
        min_value=Decimal("30"),
        max_value=Decimal("45"),
        coerce_to_string=False,
    )
    respiratory_rate = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=60
    )
    weight = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal("0"),
        max_value=Decimal("500"),
        coerce_to_string=False,
    )

    class Meta:
        model = TriageAssessment
        fields = [
            "encounter",
            "chief_complaint",
            "chief_complaint_category",
            "pain_score",
            "mental_status",
            "mobility",
            "arrival_mode",
            "allergies_noted",
            "spo2",
            "heart_rate",
            "systolic_bp",
            "diastolic_bp",
            "temperature",
            "respiratory_rate",
            "weight",
            "triage_category",
            "auto_calculated_category",
            "category_override_reason",
            "assigned_area",
            "assigned_clinician",
            "arrival_time",
            "triage_start_time",
            "triage_end_time",
        ]

    def _extract_vitals(self, data, encounter: Encounter | None) -> dict:
        """Extract vitals from incoming triage payload; fallback to encounter vitals."""
        vitals = {}

        if data.get("spo2") is not None:
            vitals["spo2"] = data.get("spo2")
        if data.get("heart_rate") is not None:
            vitals["heart_rate"] = data.get("heart_rate")
        if data.get("systolic_bp") is not None:
            vitals["systolic_bp"] = data.get("systolic_bp")
        if data.get("diastolic_bp") is not None:
            vitals["diastolic_bp"] = data.get("diastolic_bp")
        if data.get("temperature") is not None:
            vitals["temperature"] = data.get("temperature")
        if data.get("respiratory_rate") is not None:
            vitals["respiratory_rate"] = data.get("respiratory_rate")
        if data.get("weight") is not None:
            vitals["weight"] = data.get("weight")

        if vitals:
            return vitals

        if not encounter:
            return {}

        if hasattr(encounter, "spo2") and encounter.spo2 is not None:
            vitals["spo2"] = encounter.spo2
        if hasattr(encounter, "pulse") and encounter.pulse is not None:
            vitals["heart_rate"] = encounter.pulse
        if hasattr(encounter, "blood_pressure") and encounter.blood_pressure:
            bp_parts = encounter.blood_pressure.split("/")
            if len(bp_parts) == 2:
                try:
                    vitals["systolic_bp"] = int(bp_parts[0])
                    vitals["diastolic_bp"] = int(bp_parts[1])
                except ValueError:
                    pass
        if hasattr(encounter, "temperature") and encounter.temperature is not None:
            vitals["temperature"] = encounter.temperature
        if hasattr(encounter, "respiratory_rate") and encounter.respiratory_rate is not None:
            vitals["respiratory_rate"] = encounter.respiratory_rate

        return vitals

    def validate(self, data):
        """Ensure override reason provided if category differs from auto-calculated.

        The frontend sends auto_calculated_category to indicate what was shown
        to the user as the "suggested" category. We use this for comparison
        to determine if the user overrode the suggestion (requires reason) or
        accepted it (no reason needed).

        If frontend doesn't send auto_calculated_category, we fall back to
        calculating it server-side.
        """
        # Get user's selected category
        user_category = data.get("triage_category")
        if not user_category:
            # No category selected, will be auto-calculated in create()
            return data

        # Get the auto-calculated category - prefer frontend's value
        frontend_auto_category = data.get("auto_calculated_category")

        if frontend_auto_category:
            # Use frontend's auto-calculated category for comparison
            # This ensures consistency with what the user saw in the UI
            auto_category = frontend_auto_category
        else:
            # Fall back to server-side calculation
            encounter = data.get("encounter")
            if not encounter:
                return data

            vitals = self._extract_vitals(data, encounter)

            # Calculate suggested category
            calculator = TriageCategoryCalculator()
            auto_category, _ = calculator.calculate(
                vitals=vitals,
                mental_status=data.get("mental_status"),
                chief_complaint_category=data.get("chief_complaint_category"),
                pain_score=data.get("pain_score"),
                mobility=data.get("mobility"),
            )

        # Check if user is overriding
        if user_category != auto_category:
            # Override - require reason
            if not data.get("category_override_reason"):
                raise serializers.ValidationError(
                    {
                        "category_override_reason": "Override reason required when changing category from auto-calculated value."
                    }
                )

        return data

    def create(self, validated_data):
        """Auto-calculate category, generate alerts, add to queue.

        Auto-sets triage_start_time to now (when triage assessment begins).
        """
        from django.utils import timezone

        # Get the encounter
        encounter = validated_data["encounter"]

        # Remove frontend's auto_calculated_category (used only for validation)
        # We'll calculate and set the backend's value below
        validated_data.pop("auto_calculated_category", None)

        # Auto-set triage_start_time to now
        validated_data["triage_start_time"] = timezone.now()

        vitals = self._extract_vitals(validated_data, encounter)

        # Calculate category and alerts
        calculator = TriageCategoryCalculator()
        auto_category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status=validated_data.get("mental_status"),
            chief_complaint_category=validated_data.get("chief_complaint_category"),
            pain_score=validated_data.get("pain_score"),
            mobility=validated_data.get("mobility"),
        )

        # Set auto-calculated category and alerts
        validated_data["auto_calculated_category"] = auto_category
        validated_data["alerts"] = alerts

        # If user didn't specify category, use auto-calculated
        if "triage_category" not in validated_data or not validated_data["triage_category"]:
            validated_data["triage_category"] = auto_category

        # Set triaged_by from request
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["triaged_by"] = request.user

        # Create the assessment
        assessment = TriageAssessment.objects.create(**validated_data)

        # Add to queue
        from .models import TriageQueue

        TriageQueue.objects.create(
            triage_assessment=assessment,
            position=0,  # Will be recalculated by queue ordering
            status="WAITING",
        )

        return assessment


class TriageQueueSerializer(serializers.ModelSerializer):
    """Serializer for triage queue entries with flattened data for frontend display."""

    # Flattened patient fields
    patient_id = serializers.IntegerField(
        source="triage_assessment.encounter.patient.id", read_only=True
    )
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(
        source="triage_assessment.encounter.patient.mrn", read_only=True
    )
    patient_age = serializers.SerializerMethodField()
    patient_gender = serializers.CharField(
        source="triage_assessment.encounter.patient.gender", read_only=True
    )

    # Flattened triage assessment fields
    triage_category = serializers.CharField(
        source="triage_assessment.triage_category", read_only=True
    )
    chief_complaint_category = serializers.CharField(
        source="triage_assessment.chief_complaint_category", read_only=True
    )
    chief_complaint = serializers.CharField(
        source="triage_assessment.chief_complaint", read_only=True
    )
    assigned_area = serializers.CharField(source="triage_assessment.assigned_area", read_only=True)
    assigned_area_display = serializers.SerializerMethodField()
    arrival_time = serializers.DateTimeField(
        source="triage_assessment.arrival_time", read_only=True
    )
    triage_time = serializers.DateTimeField(
        source="triage_assessment.triage_start_time", read_only=True
    )
    wait_time_minutes = serializers.SerializerMethodField()
    alerts_count = serializers.SerializerMethodField()

    # Queue-specific fields
    called_by_name = serializers.CharField(
        source="called_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = TriageQueue
        fields = [
            "id",
            "patient_id",
            "patient_name",
            "patient_mrn",
            "patient_age",
            "patient_gender",
            "triage_category",
            "chief_complaint_category",
            "chief_complaint",
            "assigned_area",
            "assigned_area_display",
            "arrival_time",
            "triage_time",
            "wait_time_minutes",
            "alerts_count",
            "status",
            "position",
            "called_at",
            "called_by_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["position", "created_at", "updated_at"]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.triage_assessment.encounter.patient
        return f"{patient.first_name} {patient.last_name}"

    def get_patient_age(self, obj) -> int:
        """Get patient age in years."""
        patient = obj.triage_assessment.encounter.patient
        if hasattr(patient, "age"):
            return patient.age
        # Calculate age if not a property
        from datetime import date

        today = date.today()
        dob = patient.date_of_birth
        # Handle if dob is a string
        if isinstance(dob, str):
            from django.utils.dateparse import parse_date

            dob = parse_date(dob)
        if dob is None:
            return None
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    def get_assigned_area_display(self, obj) -> str:
        """Get human-readable area name."""
        area = obj.triage_assessment.assigned_area
        area_labels = {
            "OPD": "Outpatient Department",
            "ER_RESUS": "ER Resuscitation",
            "ER_ACUTE": "ER Acute",
            "ER_FAST_TRACK": "ER Fast Track",
            "OBSERVATION": "Observation",
            "TRAUMA": "Trauma",
            "PEDIATRIC_ER": "Pediatric ER",
            "MATERNITY": "Maternity",
            "SPECIALTY": "Specialty",
        }
        return area_labels.get(area, area)

    def get_wait_time_minutes(self, obj) -> int:
        """Calculate wait time in minutes since arrival."""
        arrival_time = obj.triage_assessment.arrival_time
        if not arrival_time:
            return 0
        from django.utils import timezone

        now = timezone.now()
        diff = now - arrival_time
        return int(diff.total_seconds() / 60)

    def get_alerts_count(self, obj) -> int:
        """Get count of active alerts."""
        alerts = obj.triage_assessment.alerts or []
        return len(alerts) if isinstance(alerts, list) else 0


class TriageCategoryCalculationSerializer(serializers.Serializer):
    """Serializer for category calculation request."""

    spo2 = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True, coerce_to_string=False
    )
    systolic_bp = serializers.IntegerField(required=False, allow_null=True)
    diastolic_bp = serializers.IntegerField(required=False, allow_null=True)
    heart_rate = serializers.IntegerField(required=False, allow_null=True)
    temperature = serializers.DecimalField(
        max_digits=4, decimal_places=1, required=False, allow_null=True, coerce_to_string=False
    )
    respiratory_rate = serializers.IntegerField(required=False, allow_null=True)
    mental_status = serializers.ChoiceField(choices=["A", "V", "P", "U"])
    chief_complaint_category = serializers.CharField()
    pain_score = serializers.IntegerField(
        min_value=0, max_value=10, required=False, allow_null=True
    )
    mobility = serializers.CharField(required=False, allow_null=True)

    def calculate_category(self):
        """Calculate triage category using the service."""
        vitals = {}

        if self.validated_data.get("spo2"):
            vitals["spo2"] = self.validated_data["spo2"]
        if self.validated_data.get("systolic_bp"):
            vitals["systolic_bp"] = self.validated_data["systolic_bp"]
        if self.validated_data.get("diastolic_bp"):
            vitals["diastolic_bp"] = self.validated_data["diastolic_bp"]
        if self.validated_data.get("heart_rate"):
            vitals["heart_rate"] = self.validated_data["heart_rate"]
        if self.validated_data.get("temperature"):
            vitals["temperature"] = self.validated_data["temperature"]
        if self.validated_data.get("respiratory_rate"):
            vitals["respiratory_rate"] = self.validated_data["respiratory_rate"]

        calculator = TriageCategoryCalculator()
        category, alerts = calculator.calculate(
            vitals=vitals,
            mental_status=self.validated_data["mental_status"],
            chief_complaint_category=self.validated_data["chief_complaint_category"],
            pain_score=self.validated_data.get("pain_score"),
            mobility=self.validated_data.get("mobility"),
        )

        return {
            "suggested_category": category,
            "alerts": alerts,
            "vitals": vitals,
        }
