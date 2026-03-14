"""
Document Signing Service — RSA-2048 digital signatures for clinical documents.

Signs and verifies clinical documents (lab results, prescriptions,
discharge summaries, radiology reports) using X.509 user certificates.

DHA Compliance: Gap #32 — Digital Signatures (Sprint 3.C)
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
from dataclasses import dataclass, field

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

logger = logging.getLogger(__name__)


@dataclass
class VerificationResult:
    """Result of a document signature verification."""

    valid: bool
    document_type: str = ""
    document_id: int | None = None
    signer_username: str = ""
    signer_name: str = ""
    signed_at: str = ""
    certificate_serial: str = ""
    certificate_valid: bool = True
    content_matches: bool = True
    signature_valid: bool = True
    errors: list[str] = field(default_factory=list)


# Registry of content extractors per document type
SIGNABLE_DOCUMENT_TYPES = {
    "LabResult",
    "Prescription",
    "Discharge",
    "RadiologyReport",
}


class DocumentSigningService:
    """Service for signing and verifying clinical documents."""

    def sign_document(self, document_type: str, document_id: int, user):
        """
        Sign a clinical document with the user's active certificate.

        Args:
            document_type: Model name (e.g., 'LabResult').
            document_id: Primary key of the document.
            user: Django User performing the signature.

        Returns:
            DocumentSignature instance.

        Raises:
            ValueError: If user has no valid certificate or document not found.
        """
        from hmis.apps.core.kms import get_kms_provider
        from hmis.apps.core.models import AuditLog, DocumentSignature, UserCertificate

        if document_type not in SIGNABLE_DOCUMENT_TYPES:
            raise ValueError(f"Unsupported document type: {document_type}")

        # Get user's active certificate
        cert = (
            UserCertificate.objects.filter(
                user=user,
                is_revoked=False,
            )
            .order_by("-created_at")
            .first()
        )
        if cert is None:
            raise ValueError("User has no valid certificate. Issue a certificate first.")
        if cert.is_expired:
            raise ValueError("User's certificate has expired. Renew the certificate.")

        # Get the document
        document = self._get_document(document_type, document_id)

        # Serialize content to canonical form
        content = self.get_signable_content(document_type, document)
        content_bytes = content.encode("utf-8")

        # Hash the content
        content_hash = hashlib.sha256(content_bytes).hexdigest()

        # Decrypt user's private key
        kms = get_kms_provider()
        private_key_pem = kms.decrypt(
            cert.private_key_pem_encrypted.encode("latin-1"),
            context={"purpose": "document_signing", "document_type": document_type},
        )
        private_key = serialization.load_pem_private_key(
            private_key_pem, password=None
        )

        # Sign the hash
        signature_bytes = private_key.sign(
            content_bytes,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        signature_b64 = base64.b64encode(signature_bytes).decode("ascii")

        # Store the signature
        doc_sig = DocumentSignature.objects.create(
            document_type=document_type,
            document_id=document_id,
            signer=user,
            certificate=cert,
            content_hash=content_hash,
            signature=signature_b64,
        )

        # Audit log
        AuditLog.log(
            action="document_sign",
            user=user,
            resource_type=document_type,
            resource_id=document_id,
            details={
                "signature_id": doc_sig.id,
                "certificate_serial": cert.serial_number,
                "content_hash": content_hash,
            },
        )

        logger.info(
            f"Document signed: {document_type}#{document_id} by {user.username} "
            f"(cert: {cert.serial_number[:8]}...)"
        )
        return doc_sig

    def verify_signature(self, signature_record) -> VerificationResult:
        """
        Verify a document signature.

        Checks:
        1. Certificate validity (not expired, not revoked, CA active)
        2. Content integrity (re-serialize and compare hash)
        3. Cryptographic signature (RSA verification)

        Args:
            signature_record: DocumentSignature instance.

        Returns:
            VerificationResult with details.
        """
        from hmis.apps.core.models import AuditLog
        from hmis.apps.core.services.pki_service import PKIService

        errors = []
        cert = signature_record.certificate
        signer = signature_record.signer

        # 1. Verify certificate
        pki = PKIService()
        cert_result = pki.verify_certificate(cert)
        certificate_valid = cert_result.valid
        if not certificate_valid:
            errors.extend(cert_result.errors)

        # 2. Verify content integrity
        content_matches = True
        signature_valid = True
        try:
            document = self._get_document(
                signature_record.document_type,
                signature_record.document_id,
            )
            content = self.get_signable_content(
                signature_record.document_type, document
            )
            content_bytes = content.encode("utf-8")
            current_hash = hashlib.sha256(content_bytes).hexdigest()

            if current_hash != signature_record.content_hash:
                content_matches = False
                errors.append(
                    "Document content has changed since signing "
                    f"(original hash: {signature_record.content_hash[:16]}..., "
                    f"current: {current_hash[:16]}...)"
                )

            # 3. Verify cryptographic signature
            public_key = serialization.load_pem_public_key(
                cert.public_key_pem.encode()
            )
            # Re-serialize original content for signature check
            # Use the original content bytes (from current content)
            # The signature was created over the content bytes
            try:
                signature_bytes = base64.b64decode(signature_record.signature)
                public_key.verify(
                    signature_bytes,
                    content_bytes,
                    padding.PKCS1v15(),
                    hashes.SHA256(),
                )
            except Exception:
                # If content has changed, try verifying against original hash
                # (signature was over original content, so it won't match new content)
                if not content_matches:
                    errors.append("Signature cannot be verified (document was modified after signing)")
                else:
                    signature_valid = False
                    errors.append("Cryptographic signature verification failed")

        except Exception as e:
            errors.append(f"Verification error: {e}")
            content_matches = False
            signature_valid = False

        is_valid = certificate_valid and content_matches and signature_valid

        # Update cached validity
        signature_record.is_valid = is_valid
        signature_record.verification_note = "; ".join(errors) if errors else "Valid"
        signature_record.save(update_fields=["is_valid", "verification_note"])

        # Audit log
        AuditLog.log(
            action="document_verify",
            user=signer,
            resource_type=signature_record.document_type,
            resource_id=signature_record.document_id,
            details={
                "signature_id": signature_record.id,
                "valid": is_valid,
                "errors": errors,
            },
        )

        return VerificationResult(
            valid=is_valid,
            document_type=signature_record.document_type,
            document_id=signature_record.document_id,
            signer_username=signer.username,
            signer_name=signer.get_full_name() or signer.username,
            signed_at=signature_record.signed_at.isoformat(),
            certificate_serial=cert.serial_number,
            certificate_valid=certificate_valid,
            content_matches=content_matches,
            signature_valid=signature_valid,
            errors=errors,
        )

    def get_signable_content(self, document_type: str, document) -> str:
        """
        Serialize a document to canonical JSON for signing.

        Each document type has a defined set of fields that constitute
        the signed content. This ensures deterministic serialization.

        Args:
            document_type: Model name.
            document: Model instance.

        Returns:
            Canonical JSON string.
        """
        extractors = {
            "LabResult": self._extract_lab_result,
            "Prescription": self._extract_prescription,
            "Discharge": self._extract_discharge,
            "RadiologyReport": self._extract_radiology_report,
        }

        extractor = extractors.get(document_type)
        if not extractor:
            raise ValueError(f"No content extractor for: {document_type}")

        data = extractor(document)
        return json.dumps(data, sort_keys=True, default=str)

    def _get_document(self, document_type: str, document_id: int):
        """Load a document instance by type and ID."""
        model_map = {
            "LabResult": ("laboratory", "LabResult"),
            "Prescription": ("pharmacy", "Prescription"),
            "Discharge": ("inpatient", "Discharge"),
            "RadiologyReport": ("imaging", "RadiologyReport"),
        }

        app_model = model_map.get(document_type)
        if not app_model:
            raise ValueError(f"Unknown document type: {document_type}")

        from django.apps import apps

        Model = apps.get_model(app_model[0], app_model[1])
        try:
            return Model.objects.get(pk=document_id)
        except Model.DoesNotExist:
            raise ValueError(f"{document_type} with id={document_id} not found")

    def _extract_lab_result(self, doc) -> dict:
        """Extract signable content from a LabResult."""
        patient_id = None
        if hasattr(doc, "order_item") and doc.order_item:
            order_item = doc.order_item
            if hasattr(order_item, "order") and order_item.order:
                patient_id = order_item.order.patient_id

        return {
            "type": "LabResult",
            "id": doc.pk,
            "patient_id": patient_id,
            "numeric_value": str(doc.numeric_value) if doc.numeric_value is not None else None,
            "text_value": doc.text_value or "",
            "result_unit": getattr(doc, "result_unit", "") or "",
            "reference_low": str(doc.reference_low) if getattr(doc, "reference_low", None) is not None else None,
            "reference_high": str(doc.reference_high) if getattr(doc, "reference_high", None) is not None else None,
            "verification_status": doc.verification_status,
            "verified_at": str(doc.verified_at) if doc.verified_at else None,
        }

    def _extract_prescription(self, doc) -> dict:
        """Extract signable content from a Prescription."""
        items = []
        if hasattr(doc, "items"):
            for item in doc.items.all().order_by("id"):
                items.append({
                    "drug_id": item.drug_id,
                    "dosage": item.dosage,
                    "frequency": item.frequency,
                    "duration": getattr(item, "duration", ""),
                    "quantity": str(item.quantity) if item.quantity is not None else None,
                })

        return {
            "type": "Prescription",
            "id": doc.pk,
            "prescription_number": doc.prescription_number,
            "patient_id": doc.patient_id,
            "prescribed_by_id": doc.prescribed_by_id,
            "prescribed_at": str(doc.prescribed_at) if doc.prescribed_at else None,
            "status": doc.status,
            "items": items,
        }

    def _extract_discharge(self, doc) -> dict:
        """Extract signable content from a Discharge."""
        patient_id = doc.admission.patient_id if hasattr(doc, "admission") and doc.admission else None

        return {
            "type": "Discharge",
            "id": doc.pk,
            "patient_id": patient_id,
            "admission_id": doc.admission_id if hasattr(doc, "admission_id") else None,
            "discharge_date": str(doc.discharge_date) if doc.discharge_date else None,
            "discharge_type": getattr(doc, "discharge_type", ""),
            "final_diagnosis_text": getattr(doc, "final_diagnosis_text", ""),
            "treatment_summary": getattr(doc, "treatment_summary", ""),
            "discharged_by_id": doc.discharged_by_id if hasattr(doc, "discharged_by_id") else None,
        }

    def _extract_radiology_report(self, doc) -> dict:
        """Extract signable content from a RadiologyReport."""
        patient_id = None
        if hasattr(doc, "imaging_order") and doc.imaging_order:
            patient_id = doc.imaging_order.patient_id

        return {
            "type": "RadiologyReport",
            "id": doc.pk,
            "patient_id": patient_id,
            "findings": doc.findings,
            "impression": doc.impression,
            "recommendations": doc.recommendations,
            "status": doc.status,
            "reported_by_id": doc.reported_by_id,
        }
