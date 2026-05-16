"""
Management command to seed the imaging procedure catalog.

Seeds common imaging procedures used in Kenya healthcare facilities
with costs, modality, body region, and SHA intervention codes.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand

from hmis.apps.imaging.models import ImagingProcedure


class Command(BaseCommand):
    """Seed imaging procedure catalog with common Kenya procedures."""

    help = "Seed the imaging procedure catalog with common Kenya procedures"

    # Common Kenya imaging procedures with approximate costs (KES)
    IMAGING_PROCEDURES = [
        # X-RAY PROCEDURES
        {
            "code": "XR-CHEST-PA",
            "name": "Chest X-Ray (PA View)",
            "modality": "XR",
            "body_region": "CHEST",
            "cost": Decimal("1500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-001",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-CHEST-APLAT",
            "name": "Chest X-Ray (PA and Lateral)",
            "modality": "XR",
            "body_region": "CHEST",
            "cost": Decimal("2000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-002",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-ABDOMEN",
            "name": "Abdominal X-Ray",
            "modality": "XR",
            "body_region": "ABDOMEN",
            "cost": Decimal("1500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-003",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-SKULL-AP-LAT",
            "name": "Skull X-Ray (AP and Lateral)",
            "modality": "XR",
            "body_region": "HEAD",
            "cost": Decimal("2000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-004",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-SPINE-CERVICAL",
            "name": "Cervical Spine X-Ray",
            "modality": "XR",
            "body_region": "SPINE",
            "cost": Decimal("2500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-005",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-SPINE-THORACIC",
            "name": "Thoracic Spine X-Ray",
            "modality": "XR",
            "body_region": "SPINE",
            "cost": Decimal("2500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-006",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-SPINE-LUMBAR",
            "name": "Lumbosacral Spine X-Ray",
            "modality": "XR",
            "body_region": "SPINE",
            "cost": Decimal("2500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-007",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-PELVIS",
            "name": "Pelvis X-Ray",
            "modality": "XR",
            "body_region": "PELVIS",
            "cost": Decimal("2000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-008",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-KNEE",
            "name": "Knee X-Ray",
            "modality": "XR",
            "body_region": "LOWER_EXTREMITY",
            "cost": Decimal("1500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-009",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-ANKLE",
            "name": "Ankle X-Ray",
            "modality": "XR",
            "body_region": "LOWER_EXTREMITY",
            "cost": Decimal("1500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-010",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-FOOT",
            "name": "Foot X-Ray",
            "modality": "XR",
            "body_region": "LOWER_EXTREMITY",
            "cost": Decimal("1500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-011",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-HIP",
            "name": "Hip X-Ray",
            "modality": "XR",
            "body_region": "LOWER_EXTREMITY",
            "cost": Decimal("2000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-012",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-SHOULDER",
            "name": "Shoulder X-Ray",
            "modality": "XR",
            "body_region": "UPPER_EXTREMITY",
            "cost": Decimal("1500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-013",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-ELBOW",
            "name": "Elbow X-Ray",
            "modality": "XR",
            "body_region": "UPPER_EXTREMITY",
            "cost": Decimal("1500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-014",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-WRIST",
            "name": "Wrist X-Ray",
            "modality": "XR",
            "body_region": "UPPER_EXTREMITY",
            "cost": Decimal("1500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-015",
            "turnaround_hours": 24,
        },
        {
            "code": "XR-HAND",
            "name": "Hand X-Ray",
            "modality": "XR",
            "body_region": "UPPER_EXTREMITY",
            "cost": Decimal("1500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-XR-016",
            "turnaround_hours": 24,
        },
        # ULTRASOUND PROCEDURES
        {
            "code": "US-ABDOMEN",
            "name": "Abdominal Ultrasound",
            "modality": "US",
            "body_region": "ABDOMEN",
            "cost": Decimal("3000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-US-001",
            "turnaround_hours": 24,
        },
        {
            "code": "US-PELVIS",
            "name": "Pelvic Ultrasound",
            "modality": "US",
            "body_region": "PELVIS",
            "cost": Decimal("3000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-US-002",
            "turnaround_hours": 24,
        },
        {
            "code": "US-OBSTETRIC",
            "name": "Obstetric Ultrasound",
            "modality": "US",
            "body_region": "PELVIS",
            "cost": Decimal("3500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-US-003",
            "turnaround_hours": 24,
        },
        {
            "code": "US-RENAL",
            "name": "Renal Ultrasound (KUB)",
            "modality": "US",
            "body_region": "ABDOMEN",
            "cost": Decimal("3000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-US-004",
            "turnaround_hours": 24,
        },
        {
            "code": "US-THYROID",
            "name": "Thyroid Ultrasound",
            "modality": "US",
            "body_region": "NECK",
            "cost": Decimal("3000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-US-005",
            "turnaround_hours": 24,
        },
        {
            "code": "US-BREAST",
            "name": "Breast Ultrasound",
            "modality": "US",
            "body_region": "CHEST",
            "cost": Decimal("3500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-US-006",
            "turnaround_hours": 24,
        },
        {
            "code": "US-CARDIAC-ECHO",
            "name": "Echocardiogram (Cardiac Ultrasound)",
            "modality": "US",
            "body_region": "CHEST",
            "cost": Decimal("5000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-US-007",
            "turnaround_hours": 48,
        },
        {
            "code": "US-DOPPLER-VENOUS",
            "name": "Venous Doppler Ultrasound",
            "modality": "US",
            "body_region": "LOWER_EXTREMITY",
            "cost": Decimal("4000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-US-008",
            "turnaround_hours": 24,
        },
        {
            "code": "US-CAROTID",
            "name": "Carotid Doppler Ultrasound",
            "modality": "US",
            "body_region": "NECK",
            "cost": Decimal("4500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-US-009",
            "turnaround_hours": 24,
        },
        {
            "code": "US-PROSTATE-TRUS",
            "name": "Transrectal Prostate Ultrasound",
            "modality": "US",
            "body_region": "PELVIS",
            "cost": Decimal("4000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-US-010",
            "turnaround_hours": 48,
        },
        # CT SCAN PROCEDURES
        {
            "code": "CT-HEAD-NC",
            "name": "CT Head without Contrast",
            "modality": "CT",
            "body_region": "HEAD",
            "cost": Decimal("8000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-001",
            "turnaround_hours": 48,
        },
        {
            "code": "CT-HEAD-C",
            "name": "CT Head with Contrast",
            "modality": "CT",
            "body_region": "HEAD",
            "cost": Decimal("12000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-002",
            "requires_contrast": True,
            "turnaround_hours": 48,
        },
        {
            "code": "CT-CHEST-NC",
            "name": "CT Chest without Contrast",
            "modality": "CT",
            "body_region": "CHEST",
            "cost": Decimal("10000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-003",
            "turnaround_hours": 48,
        },
        {
            "code": "CT-CHEST-C",
            "name": "CT Chest with Contrast",
            "modality": "CT",
            "body_region": "CHEST",
            "cost": Decimal("15000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-004",
            "requires_contrast": True,
            "turnaround_hours": 48,
        },
        {
            "code": "CT-ABDOMEN-NC",
            "name": "CT Abdomen without Contrast",
            "modality": "CT",
            "body_region": "ABDOMEN",
            "cost": Decimal("10000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-005",
            "turnaround_hours": 48,
        },
        {
            "code": "CT-ABDOMEN-C",
            "name": "CT Abdomen with Contrast",
            "modality": "CT",
            "body_region": "ABDOMEN",
            "cost": Decimal("15000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-006",
            "requires_contrast": True,
            "turnaround_hours": 48,
        },
        {
            "code": "CT-ABDOMEN-PELVIS",
            "name": "CT Abdomen and Pelvis with Contrast",
            "modality": "CT",
            "body_region": "ABDOMEN",
            "cost": Decimal("20000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-007",
            "requires_contrast": True,
            "turnaround_hours": 48,
        },
        {
            "code": "CT-SPINE-CERVICAL",
            "name": "CT Cervical Spine",
            "modality": "CT",
            "body_region": "SPINE",
            "cost": Decimal("10000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-008",
            "turnaround_hours": 48,
        },
        {
            "code": "CT-SPINE-LUMBAR",
            "name": "CT Lumbar Spine",
            "modality": "CT",
            "body_region": "SPINE",
            "cost": Decimal("10000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-009",
            "turnaround_hours": 48,
        },
        {
            "code": "CT-ANGIOGRAPHY",
            "name": "CT Angiography",
            "modality": "CT",
            "body_region": "CHEST",
            "cost": Decimal("25000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-010",
            "requires_contrast": True,
            "turnaround_hours": 48,
        },
        {
            "code": "CTPA",
            "name": "CT Pulmonary Angiography",
            "modality": "CT",
            "body_region": "CHEST",
            "cost": Decimal("25000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-CT-011",
            "requires_contrast": True,
            "turnaround_hours": 24,
            "special_preparation": "NPO for 4 hours. Check renal function.",
        },
        # MRI PROCEDURES
        {
            "code": "MRI-BRAIN-NC",
            "name": "MRI Brain without Contrast",
            "modality": "MRI",
            "body_region": "HEAD",
            "cost": Decimal("15000.00"),
            "sha_claimable": False,
            "sha_intervention_code": "SHA-MRI-001",
            "turnaround_hours": 72,
            "special_preparation": "Remove all metal objects. Check for pacemaker/implants.",
        },
        {
            "code": "MRI-BRAIN-C",
            "name": "MRI Brain with Contrast",
            "modality": "MRI",
            "body_region": "HEAD",
            "cost": Decimal("20000.00"),
            "sha_claimable": False,
            "sha_intervention_code": "SHA-MRI-002",
            "requires_contrast": True,
            "turnaround_hours": 72,
            "special_preparation": "Remove all metal objects. Check for pacemaker/implants. NPO 4 hours.",
        },
        {
            "code": "MRI-SPINE-CERVICAL",
            "name": "MRI Cervical Spine",
            "modality": "MRI",
            "body_region": "SPINE",
            "cost": Decimal("18000.00"),
            "sha_claimable": False,
            "sha_intervention_code": "SHA-MRI-003",
            "turnaround_hours": 72,
        },
        {
            "code": "MRI-SPINE-THORACIC",
            "name": "MRI Thoracic Spine",
            "modality": "MRI",
            "body_region": "SPINE",
            "cost": Decimal("18000.00"),
            "sha_claimable": False,
            "sha_intervention_code": "SHA-MRI-004",
            "turnaround_hours": 72,
        },
        {
            "code": "MRI-SPINE-LUMBAR",
            "name": "MRI Lumbar Spine",
            "modality": "MRI",
            "body_region": "SPINE",
            "cost": Decimal("18000.00"),
            "sha_claimable": False,
            "sha_intervention_code": "SHA-MRI-005",
            "turnaround_hours": 72,
        },
        {
            "code": "MRI-KNEE",
            "name": "MRI Knee",
            "modality": "MRI",
            "body_region": "LOWER_EXTREMITY",
            "cost": Decimal("18000.00"),
            "sha_claimable": False,
            "sha_intervention_code": "SHA-MRI-006",
            "turnaround_hours": 72,
        },
        {
            "code": "MRI-SHOULDER",
            "name": "MRI Shoulder",
            "modality": "MRI",
            "body_region": "UPPER_EXTREMITY",
            "cost": Decimal("18000.00"),
            "sha_claimable": False,
            "sha_intervention_code": "SHA-MRI-007",
            "turnaround_hours": 72,
        },
        {
            "code": "MRI-PELVIS",
            "name": "MRI Pelvis",
            "modality": "MRI",
            "body_region": "PELVIS",
            "cost": Decimal("20000.00"),
            "sha_claimable": False,
            "sha_intervention_code": "SHA-MRI-008",
            "turnaround_hours": 72,
        },
        {
            "code": "MRI-ABDOMEN",
            "name": "MRI Abdomen",
            "modality": "MRI",
            "body_region": "ABDOMEN",
            "cost": Decimal("22000.00"),
            "sha_claimable": False,
            "sha_intervention_code": "SHA-MRI-009",
            "turnaround_hours": 72,
        },
        # MAMMOGRAPHY
        {
            "code": "MG-BILATERAL",
            "name": "Bilateral Mammography",
            "modality": "MG",
            "body_region": "CHEST",
            "cost": Decimal("4000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-MG-001",
            "turnaround_hours": 48,
        },
        {
            "code": "MG-UNILATERAL",
            "name": "Unilateral Mammography",
            "modality": "MG",
            "body_region": "CHEST",
            "cost": Decimal("2500.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-MG-002",
            "turnaround_hours": 48,
        },
        # FLUOROSCOPY
        {
            "code": "FL-BARIUM-SWALLOW",
            "name": "Barium Swallow",
            "modality": "FL",
            "body_region": "CHEST",
            "cost": Decimal("5000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-FL-001",
            "requires_contrast": True,
            "turnaround_hours": 48,
            "special_preparation": "NPO overnight. No smoking on day of exam.",
        },
        {
            "code": "FL-BARIUM-MEAL",
            "name": "Barium Meal Follow-Through",
            "modality": "FL",
            "body_region": "ABDOMEN",
            "cost": Decimal("6000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-FL-002",
            "requires_contrast": True,
            "turnaround_hours": 48,
            "special_preparation": "NPO overnight.",
        },
        {
            "code": "FL-BARIUM-ENEMA",
            "name": "Barium Enema",
            "modality": "FL",
            "body_region": "ABDOMEN",
            "cost": Decimal("6000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-FL-003",
            "requires_contrast": True,
            "turnaround_hours": 48,
            "special_preparation": "Bowel preparation required. NPO overnight.",
        },
        {
            "code": "FL-IVU",
            "name": "Intravenous Urography (IVU)",
            "modality": "FL",
            "body_region": "ABDOMEN",
            "cost": Decimal("5000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-FL-004",
            "requires_contrast": True,
            "turnaround_hours": 48,
            "special_preparation": "Use bowel prep. NPO 6 hours.",
        },
        {
            "code": "FL-HSG",
            "name": "Hysterosalpingography (HSG)",
            "modality": "FL",
            "body_region": "PELVIS",
            "cost": Decimal("8000.00"),
            "sha_claimable": True,
            "sha_intervention_code": "SHA-FL-005",
            "requires_contrast": True,
            "turnaround_hours": 24,
            "special_preparation": "Schedule 7-10 days after menstruation. No intercourse 48 hrs before.",
        },
    ]

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Force update existing procedures (overwrite)",
        )
        parser.add_argument(
            "--facility",
            type=int,
            help="Facility ID to scope procedures to (required for multi-tenant)",
        )

    def handle(self, *args, **options):
        force = options["force"]
        facility_id = options.get("facility")

        facility = None
        organization = None
        if facility_id:
            from hmis.apps.core.models import Facility

            try:
                facility = Facility.objects.select_related("organization").get(pk=facility_id)
                organization = facility.organization
            except Facility.DoesNotExist:
                self.stderr.write(self.style.ERROR(f"Facility with ID {facility_id} not found."))
                return

        created_count = 0
        updated_count = 0
        skipped_count = 0

        for proc_data in self.IMAGING_PROCEDURES:
            code = proc_data["code"]
            filter_kwargs = {"code": code}
            if facility:
                filter_kwargs["facility"] = facility

            existing = ImagingProcedure.objects.filter(**filter_kwargs).first()

            if existing:
                if force:
                    for key, value in proc_data.items():
                        setattr(existing, key, value)
                    existing.save()
                    updated_count += 1
                    self.stdout.write(f"Updated: {code}")
                else:
                    skipped_count += 1
                    self.stdout.write(f"Skipped (exists): {code}")
            else:
                ImagingProcedure.objects.create(
                    facility=facility,
                    organization=organization,
                    **proc_data,
                )
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"Created: {code}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSeeding complete: {created_count} created, {updated_count} updated, {skipped_count} skipped"
            )
        )
