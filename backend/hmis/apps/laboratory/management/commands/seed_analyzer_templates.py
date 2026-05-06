"""
Management command to seed default AnalyzerDriverTemplate records.

Seeds pre-configured driver templates for common laboratory analyzers
found in Kenyan healthcare facilities (Sysmex, Roche, Abbott, Beckman,
Mindray, GeneXpert, Horiba, Erba, Dirui).
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.laboratory.analyzers.models import AnalyzerDriverTemplate

TEMPLATES = [
    # --- Hematology ---
    {
        "name": "Sysmex XN-Series ASTM",
        "manufacturer": "Sysmex",
        "model_pattern": "XN-*",
        "category": "HEMATOLOGY",
        "description": (
            "Sysmex XN-series hematology analyzers (XN-1000, XN-2000, XN-3000). "
            "ASTM E1394 protocol over TCP. Supports CBC, 5-part diff, reticulocytes."
        ),
        "protocol": "ASTM",
        "default_port": 9100,
        "default_encoding": "ascii",
        "default_config": {
            "timeout_ms": 30000,
            "frame_size": 240,
            "checksum": True,
            "sender_id": "LIS",
            "receiver_id": "XN",
        },
        "default_field_mapping": {
            "sample_id": "O.2",
            "test_code": "R.2.3",
            "result_value": "R.3",
            "result_unit": "R.4",
            "flags": "R.6",
        },
        "notes": "Requires firmware ≥01-10. Frame size 240 for XN-series.",
    },
    {
        "name": "Mindray BC-Series ASTM",
        "manufacturer": "Mindray",
        "model_pattern": "BC-*",
        "category": "HEMATOLOGY",
        "description": (
            "Mindray BC-series hematology analyzers (BC-5000, BC-5150, BC-6200). "
            "ASTM protocol. Common in Kenyan Level 4-5 facilities."
        ),
        "protocol": "ASTM",
        "default_port": 9200,
        "default_encoding": "ascii",
        "default_config": {
            "timeout_ms": 30000,
            "frame_size": 240,
            "checksum": True,
            "sender_id": "LIS",
            "receiver_id": "BC",
        },
        "default_field_mapping": {
            "sample_id": "O.2",
            "test_code": "R.2.3",
            "result_value": "R.3",
            "result_unit": "R.4",
            "flags": "R.6",
        },
        "notes": "Widely deployed in Kenya. Compatible with LIS2-A2.",
    },
    {
        "name": "Horiba ABX Pentra ASTM",
        "manufacturer": "Horiba",
        "model_pattern": "Pentra*",
        "category": "HEMATOLOGY",
        "description": (
            "Horiba ABX Pentra series (Pentra 60, Pentra 80, Pentra XL80). "
            "ASTM/LIS2-A2. Common in Kenyan Level 3-4 facilities."
        ),
        "protocol": "ASTM",
        "default_port": 9100,
        "default_encoding": "ascii",
        "default_config": {
            "timeout_ms": 30000,
            "frame_size": 63,
            "checksum": True,
            "sender_id": "LIS",
            "receiver_id": "PENTRA",
        },
        "default_field_mapping": {
            "sample_id": "O.2",
            "test_code": "R.2.3",
            "result_value": "R.3",
            "result_unit": "R.4",
            "flags": "R.6",
        },
        "notes": "Uses smaller frame size (63 bytes). Verify frame_size matches firmware.",
    },
    # --- Chemistry ---
    {
        "name": "Roche cobas c-Series ASTM",
        "manufacturer": "Roche",
        "model_pattern": "cobas c*",
        "category": "CHEMISTRY",
        "description": (
            "Roche cobas c-series clinical chemistry (cobas c111, c311, c501, c701). "
            "ASTM protocol. Standard in Kenyan referral hospitals."
        ),
        "protocol": "ASTM",
        "default_port": 9101,
        "default_encoding": "ascii",
        "default_config": {
            "timeout_ms": 45000,
            "frame_size": 240,
            "checksum": True,
            "sender_id": "LIS",
            "receiver_id": "COBAS",
        },
        "default_field_mapping": {
            "sample_id": "O.2",
            "test_code": "R.2.3",
            "result_value": "R.3",
            "result_unit": "R.4",
            "flags": "R.6",
            "reference_range": "R.5",
        },
        "notes": "cobas c111 uses serial bridge. c311+ support TCP natively.",
    },
    {
        "name": "Erba Chem Series ASTM",
        "manufacturer": "Erba",
        "model_pattern": "Chem*",
        "category": "CHEMISTRY",
        "description": (
            "Erba Mannheim Chem series (Chem 5x, Chem 7, XL-180, XL-640). "
            "ASTM/LIS2-A2. Common in Kenyan Level 4 facilities."
        ),
        "protocol": "ASTM",
        "default_port": 9100,
        "default_encoding": "ascii",
        "default_config": {
            "timeout_ms": 30000,
            "frame_size": 240,
            "checksum": True,
            "sender_id": "LIS",
            "receiver_id": "ERBA",
        },
        "default_field_mapping": {
            "sample_id": "O.2",
            "test_code": "R.2.3",
            "result_value": "R.3",
            "result_unit": "R.4",
            "flags": "R.6",
        },
        "notes": "Older models may need RS-232 serial bridge. Check baud rate settings.",
    },
    # --- Immunoassay ---
    {
        "name": "Abbott Architect HL7",
        "manufacturer": "Abbott",
        "model_pattern": "Architect*",
        "category": "IMMUNOASSAY",
        "description": (
            "Abbott Architect i-series immunoassay (i1000SR, i2000SR). "
            "HL7 v2.5 over MLLP. Used for HIV VL, Hepatitis, Thyroid in Kenya."
        ),
        "protocol": "HL7",
        "default_port": 2575,
        "default_encoding": "utf-8",
        "default_config": {
            "version": "2.5",
            "receiving_application": "LIS",
            "receiving_facility": "VITORA",
            "sending_application": "ARCHITECT",
            "ack_mode": "original",
        },
        "default_field_mapping": {
            "sample_id": "OBR.3",
            "test_code": "OBX.3.1",
            "result_value": "OBX.5",
            "result_unit": "OBX.6",
            "flags": "OBX.8",
            "reference_range": "OBX.7",
        },
        "notes": "Requires MLLP framing (0x0B header, 0x1C footer). HL7 v2.5.",
    },
    {
        "name": "Beckman Coulter Access HL7",
        "manufacturer": "Beckman Coulter",
        "model_pattern": "Access*",
        "category": "IMMUNOASSAY",
        "description": (
            "Beckman Coulter Access/UniCel DxI immunoassay analyzers. "
            "HL7 v2.3.1 over MLLP. Used for specialized immunoassays."
        ),
        "protocol": "HL7",
        "default_port": 2575,
        "default_encoding": "utf-8",
        "default_config": {
            "version": "2.3.1",
            "receiving_application": "LIS",
            "receiving_facility": "VITORA",
            "sending_application": "ACCESS",
            "ack_mode": "original",
        },
        "default_field_mapping": {
            "sample_id": "OBR.3",
            "test_code": "OBX.3.1",
            "result_value": "OBX.5",
            "result_unit": "OBX.6",
            "flags": "OBX.8",
        },
        "notes": "HL7 v2.3.1. Some models use custom Z-segments for QC data.",
    },
    # --- Molecular / PCR ---
    {
        "name": "Cepheid GeneXpert ASTM",
        "manufacturer": "Cepheid",
        "model_pattern": "GeneXpert*",
        "category": "MOLECULAR",
        "description": (
            "Cepheid GeneXpert (GX-IV, GX-XVI, Infinity). "
            "ASTM E1394 over TCP. Critical for TB/MDR-TB and COVID diagnostics in Kenya."
        ),
        "protocol": "ASTM",
        "default_port": 9101,
        "default_encoding": "ascii",
        "default_config": {
            "timeout_ms": 60000,
            "frame_size": 240,
            "checksum": True,
            "sender_id": "LIS",
            "receiver_id": "GXPERT",
        },
        "default_field_mapping": {
            "sample_id": "O.2",
            "test_code": "R.2.3",
            "result_value": "R.3",
            "result_unit": "R.4",
            "flags": "R.6",
        },
        "notes": (
            "GeneXpert Dx software must have LIS connectivity enabled. "
            "60s timeout for large cartridge batches."
        ),
    },
    # --- Urinalysis ---
    {
        "name": "Dirui H-Series Serial",
        "manufacturer": "Dirui",
        "model_pattern": "H-*",
        "category": "URINALYSIS",
        "description": (
            "Dirui H-series urinalysis analyzers (H-100, H-500, H-800). "
            "Serial RS-232 via TCP bridge. Widely used in Kenyan Level 3 facilities."
        ),
        "protocol": "SERIAL",
        "default_port": 8100,
        "default_encoding": "ascii",
        "default_config": {
            "baud_rate": 9600,
            "data_bits": 8,
            "stop_bits": 1,
            "parity": "none",
            "flow_control": "none",
            "timeout_ms": 15000,
        },
        "default_field_mapping": {
            "sample_id": "O.2",
            "test_code": "R.2.3",
            "result_value": "R.3",
            "result_unit": "R.4",
        },
        "notes": (
            "Requires a serial-to-TCP bridge (e.g., Moxa NPort, USR-TCP232). "
            "Baud rate 9600 is standard for H-series."
        ),
    },
]


class Command(BaseCommand):
    help = "Seed default analyzer driver templates for common Kenyan lab instruments."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview templates that would be created without saving.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        created_count = 0
        skipped_count = 0

        for tpl_data in TEMPLATES:
            name = tpl_data["name"]
            exists = AnalyzerDriverTemplate.objects.filter(name=name).exists()
            if exists:
                skipped_count += 1
                if options["verbosity"] >= 2:
                    self.stdout.write(f"  SKIP: {name} (already exists)")
                continue

            if dry_run:
                self.stdout.write(self.style.SUCCESS(f"  WOULD CREATE: {name}"))
                created_count += 1
                continue

            AnalyzerDriverTemplate.objects.create(**tpl_data)
            created_count += 1
            if options["verbosity"] >= 2:
                self.stdout.write(self.style.SUCCESS(f"  CREATED: {name}"))

        self.stdout.write("")
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN: Would create {created_count}, skip {skipped_count} "
                    f"(of {len(TEMPLATES)} total templates)"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Done: Created {created_count}, skipped {skipped_count} "
                    f"(of {len(TEMPLATES)} total templates)"
                )
            )
