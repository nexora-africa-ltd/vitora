"""
Backfill organization and facility on all seeded records that are missing them.

Assigns orphaned records to the demo organization (slug=demo-health-services)
and HQ facility (mfl_code=DEMO-HQ-001).
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Backfill organization and facility on records missing them"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be updated without making changes",
        )

    def handle(self, *args, **options):
        from django.apps import apps

        from hmis.apps.core.models import Facility, Organization

        dry_run = options["dry_run"]

        # Resolve demo org + HQ facility
        try:
            demo_org = Organization.objects.get(slug="demo-health-services")
        except Organization.DoesNotExist:
            self.stderr.write(
                self.style.ERROR("Demo organization not found. Run seed_demo_data first.")
            )
            return

        try:
            hq_facility = Facility.objects.get(mfl_code="DEMO-HQ-001")
        except Facility.DoesNotExist:
            # Try alternate code used in some environments
            hq_facility = Facility.objects.filter(
                organization=demo_org, is_headquarters=True
            ).first()
            if not hq_facility:
                self.stderr.write(
                    self.style.ERROR("HQ facility not found. Run seed_demo_data first.")
                )
                return

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be made\n"))

        self.stdout.write(
            f"Backfilling to: {demo_org.name} / {hq_facility.name} (mfl={hq_facility.mfl_code})\n"
        )

        total_updated = 0

        # ── Models with both organization + facility ──────────────────
        MODELS_ORG_AND_FACILITY = [
            # Clinical
            ("encounters", "Encounter", "organization", "facility"),
            ("triage", "TriageAssessment", "organization", "facility"),
            ("triage", "ERBed", "organization", "facility"),
            ("clinics", "Clinic", "organization", "facility"),
            ("clinics", "ClinicSession", "organization", "facility"),
            ("clinics", "ClinicVisit", "organization", "facility"),
            # Scheduling
            ("scheduling", "Resource", "organization", "facility"),
            ("scheduling", "Shift", "organization", "facility"),
            ("scheduling", "Appointment", "organization", "facility"),
            ("scheduling", "AssignmentRule", "organization", "facility"),
            ("scheduling", "SchedulingSettings", "organization", "facility"),
            ("scheduling", "StaffConstraint", "organization", "facility"),
            # Pharmacy & stock
            ("pharmacy", "Prescription", "organization", "facility"),
            ("pharmacy", "StockBatch", "organization", "facility"),
            ("pharmacy", "StockAlert", "organization", "facility"),
            ("pharmacy", "Dispensing", "organization", "facility"),
            # Inventory
            ("inventory", "PurchaseOrder", "organization", "facility"),
            ("inventory", "GoodsReceiptNote", "organization", "facility"),
            ("inventory", "StoreLocation", "organization", "facility"),
            ("inventory", "WardStock", "organization", "facility"),
            ("inventory", "StockCount", "organization", "facility"),
            ("inventory", "ETIMSConfig", "organization", "facility"),
            ("inventory", "ETIMSInvoice", "organization", "facility"),
            ("inventory", "ConsumptionRecord", "organization", "facility"),
            ("inventory", "DemandForecast", "organization", "facility"),
            ("inventory", "ReorderSuggestion", "organization", "facility"),
            # Laboratory
            ("laboratory", "LabOrder", "organization", "facility"),
            ("laboratory", "Instrument", "organization", "facility"),
            # Inpatient
            ("inpatient", "Admission", "organization", "facility"),
            ("inpatient", "Ward", "organization", "facility"),
            ("inpatient", "AdverseTransfusionReaction", "organization", "facility"),
            ("inpatient", "DischargeTemplate", "organization", "facility"),
            # Billing
            ("billing", "Invoice", "organization", "facility"),
            ("billing", "PaymentPoint", "organization", "facility"),
            # Surveillance
            ("surveillance", "NotifiableCase", "organization", "facility"),
            ("surveillance", "SurveillanceAlert", "organization", "facility"),
            ("surveillance", "IHRNotification", "organization", "facility"),
            # MCH
            ("mch", "MCHRegistration", "organization", "facility"),
            # Allied health
            ("nutrition", "NutritionConsultation", "organization", "facility"),
            ("counselling", "CounsellingReferral", "organization", "facility"),
            ("physiotherapy", "PhysiotherapyOrder", "organization", "facility"),
            ("occupational_therapy", "OccupationalTherapyOrder", "organization", "facility"),
            ("social_work", "SocialWorkReferral", "organization", "facility"),
            # AI & CDS
            ("ai", "ChatSession", "organization", "facility"),
            ("ai", "AICarePlanResult", "organization", "facility"),
            ("ai", "AICDSResult", "organization", "facility"),
            ("ai", "AILabInterpretResult", "organization", "facility"),
            ("ai", "AIDischargeResult", "organization", "facility"),
            ("ai", "AIICURiskResult", "organization", "facility"),
            ("ai", "AIInvestigationSuggestResult", "organization", "facility"),
            ("cds", "CDSAlert", "organization", "facility"),
            # Procedures
            ("procedures", "ProcedureCatalog", "organization", "facility"),
            ("procedures", "ProcedureOrder", "organization", "facility"),
            ("procedures", "ProcedureConsent", "organization", "facility"),
            ("procedures", "ProcedureLog", "organization", "facility"),
            ("procedures", "ProcedureOutcome", "organization", "facility"),
            # Immunizations
            ("immunizations", "ImmunizationRecord", "organization", "facility"),
            ("immunizations", "VaccineCampaign", "organization", "facility"),
            ("immunizations", "AEFI", "organization", "facility"),
            ("immunizations", "VaccineStock", "organization", "facility"),
            ("immunizations", "ColdChainEquipment", "organization", "facility"),
            ("immunizations", "VaccineIncident", "organization", "facility"),
            # Analytics & Reporting
            ("analytics", "FacilityDailySummary", "organization", "facility"),
            ("analytics", "DepartmentMonthlySummary", "organization", "facility"),
            ("analytics", "DiagnosisTrend", "organization", "facility"),
            ("analytics", "PatientDemographicSnapshot", "organization", "facility"),
            ("moh_reporting", "MOH705Report", "organization", "facility"),
            ("moh_reporting", "MOH711Report", "organization", "facility"),
            ("moh_reporting", "MOH717Report", "organization", "facility"),
            # Check-in & Integration
            ("checkin", "CheckIn", "organization", "facility"),
            ("hl7", "HL7Message", "organization", "facility"),
            # Core
            ("core", "AuditLog", "organization", "facility"),
            ("core", "SyncQueue", "organization", "facility"),
            ("core", "Role", "organization", "facility"),
        ]

        for app_label, model_name, org_field, fac_field in MODELS_ORG_AND_FACILITY:
            try:
                Model = apps.get_model(app_label, model_name)
            except LookupError:
                continue

            # Update org
            qs_org = Model.objects.filter(**{f"{org_field}__isnull": True})
            count_org = qs_org.count()
            if count_org and not dry_run:
                qs_org.update(**{org_field: demo_org})

            # Update facility
            qs_fac = Model.objects.filter(**{f"{fac_field}__isnull": True})
            count_fac = qs_fac.count()
            if count_fac and not dry_run:
                qs_fac.update(**{fac_field: hq_facility})

            if count_org or count_fac:
                self.stdout.write(
                    f"  {app_label}.{model_name}: org={count_org}, facility={count_fac}"
                )
                total_updated += max(count_org, count_fac)

        # ── Org-only models (no facility FK) ─────────────────────────
        MODELS_ORG_ONLY = [
            ("inventory", "Supplier", "organization"),
        ]

        for app_label, model_name, org_field in MODELS_ORG_ONLY:
            try:
                Model = apps.get_model(app_label, model_name)
            except LookupError:
                continue

            qs = Model.objects.filter(**{f"{org_field}__isnull": True})
            count = qs.count()
            if count and not dry_run:
                qs.update(**{org_field: demo_org})
            if count:
                self.stdout.write(f"  {app_label}.{model_name}: org={count}")
                total_updated += count

        # ── StockTransfer: org + source_facility + destination_facility
        try:
            StockTransfer = apps.get_model("inventory", "StockTransfer")

            qs_org = StockTransfer.objects.filter(organization__isnull=True)
            count_org = qs_org.count()
            if count_org and not dry_run:
                qs_org.update(organization=demo_org)

            qs_src = StockTransfer.objects.filter(source_facility__isnull=True)
            count_src = qs_src.count()
            if count_src and not dry_run:
                qs_src.update(source_facility=hq_facility)

            qs_dst = StockTransfer.objects.filter(destination_facility__isnull=True)
            count_dst = qs_dst.count()
            if count_dst and not dry_run:
                qs_dst.update(destination_facility=hq_facility)

            if count_org or count_src or count_dst:
                self.stdout.write(
                    f"  inventory.StockTransfer: org={count_org}, "
                    f"source_facility={count_src}, destination_facility={count_dst}"
                )
                total_updated += max(count_org, count_src, count_dst)
        except LookupError:
            pass

        # ── Patient uses registered_at_facility (not facility) ────────
        try:
            Patient = apps.get_model("patients", "Patient")

            qs_org = Patient.objects.filter(organization__isnull=True)
            count_org = qs_org.count()
            if count_org and not dry_run:
                qs_org.update(organization=demo_org)

            qs_fac = Patient.objects.filter(registered_at_facility__isnull=True)
            count_fac = qs_fac.count()
            if count_fac and not dry_run:
                qs_fac.update(registered_at_facility=hq_facility)

            if count_org or count_fac:
                self.stdout.write(
                    f"  patients.Patient: org={count_org}, registered_at_facility={count_fac}"
                )
                total_updated += max(count_org, count_fac)
        except LookupError:
            pass

        # ── IDSRWeeklyReport uses facility_ref (not facility) ─────────
        try:
            IDSRWeeklyReport = apps.get_model("surveillance", "IDSRWeeklyReport")

            qs_org = IDSRWeeklyReport.objects.filter(organization__isnull=True)
            count_org = qs_org.count()
            if count_org and not dry_run:
                qs_org.update(organization=demo_org)

            qs_fac = IDSRWeeklyReport.objects.filter(facility_ref__isnull=True)
            count_fac = qs_fac.count()
            if count_fac and not dry_run:
                qs_fac.update(facility_ref=hq_facility)

            if count_org or count_fac:
                self.stdout.write(
                    f"  surveillance.IDSRWeeklyReport: org={count_org}, facility_ref={count_fac}"
                )
                total_updated += max(count_org, count_fac)
        except LookupError:
            pass

        # ── StaffProfile uses primary_facility (not facility) ─────────
        try:
            StaffProfile = apps.get_model("core", "StaffProfile")

            qs_org = StaffProfile.objects.filter(organization__isnull=True)
            count_org = qs_org.count()
            if count_org and not dry_run:
                qs_org.update(organization=demo_org)

            qs_fac = StaffProfile.objects.filter(primary_facility__isnull=True)
            count_fac = qs_fac.count()
            if count_fac and not dry_run:
                qs_fac.update(primary_facility=hq_facility)

            if count_org or count_fac:
                self.stdout.write(
                    f"  core.StaffProfile: org={count_org}, primary_facility={count_fac}"
                )
                total_updated += max(count_org, count_fac)
        except LookupError:
            pass

        # ── Allergy has organization only ─────────────────────────────
        try:
            Allergy = apps.get_model("patients", "Allergy")
            qs = Allergy.objects.filter(organization__isnull=True)
            count = qs.count()
            if count and not dry_run:
                qs.update(organization=demo_org)
            if count:
                self.stdout.write(f"  patients.Allergy: org={count}")
                total_updated += count
        except LookupError:
            pass

        # ── Facilities without an organization ────────────────────────
        qs_fac = Facility.objects.filter(organization__isnull=True)
        count_fac = qs_fac.count()
        if count_fac and not dry_run:
            qs_fac.update(organization=demo_org)
        if count_fac:
            self.stdout.write(f"  core.Facility: org={count_fac}")
            total_updated += count_fac

        # ── Summary ───────────────────────────────────────────────────
        if total_updated == 0:
            self.stdout.write(self.style.SUCCESS("\nAll records already have org/facility."))
        elif dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"\nWould update ~{total_updated} records. Run without --dry-run to apply."
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS(f"\n✅ Backfilled ~{total_updated} records."))
