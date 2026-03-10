import csv
from pathlib import Path

import pytest
from django.core.management import call_command


@pytest.mark.django_db
class TestImportDrugsCommand:
    def _write_csv(self, csv_path: Path, rows: list[dict]) -> None:
        fieldnames = [
            "code",
            "generic_name",
            "brand_names",
            "category",
            "form",
            "strength",
            "unit",
            "schedule",
            "requires_prescription",
            "is_controlled",
            "is_narcotic",
            "keml_code",
            "is_essential",
            "sha_code",
            "default_reorder_level",
            "default_reorder_quantity",
            "storage_requirements",
            "reference_price",
            "is_active",
        ]

        with csv_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)

    def test_import_creates_drug_with_categories(self, tmp_path):
        from hmis.apps.pharmacy.models import Drug

        csv_path = tmp_path / "drug_catalog.csv"
        self._write_csv(
            csv_path,
            [
                {
                    "code": "DRG001",
                    "generic_name": "Amoxicillin",
                    "brand_names": "['Amoxil']",
                    "category": "ANTIBIOTIC",
                    "form": "CAPSULE",
                    "strength": "500mg",
                    "unit": "capsule",
                    "schedule": "POM",
                    "requires_prescription": "true",
                    "is_controlled": "false",
                    "is_narcotic": "false",
                    "keml_code": "J01CA04",
                    "is_essential": "true",
                    "sha_code": "",
                    "default_reorder_level": "50",
                    "default_reorder_quantity": "100",
                    "storage_requirements": "",
                    "reference_price": "10.5",
                    "is_active": "true",
                }
            ],
        )

        call_command("import_drugs", file=str(csv_path))

        drug = Drug.objects.get(code="DRG001")
        assert drug.categories == ["ANTIBIOTIC"]
        assert drug.category == "ANTIBIOTIC"  # backward-compat property

    def test_import_updates_existing_drug_categories(self, tmp_path):
        from hmis.apps.pharmacy.models import Drug

        Drug.objects.create(
            code="DRG002",
            generic_name="Paracetamol",
            strength="500mg",
            form="TABLET",
            categories=["OTHER"],
            unit="tablet",
        )

        csv_path = tmp_path / "drug_catalog.csv"
        self._write_csv(
            csv_path,
            [
                {
                    "code": "DRG002",
                    "generic_name": "Paracetamol",
                    "brand_names": "[]",
                    "category": "ANALGESIC",
                    "form": "TABLET",
                    "strength": "500mg",
                    "unit": "tablet",
                    "schedule": "OTC",
                    "requires_prescription": "false",
                    "is_controlled": "false",
                    "is_narcotic": "false",
                    "keml_code": "",
                    "is_essential": "false",
                    "sha_code": "",
                    "default_reorder_level": "50",
                    "default_reorder_quantity": "100",
                    "storage_requirements": "",
                    "reference_price": "",
                    "is_active": "true",
                }
            ],
        )

        call_command("import_drugs", file=str(csv_path))

        drug = Drug.objects.get(code="DRG002")
        assert drug.categories == ["ANALGESIC"]
        assert drug.category == "ANALGESIC"
