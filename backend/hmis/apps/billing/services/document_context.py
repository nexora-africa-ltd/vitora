from __future__ import annotations

from dataclasses import dataclass

from django.utils import timezone

from hmis.apps.billing.facility_identifiers import resolve_fr_code


@dataclass
class ClaimDocumentContext:
    claim_number: str
    sha_member_number: str
    fund: str
    scheme: str
    facility_name: str
    facility_mfl_code: str
    facility_fr_code: str
    generated_at: str


def build_claim_document_context(claim) -> ClaimDocumentContext:
    member = getattr(claim, "sha_member", None)
    facility = getattr(claim, "facility", None)

    sha_number = ""
    if member is not None:
        sha_number = str(getattr(member, "sha_number", "") or "").strip()
    if not sha_number:
        sha_number = str(getattr(claim, "sha_member_number", "") or "").strip()

    scheme = ""
    fund = ""
    if member is not None:
        scheme = str(getattr(member, "benefit_package", "") or "").strip()
        if getattr(member, "is_pfms_eligible", False):
            category = str(getattr(member, "pfms_category", "") or "").strip()
            fund = f"PFMS ({category})" if category else "PFMS"

        eligibility = getattr(member, "eligibility_response", {}) or {}
        if not scheme and isinstance(eligibility, dict):
            eligible = eligibility.get("eligible_schemes") or []
            if isinstance(eligible, list) and eligible:
                scheme = str(eligible[0])

            if not scheme:
                schemes = eligibility.get("schemes") or []
                if isinstance(schemes, list) and schemes:
                    first_scheme = schemes[0]
                    if isinstance(first_scheme, dict):
                        scheme = (
                            str(first_scheme.get("schemeName") or "").strip()
                            or str(first_scheme.get("name") or "").strip()
                            or str(first_scheme.get("scheme") or "").strip()
                        )

            if not fund:
                fund = (
                    str(eligibility.get("fund") or "").strip()
                    or str(eligibility.get("fund_name") or "").strip()
                    or str(eligibility.get("fundName") or "").strip()
                )

    if not fund:
        fund = "SHA"

    if not scheme:
        claim_flow = str(getattr(claim, "claim_flow", "") or "").strip().upper()
        if claim_flow:
            scheme = claim_flow
        else:
            scheme = "SHA"

    fr_code = ""
    if facility is not None:
        try:
            fr_code = resolve_fr_code(facility, allow_settings_fallback=False).value
        except (AttributeError, TypeError, RuntimeError, OSError, AssertionError):  # noqa: BLE001 - display helper should never fail generation
            fr_code = str(getattr(facility, "dha_fr_code", "") or "").strip()

    return ClaimDocumentContext(
        claim_number=str(getattr(claim, "claim_number", "") or "").strip(),
        sha_member_number=sha_number,
        fund=fund,
        scheme=scheme,
        facility_name=str(getattr(facility, "name", "") or "").strip(),
        facility_mfl_code=str(getattr(facility, "mfl_code", "") or "").strip(),
        facility_fr_code=fr_code,
        generated_at=timezone.now().strftime("%Y-%m-%d %H:%M"),
    )


def append_standard_header(lines: list[str], *, title: str, claim) -> None:
    ctx = build_claim_document_context(claim)
    lines.extend(
        [
            title,
            "=" * len(title),
            "",
            "Claim & Beneficiary",
            "-------------------",
            f"Claim Number: {ctx.claim_number or 'N/A'}",
            f"SHA Number: {ctx.sha_member_number or 'N/A'}",
            f"Fund: {ctx.fund or 'Not captured'}",
            f"Scheme: {ctx.scheme or 'Not captured'}",
            "",
            "Facility",
            "--------",
            f"Facility Name: {ctx.facility_name or 'N/A'}",
            f"MFL Code: {ctx.facility_mfl_code or 'N/A'}",
            f"FR Code: {ctx.facility_fr_code or 'N/A'}",
            "",
            f"Generated At: {ctx.generated_at}",
            "",
        ]
    )
