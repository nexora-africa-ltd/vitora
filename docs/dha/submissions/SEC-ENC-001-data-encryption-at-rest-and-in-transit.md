# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
Purpose: DHA portal submission narrative for SEC-ENC-001 Data Encryption (At Rest & In Transit).
Use: Submit this endpoint description and attach the linked SEC-ENC-001 evidence package.
Inputs: DHA staging security-evidence account, SEC-ENC-001 captured artifacts, and signed key-management approval.
-->

# SEC-ENC-001 — Data Encryption (At Rest & In Transit)

**Priority:** Critical
**Test method:** Technical inspection and live-system verification
**Status:** **Ready pending signed key-management approval PDF**

## Capability statement

Vitora HMIS protects selected direct identifiers at rest using legacy Fernet encryption (AES-128-CBC with HMAC-SHA256) and its current organization-scoped AES-256-GCM encryption path. The staging service uses Azure Key Vault for cloud KMS operations and Azure Storage Service Encryption with Microsoft-managed keys for blob storage. Browser/API traffic is protected by TLS 1.2+; external HL7/MLLP integrations reject plaintext transport. Production database backups fail closed without a backup passphrase and are encrypted with GPG AES-256 before upload.

The attached package includes live TLS scans, Neon provider evidence, Azure Key Vault and Storage posture evidence, an authenticated encryption-status response, a GPG-encrypted backup artifact, and a successful isolated restore drill.

## DHA portal endpoint submission

| Portal field | Value |
| --- | --- |
| Endpoint title | Retrieve active encryption control posture — SEC-ENC-001 |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/core/security/encryption-status/` |
| Authentication | DHA staging security-evidence administrator bearer JWT with `core.view_encryption_evidence` |
| Required header | `X-Facility-ID: 13` |
| Expected result | `200 OK`; active KMS provider/health, encryption algorithms, TLS requirements, encrypted-backup requirement, and media-storage posture |

The endpoint is restricted to the dedicated platform permission and intentionally excludes keys, passphrases, connection strings, certificates, patient data, and backup contents. An unauthenticated request receives `401`; a staff user without the dedicated permission receives `403`.

## Evidence attachments

| Attachment | DHA pass criterion |
| --- | --- |
| `SEC-ENC-001/01-encryption-status-response.json` | Authenticated live confirmation of healthy Azure Key Vault provider and active encryption posture |
| `SEC-ENC-001/01-encryption-status-unauthenticated-response.json` | Endpoint rejects unauthenticated access |
| `SEC-ENC-001/02-tls-certificate.txt` | Valid DigiCert certificate chain, hostname, issuer, and validity period |
| `SEC-ENC-001/03-tls-protocol-scan.txt` and `03-tls-cipher-scan.txt` | TLS 1.2/1.3 and strong cipher-suite evidence |
| `SEC-ENC-001/04-database-encryption-at-rest.md` | Neon AES-256 database-storage encryption and database TLS evidence mapping |
| `SEC-ENC-001/05-*.json` | Azure Key Vault key status, workload managed identity, assigned crypto roles, and rotation-notification policy |
| `SEC-ENC-001/06-*.json` | Azure Storage Service Encryption, TLS 1.2, secure transfer, and private backup-container evidence |
| `SEC-ENC-001/07-encrypted-backup-artifact.txt` | Successful GPG-encrypted `.sql.gz.gpg` backup with paired checksum metadata |
| `SEC-ENC-001/08-backup-checksum-and-restore-drill.txt` | Successful decrypt, checksum verification, and isolated PostgreSQL restore drill |
| `SEC-ENC-001/09-key-management-approval.pdf` | Signed key custody, rotation, recovery, and compromise approval record |
| `SEC-ENC-001/automated-test-report.txt` | Encryption, KMS, backup, TLS, endpoint, and configuration regression checks |
| `SEC-ENC-001/SHA256SUMS.txt` | Integrity checksums for the final package |

## DHA pass-criteria mapping

| DHA criterion | Evidence |
| --- | --- |
| Database encryption verified | Neon security evidence documents AES-256 encryption at rest; application PII encryption and Azure Key Vault posture are separately evidenced. |
| TLS 1.2+ used for transmissions | Live certificate, protocol, and cipher scans; HTTPS enforcement and TLS-required integration controls. |
| AES-128 Fernet at rest / TLS 1.2+ in transit | Authenticated endpoint response, encryption implementation specification, targeted regression report, and live TLS evidence. |
| Encryption keys securely managed | Azure Key Vault key/identity/role evidence and signed key-management approval record. |
| Secure uploaded-file storage | Azure Storage Service Encryption, secure transfer, TLS 1.2, disabled public blob access, and private backup-container evidence. |
| Encrypted backups and recoverability | Live `.gpg` artifact metadata, paired checksum, and successful restore-drill evidence. |

## Final submission gate

1. Sign `SEC-ENC-001/09-key-management-approval.pdf`.
2. Regenerate `SEC-ENC-001/SHA256SUMS.txt` after signing.
3. Review every artifact for secrets, tokens, direct identifiers, account keys, SAS values, connection strings, and unsanitized screenshots.
4. Attach this narrative and the final SEC-ENC-001 package to the DHA portal.

## Detailed implementation reference

See [`../../encryption-implementation-specification.md`](../../encryption-implementation-specification.md) for encryption architecture, algorithms, KMS design, backup controls, synchronization boundaries, and key-management procedures.
