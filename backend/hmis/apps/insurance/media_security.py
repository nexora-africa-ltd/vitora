# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Security helpers for insurance enrollment card images."""

from __future__ import annotations

import mimetypes
import os
import uuid

from django.conf import settings
from django.core import signing
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from hmis.apps.core.kms import get_kms_provider

CARD_IMAGE_SIGNING_SALT = "insurance.card.image"


def signed_card_image_url_ttl_seconds() -> int:
    return int(getattr(settings, "INSURANCE_CARD_IMAGE_URL_TTL_SECONDS", 300))


def _safe_extension(filename: str) -> str:
    _, ext = os.path.splitext(filename or "")
    ext = ext.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp"}:
        return ext
    return ".bin"


def build_card_image_token(*, enrollment_id: int, side: str, user_id: int) -> str:
    payload = {
        "enrollment_id": enrollment_id,
        "side": side,
        "user_id": user_id,
    }
    return signing.dumps(payload, salt=CARD_IMAGE_SIGNING_SALT)


def validate_card_image_token(
    token: str,
    *,
    enrollment_id: int,
    side: str,
    user_id: int,
) -> bool:
    try:
        payload = signing.loads(
            token,
            salt=CARD_IMAGE_SIGNING_SALT,
            max_age=signed_card_image_url_ttl_seconds(),
        )
    except signing.BadSignature:
        return False

    return (
        payload.get("enrollment_id") == enrollment_id
        and payload.get("side") == side
        and payload.get("user_id") == user_id
    )


def build_card_image_url(*, request, enrollment_id: int, side: str, user_id: int) -> str:
    token = build_card_image_token(enrollment_id=enrollment_id, side=side, user_id=user_id)
    path = f"/api/insurance/enrollments/{enrollment_id}/card-image/{side}/?token={token}"
    return request.build_absolute_uri(path)


def save_encrypted_card_image(*, enrollment, side: str, uploaded_file) -> str:
    """Encrypt and persist card image bytes in storage."""
    uploaded_file.seek(0)
    plaintext = uploaded_file.read()
    kms = get_kms_provider()
    ciphertext = kms.encrypt(
        plaintext,
        context={
            "purpose": "insurance_card_image",
            "enrollment_id": str(enrollment.id),
            "side": side,
            "organization_id": str(getattr(enrollment.organization, "id", "")),
        },
    )

    ext = _safe_extension(getattr(uploaded_file, "name", ""))
    object_name = (
        f"insurance/cards/{enrollment.organization_id}/{enrollment.id}/"
        f"{side}-{uuid.uuid4().hex}{ext}.enc"
    )
    return default_storage.save(object_name, ContentFile(ciphertext))


def read_decrypted_card_image(*, enrollment, side: str) -> tuple[bytes, str]:
    field_name = "card_image_front" if side == "front" else "card_image_back"
    stored = getattr(enrollment, field_name, None)
    file_name = getattr(stored, "name", "") if stored else ""
    if not file_name:
        raise FileNotFoundError("No card image found")

    with default_storage.open(file_name, "rb") as fh:
        ciphertext = fh.read()

    kms = get_kms_provider()
    plaintext = kms.decrypt(
        ciphertext,
        context={
            "purpose": "insurance_card_image",
            "enrollment_id": str(enrollment.id),
            "side": side,
            "organization_id": str(getattr(enrollment.organization, "id", "")),
        },
    )

    original_name = file_name[:-4] if file_name.endswith(".enc") else file_name
    content_type = mimetypes.guess_type(original_name)[0] or "application/octet-stream"
    return plaintext, content_type
