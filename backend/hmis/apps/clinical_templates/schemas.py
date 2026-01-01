"""
JSON Schema definitions and validation for clinical template content.

Ensures clinical template JSON content follows a defined schema for consistency.
"""

from django.core.exceptions import ValidationError

# Valid field types for template fields
VALID_FIELD_TYPES = [
    "text",
    "textarea",
    "number",
    "boolean",
    "date",
    "datetime",
    "select",
    "multiselect",
    "radio",
]

# Maximum limits
MAX_SECTIONS = 20
MAX_FIELDS_PER_SECTION = 50


def validate_template_content(content: dict) -> None:
    """
    Validate template content against the schema.

    Args:
        content: The template content dictionary to validate

    Raises:
        ValidationError: If content is invalid

    Returns:
        None if valid
    """
    errors = get_validation_errors(content)
    if errors:
        raise ValidationError({"content": errors})


def get_validation_errors(content: dict) -> list:
    """
    Get list of validation errors for template content.

    Args:
        content: The template content dictionary to validate

    Returns:
        list: List of error messages (empty if valid)
    """
    errors = []

    # Check content is a dict
    if not isinstance(content, dict):
        errors.append("Content must be a JSON object")
        return errors

    # Check required top-level fields
    if "title" not in content:
        errors.append("Content must have a 'title' field")

    if "sections" not in content:
        errors.append("Content must have a 'sections' field")
        return errors

    sections = content.get("sections", [])

    # Check sections is a list
    if not isinstance(sections, list):
        errors.append("'sections' must be an array")
        return errors

    # Check max sections
    if len(sections) > MAX_SECTIONS:
        errors.append(f"Maximum {MAX_SECTIONS} sections allowed, got {len(sections)}")

    # Validate each section
    for i, section in enumerate(sections):
        section_errors = _validate_section(section, i)
        errors.extend(section_errors)

    return errors


def _validate_section(section: dict, index: int) -> list:
    """
    Validate a single section.

    Args:
        section: The section dictionary
        index: Section index for error messages

    Returns:
        list: List of error messages for this section
    """
    errors = []
    prefix = f"Section {index + 1}"

    if not isinstance(section, dict):
        errors.append(f"{prefix}: must be an object")
        return errors

    # Check required section fields
    if "name" not in section:
        errors.append(f"{prefix}: must have a 'name' field")

    # Validate fields if present
    fields = section.get("fields", [])
    if not isinstance(fields, list):
        errors.append(f"{prefix}: 'fields' must be an array")
    else:
        # Check max fields per section
        if len(fields) > MAX_FIELDS_PER_SECTION:
            errors.append(
                f"{prefix}: Maximum {MAX_FIELDS_PER_SECTION} fields allowed, got {len(fields)}"
            )

        # Validate each field
        for j, field in enumerate(fields):
            field_errors = _validate_field(field, prefix, j)
            errors.extend(field_errors)

    return errors


def _validate_field(field: dict, section_prefix: str, index: int) -> list:
    """
    Validate a single field.

    Args:
        field: The field dictionary
        section_prefix: Section prefix for error messages
        index: Field index for error messages

    Returns:
        list: List of error messages for this field
    """
    errors = []
    prefix = f"{section_prefix}, Field {index + 1}"

    if not isinstance(field, dict):
        errors.append(f"{prefix}: must be an object")
        return errors

    # Check required field attributes
    if "name" not in field:
        errors.append(f"{prefix}: must have a 'name' attribute")

    if "type" not in field:
        errors.append(f"{prefix}: must have a 'type' attribute")
    else:
        field_type = field.get("type")
        if field_type not in VALID_FIELD_TYPES:
            errors.append(
                f"{prefix}: invalid type '{field_type}'. "
                f"Valid types: {', '.join(VALID_FIELD_TYPES)}"
            )

        # Check that select/multiselect have options
        if field_type in ("select", "multiselect", "radio"):
            if "options" not in field or not field.get("options"):
                errors.append(f"{prefix}: '{field_type}' field must have 'options' array")

    return errors


# JSON Schema definition (for reference/documentation)
TEMPLATE_CONTENT_SCHEMA = {
    "type": "object",
    "required": ["title", "sections"],
    "properties": {
        "title": {"type": "string", "minLength": 1},
        "version": {"type": "string"},
        "description": {"type": "string"},
        "sections": {
            "type": "array",
            "maxItems": MAX_SECTIONS,
            "items": {
                "type": "object",
                "required": ["name"],
                "properties": {
                    "name": {"type": "string", "minLength": 1},
                    "order": {"type": "integer", "minimum": 0},
                    "fields": {
                        "type": "array",
                        "maxItems": MAX_FIELDS_PER_SECTION,
                        "items": {
                            "type": "object",
                            "required": ["name", "type"],
                            "properties": {
                                "name": {"type": "string", "minLength": 1},
                                "type": {"type": "string", "enum": VALID_FIELD_TYPES},
                                "required": {"type": "boolean"},
                                "label": {"type": "string"},
                                "options": {"type": "array", "items": {"type": "string"}},
                                "min": {"type": "number"},
                                "max": {"type": "number"},
                            },
                        },
                    },
                },
            },
        },
    },
}
