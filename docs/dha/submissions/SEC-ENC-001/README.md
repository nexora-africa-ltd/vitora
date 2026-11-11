# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
Purpose: DHA portal submission guide for SEC-ENC-001 Data Encryption (At Rest & In Transit).
Use: Capture the listed staging evidence immediately before certification and submit it with this guide.
Inputs: DHA staging security-administrator account, Azure/Neon evidence access, and the live staging API domain.
-->

# SEC-ENC-001 — Data Encryption (At Rest & In Transit)

**Priority:** Critical
**Test method:** Technical inspection and live-system verification
**Status:** **Code ready; operational evidence capture required before portal submission.**

## DHA endpoint submission

| Portal field | Value |
| --- | --- |
| Endpoint title | Retrieve active encryption control posture — SEC-ENC-001 |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/core/security/encryption-status/` |
| Authentication | DHA staging evidence-reader bearer JWT with `core.view_encryption_evidence` |
| Required header | `X-Facility-ID: 13` |
| Expected result | `200 OK`; non-secret active KMS status/provider, field-encryption algorithms, TLS requirements, encrypted-backup enforcement, and media-storage posture |

The endpoint deliberately excludes keys, passphrases, connection strings, certificate private material, patient data, and backup contents. It is not organization-scoped: it reports platform infrastructure and is restricted to the explicit `core.view_encryption_evidence` permission. A caller without that permission receives `403`; an anonymous caller receives `401`.

## Control statement

Vitora encrypts direct identifiers at rest with legacy Fernet (AES-128-CBC with HMAC-SHA256) and uses the current organization-scoped AES-256-GCM path where enabled. Production/staging deployment selects Azure Key Vault for KMS operations and wraps organization key material. Public browser/API traffic uses HTTPS, with TLS 1.2 or higher verified at ingress. External HL7/MLLP connections are rejected unless TLS and certificate verification are enabled. Cloud database backups fail closed unless `BACKUP_ENCRYPTION_KEY` is available and are symmetrically encrypted with GPG AES-256 before upload.

The detailed design and key-management procedure are in [`../../../encryption-implementation-specification.md`](../../../encryption-implementation-specification.md). This submission must be supported by the live artifacts below; source code or the endpoint alone is not sufficient proof of cloud-provider encryption or backup operation.

## Required live evidence

| Attachment | Capture source | DHA criterion |
| --- | --- | --- |
| `01-encryption-status-response.json` | Authenticated GET endpoint response | Active KMS provider, algorithms, TLS and backup requirements without secret disclosure |
| `02-tls-certificate.txt` | Browser certificate inspector or `openssl s_client` | Valid certificate hostname, issuer, chain, and dates |
| `03-tls-protocol-scan.txt` | Approved TLS scan | TLS 1.2 and TLS 1.3 accepted; TLS 1.0/1.1 rejected where scanner supports those probes |
| `04-database-encryption-at-rest.md` | Neon provider security overview + sanitized project/branch context image | Database AES-256 storage encryption, required database TLS, provider scope, and evidence provenance |
| `05-key-vault-key-and-identity.json` | Sanitized Azure CLI response | Enabled RSA KEK attributes, system-assigned workload identity, and assigned Key Vault roles |
| `05-key-vault-rotation-policy.json` | Sanitized Azure CLI response | Configured KEK rotation/expiry notification policy |
| `06-media-storage-encryption.json` | Sanitized Azure CLI response | Provider-managed encryption at rest, HTTPS-only/minimum TLS 1.2, and no public blob access |
| `06-backup-container-access.json` | Sanitized Azure Resource Manager response | Backup container has no anonymous public access |
| `07-encrypted-backup-artifact.txt` | Azure Blob listing/properties | Newly generated `.sql.gz.gpg` backup artifact, size, timestamp, and restricted container access; do not attach backup content |
| `08-backup-checksum-and-restore-drill.txt` | Restore-drill workflow/job logs | GPG decrypt, SHA-256 verification, and isolated restore success |
| `09-key-management-approval.pdf` | Approved internal procedure | Key owner/custody, separation of duties, annual rotation, compromise response, recovery/restore procedure |
| `automated-test-report.txt` | Targeted backend test run | Regression coverage for KMS, PII encryption, backup fail-closed behavior, endpoint access, and HL7 TLS enforcement |
| `capture-manifest.json` | Evidence packaging manifest | Capture timestamps, sources, completion state, and remaining live evidence |
| `SHA256SUMS.txt` | `sha256sum` over evidence files | Attachment integrity |

## Capture commands

Use DHA staging accounts and synthetic data only. Do not save tokens, cookies, PII, passphrases, or backup contents in this directory.

```bash
export DHA_ACCESS_TOKEN='<DHA staging security-administrator token>'
export API_BASE_URL='https://staging-api.vitora.digital'

curl --silent --show-error --fail --max-time 30 \
  --header "Authorization: Bearer ${DHA_ACCESS_TOKEN}" \
  --header 'X-Facility-ID: 13' \
  "${API_BASE_URL}/api/core/security/encryption-status/" \
  | jq . > 01-encryption-status-response.json

printf '' | openssl s_client \
  -connect staging-api.vitora.digital:443 \
  -servername staging-api.vitora.digital \
  -tls1_2 -showcerts 2>&1 > 02-tls-certificate.txt

{
  printf 'TLS 1.2\n'
  printf '' | openssl s_client -connect staging-api.vitora.digital:443 \
    -servername staging-api.vitora.digital -tls1_2 -brief 2>&1
  printf '\nTLS 1.3\n'
  printf '' | openssl s_client -connect staging-api.vitora.digital:443 \
    -servername staging-api.vitora.digital -tls1_3 -brief 2>&1
} > 03-tls-protocol-scan.txt

poetry run pytest --no-cov -q \
  tests/core/test_encryption_status_endpoint.py \
  tests/core/test_kms.py \
  tests/core/test_pii_v2.py \
  tests/patients/test_pii_encryption.py \
  tests/laboratory/test_hl7_transport_security.py \
  tests/infrastructure/test_backup_dr.py \
  tests/infrastructure/test_scaling_operational_assets.py \
  | tee automated-test-report.txt

sha256sum 0[1-9]-* automated-test-report.txt > SHA256SUMS.txt
```

Capture Azure Storage evidence as structured JSON rather than a portal screenshot. This command contains configuration only; it does not return storage keys, SAS tokens, or file content:

```bash
export AZURE_RESOURCE_GROUP='vitora-rg-sa'
export STORAGE_ACCOUNT='vitorabackupssa'

az storage account show \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${STORAGE_ACCOUNT}" \
  --query '{
    encryption: encryption,
    minimumTlsVersion: minimumTlsVersion,
    secureTransferRequired: enableHttpsTrafficOnly,
    publicBlobAccessAllowed: allowBlobPublicAccess,
    publicNetworkAccess: publicNetworkAccess
  }' \
  --output json > 06-media-storage-encryption.json
```

Before attaching, review the JSON and redact the storage-account name only if DHA does not require it. The expected baseline is Microsoft-managed Storage Service Encryption; `requireInfrastructureEncryption: false` means the optional second encryption layer is disabled, not that Azure Storage encryption at rest is disabled.

## Pre-submission gate

Do **not** submit this item until all are true:

1. The live endpoint returns `200` for the DHA security administrator and reports `AzureKeyVaultProvider` as healthy.
2. The certificate capture proves the current hostname, trusted issuer, and valid dates; an external scan proves TLS 1.2+.
3. Neon/database-provider evidence confirms encryption at rest for the database volume and backups/replicas in scope.
4. Azure Key Vault evidence confirms managed-identity cryptographic access, separated KEK/key ownership, and rotation policy.
5. Azure Storage evidence confirms encryption at rest, TLS 1.2 minimum, and private patient-document/backup containers.
6. A scheduled backup produces a new `.gpg` artifact, checksum, and successful isolated restore drill.
7. All captures are sanitized and checksummed.

## Implementation references

- `backend/hmis/apps/core/views_encryption_status.py`
- `backend/hmis/apps/core/pii.py`
- `backend/hmis/apps/core/pii_v2.py`
- `backend/hmis/apps/core/kms/azure.py`
- `backend/hmis/settings/production.py`
- `backend/scripts/backup-db.sh`
- `backend/hmis/apps/laboratory/services/hl7_integration.py`
