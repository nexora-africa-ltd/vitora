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

from .models import ERBed, Escalation, TriageAssessment, TriageQueue, TriageVitalThreshold, WaitTimeBreach, WaitingQueue
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
    encounter_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    reason_for_visit = serializers.CharField(required=False, allow_blank=True, default="")
    priority_hint = serializers.CharField(required=False, allow_blank=True, default="")
    create_encounter = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = WaitingQueue
        fields = ["patient_id", "encounter_id", "reason_for_visit", "priority_hint", "create_encounter", "notes"]

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

    def validate_encounter_id(self, value):
        """Validate that the encounter exists if provided."""
        if value is None:
            return value
        try:
            Encounter.objects.get(pk=value)
        except Encounter.DoesNotExist:
            raise serializers.ValidationError("Encounter not found.")
        return value

    def create(self, validated_data):
        patient_id = validated_data.pop("patient_id")
        encounter_id = validated_data.pop("encounter_id", None)
        create_encounter = validated_data.pop("create_encounter", True)

        patient = Patient.objects.get(pk=patient_id)
        request = self.context.get("request")

        # Use existing encounter if provided, otherwise create if requested
        encounter = None
        if encounter_id:
            encounter = Encounter.objects.get(pk=encounter_id)
        elif create_encounter:
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
    patient_gender = serializers.CharField(source="encounter.patient.gender", read_only=True)
    encounter_mrn = serializers.CharField(source="encounter.patient.mrn", read_only=True)
    assigned_clinician_name = serializers.SerializerMethodField()
    assigned_clinic_name = serializers.CharField(source="assigned_clinic.name", read_only=True, allow_null=True)
    routing_destination = serializers.CharField(read_only=True)
    alerts = serializers.SerializerMethodField()  # Handle legacy string format conversion
    vitals = serializers.SerializerMethodField()
    wait_time_minutes = serializers.SerializerMethodField()
    is_wait_time_exceeded = serializers.SerializerMethodField()
    triaged_by_name = serializers.CharField(source="triaged_by.get_full_name", read_only=True)

    # Vital sign fields - output as numbers instead of strings
    spo2 = serializers.FloatField(allow_null=True, required=False)
    temperature = serializers.FloatField(allow_null=True, required=False)

    class Meta:
        model = TriageAssessment
        fields = [
            "id",
            "encounter",
            "encounter_mrn",
            "patient_name",
            "patient_mrn",
            "patient_age",
            "patient_gender",
            "chief_complaint",
            "chief_complaint_category",
            "pain_score",
            "mental_status",
            "mobility",
            "arrival_mode",
            "referring_facility_name",
            "allergies_noted",
            "spo2",
            "heart_rate",
            "systolic_bp",
            "diastolic_bp",
            "temperature",
            "respiratory_rate",
            "weight",
            "height",
            "triage_category",
            "auto_calculated_category",
            "category_override_reason",
            "assigned_area",
            "assigned_clinic",
            "assigned_clinic_name",
            "routing_destination",
            "assigned_clinician",
            "assigned_clinician_name",
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
        read_only_fields = ["auto_calculated_category", "alerts", "triaged_by", "assigned_clinic_name", "routing_destination"]

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
        if obj.height is not None:
            vitals["height"] = str(obj.height)

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

    def get_assigned_clinician_name(self, obj) -> str | None:
        """Get the full name of the assigned clinician."""
        if obj.assigned_clinician:
            return obj.assigned_clinician.get_full_name() or obj.assigned_clinician.username
        return None

    def get_alerts(self, obj) -> list:
        """
        Get alerts in structured format, converting legacy string alerts if needed.

        Legacy format: ['CRITICAL: Message here', 'WARNING: Another message']
        New format: [{'id': 'uuid', 'severity': 'CRITICAL', 'vital_type': 'GENERAL', ...}]
        """
        import uuid

        alerts = obj.alerts or []

        if not alerts:
            return []

        # Check if already in new structured format
        if isinstance(alerts[0], dict) and "id" in alerts[0]:
            return alerts

        # Convert legacy string alerts to structured format
        converted = []
        for alert_str in alerts:
            if not isinstance(alert_str, str):
                # Already a dict but missing 'id' - add it
                if isinstance(alert_str, dict):
                    if "id" not in alert_str:
                        alert_str["id"] = str(uuid.uuid4())
                    converted.append(alert_str)
                continue

            # Parse legacy string format: "SEVERITY: Message"
            severity = "WARNING"
            vital_type = "GENERAL"
            message = alert_str

            if alert_str.startswith("CRITICAL:"):
                severity = "CRITICAL"
                message = alert_str[len("CRITICAL:") :].strip()
            elif alert_str.startswith("WARNING:"):
                severity = "WARNING"
                message = alert_str[len("WARNING:") :].strip()

            # Try to infer vital_type from message
            message_lower = message.lower()
            if "spo2" in message_lower or "oxygen" in message_lower or "hypoxemia" in message_lower:
                vital_type = "SPO2"
            elif "blood pressure" in message_lower or "hypertension" in message_lower or "hypotension" in message_lower or "map" in message_lower:
                vital_type = "SYSTOLIC_BP"
            elif "heart rate" in message_lower or "bradycardia" in message_lower or "tachycardia" in message_lower:
                vital_type = "HEART_RATE"
            elif "temperature" in message_lower or "fever" in message_lower or "hypothermia" in message_lower:
                vital_type = "TEMPERATURE"
            elif "respiratory" in message_lower or "breathing" in message_lower:
                vital_type = "RESPIRATORY_RATE"
            elif "mental" in message_lower or "avpu" in message_lower or "unresponsive" in message_lower or "responds" in message_lower:
                vital_type = "MENTAL_STATUS"
            elif "pain" in message_lower:
                vital_type = "PAIN_SCORE"

            converted.append({
                "id": str(uuid.uuid4()),
                "severity": severity,
                "vital_type": vital_type,
                "message": message,
                "value": 0,  # Cannot be recovered from string, use 0 as placeholder
                "threshold": 0,  # Cannot be recovered from string, use 0 as placeholder
            })

        return converted


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
    height = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal("0"),
        max_value=Decimal("300"),
        coerce_to_string=False,
    )

    # Make assigned_area optional (blank allowed for clinic routing)
    assigned_area = serializers.ChoiceField(
        choices=TriageAssessment.ASSIGNED_AREA_CHOICES,
        required=False,
        allow_blank=True,
        allow_null=True,
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
            "referring_facility_name",
            "allergies_noted",
            "spo2",
            "heart_rate",
            "systolic_bp",
            "diastolic_bp",
            "temperature",
            "respiratory_rate",
            "weight",
            "height",
            "triage_category",
            "auto_calculated_category",
            "category_override_reason",
            "assigned_area",
            "assigned_clinic",
            "assigned_clinician",
            "arrival_time",
            "triage_start_time",
            "triage_end_time",
        ]
        extra_kwargs = {
            "assigned_clinic": {"required": False, "allow_null": True},
        }

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
        """Validate triage assessment data.

        - Ensure referral facility name provided when arrival_mode is REFERRAL
        - Ensure override reason provided if category differs from auto-calculated
        - Ensure either assigned_area OR assigned_clinic is provided (not both)
        """
        # ========================================================================
        # Referral Validation: referring_facility_name required if arrival_mode is REFERRAL
        # ========================================================================
        arrival_mode = data.get("arrival_mode", "WALK_IN")
        referring_facility_name = data.get("referring_facility_name", "")

        if arrival_mode == "REFERRAL" and not referring_facility_name.strip():
            raise serializers.ValidationError(
                {
                    "referring_facility_name": "Referring facility name is required when arrival mode is 'Referral from another facility'.",
                }
            )

        # ========================================================================
        # Routing Validation: Either assigned_area OR assigned_clinic required
        # ========================================================================
        assigned_area = data.get("assigned_area")
        assigned_clinic = data.get("assigned_clinic")

        has_area = bool(assigned_area) and assigned_area.strip() if isinstance(assigned_area, str) else bool(assigned_area)
        has_clinic = assigned_clinic is not None

        if not has_area and not has_clinic:
            raise serializers.ValidationError(
                {
                    "assigned_area": "Either 'assigned_area' (for ER zones) or 'assigned_clinic' (for clinics) must be provided.",
                    "assigned_clinic": "Either 'assigned_area' (for ER zones) or 'assigned_clinic' (for clinics) must be provided.",
                }
            )

        if has_area and has_clinic:
            raise serializers.ValidationError(
                {
                    "assigned_area": "Cannot set both 'assigned_area' and 'assigned_clinic'. Choose one routing option.",
                    "assigned_clinic": "Cannot set both 'assigned_area' and 'assigned_clinic'. Choose one routing option.",
                }
            )

        # Clear the other field if one is set
        if has_clinic:
            data["assigned_area"] = ""
        if has_area:
            data["assigned_clinic"] = None

        # ========================================================================
        # Category Override Validation
        # ========================================================================
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
        If assigned_clinic is provided, auto-creates a ClinicVisit in the clinic queue.
        """
        from datetime import date

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
        user = None
        if request and hasattr(request, "user"):
            user = request.user
            validated_data["triaged_by"] = user

        # Create the assessment
        assessment = TriageAssessment.objects.create(**validated_data)

        # If assigned_clinic is provided, auto-create ClinicVisit
        assigned_clinic = validated_data.get("assigned_clinic")
        if assigned_clinic:
            from hmis.apps.clinics.models import ClinicSession, ClinicVisit

            # Map triage category to clinic priority
            triage_to_priority = {
                "RED": "EMERGENCY",
                "ORANGE": "URGENT",
                "YELLOW": "PRIORITY",
                "GREEN": "STANDARD",
                "BLUE": "NON_URGENT",
            }
            priority = triage_to_priority.get(assessment.triage_category, "STANDARD")

            # Get or create today's session for the clinic
            session, _ = ClinicSession.objects.get_or_create(
                clinic=assigned_clinic,
                session_date=date.today(),
                defaults={"status": "OPEN"},
            )

            # Create clinic visit
            ClinicVisit.objects.create(
                session=session,
                patient=encounter.patient,
                triage_assessment=assessment,
                visit_type="NEW",
                source="TRIAGE",
                chief_complaint=assessment.chief_complaint,
                priority=priority,
                notes="",
                registered_by=user,
            )
        else:
            # Add to triage queue (for ER areas)
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
    assigned_clinic = serializers.IntegerField(source="triage_assessment.assigned_clinic_id", read_only=True, allow_null=True)
    assigned_clinic_name = serializers.CharField(source="triage_assessment.assigned_clinic.name", read_only=True, allow_null=True)
    routing_destination = serializers.CharField(source="triage_assessment.routing_destination", read_only=True)
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
            "assigned_clinic",
            "assigned_clinic_name",
            "routing_destination",
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
        """Get human-readable area name or clinic name."""
        # If assigned to a clinic, return clinic name
        if obj.triage_assessment.assigned_clinic:
            return obj.triage_assessment.assigned_clinic.name

        # Otherwise return the ER area display name
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
        return area_labels.get(area, area or "Not assigned")

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


# =============================================================================
# ER BED BOARD SERIALIZERS (Phase 3)
# =============================================================================


class ERBedSerializer(serializers.ModelSerializer):
    """Full ER bed detail serializer."""

    zone_display = serializers.CharField(source="get_zone_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    patient_name = serializers.CharField(read_only=True)
    patient_mrn = serializers.CharField(read_only=True)
    triage_category = serializers.CharField(read_only=True)
    occupied_duration_minutes = serializers.IntegerField(read_only=True)
    is_available = serializers.BooleanField(read_only=True)

    class Meta:
        model = ERBed
        fields = [
            "id",
            "zone",
            "zone_display",
            "bed_number",
            "status",
            "status_display",
            "current_patient",
            "patient_name",
            "patient_mrn",
            "current_triage_assessment",
            "triage_category",
            "occupied_duration_minutes",
            "is_available",
            "notes",
            "status_changed_at",
            "status_changed_by",
            "created_at",
        ]
        read_only_fields = [
            "status_changed_at",
            "status_changed_by",
            "created_at",
        ]


class ERBedListSerializer(serializers.ModelSerializer):
    """Compact serializer for bed board grid display."""

    patient_name = serializers.CharField(read_only=True)
    patient_mrn = serializers.CharField(read_only=True)
    triage_category = serializers.CharField(read_only=True)
    occupied_duration_minutes = serializers.IntegerField(read_only=True)
    is_available = serializers.BooleanField(read_only=True)

    class Meta:
        model = ERBed
        fields = [
            "id",
            "zone",
            "bed_number",
            "status",
            "current_patient",
            "patient_name",
            "patient_mrn",
            "triage_category",
            "occupied_duration_minutes",
            "is_available",
        ]


class ERBedCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating ER beds."""

    class Meta:
        model = ERBed
        fields = ["zone", "bed_number", "status", "notes"]


class ERBedAssignPatientSerializer(serializers.Serializer):
    """Serializer for assigning a patient to an ER bed."""

    patient = serializers.PrimaryKeyRelatedField(
        queryset=Patient.objects.all(),
        help_text="Patient ID to assign to this bed",
    )
    triage_assessment = serializers.PrimaryKeyRelatedField(
        queryset=TriageAssessment.objects.all(),
        required=False,
        allow_null=True,
        help_text="Optional triage assessment ID for the patient",
    )


class ERBedReleaseSerializer(serializers.Serializer):
    """Serializer for releasing a patient from an ER bed."""

    mark_cleaning = serializers.BooleanField(
        default=True,
        help_text="If true, transition bed to CLEANING; otherwise mark AVAILABLE immediately",
    )


class ERBedUpdateStatusSerializer(serializers.Serializer):
    """Serializer for updating bed status (mark available, out of service)."""

    status = serializers.ChoiceField(
        choices=["AVAILABLE", "OUT_OF_SERVICE"],
        help_text="New bed status",
    )
    reason = serializers.CharField(
        required=False,
        default="",
        help_text="Reason for status change (used for OUT_OF_SERVICE)",
    )


class ERBedBoardSummarySerializer(serializers.Serializer):
    """Serializer for the bed board summary response."""

    zone = serializers.CharField()
    zone_display = serializers.CharField()
    total_beds = serializers.IntegerField()
    available = serializers.IntegerField()
    occupied = serializers.IntegerField()
    cleaning = serializers.IntegerField()
    out_of_service = serializers.IntegerField()
    occupancy_rate = serializers.FloatField()


# =============================================================================
# Phase 4: Auto-Escalation & Alerts Serializers
# =============================================================================


class WaitTimeBreachSerializer(serializers.ModelSerializer):
    """Read serializer for wait time breach alerts."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()

    class Meta:
        model = WaitTimeBreach
        fields = [
            "id",
            "queue_entry",
            "triage_assessment",
            "patient",
            "patient_name",
            "patient_mrn",
            "triage_category",
            "severity",
            "target_wait_minutes",
            "actual_wait_minutes",
            "assigned_area",
            "status",
            "acknowledged_by",
            "acknowledged_at",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_patient_mrn(self, obj) -> str:
        return obj.patient.mrn


class WaitTimeBreachAcknowledgeSerializer(serializers.Serializer):
    """Serializer for acknowledging a wait time breach."""

    notes = serializers.CharField(
        required=False,
        default="",
        help_text="Optional notes when acknowledging",
    )


class EscalationSerializer(serializers.ModelSerializer):
    """Read serializer for escalation records."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    escalated_by_name = serializers.SerializerMethodField()
    escalation_type_display = serializers.CharField(
        source="get_escalation_type_display", read_only=True
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )

    class Meta:
        model = Escalation
        fields = [
            "id",
            "queue_entry",
            "triage_assessment",
            "patient",
            "patient_name",
            "patient_mrn",
            "escalation_type",
            "escalation_type_display",
            "reason",
            "status",
            "status_display",
            "wait_time_at_escalation",
            "triage_category",
            "assigned_area",
            "escalated_by",
            "escalated_by_name",
            "resolved_by",
            "resolved_at",
            "resolution_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_patient_mrn(self, obj) -> str:
        return obj.patient.mrn

    def get_escalated_by_name(self, obj) -> str:
        if obj.escalated_by:
            return f"{obj.escalated_by.first_name} {obj.escalated_by.last_name}".strip() or obj.escalated_by.username
        return ""


class EscalationCreateSerializer(serializers.Serializer):
    """Serializer for creating an escalation from a queue entry."""

    escalation_type = serializers.ChoiceField(
        choices=Escalation.ESCALATION_TYPE_CHOICES,
        help_text="Type of escalation",
    )
    reason = serializers.CharField(
        help_text="Reason for escalation",
    )


class EscalationResolveSerializer(serializers.Serializer):
    """Serializer for resolving an escalation."""

    resolution_notes = serializers.CharField(
        required=False,
        default="",
        help_text="Optional resolution notes",
    )
