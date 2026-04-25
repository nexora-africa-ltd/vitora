import csv
from pathlib import Path

import pytest
from django.core.management import call_command


@pytest.mark.django_db
class TestImportICD11Command:
    def _write_csv(self, csv_path: Path, rows: list[dict]) -> None:
        fieldnames = [
            "Foundation URI",
            "Linearization (release) URI",
            "8Y",
            "BlockId",
            "Title",
            "ClassKind",
            "DepthInKind",
            "IsResidual",
            "PrimaryLocation",
            "ChapterNo",
            "BrowserLink",
            "iCatLink",
            "isLeaf",
            "noOfNonResidualChildren",
            "Primary tabulation",
            "Grouping1",
            "Grouping2",
            "Grouping3",
            "Grouping4",
            "Grouping5",
            "Version:2021 May 11 - 22:00 UTC",
        ]

        with csv_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)

    def test_import_creates_local_icd11_codes_and_normalizes_excel_codes(self, tmp_path):
        from hmis.apps.billing.models import ICD11CodeReference

        csv_path = tmp_path / "icd11.csv"
        self._write_csv(
            csv_path,
            [
                {
                    "Foundation URI": "http://id.who.int/icd/entity/257068234",
                    "Linearization (release) URI": "http://id.who.int/icd/release/11/2021-05/mms/257068234",
                    "8Y": "1A00",
                    "BlockId": "",
                    "Title": "Cholera",
                    "ClassKind": "category",
                    "DepthInKind": "1",
                    "IsResidual": "FALSE",
                    "PrimaryLocation": "TRUE",
                    "ChapterNo": "1",
                    "BrowserLink": "browser",
                    "iCatLink": "iCat",
                    "isLeaf": "TRUE",
                    "noOfNonResidualChildren": "0",
                    "Primary tabulation": "TRUE",
                    "Grouping1": "BlockL1-1A0",
                    "Grouping2": "",
                    "Grouping3": "",
                    "Grouping4": "",
                    "Grouping5": "",
                    "Version:2021 May 11 - 22:00 UTC": "",
                },
                {
                    "Foundation URI": "http://id.who.int/icd/entity/2054716425",
                    "Linearization (release) URI": "http://id.who.int/icd/release/11/2021-05/mms/2054716425",
                    "8Y": "1.00E+70",
                    "BlockId": "",
                    "Title": "Smallpox",
                    "ClassKind": "category",
                    "DepthInKind": "1",
                    "IsResidual": "FALSE",
                    "PrimaryLocation": "TRUE",
                    "ChapterNo": "1",
                    "BrowserLink": "browser",
                    "iCatLink": "iCat",
                    "isLeaf": "TRUE",
                    "noOfNonResidualChildren": "0",
                    "Primary tabulation": "TRUE",
                    "Grouping1": "BlockL1-1E7",
                    "Grouping2": "BlockL2-1E7",
                    "Grouping3": "",
                    "Grouping4": "",
                    "Grouping5": "",
                    "Version:2021 May 11 - 22:00 UTC": "",
                },
                {
                    "Foundation URI": "http://id.who.int/icd/entity/455894495",
                    "Linearization (release) URI": "http://id.who.int/icd/release/11/2021-05/mms/455894495",
                    "8Y": "",
                    "BlockId": "BlockL2-1A6",
                    "Title": "Syphilis",
                    "ClassKind": "block",
                    "DepthInKind": "2",
                    "IsResidual": "FALSE",
                    "PrimaryLocation": "TRUE",
                    "ChapterNo": "1",
                    "BrowserLink": "browser",
                    "iCatLink": "iCat",
                    "isLeaf": "FALSE",
                    "noOfNonResidualChildren": "4",
                    "Primary tabulation": "",
                    "Grouping1": "BlockL1-1A6",
                    "Grouping2": "",
                    "Grouping3": "",
                    "Grouping4": "",
                    "Grouping5": "",
                    "Version:2021 May 11 - 22:00 UTC": "",
                },
            ],
        )

        call_command("import_icd11", str(csv_path))

        assert ICD11CodeReference.objects.count() == 2
        assert ICD11CodeReference.objects.filter(code="1A00", title="Cholera").exists()
        assert ICD11CodeReference.objects.filter(code="1E70", title="Smallpox").exists()
        assert not ICD11CodeReference.objects.filter(title="Syphilis", class_kind="block").exists()
