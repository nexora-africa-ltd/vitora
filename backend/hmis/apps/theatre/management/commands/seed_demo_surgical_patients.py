"""Seed demo surgical patients and surgery cases for theatre walkthroughs."""

from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models.deletion import CASCADE, PROTECT
from django.utils import timezone

from hmis.apps.core.models import County, Facility, Organization, SubCounty
from hmis.apps.patients.models import Patient
from hmis.apps.procedures.models import ProcedureCatalog
from hmis.apps.theatre.models import (
    AnesthesiaRecord,
    OperatingTheatre,
    OperativeNote,
    PACURecord,
    SurgeryCase,
    WHOSafetyChecklist,
)

DEMO_SUFFIX = " (Surgical Demo)"
DEMO_USER_PREFIX = "demo_surgical_"

DEMO_CASE_SPECS = [
    {
        "patient": {
            "first_name": "Naomi",
            "last_name": "Odhiambo",
            "date_of_birth": date(1991, 8, 14),
            "gender": "F",
            "phone_number": "+254700100001",
            "county_name": "Mombasa",
        },
        "procedure": {
            "code": "GS-APP",
            "name": "Appendectomy",
            "body_system": ProcedureCatalog.BodySystem.DIGESTIVE,
            "risk_level": ProcedureCatalog.RiskLevel.MEDIUM,
            "tibabot_procedure_key": "appendectomy",
            "anesthesia_type": SurgeryCase.AnesthesiaType.GENERAL,
            "duration": 60,
        },
        "theatre": {
            "code": "DEMO-OT-01",
            "name": "Demo General Theatre 1",
            "theatre_type": OperatingTheatre.TheatreType.GENERAL,
        },
        "status": SurgeryCase.CaseStatus.REQUESTED,
        "priority": SurgeryCase.Priority.ELECTIVE,
        "diagnosis": "Acute appendicitis",
        "laterality": SurgeryCase.Laterality.NA,
        "asa_class": SurgeryCase.ASAClass.CLASS_II,
        "scheduled_day_offset": 0,
        "scheduled_time": time(8, 30),
    },
    {
        "patient": {
            "first_name": "Joseph",
            "last_name": "Kamau",
            "date_of_birth": date(1974, 1, 9),
            "gender": "M",
            "phone_number": "+254700100002",
            "county_name": "Mombasa",
        },
        "procedure": {
            "code": "GS-HERNIA",
            "name": "Hernia Repair",
            "body_system": ProcedureCatalog.BodySystem.DIGESTIVE,
            "risk_level": ProcedureCatalog.RiskLevel.LOW,
            "tibabot_procedure_key": "hernia_repair",
            "anesthesia_type": SurgeryCase.AnesthesiaType.SPINAL,
            "duration": 45,
        },
        "theatre": {
            "code": "DEMO-OT-02",
            "name": "Demo Day Surgery Theatre",
            "theatre_type": OperatingTheatre.TheatreType.MINOR,
        },
        "status": SurgeryCase.CaseStatus.PRE_OP,
        "priority": SurgeryCase.Priority.ELECTIVE,
        "diagnosis": "Right inguinal hernia",
        "laterality": SurgeryCase.Laterality.RIGHT,
        "asa_class": SurgeryCase.ASAClass.CLASS_II,
        "scheduled_day_offset": 0,
        "scheduled_time": time(10, 0),
    },
    {
        "patient": {
            "first_name": "Miriam",
            "last_name": "Achieng",
            "date_of_birth": date(1986, 5, 3),
            "gender": "F",
            "phone_number": "+254700100003",
            "county_name": "Mombasa",
        },
        "procedure": {
            "code": "OB-CS",
            "name": "Cesarean Section",
            "body_system": ProcedureCatalog.BodySystem.REPRODUCTIVE,
            "risk_level": ProcedureCatalog.RiskLevel.HIGH,
            "tibabot_procedure_key": "cesarean_section",
            "anesthesia_type": SurgeryCase.AnesthesiaType.SPINAL,
            "duration": 60,
        },
        "theatre": {
            "code": "DEMO-OT-03",
            "name": "Demo Obstetric Theatre",
            "theatre_type": OperatingTheatre.TheatreType.OBSTETRIC,
        },
        "status": SurgeryCase.CaseStatus.IN_SURGERY,
        "priority": SurgeryCase.Priority.URGENT,
        "diagnosis": "Previous cesarean scar in labour",
        "laterality": SurgeryCase.Laterality.NA,
        "asa_class": SurgeryCase.ASAClass.CLASS_III,
        "scheduled_day_offset": 0,
        "scheduled_time": time(11, 30),
    },
    {
        "patient": {
            "first_name": "Samuel",
            "last_name": "Mutiso",
            "date_of_birth": date(2003, 11, 17),
            "gender": "M",
            "phone_number": "+254700100004",
            "county_name": "Mombasa",
        },
        "procedure": {
            "code": "OR-ORIF",
            "name": "ORIF (Open Reduction Internal Fixation)",
            "body_system": ProcedureCatalog.BodySystem.MUSCULOSKELETAL,
            "risk_level": ProcedureCatalog.RiskLevel.MEDIUM,
            "tibabot_procedure_key": "orif_long_bone_fracture",
            "anesthesia_type": SurgeryCase.AnesthesiaType.GENERAL,
            "duration": 90,
        },
        "theatre": {
            "code": "DEMO-OT-04",
            "name": "Demo Orthopaedic Theatre",
            "theatre_type": OperatingTheatre.TheatreType.ORTHO,
        },
        "status": SurgeryCase.CaseStatus.IN_PACU,
        "priority": SurgeryCase.Priority.URGENT,
        "diagnosis": "Closed tibial shaft fracture",
        "laterality": SurgeryCase.Laterality.LEFT,
        "asa_class": SurgeryCase.ASAClass.CLASS_II,
        "scheduled_day_offset": -1,
        "scheduled_time": time(13, 0),
    },
    {
        "patient": {
            "first_name": "Evelyn",
            "last_name": "Wanjiru",
            "date_of_birth": date(1968, 2, 27),
            "gender": "F",
            "phone_number": "+254700100005",
            "county_name": "Mombasa",
        },
        "procedure": {
            "code": "GS-CHOLE",
            "name": "Cholecystectomy",
            "body_system": ProcedureCatalog.BodySystem.DIGESTIVE,
            "risk_level": ProcedureCatalog.RiskLevel.MEDIUM,
            "tibabot_procedure_key": "cholecystectomy",
            "anesthesia_type": SurgeryCase.AnesthesiaType.GENERAL,
            "duration": 90,
        },
        "theatre": {
            "code": "DEMO-OT-01",
            "name": "Demo General Theatre 1",
            "theatre_type": OperatingTheatre.TheatreType.GENERAL,
        },
        "status": SurgeryCase.CaseStatus.DISCHARGED,
        "priority": SurgeryCase.Priority.ELECTIVE,
        "diagnosis": "Symptomatic gallstones",
        "laterality": SurgeryCase.Laterality.NA,
        "asa_class": SurgeryCase.ASAClass.CLASS_II,
        "scheduled_day_offset": -2,
        "scheduled_time": time(9, 15),
    },
]


class Command(BaseCommand):
    help = "Seed demo surgical patients and theatre cases for theatre walkthroughs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Remove seeded demo surgical patients and related records.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be created without writing data.",
        )
        parser.add_argument("--org", type=str, default="", help="Organization name or slug to use.")
        parser.add_argument(
            "--facility", type=str, default="", help="Facility name or MFL code to use."
        )

    def handle(self, *args, **options):
        if options["clear"]:
            return self._clear_demo_data(dry_run=options["dry_run"])

        organization = self._resolve_organization(options["org"])
        facility = self._resolve_facility(options["facility"], organization)
        if facility is None:
            raise CommandError("No facility could be resolved. Create or specify a facility first.")

        if organization is None:
            organization = facility.organization

        dry_run = options["dry_run"]
        with transaction.atomic():
            users = self._ensure_demo_users(dry_run=dry_run)
            created_patients, created_cases = self._seed_cases(
                organization=organization,
                facility=facility,
                users=users,
                dry_run=dry_run,
            )
            if dry_run:
                transaction.set_rollback(True)

        mode = "Would create" if dry_run else "Created"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode} {created_patients} demo surgical patient(s) and {created_cases} case(s)."
            )
        )
        self.stdout.write(f"  Organization: {organization.name}")
        self.stdout.write(f"  Facility:     {facility.name}")
        self.stdout.write(
            self.style.NOTICE("Run with --clear to remove seeded demo surgical patients.")
        )

    def _resolve_organization(self, org_hint: str) -> Organization | None:
        if org_hint:
            return (
                Organization.objects.filter(name=org_hint).first()
                or Organization.objects.filter(slug=org_hint).first()
            )
        return Organization.objects.first()

    def _resolve_facility(
        self, facility_hint: str, organization: Organization | None
    ) -> Facility | None:
        if facility_hint:
            return (
                Facility.objects.filter(name=facility_hint).first()
                or Facility.objects.filter(mfl_code=facility_hint).first()
            )
        if organization is not None:
            return Facility.objects.filter(organization=organization, is_active=True).first()
        return Facility.objects.filter(is_active=True).first()

    def _resolve_location(
        self, facility: Facility, county_name: str
    ) -> tuple[County | None, SubCounty | None]:
        county = (
            facility.county
            or County.objects.filter(name__iexact=county_name).first()
            or County.objects.first()
        )
        if county is None:
            return None, None
        sub_county = facility.sub_county or SubCounty.objects.filter(county=county).first()
        return county, sub_county

    def _ensure_demo_users(self, *, dry_run: bool) -> dict[str, object]:
        User = get_user_model()
        defaults = {
            "is_active": True,
            "email": "demo-surgery@vitora.local",
            "first_name": "Demo",
            "last_name": "Surgery",
        }
        anesthetist_defaults = {
            "is_active": True,
            "email": "demo-anesthesia@vitora.local",
            "first_name": "Demo",
            "last_name": "Anesthetist",
        }
        if dry_run:
            surgeon = User(username=f"{DEMO_USER_PREFIX}surgeon", **defaults)
            anesthetist = User(username=f"{DEMO_USER_PREFIX}anesthetist", **anesthetist_defaults)
            nurse = User(
                username=f"{DEMO_USER_PREFIX}nurse",
                email="demo-pacu@vitora.local",
                first_name="Demo",
                last_name="PACU",
                is_active=True,
            )
            return {"surgeon": surgeon, "anesthetist": anesthetist, "nurse": nurse}

        surgeon, _ = User.objects.get_or_create(
            username=f"{DEMO_USER_PREFIX}surgeon",
            defaults=defaults,
        )
        anesthetist, _ = User.objects.get_or_create(
            username=f"{DEMO_USER_PREFIX}anesthetist",
            defaults=anesthetist_defaults,
        )
        nurse, _ = User.objects.get_or_create(
            username=f"{DEMO_USER_PREFIX}nurse",
            defaults={
                "email": "demo-pacu@vitora.local",
                "first_name": "Demo",
                "last_name": "PACU",
                "is_active": True,
            },
        )
        return {"surgeon": surgeon, "anesthetist": anesthetist, "nurse": nurse}

    def _seed_cases(
        self,
        *,
        organization: Organization,
        facility: Facility,
        users: dict[str, object],
        dry_run: bool,
    ) -> tuple[int, int]:
        created_patients = 0
        created_cases = 0

        for spec in DEMO_CASE_SPECS:
            patient, patient_created = self._get_or_create_patient(
                spec["patient"], organization, facility, dry_run=dry_run
            )
            created_patients += int(patient_created)
            procedure = self._get_or_create_procedure(
                spec["procedure"], organization, facility, dry_run=dry_run
            )
            theatre = self._get_or_create_theatre(
                spec["theatre"], organization, facility, dry_run=dry_run
            )
            _, case_created = self._get_or_create_case(
                patient=patient,
                procedure=procedure,
                theatre=theatre,
                spec=spec,
                facility=facility,
                organization=organization,
                users=users,
                dry_run=dry_run,
            )
            created_cases += int(case_created)

        return created_patients, created_cases

    def _get_or_create_patient(
        self, patient_spec: dict, organization: Organization, facility: Facility, *, dry_run: bool
    ):
        tagged_last_name = f"{patient_spec['last_name']}{DEMO_SUFFIX}"
        existing = Patient.objects.filter(
            first_name=patient_spec["first_name"],
            last_name=tagged_last_name,
            date_of_birth=patient_spec["date_of_birth"],
        ).first()
        if existing:
            self.stdout.write(
                f"  ⏭  Patient {existing.first_name} {existing.last_name} already exists"
            )
            return existing, False

        county, sub_county = self._resolve_location(facility, patient_spec["county_name"])
        if county is None or sub_county is None:
            raise CommandError(
                "Cannot seed surgical demo patients without county and sub-county data."
            )

        if dry_run:
            patient = Patient(
                first_name=patient_spec["first_name"],
                last_name=tagged_last_name,
                date_of_birth=patient_spec["date_of_birth"],
                gender=patient_spec["gender"],
                phone_number=patient_spec.get("phone_number", ""),
                county=county,
                sub_county=sub_county,
                organization=organization,
                registered_at_facility=facility,
                referral_source="self",
            )
            return patient, True

        patient = Patient.objects.create(
            first_name=patient_spec["first_name"],
            last_name=tagged_last_name,
            date_of_birth=patient_spec["date_of_birth"],
            gender=patient_spec["gender"],
            phone_number=patient_spec.get("phone_number", ""),
            county=county,
            sub_county=sub_county,
            organization=organization,
            registered_at_facility=facility,
            referral_source="self",
        )
        self.stdout.write(f"  ✅  Patient {patient.first_name} {patient.last_name} ({patient.mrn})")
        return patient, True

    def _get_or_create_procedure(
        self, procedure_spec: dict, organization: Organization, facility: Facility, *, dry_run: bool
    ):
        existing = ProcedureCatalog.objects.filter(code=procedure_spec["code"]).first()
        if existing:
            return existing

        if dry_run:
            return ProcedureCatalog(
                code=procedure_spec["code"],
                name=procedure_spec["name"],
                category=ProcedureCatalog.Category.SURGICAL,
                body_system=procedure_spec["body_system"],
                risk_level=procedure_spec["risk_level"],
                tibabot_procedure_key=procedure_spec["tibabot_procedure_key"],
                typical_duration_minutes=procedure_spec["duration"],
                consent_required=True,
                requires_anesthesia=True,
                anesthesia_type=procedure_spec["anesthesia_type"],
                is_active=True,
                organization=organization,
                facility=facility,
            )

        return ProcedureCatalog.objects.create(
            code=procedure_spec["code"],
            name=procedure_spec["name"],
            category=ProcedureCatalog.Category.SURGICAL,
            body_system=procedure_spec["body_system"],
            risk_level=procedure_spec["risk_level"],
            tibabot_procedure_key=procedure_spec["tibabot_procedure_key"],
            typical_duration_minutes=procedure_spec["duration"],
            consent_required=True,
            requires_anesthesia=True,
            anesthesia_type=procedure_spec["anesthesia_type"],
            is_active=True,
            organization=organization,
            facility=facility,
        )

    def _get_or_create_theatre(
        self, theatre_spec: dict, organization: Organization, facility: Facility, *, dry_run: bool
    ):
        existing = OperatingTheatre.objects.filter(
            facility=facility, code=theatre_spec["code"]
        ).first()
        if existing:
            return existing

        if dry_run:
            return OperatingTheatre(
                code=theatre_spec["code"],
                name=theatre_spec["name"],
                theatre_type=theatre_spec["theatre_type"],
                location="Demo Surgical Suite",
                organization=organization,
                facility=facility,
                is_active=True,
            )

        return OperatingTheatre.objects.create(
            code=theatre_spec["code"],
            name=theatre_spec["name"],
            theatre_type=theatre_spec["theatre_type"],
            location="Demo Surgical Suite",
            organization=organization,
            facility=facility,
            is_active=True,
        )

    def _get_or_create_case(
        self,
        *,
        patient,
        procedure,
        theatre,
        spec: dict,
        facility: Facility,
        organization: Organization,
        users: dict[str, object],
        dry_run: bool,
    ):
        scheduled_date = timezone.localdate() + timedelta(days=spec["scheduled_day_offset"])
        existing = SurgeryCase.objects.filter(
            patient=patient,
            primary_procedure=procedure,
            scheduled_date=scheduled_date,
            diagnosis=spec["diagnosis"],
        ).first()
        if existing:
            self.stdout.write(f"  ⏭  Case {existing.case_number} already exists")
            return existing, False

        if dry_run:
            case = SurgeryCase(
                patient=patient,
                primary_procedure=procedure,
                theatre=theatre,
                scheduled_date=scheduled_date,
                scheduled_start_time=spec["scheduled_time"],
                estimated_duration_minutes=spec["procedure"]["duration"],
                priority=spec["priority"],
                diagnosis=spec["diagnosis"],
                laterality=spec["laterality"],
                asa_class=spec["asa_class"],
                anesthesia_type=spec["procedure"]["anesthesia_type"],
                requesting_doctor=users["surgeon"],
                organization=organization,
                facility=facility,
            )
            return case, True

        case = SurgeryCase.objects.create(
            patient=patient,
            primary_procedure=procedure,
            theatre=theatre,
            scheduled_date=scheduled_date,
            scheduled_start_time=spec["scheduled_time"],
            estimated_duration_minutes=spec["procedure"]["duration"],
            priority=spec["priority"],
            diagnosis=spec["diagnosis"],
            laterality=spec["laterality"],
            asa_class=spec["asa_class"],
            anesthesia_type=spec["procedure"]["anesthesia_type"],
            requesting_doctor=users["surgeon"],
            organization=organization,
            facility=facility,
        )
        self._apply_status_and_related_records(case=case, status=spec["status"], users=users)
        self.stdout.write(f"  ✅  Case {case.case_number} seeded in status {case.status}")
        return case, True

    def _apply_status_and_related_records(
        self, *, case: SurgeryCase, status: str, users: dict[str, object]
    ) -> None:
        surgeon = users["surgeon"]
        anesthetist = users["anesthetist"]
        nurse = users["nurse"]

        if status in {
            SurgeryCase.CaseStatus.SCHEDULED,
            SurgeryCase.CaseStatus.PRE_OP,
            SurgeryCase.CaseStatus.IN_THEATRE,
            SurgeryCase.CaseStatus.IN_SURGERY,
            SurgeryCase.CaseStatus.IN_PACU,
            SurgeryCase.CaseStatus.DISCHARGED,
        }:
            case.schedule(user=surgeon)
        if status in {
            SurgeryCase.CaseStatus.PRE_OP,
            SurgeryCase.CaseStatus.IN_THEATRE,
            SurgeryCase.CaseStatus.IN_SURGERY,
            SurgeryCase.CaseStatus.IN_PACU,
            SurgeryCase.CaseStatus.DISCHARGED,
        }:
            case.start_pre_op(user=surgeon)
        if status in {
            SurgeryCase.CaseStatus.IN_THEATRE,
            SurgeryCase.CaseStatus.IN_SURGERY,
            SurgeryCase.CaseStatus.IN_PACU,
            SurgeryCase.CaseStatus.DISCHARGED,
        }:
            case.enter_theatre(user=surgeon)
        if status in {
            SurgeryCase.CaseStatus.IN_SURGERY,
            SurgeryCase.CaseStatus.IN_PACU,
            SurgeryCase.CaseStatus.DISCHARGED,
        }:
            case.start_surgery(user=surgeon)
        if status in {SurgeryCase.CaseStatus.IN_PACU, SurgeryCase.CaseStatus.DISCHARGED}:
            case.end_surgery(user=surgeon)
        if status == SurgeryCase.CaseStatus.DISCHARGED:
            case.discharge(user=surgeon)

        checklist, _ = WHOSafetyChecklist.objects.get_or_create(surgery_case=case)
        if case.status in {
            SurgeryCase.CaseStatus.PRE_OP,
            SurgeryCase.CaseStatus.IN_THEATRE,
            SurgeryCase.CaseStatus.IN_SURGERY,
            SurgeryCase.CaseStatus.IN_PACU,
            SurgeryCase.CaseStatus.DISCHARGED,
        }:
            checklist.patient_identity_confirmed = True
            checklist.procedure_site_marked = True
            checklist.consent_signed = True
            checklist.anesthesia_machine_checked = True
            checklist.pulse_oximeter_attached = True
            checklist.complete_sign_in(surgeon)
        if case.status in {
            SurgeryCase.CaseStatus.IN_SURGERY,
            SurgeryCase.CaseStatus.IN_PACU,
            SurgeryCase.CaseStatus.DISCHARGED,
        }:
            checklist.team_members_introduced = True
            checklist.patient_name_confirmed = True
            checklist.procedure_confirmed = True
            checklist.site_confirmed = True
            checklist.complete_time_out(surgeon)
        if case.status in {SurgeryCase.CaseStatus.IN_PACU, SurgeryCase.CaseStatus.DISCHARGED}:
            checklist.procedure_name_recorded = True
            checklist.instrument_count_correct = True
            checklist.sponge_count_correct = True
            checklist.needle_count_correct = True
            checklist.complete_sign_out(surgeon)
        checklist.save()

        record, _ = AnesthesiaRecord.objects.get_or_create(
            surgery_case=case,
            defaults={"anesthesiologist": anesthetist},
        )
        record.anesthesiologist = anesthetist
        if case.status in {
            SurgeryCase.CaseStatus.PRE_OP,
            SurgeryCase.CaseStatus.IN_THEATRE,
            SurgeryCase.CaseStatus.IN_SURGERY,
            SurgeryCase.CaseStatus.IN_PACU,
            SurgeryCase.CaseStatus.DISCHARGED,
        }:
            record.pre_op_assessment_at = timezone.now() - timedelta(hours=2)
            record.mallampati_class = "II"
            record.npo_confirmed = True
            record.anesthesia_consent_obtained = True
            record.risks_explained = True
        if case.status in {
            SurgeryCase.CaseStatus.IN_SURGERY,
            SurgeryCase.CaseStatus.IN_PACU,
            SurgeryCase.CaseStatus.DISCHARGED,
        }:
            record.induction_time = timezone.now() - timedelta(hours=1, minutes=20)
            record.intubation_time = timezone.now() - timedelta(hours=1, minutes=10)
            record.estimated_blood_loss = 150
            record.pain_management_plan = "Paracetamol and tramadol as needed"
        if case.status in {SurgeryCase.CaseStatus.IN_PACU, SurgeryCase.CaseStatus.DISCHARGED}:
            record.pacu_handover_at = timezone.now() - timedelta(minutes=30)
            record.pacu_handover_notes = "Stable vitals on transfer to PACU"
        record.save()

        if case.status in {
            SurgeryCase.CaseStatus.IN_SURGERY,
            SurgeryCase.CaseStatus.IN_PACU,
            SurgeryCase.CaseStatus.DISCHARGED,
        }:
            note, _ = OperativeNote.objects.get_or_create(
                surgery_case=case,
                defaults={
                    "dictated_by": surgeon,
                    "pre_operative_diagnosis": case.diagnosis,
                    "post_operative_diagnosis": case.diagnosis,
                    "procedure_performed": case.primary_procedure.name,
                    "findings": "Expected operative findings for demo case",
                    "technique_description": "Standard operative technique documented for demo walkthrough.",
                },
            )
            note.dictated_by = surgeon
            note.pre_operative_diagnosis = case.diagnosis
            note.post_operative_diagnosis = case.diagnosis
            note.procedure_performed = case.primary_procedure.name
            note.findings = "Expected operative findings for demo case"
            note.technique_description = (
                "Standard operative technique documented for demo walkthrough."
            )
            note.post_operative_plan = "Routine post-operative monitoring"
            note.estimated_blood_loss = 150
            if case.status in {SurgeryCase.CaseStatus.IN_PACU, SurgeryCase.CaseStatus.DISCHARGED}:
                note.sign(surgeon)
            else:
                note.save()

        if case.status in {SurgeryCase.CaseStatus.IN_PACU, SurgeryCase.CaseStatus.DISCHARGED}:
            pacu, _ = PACURecord.objects.get_or_create(
                surgery_case=case,
                defaults={
                    "arrival_time": timezone.now() - timedelta(minutes=25),
                    "arriving_nurse": nurse,
                    "initial_aldrete_score": 8,
                    "initial_pain_score": 3,
                },
            )
            pacu.arriving_nurse = nurse
            pacu.initial_aldrete_score = 8
            pacu.initial_pain_score = 3
            pacu.record_handover(
                recipient="Ward nurse", notes="Stable, continue routine monitoring"
            )
            if case.status == SurgeryCase.CaseStatus.DISCHARGED:
                pacu.discharge_time = timezone.now() - timedelta(minutes=5)
                pacu.discharge_aldrete_score = 9
                pacu.discharge_destination = PACURecord.DischargeDestination.WARD
                pacu.discharged_by = nurse
                pacu.discharge_notes = "Transferred to ward in stable condition"
            pacu.save()

    def _clear_demo_data(self, *, dry_run: bool):
        demo_patients = Patient.objects.filter(last_name__endswith=DEMO_SUFFIX)
        count = demo_patients.count()
        if count == 0:
            self.stdout.write(self.style.NOTICE("No demo surgical patients found."))
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"Would delete {count} demo surgical patient(s) and related records."
                )
            )
            return

        patched = []
        for field in Patient._meta.get_fields():
            if hasattr(field, "on_delete") and field.on_delete is PROTECT:
                patched.append((field, PROTECT))
                field.on_delete = CASCADE

        try:
            _, counts = demo_patients.delete()
        finally:
            for field, original in patched:
                field.on_delete = original

        SurgeryCase.objects.filter(theatre__code__startswith="DEMO-OT-").delete()
        OperatingTheatre.objects.filter(code__startswith="DEMO-OT-").delete()
        ProcedureCatalog.objects.filter(
            code__in=[spec["procedure"]["code"] for spec in DEMO_CASE_SPECS]
        ).delete()
        get_user_model().objects.filter(username__startswith=DEMO_USER_PREFIX).delete()

        self.stdout.write(
            self.style.SUCCESS(f"Deleted {count} demo surgical patient(s) and related records.")
        )
        for model_label, deleted_count in sorted(counts.items()):
            if deleted_count:
                self.stdout.write(f"  {model_label}: {deleted_count}")
