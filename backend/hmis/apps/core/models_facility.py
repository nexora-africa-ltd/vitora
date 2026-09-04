# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core models facility for Vitora HMIS.

What this file is for:
- Implement models facility logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from django.db import models
from django.utils import timezone

from hmis.apps.core.models_audit_sync import TimeStampedModel
from hmis.apps.core.pii import encrypted_pii_property
from hmis.apps.core.upload_validators import validate_image_upload as _validate_image_upload


class Facility(TimeStampedModel):
    """
    Healthcare facility with enabled service modules.

    Represents a physical healthcare facility registered on the Kenya Master
    Facility List (MFL).  The model captures:

    * **Identity** – MFL code, official name, KEPH level, and ownership type.
    * **Location** – Links to the Kenya three-tier administrative hierarchy
      (County → Sub-County → Ward).
    * **SHA integration** – Whether the facility is contracted by the Social
      Health Authority for claims processing.
    * **Capability modules** – Explicit boolean flags indicating which clinical
      service modules are enabled at this facility.  These flags drive the
      capability-based sidebar filtering in the web frontend so that users
      only see navigation items relevant to their facility's services.

    The ``modules`` property returns all capability flags as a dictionary,
    suitable for serialization in API responses.  The ``default_modules_for_level``
    class method provides sensible defaults when creating a new facility based
    on its KEPH level.
    """

    # ------------------------------------------------------------------
    # Choice Constants
    # ------------------------------------------------------------------

    class FacilityLevel(models.TextChoices):
        """
        Kenya Essential Package for Health (KEPH) facility levels.

        Level 1 – Community health units (no physical infrastructure).
        Level 2 – Dispensaries and clinics.
        Level 3 – Health centres and maternity/nursing homes.
        Level 4 – Sub-county and medium-sized hospitals.
        Level 5 – County referral hospitals.
        Level 6 – National referral hospitals.
        """

        LEVEL_1 = "1", "Level 1 – Community Unit"
        LEVEL_2 = "2", "Level 2 – Dispensary"
        LEVEL_3 = "3", "Level 3 – Health Centre"
        LEVEL_4 = "4", "Level 4 – Sub-County Hospital"
        LEVEL_5 = "5", "Level 5 – County Referral Hospital"
        LEVEL_6 = "6", "Level 6 – National Referral Hospital"

    class LevelSubtype(models.TextChoices):
        """Optional KEPH subtype suffix for levels that are split into bands."""

        A = "A", "A"
        B = "B", "B"
        C = "C", "C"

    class OwnershipType(models.TextChoices):
        """
        Facility ownership categories as defined by the Ministry of Health.

        GOK     – Government of Kenya (public) facilities.
        FBO     – Faith-Based Organization facilities.
        NGO     – Non-Governmental Organization facilities.
        PRIVATE – Private-practice / commercial facilities.
        """

        GOK = "GOK", "Government of Kenya"
        FBO = "FBO", "Faith-Based Organization"
        NGO = "NGO", "Non-Governmental Organization"
        PRIVATE = "PRIVATE", "Private Practice"

    class OperatingMode(models.TextChoices):
        """
        Top-level facility operating mode.

        Selecting a standalone mode cascades the relevant ``has_*`` module
        flags off (clinical workflow modules) and on (the chosen standalone
        module + billing + inventory). Switching back to FULL_HMIS does
        **not** auto-restore previous flags; admins must re-enable them or
        rely on KEPH-level defaults.
        """

        FULL_HMIS = "FULL_HMIS", "Full HMIS"
        STANDALONE_LAB = "STANDALONE_LAB", "Standalone Lab"
        STANDALONE_PHARMACY = "STANDALONE_PHARMACY", "Standalone Pharmacy"
        STANDALONE_IMAGING = "STANDALONE_IMAGING", "Standalone Imaging"
        STANDALONE_DIAGNOSTIC = "STANDALONE_DIAGNOSTIC", "Standalone Diagnostic Centre"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    organization = models.ForeignKey(
        "Organization",
        on_delete=models.PROTECT,
        related_name="facilities",
        null=True,
        blank=True,
        help_text="Parent organization (tenant) that owns this facility.",
    )
    mfl_code = models.CharField(
        max_length=20,
        unique=True,
        help_text="Kenya Master Facility List (MFL) code – the unique identifier "
        "assigned to every registered health facility by the MoH.",
    )
    facility_registry_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Generic national registry code for non-Kenya facilities.",
    )
    country_code = models.CharField(
        max_length=2,
        default="KE",
        help_text="ISO 3166-1 alpha-2 code for the facility country.",
    )
    name = models.CharField(
        max_length=200,
        help_text="Official facility name as registered on the MFL.",
    )
    level = models.CharField(
        max_length=1,
        choices=FacilityLevel.choices,
        help_text="KEPH level (1–6) determining the scope of services offered.",
    )
    level_subtype = models.CharField(
        max_length=1,
        choices=LevelSubtype.choices,
        blank=True,
        default="",
        help_text="Optional KEPH subtype band (e.g. A/B/C for Level 3/4 variants).",
    )
    ownership = models.CharField(
        max_length=20,
        choices=OwnershipType.choices,
        help_text="Ownership category (GOK, FBO, NGO, or Private).",
    )
    is_headquarters = models.BooleanField(
        default=False,
        help_text="Whether this is the main branch of the organization.",
    )
    branch_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Internal branch identifier within the organization.",
    )
    logo = models.ImageField(
        upload_to="facilities/logos/",
        null=True,
        blank=True,
        validators=[_validate_image_upload],
        help_text="Facility logo for branding. Falls back to organization logo if not set.",
    )

    # ------------------------------------------------------------------
    # Location (Kenya administrative hierarchy)
    # ------------------------------------------------------------------

    county = models.ForeignKey(
        "County",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="facilities",
        help_text="County where the facility is located.",
    )
    sub_county = models.ForeignKey(
        "SubCounty",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="facilities",
        help_text="Sub-county where the facility is located.",
    )
    region_state = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text="State/province/region for non-Kenya locations.",
    )
    district = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text="District/county equivalent for non-Kenya locations.",
    )
    locality = models.CharField(
        max_length=120,
        blank=True,
        default="",
        help_text="City/town/locality for non-Kenya locations.",
    )
    ward = models.ForeignKey(
        "Ward",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="facilities",
        help_text="Ward where the facility is located (optional).",
    )

    # ------------------------------------------------------------------
    # SHA (Social Health Authority) Registration
    # ------------------------------------------------------------------

    sha_contracted = models.BooleanField(
        default=False,
        help_text="Whether the facility is contracted by the Social Health "
        "Authority (SHA) for claims processing.",
    )
    sha_contract_expiry = models.DateField(
        null=True,
        blank=True,
        help_text="Date when the current SHA contract expires.",
    )
    sha_facility_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA-specific facility code used in claims submission.",
    )

    # Biometrics workstation — identifies the hardware server for fingerprint capture
    workstation_id = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Hardware Server workstation identifier for DHA biometric consent.",
    )

    # Biometrics agent — PII encrypted (Kenya DPA 2019 § 41)
    biometrics_agent_national_id_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted national ID of the biometrics agent.",
    )
    biometrics_agent_national_id = encrypted_pii_property("biometrics_agent_national_id")

    biometrics_enforced = models.BooleanField(
        default=False,
        help_text=(
            "When True, DHA requires biometric (fingerprint) consent for this "
            "facility — OTP-only consent is not allowed. Set by DHA compliance."
        ),
    )

    # ------------------------------------------------------------------
    # DHA Registry Cache (populated via ILM facility-search)
    # ------------------------------------------------------------------
    # Non-PII fields stored as plain columns for offline access.
    # PII fields (admin phone, email, ID) stored encrypted.

    dha_registry_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the DHA registry data was last fetched.",
    )
    dha_fid_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="DHA Facility ID code.",
    )
    dha_fr_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="DHA Facility Registration code.",
    )
    dha_license_status = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="License status from DHA (e.g. LICENSED).",
    )
    dha_license_number = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="License number from DHA.",
    )
    dha_license_expiry = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="License expiry date string from DHA.",
    )
    dha_operational_status = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Regulatory operational status from DHA.",
    )
    dha_sha_contract_status = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA contract status from DHA.",
    )
    dha_sha_contract_start = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="SHA contract start date string from DHA.",
    )
    dha_sha_contract_end = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="SHA contract end date string from DHA.",
    )
    dha_total_beds = models.PositiveIntegerField(
        default=0,
        help_text="Total bed capacity from DHA.",
    )
    dha_icu_beds = models.PositiveIntegerField(
        default=0,
        help_text="ICU bed count from DHA.",
    )
    dha_hdu_beds = models.PositiveIntegerField(
        default=0,
        help_text="HDU bed count from DHA.",
    )
    dha_facility_type = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Facility type from DHA.",
    )
    dha_keph_level = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="KEPH level from DHA.",
    )
    dha_ownership = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Ownership from DHA.",
    )
    dha_regulatory_body = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Regulatory body from DHA.",
    )

    # DHA PII fields — encrypted (admin contact, facility contact)
    dha_admin_name_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted DHA administrator name.",
    )
    dha_admin_phone_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted DHA administrator phone.",
    )
    dha_admin_email_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted DHA administrator email.",
    )
    dha_admin_id_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted DHA administrator national ID.",
    )
    dha_facility_phone_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted facility phone from DHA.",
    )
    dha_facility_email_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted facility email from DHA.",
    )

    # Property descriptors — transparent encrypt-on-write, decrypt-on-read
    dha_admin_name = encrypted_pii_property("dha_admin_name")
    dha_admin_phone = encrypted_pii_property("dha_admin_phone")
    dha_admin_email = encrypted_pii_property("dha_admin_email")
    dha_admin_id = encrypted_pii_property("dha_admin_id")
    dha_facility_phone = encrypted_pii_property("dha_facility_phone")
    dha_facility_email = encrypted_pii_property("dha_facility_email")

    # Full DHA response (non-PII subset) for UI rendering
    dha_registry_data = models.JSONField(
        null=True,
        blank=True,
        help_text="Cached DHA registry response with PII fields stripped.",
    )

    # ------------------------------------------------------------------
    # DHIS2 / KHIS Integration
    # ------------------------------------------------------------------

    dhis2_org_unit = models.CharField(
        max_length=11,
        blank=True,
        default="",
        help_text="DHIS2 Organisation Unit UID for this facility. "
        "Each facility has a unique 11-character UID in KHIS.",
    )

    # ------------------------------------------------------------------
    # Enabled Modules (Capability-Based Experience)
    # ------------------------------------------------------------------
    # Explicit booleans are used instead of a JSONField so that Django
    # can enforce type safety and queries remain straightforward
    # (e.g. ``Facility.objects.filter(has_laboratory=True)``).

    has_outpatient = models.BooleanField(
        default=True,
        help_text="Outpatient Department (OPD) services.",
    )
    has_inpatient = models.BooleanField(
        default=False,
        help_text="Inpatient (ward admission) services.",
    )
    has_emergency = models.BooleanField(
        default=False,
        help_text="Emergency / Casualty department.",
    )
    has_pharmacy = models.BooleanField(
        default=True,
        help_text="Pharmacy / dispensing services.",
    )
    has_laboratory = models.BooleanField(
        default=False,
        help_text="Laboratory / diagnostics services.",
    )
    has_imaging = models.BooleanField(
        default=False,
        help_text="Radiology / imaging services.",
    )
    has_theatre = models.BooleanField(
        default=False,
        help_text="Surgical theatre / operating room.",
    )
    has_dialysis = models.BooleanField(
        default=False,
        help_text="Renal dialysis unit.",
    )
    has_icu = models.BooleanField(
        default=False,
        help_text="Intensive Care Unit (ICU).",
    )
    has_hdu = models.BooleanField(
        default=False,
        help_text="High Dependency Unit (HDU).",
    )
    has_nbu = models.BooleanField(
        default=False,
        help_text="Newborn Unit (NBU).",
    )
    has_maternity = models.BooleanField(
        default=False,
        help_text="Maternity / obstetrics services.",
    )
    has_mortuary = models.BooleanField(
        default=False,
        help_text="Mortuary / funeral services.",
    )
    has_blood_bank = models.BooleanField(
        default=False,
        help_text="Blood bank / transfusion services.",
    )
    has_inventory = models.BooleanField(
        default=False,
        help_text="Inventory / supply chain management module.",
    )
    has_lis_standalone = models.BooleanField(
        default=False,
        help_text="LIS standalone mode: lab operates independently without full HMIS.",
    )
    has_pharmacy_standalone = models.BooleanField(
        default=False,
        help_text="Pharmacy standalone mode: pharmacy operates as a retail/walk-in dispensary without full HMIS.",
    )
    has_imaging_standalone = models.BooleanField(
        default=False,
        help_text="Imaging standalone mode: imaging operates independently (e.g., diagnostic centre) without full HMIS.",
    )
    has_triage = models.BooleanField(
        default=True,
        help_text="Triage / patient acuity assessment.",
    )
    has_scheduling = models.BooleanField(
        default=True,
        help_text="Appointment scheduling and roster management.",
    )
    has_surveillance = models.BooleanField(
        default=False,
        help_text="Disease surveillance and outbreak reporting.",
    )
    has_immunizations = models.BooleanField(
        default=False,
        help_text="Immunization / vaccination programme.",
    )
    has_allied_health = models.BooleanField(
        default=False,
        help_text="Allied health services (physiotherapy, nutrition, social work, etc.).",
    )
    has_quality = models.BooleanField(
        default=False,
        help_text="Quality improvement and clinical audit.",
    )
    has_billing = models.BooleanField(
        default=True,
        help_text="Billing, invoicing, and financial management.",
    )
    has_private_insurance = models.BooleanField(
        default=False,
        help_text="Private insurance claims, pre-authorizations, and remittances.",
    )
    has_moh_reporting = models.BooleanField(
        default=True,
        help_text="MOH 705/711/717 aggregate reporting and DHIS2 submission.",
    )
    has_ai_assistant = models.BooleanField(
        default=False,
        help_text="TibaBot AI assistant available at this facility (requires plan ai_assistant feature).",
    )
    has_cds = models.BooleanField(
        default=False,
        help_text="Clinical Decision Support (CDS) available at this facility (requires plan ai_assistant feature).",
    )
    has_procedures = models.BooleanField(
        default=False,
        help_text="Clinical procedures / treatment room capability at this facility.",
    )
    has_analytics = models.BooleanField(
        default=False,
        help_text="Analytics and BI dashboards enabled at this facility (requires plan custom_reports feature).",
    )

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    is_active = models.BooleanField(
        default=True,
        help_text="Whether the facility is currently operational.",
    )

    lis_onboarding_completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "When LIS standalone onboarding was completed for this facility. "
            "NULL means setup is still incomplete."
        ),
    )

    operating_mode = models.CharField(
        max_length=30,
        choices=OperatingMode.choices,
        default=OperatingMode.FULL_HMIS,
        help_text=(
            "Top-level facility mode. Choosing a standalone mode disables "
            "clinical workflow modules (inpatient, ER, triage, etc.) and "
            "enables the relevant standalone module + billing + inventory."
        ),
    )

    # ------------------------------------------------------------------
    # Meta & Magic Methods
    # ------------------------------------------------------------------

    class Meta:
        """Meta options for Facility."""

        verbose_name = "Facility"
        verbose_name_plural = "Facilities"
        ordering = ["name"]

    def __str__(self) -> str:
        """Return the facility name and MFL code for human-readable display."""
        return f"{self.name} ({self.mfl_code})"

    @property
    def keph_level_code(self) -> str:
        """Return compact KEPH level code (e.g. "3", "3B")."""
        return f"{self.level}{self.level_subtype}" if self.level_subtype else str(self.level)

    @property
    def keph_level_display(self) -> str:
        """Return human label with subtype, e.g. "Level 3B – Health Centre"."""
        base = self.get_level_display()
        if not self.level_subtype:
            return base
        return base.replace(
            f"Level {self.level}",
            f"Level {self.level}{self.level_subtype}",
            1,
        )

    @property
    def lis_onboarding_complete(self) -> bool:
        """Whether this facility has completed LIS standalone onboarding."""
        return self.lis_onboarding_completed_at is not None

    def get_lis_onboarding_checklist(self) -> list[dict]:
        """Return LIS standalone onboarding checklist with completion status."""
        from hmis.apps.core.models_security import OrgMembership
        from hmis.apps.laboratory.analyzers.models import InstrumentChannel
        from hmis.apps.laboratory.models import LabWorkflowSettings, TestCatalog

        license_status = str(self.dha_license_status or "").strip().upper()
        license_expiry_ok = bool(
            self.dha_license_expiry and self.dha_license_expiry >= timezone.now().date()
        )
        license_status_ok = license_status in {"ACTIVE", "VALID", "CURRENT", "LICENSED"}
        has_lab_identity = bool(
            self.name
            and self.mfl_code
            and self.dha_license_number
            and self.dha_license_expiry
            and license_expiry_ok
            and license_status_ok
        )
        has_test_catalog = TestCatalog.objects.filter(
            facility=self,
            organization=self.organization,
            is_active=True,
        ).exists()
        has_workflow_setup = LabWorkflowSettings.objects.filter(
            facility=self,
            organization=self.organization,
        ).exists()
        has_instrument_channel = InstrumentChannel.objects.filter(
            facility=self,
            organization=self.organization,
            is_active=True,
        ).exists()
        has_pricing_basics = TestCatalog.objects.filter(
            facility=self,
            organization=self.organization,
            is_active=True,
            cost__gt=0,
        ).exists()
        has_team_invitation = OrgMembership.objects.filter(
            organization=self.organization,
            facilities=self,
            status=OrgMembership.MembershipStatus.ACTIVE,
        ).exists()

        return [
            {
                "key": "lab_identity",
                "label": "Facility and laboratory identity",
                "done": has_lab_identity,
                "required": True,
            },
            {
                "key": "test_catalog",
                "label": "Test catalog setup",
                "done": has_test_catalog,
                "required": True,
            },
            {
                "key": "specimen_workflow",
                "label": "Specimen and workflow setup",
                "done": has_workflow_setup,
                "required": True,
            },
            {
                "key": "instrument_channels",
                "label": "Instrument and channel setup",
                "done": has_instrument_channel,
                "required": True,
            },
            {
                "key": "pricing_basics",
                "label": "Price list and payer basics",
                "done": has_pricing_basics,
                "required": True,
            },
            {
                "key": "team_access",
                "label": "Team invitations and permissions",
                "done": has_team_invitation,
                "required": False,
            },
        ]

    def save(self, *args, **kwargs):
        """Auto-apply default modules based on KEPH level on creation."""
        self.country_code = (self.country_code or "KE").upper().strip()
        subtype = str(getattr(self, "level_subtype", "") or "").strip().upper()
        if subtype not in {"", "A", "B", "C"}:
            subtype = ""
        if str(self.level) in {"1", "2"}:
            subtype = ""
        self.level_subtype = subtype

        # Detect operating_mode changes so we cascade module flags on save.
        apply_mode_cascade = False
        if self._state.adding:
            if self.operating_mode and self.operating_mode != self.OperatingMode.FULL_HMIS:
                apply_mode_cascade = True
        else:
            try:
                previous = type(self).objects.only("operating_mode").get(pk=self.pk)
            except type(self).DoesNotExist:
                previous = None
            if previous and previous.operating_mode != self.operating_mode:
                apply_mode_cascade = True

        if self._state.adding and not getattr(self, "_skip_module_defaults", False):
            module_fields = [
                "has_outpatient",
                "has_inpatient",
                "has_emergency",
                "has_pharmacy",
                "has_laboratory",
                "has_imaging",
                "has_theatre",
                "has_dialysis",
                "has_icu",
                "has_hdu",
                "has_nbu",
                "has_maternity",
                "has_mortuary",
                "has_blood_bank",
                "has_inventory",
                "has_triage",
                "has_scheduling",
                "has_surveillance",
                "has_immunizations",
                "has_allied_health",
                "has_quality",
                "has_billing",
                "has_private_insurance",
                "has_procedures",
                "has_analytics",
            ]
            # Only apply defaults if no module was explicitly set beyond the
            # model-level defaults (outpatient=True, pharmacy=True, triage=True,
            # scheduling=True, billing=True, rest=False).
            defaults_from_model = {
                "has_outpatient": True,
                "has_pharmacy": True,
                "has_triage": True,
                "has_scheduling": True,
                "has_billing": True,
            }
            all_at_model_default = all(
                getattr(self, f) == defaults_from_model.get(f, False) for f in module_fields
            )
            if all_at_model_default and self.level:
                level_defaults = self.default_modules_for_level(self.level)
                for module_name, enabled in level_defaults.items():
                    setattr(self, f"has_{module_name}", enabled)

        if apply_mode_cascade:
            self._apply_operating_mode_cascade()

        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    # Operating-mode cascade
    # ------------------------------------------------------------------

    # Clinical workflow modules disabled in any standalone mode.
    # Lab/imaging standalone flags are included here and selectively
    # re-enabled per mode via _MODE_ENABLES.
    _STANDALONE_DISABLES = (
        "has_inpatient",
        "has_emergency",
        "has_triage",
        "has_maternity",
        "has_theatre",
        "has_dialysis",
        "has_icu",
        "has_hdu",
        "has_nbu",
        "has_mortuary",
        "has_blood_bank",
        "has_allied_health",
        "has_scheduling",
        "has_surveillance",
        "has_immunizations",
        "has_outpatient",
        "has_moh_reporting",
        # Quality, private insurance and AI/CDS are full-HMIS only.
        "has_quality",
        "has_private_insurance",
        "has_ai_assistant",
        "has_cds",
        "has_procedures",
        "has_analytics",
        # Service-specific flags — disabled by default, re-enabled per mode
        "has_pharmacy",
        "has_pharmacy_standalone",
        "has_laboratory",
        "has_imaging",
        "has_lis_standalone",
        "has_imaging_standalone",
    )

    # Per-mode flags to force-enable.
    _MODE_ENABLES: dict[str, tuple[str, ...]] = {
        "STANDALONE_LAB": (
            "has_laboratory",
            "has_lis_standalone",
            "has_billing",
            "has_inventory",
        ),
        "STANDALONE_PHARMACY": (
            "has_pharmacy",
            "has_pharmacy_standalone",
            "has_billing",
            "has_inventory",
        ),
        "STANDALONE_IMAGING": (
            "has_imaging",
            "has_imaging_standalone",
            "has_billing",
            "has_inventory",
        ),
        "STANDALONE_DIAGNOSTIC": (
            "has_laboratory",
            "has_imaging",
            "has_lis_standalone",
            "has_imaging_standalone",
            "has_billing",
            "has_inventory",
        ),
    }

    # ------------------------------------------------------------------
    # Subscription tier gating
    # ------------------------------------------------------------------

    # Maps each Facility ``has_*`` boolean to the matching subscription
    # feature key on ``SubscriptionPlan.features``. Used by the facility
    # serializer to reject module flips that the org's plan does not cover.
    MODULE_FLAG_TO_FEATURE: dict[str, str] = {
        "has_outpatient": "outpatient",
        "has_inpatient": "inpatient",
        "has_emergency": "emergency",
        "has_pharmacy": "pharmacy",
        "has_laboratory": "laboratory",
        "has_imaging": "imaging",
        "has_theatre": "theatre",
        "has_dialysis": "dialysis",
        "has_icu": "icu",
        "has_hdu": "hdu",
        "has_nbu": "nbu",
        "has_maternity": "maternity",
        "has_mortuary": "mortuary",
        "has_blood_bank": "blood_bank",
        "has_inventory": "inventory",
        "has_lis_standalone": "lis_standalone",
        "has_pharmacy_standalone": "pharmacy_standalone",
        "has_imaging_standalone": "imaging_standalone",
        "has_triage": "triage",
        "has_scheduling": "scheduling",
        "has_surveillance": "surveillance",
        "has_immunizations": "immunizations",
        "has_allied_health": "allied_health",
        "has_quality": "quality",
        "has_billing": "billing",
        "has_private_insurance": "private_insurance",
        "has_moh_reporting": "moh_reporting",
        "has_ai_assistant": "ai_assistant",
        "has_cds": "ai_assistant",
        "has_procedures": "outpatient",
        "has_analytics": "custom_reports",
    }

    # Subscription features required to switch into a given operating mode.
    # Used by the facility serializer to reject unsupported mode changes.
    OPERATING_MODE_REQUIRED_FEATURES: dict[str, tuple[str, ...]] = {
        "STANDALONE_LAB": ("laboratory", "lis_standalone"),
        "STANDALONE_PHARMACY": ("pharmacy", "pharmacy_standalone"),
        "STANDALONE_IMAGING": ("imaging", "imaging_standalone"),
        "STANDALONE_DIAGNOSTIC": (
            "laboratory",
            "imaging",
            "lis_standalone",
            "imaging_standalone",
        ),
    }

    def _apply_operating_mode_cascade(self) -> None:
        """
        Cascade ``has_*`` flags based on ``operating_mode``.

        FULL_HMIS re-enables all clinical workflow modules that standalone
        modes disable.  Admin can then turn off individual modules.
        Any STANDALONE_* mode disables clinical workflow modules and
        force-enables the relevant standalone module plus billing/inventory.
        """
        mode = self.operating_mode
        if not mode:
            return

        if mode == self.OperatingMode.FULL_HMIS:
            # Re-enable all modules that standalone modes disable
            for flag in self._STANDALONE_DISABLES:
                setattr(self, flag, True)
            # Standalone-specific flags should be off in full HMIS
            self.has_lis_standalone = False
            self.has_imaging_standalone = False
            self.has_pharmacy_standalone = False
            return

        enables = self._MODE_ENABLES.get(str(mode), ())
        for flag in self._STANDALONE_DISABLES:
            if flag not in enables:
                setattr(self, flag, False)
        for flag in enables:
            setattr(self, flag, True)

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def modules(self) -> dict[str, bool]:
        """
        Return enabled service modules as a flat dictionary.

        This is used by the ``FacilitySerializer`` to expose the capability
        map in API responses, which in turn powers the sidebar filtering on
        the frontend.

        Returns:
            Dictionary mapping module name → enabled boolean.
        """
        return {
            "outpatient": self.has_outpatient,
            "inpatient": self.has_inpatient,
            "emergency": self.has_emergency,
            "pharmacy": self.has_pharmacy,
            "laboratory": self.has_laboratory,
            "imaging": self.has_imaging,
            "theatre": self.has_theatre,
            "dialysis": self.has_dialysis,
            "icu": self.has_icu,
            "hdu": self.has_hdu,
            "nbu": self.has_nbu,
            "maternity": self.has_maternity,
            "mortuary": self.has_mortuary,
            "blood_bank": self.has_blood_bank,
            "inventory": self.has_inventory,
            "lis_standalone": self.has_lis_standalone,
            "pharmacy_standalone": self.has_pharmacy_standalone,
            "imaging_standalone": self.has_imaging_standalone,
            "triage": self.has_triage,
            "scheduling": self.has_scheduling,
            "surveillance": self.has_surveillance,
            "immunizations": self.has_immunizations,
            "allied_health": self.has_allied_health,
            "quality": self.has_quality,
            "billing": self.has_billing,
            "private_insurance": self.has_private_insurance,
            "moh_reporting": self.has_moh_reporting,
            "ai_assistant": self.has_ai_assistant,
            "cds": self.has_cds,
            "procedures": self.has_procedures,
            "analytics": self.has_analytics,
        }

    @property
    def enabled_module_names(self) -> list[str]:
        """
        Return a list of *enabled* module names (convenience helper).

        Example::

            >>> facility.enabled_module_names
            ['outpatient', 'pharmacy', 'laboratory']
        """
        return [name for name, enabled in self.modules.items() if enabled]

    @property
    def effective_logo(self):
        """
        Return the facility's own logo, falling back to the organization logo.

        This allows facilities to either use their own branding or inherit
        the parent organization's logo.
        """
        if self.logo:
            return self.logo
        if self.organization and self.organization.logo:
            return self.organization.logo
        return None

    # ------------------------------------------------------------------
    # DHA Registry Sync
    # ------------------------------------------------------------------

    # PII field keys in DHA responses — stripped from dha_registry_data
    _DHA_PII_KEYS = frozenset(
        {
            "facilityAdministratorName",
            "facilityAdministratorPhone",
            "facilityAdministratorEmail",
            "facilityAdministratorIdentifier",
            "facilityPhoneNumber",
            "facilityEmail",
        }
    )

    _DHA_OWNERSHIP_MAP = {
        "GOK": OwnershipType.GOK,
        "PUBLIC": OwnershipType.GOK,
        "GOVERNMENT": OwnershipType.GOK,
        "GOVERNMENT OF KENYA": OwnershipType.GOK,
        "FBO": OwnershipType.FBO,
        "FAITH-BASED ORGANIZATION": OwnershipType.FBO,
        "FAITH BASED ORGANIZATION": OwnershipType.FBO,
        "NGO": OwnershipType.NGO,
        "NON-GOVERNMENTAL ORGANIZATION": OwnershipType.NGO,
        "NON GOVERNMENTAL ORGANIZATION": OwnershipType.NGO,
        "PRIVATE": OwnershipType.PRIVATE,
        "PRIVATE PRACTICE": OwnershipType.PRIVATE,
    }

    @staticmethod
    def _normalize_dha_level(value: str) -> tuple[str, str]:
        """Map DHA levels (e.g. "Level 4B") to ("4", "B")."""
        import re

        text = (value or "").strip().upper()
        match = re.search(r"([1-6])\s*([ABC])?", text)
        if not match:
            return "", ""
        level = match.group(1) or ""
        subtype = match.group(2) or ""
        if level in {"1", "2"}:
            subtype = ""
        return level, subtype

    @classmethod
    def _normalize_dha_ownership(cls, value: str) -> str:
        """Map DHA ownership labels to Facility ownership enum values."""
        key = (value or "").strip().upper()
        normalized = cls._DHA_OWNERSHIP_MAP.get(key)
        if normalized:
            return str(normalized)
        valid_values = {choice for choice, _ in cls.OwnershipType.choices}
        return key if key in valid_values else ""

    def update_from_dha_response(self, data: dict) -> list[str]:
        """
        Populate cached DHA registry fields from a DHA API response dict.

        Non-PII fields are stored as plain columns.  PII fields (admin
        contact, facility contact) are stored encrypted.  The full response
        is cached in ``dha_registry_data`` with PII keys stripped.

        Returns:
            list[str]: Canonical facility fields updated from DHA.
        """
        from django.utils.dateparse import parse_date

        updated_local_fields: list[str] = []

        def set_local_field(field_name: str, value):
            current_value = getattr(self, field_name)
            if value == current_value:
                return
            setattr(self, field_name, value)
            updated_local_fields.append(field_name)

        # Canonical local fields (used in UI and business flows)
        official_name = str(data.get("officialName", "") or "").strip()
        if official_name:
            set_local_field("name", official_name)

        fr_code = str(data.get("frCode", "") or "").strip()
        if fr_code:
            set_local_field("sha_facility_code", fr_code)

        normalized_level, normalized_subtype = self._normalize_dha_level(
            str(data.get("kephLevel", "") or "")
        )
        if normalized_level:
            set_local_field("level", normalized_level)
            set_local_field("level_subtype", normalized_subtype)

        normalized_ownership = self._normalize_dha_ownership(
            str(data.get("facilityOwnership", "") or "")
        )
        if normalized_ownership:
            set_local_field("ownership", normalized_ownership)

        sha_contract_status = str(data.get("shaContractStatus", "") or "").strip().lower()
        if sha_contract_status:
            is_contracted = "active" in sha_contract_status
            set_local_field("sha_contracted", is_contracted)

        contract_end = str(data.get("shaConstractEndDate", "") or "").strip()
        if contract_end:
            contract_expiry = parse_date(contract_end.split(" ")[0])
            if contract_expiry:
                set_local_field("sha_contract_expiry", contract_expiry)

        # Non-PII columns
        self.dha_fid_code = str(data.get("fidCode", "") or "")
        self.dha_fr_code = str(data.get("frCode", "") or "")
        self.dha_license_status = str(data.get("facilityLicenseStatus", "") or "")
        self.dha_license_number = str(data.get("licenseNumber", "") or "")
        self.dha_license_expiry = str(data.get("facilityLicenseEndDate", "") or "")
        self.dha_facility_type = str(data.get("facilityType", "") or "")
        self.dha_keph_level = str(data.get("kephLevel", "") or "")
        self.dha_ownership = str(data.get("facilityOwnership", "") or "")
        self.dha_regulatory_body = str(data.get("regulatoryBody", "") or "")

        # Operational / SHA status
        reg_ops = data.get("regulatoryOperationalStatus") or {}
        self.dha_operational_status = str(
            reg_ops.get("operationalStatus", "") if isinstance(reg_ops, dict) else ""
        )
        self.dha_sha_contract_status = str(data.get("shaContractStatus", "") or "")
        self.dha_sha_contract_start = str(data.get("shaConstractStartDate", "") or "")
        self.dha_sha_contract_end = str(data.get("shaConstractEndDate", "") or "")

        # Bed capacity
        beds = data.get("bedOccupancy") or {}
        if isinstance(beds, dict):
            self.dha_total_beds = int(beds.get("totalBeds", 0) or 0)
            self.dha_icu_beds = int(beds.get("icuBeds", 0) or 0)
            self.dha_hdu_beds = int(beds.get("hduBeds", 0) or 0)

        # PII fields — encrypted
        self.dha_admin_name = str(data.get("facilityAdministratorName", "") or "")
        self.dha_admin_phone = str(data.get("facilityAdministratorPhone", "") or "")
        self.dha_admin_email = str(data.get("facilityAdministratorEmail", "") or "")
        self.dha_admin_id = str(data.get("facilityAdministratorIdentifier", "") or "")
        self.dha_facility_phone = str(data.get("facilityPhoneNumber", "") or "")
        self.dha_facility_email = str(data.get("facilityEmail", "") or "")

        # Cache the full response with PII stripped
        safe_data = {k: v for k, v in data.items() if k not in self._DHA_PII_KEYS}
        self.dha_registry_data = safe_data
        self.dha_registry_synced_at = timezone.now()
        return updated_local_fields

    # ------------------------------------------------------------------
    # Class Methods
    # ------------------------------------------------------------------

    @classmethod
    def default_modules_for_level(cls, level: str) -> dict[str, bool]:
        """
        Return sensible default module flags for a given KEPH level.

        These defaults mirror the Kenya MoH guidelines on which services
        are typically available at each facility tier.  They are used when
        creating a new facility to pre-populate the capability flags.

        Args:
            level: KEPH level string ("1" through "6").

        Returns:
            Dictionary mapping module name → default boolean.
        """
        all_modules = {
            "outpatient": False,
            "inpatient": False,
            "emergency": False,
            "pharmacy": False,
            "laboratory": False,
            "imaging": False,
            "theatre": False,
            "dialysis": False,
            "icu": False,
            "hdu": False,
            "nbu": False,
            "maternity": False,
            "mortuary": False,
            "blood_bank": False,
            "inventory": False,
            "triage": False,
            "scheduling": False,
            "surveillance": False,
            "immunizations": False,
            "allied_health": False,
            "quality": False,
            "billing": False,
            "private_insurance": False,
            "ai_assistant": False,
            "cds": False,
            "procedures": False,
            "analytics": False,
        }

        level_overrides: dict[str, dict[str, bool]] = {
            "1": {
                "outpatient": True,
                "triage": True,
                "billing": True,
                "immunizations": True,
            },
            "2": {
                "outpatient": True,
                "pharmacy": True,
                "triage": True,
                "scheduling": True,
                "billing": True,
                "immunizations": True,
            },
            "3": {
                "outpatient": True,
                "pharmacy": True,
                "laboratory": True,
                "maternity": True,
                "triage": True,
                "scheduling": True,
                "billing": True,
                "immunizations": True,
                "surveillance": True,
            },
            "4": {
                "outpatient": True,
                "inpatient": True,
                "emergency": True,
                "pharmacy": True,
                "laboratory": True,
                "imaging": True,
                "theatre": True,
                "maternity": True,
                "inventory": True,
                "triage": True,
                "scheduling": True,
                "billing": True,
                "immunizations": True,
                "surveillance": True,
                "allied_health": True,
                "quality": True,
            },
            "5": {
                "outpatient": True,
                "inpatient": True,
                "emergency": True,
                "pharmacy": True,
                "laboratory": True,
                "imaging": True,
                "theatre": True,
                "icu": True,
                "hdu": True,
                "nbu": True,
                "maternity": True,
                "dialysis": True,
                "inventory": True,
                "triage": True,
                "scheduling": True,
                "billing": True,
                "immunizations": True,
                "surveillance": True,
                "allied_health": True,
                "quality": True,
            },
            "6": {
                "outpatient": True,
                "inpatient": True,
                "emergency": True,
                "pharmacy": True,
                "laboratory": True,
                "imaging": True,
                "theatre": True,
                "icu": True,
                "hdu": True,
                "nbu": True,
                "maternity": True,
                "dialysis": True,
                "blood_bank": True,
                "mortuary": True,
                "inventory": True,
                "triage": True,
                "scheduling": True,
                "billing": True,
                "immunizations": True,
                "surveillance": True,
                "allied_health": True,
                "quality": True,
                "private_insurance": True,
            },
        }

        overrides = level_overrides.get(
            level, {"outpatient": True, "triage": True, "billing": True}
        )
        return {**all_modules, **overrides}
