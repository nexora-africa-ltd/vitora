"""
Management command to validate WHO LMS JSON data files.

Checks:
- All expected files exist
- Valid JSON structure (L, M, S parameters)
- Correct index keys (age_days, length_cm, height_cm)
- Reasonable value ranges
- Sequential ordering of index values

Usage:
    python manage.py validate_who_lms
    python manage.py validate_who_lms --verbose
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Validate WHO Growth Standards LMS JSON data files"

    # Expected files and their configurations
    EXPECTED_FILES = {
        # Weight-for-age (0-5 years)
        "wfa_boys_0_5.json": {"index_key": "age_days", "min_index": 0, "max_index": 1856},
        "wfa_girls_0_5.json": {"index_key": "age_days", "min_index": 0, "max_index": 1856},
        # Length/height-for-age (0-5 years)
        "lhfa_boys_0_5.json": {"index_key": "age_days", "min_index": 0, "max_index": 1856},
        "lhfa_girls_0_5.json": {"index_key": "age_days", "min_index": 0, "max_index": 1856},
        # Head circumference-for-age (0-5 years)
        "hcfa_boys_0_5.json": {"index_key": "age_days", "min_index": 0, "max_index": 1856},
        "hcfa_girls_0_5.json": {"index_key": "age_days", "min_index": 0, "max_index": 1856},
        # BMI-for-age (0-5 years)
        "bfa_boys_0_5.json": {"index_key": "age_days", "min_index": 0, "max_index": 1856},
        "bfa_girls_0_5.json": {"index_key": "age_days", "min_index": 0, "max_index": 1856},
        # Weight-for-length (45-110 cm)
        "wfl_boys.json": {"index_key": "length_cm", "min_index": 45.0, "max_index": 110.0},
        "wfl_girls.json": {"index_key": "length_cm", "min_index": 45.0, "max_index": 110.0},
        # Weight-for-height (65-120 cm)
        "wfh_boys.json": {"index_key": "height_cm", "min_index": 65.0, "max_index": 120.0},
        "wfh_girls.json": {"index_key": "height_cm", "min_index": 65.0, "max_index": 120.0},
    }

    def add_arguments(self, parser):
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Show detailed validation output",
        )
        parser.add_argument(
            "--file",
            type=str,
            help="Validate a specific file only",
        )

    def handle(self, *args, **options):
        verbose = options["verbose"]
        single_file = options.get("file")

        # Determine data directory
        data_dir = (
            Path(__file__).resolve().parent.parent.parent.parent.parent.parent
            / "data"
            / "who_growth_standards"
        )

        if not data_dir.exists():
            raise CommandError(f"WHO growth standards directory not found: {data_dir}")

        self.stdout.write(f"Validating WHO LMS data in: {data_dir}\n")

        files_to_validate = self.EXPECTED_FILES
        if single_file:
            if single_file not in self.EXPECTED_FILES:
                raise CommandError(
                    f"Unknown file: {single_file}. Expected one of: {list(self.EXPECTED_FILES.keys())}"
                )
            files_to_validate = {single_file: self.EXPECTED_FILES[single_file]}

        errors = []
        warnings = []
        success_count = 0

        for filename, config in files_to_validate.items():
            filepath = data_dir / filename
            file_errors, file_warnings = self._validate_file(filepath, config, verbose)

            if file_errors:
                errors.extend([(filename, e) for e in file_errors])
                self.stdout.write(self.style.ERROR(f"✗ {filename}: {len(file_errors)} error(s)"))
            else:
                success_count += 1
                self.stdout.write(self.style.SUCCESS(f"✓ {filename}"))

            if file_warnings and verbose:
                warnings.extend([(filename, w) for w in file_warnings])

        # Summary
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write(f"Validated: {success_count}/{len(files_to_validate)} files passed")

        if errors:
            self.stdout.write(self.style.ERROR(f"\nErrors ({len(errors)}):"))
            for filename, error in errors:
                self.stdout.write(f"  [{filename}] {error}")
            raise CommandError("Validation failed")

        if warnings and verbose:
            self.stdout.write(self.style.WARNING(f"\nWarnings ({len(warnings)}):"))
            for filename, warning in warnings:
                self.stdout.write(f"  [{filename}] {warning}")

        self.stdout.write(self.style.SUCCESS("\nAll validations passed!"))

    def _validate_file(
        self, filepath: Path, config: dict, verbose: bool
    ) -> tuple[list[str], list[str]]:
        """Validate a single LMS JSON file."""
        errors = []
        warnings = []

        # Check file exists
        if not filepath.exists():
            errors.append(f"File not found: {filepath}")
            return errors, warnings

        # Load JSON
        try:
            with open(filepath) as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            errors.append(f"Invalid JSON: {e}")
            return errors, warnings

        # Check it's a list
        if not isinstance(data, list):
            errors.append("Root element must be a JSON array")
            return errors, warnings

        if len(data) == 0:
            errors.append("File contains no data points")
            return errors, warnings

        index_key = config["index_key"]
        min_index = config["min_index"]
        max_index = config["max_index"]

        prev_index = None

        for i, entry in enumerate(data):
            row_prefix = f"Row {i}"

            # Check required keys
            if not isinstance(entry, dict):
                errors.append(f"{row_prefix}: Entry must be an object")
                continue

            # Check index key exists
            if index_key not in entry:
                errors.append(f"{row_prefix}: Missing '{index_key}' key")
                continue

            # Check LMS keys exist
            for key in ["L", "M", "S"]:
                if key not in entry:
                    errors.append(f"{row_prefix}: Missing '{key}' parameter")

            # Validate index value
            index_val = entry.get(index_key)
            if not isinstance(index_val, (int, float)):
                errors.append(
                    f"{row_prefix}: '{index_key}' must be a number, got {type(index_val).__name__}"
                )
            else:
                # Check ordering (should be ascending)
                if prev_index is not None and index_val <= prev_index:
                    warnings.append(
                        f"{row_prefix}: Index {index_val} not in ascending order (prev: {prev_index})"
                    )
                prev_index = index_val

            # Validate LMS values
            l_val = entry.get("L")
            m_val = entry.get("M")
            s_val = entry.get("S")

            if isinstance(l_val, (int, float)):
                # L can be negative, zero, or positive (typically -1 to 1)
                if l_val < -5 or l_val > 5:
                    warnings.append(f"{row_prefix}: L={l_val} outside typical range [-5, 5]")
            elif l_val is not None:
                errors.append(f"{row_prefix}: L must be a number, got {type(l_val).__name__}")

            if isinstance(m_val, (int, float)):
                if m_val <= 0:
                    errors.append(f"{row_prefix}: M={m_val} must be positive (median cannot be ≤0)")
            elif m_val is not None:
                errors.append(f"{row_prefix}: M must be a number, got {type(m_val).__name__}")

            if isinstance(s_val, (int, float)):
                if s_val <= 0:
                    errors.append(f"{row_prefix}: S={s_val} must be positive (CV cannot be ≤0)")
                elif s_val > 1:
                    warnings.append(f"{row_prefix}: S={s_val} > 1 is unusually high for CV")
            elif s_val is not None:
                errors.append(f"{row_prefix}: S must be a number, got {type(s_val).__name__}")

        # Check coverage
        if data:
            first_index = data[0].get(index_key)
            last_index = data[-1].get(index_key)

            if isinstance(first_index, (int, float)) and first_index > min_index:
                warnings.append(f"Data starts at {index_key}={first_index}, expected {min_index}")

            if isinstance(last_index, (int, float)) and last_index < max_index:
                warnings.append(f"Data ends at {index_key}={last_index}, expected {max_index}")

        if verbose and not errors:
            self.stdout.write(
                f"    {len(data)} entries, index range: {data[0].get(index_key)} - {data[-1].get(index_key)}"
            )

        return errors, warnings
