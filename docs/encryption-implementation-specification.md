<!--
Purpose: DHA-facing specification of Vitora HMIS encryption implementation, key management, transport protocols,
encrypted data handling, offline synchronization boundaries, and production verification requirements.
Use: Submit with security evidence and update after material cryptographic, KMS, transport, or backup changes.
Inputs: Approved production configuration, KMS/key inventory, TLS certificate evidence, backup evidence, and security tests.
-->
<!-- markdownlint-disable MD013 MD060 -->
# Encryption Implementation Specification

**Product:** Vitora HMIS

**Supplier:** Nexora Consulting Ltd

**Document version:** 1.0

**Effective date:** 2 October 2026

**Classification:** Internal and regulatory submission material

## 1. Purpose and Scope

This specification documents the encryption controls implemented by Vitora HMIS for data at rest and in transit. It covers Fernet field encryption, key-management providers, HMAC blind indexes, TLS transport, backup encryption, client/offline data boundaries, and cryptographic operational controls.

This document distinguishes software capability from verified production operation. A configured environment must provide evidence of its active KMS provider, key custody, TLS certificates, ingress path, backup encryption, and rotation procedures before those controls are represented as active in DHA submissions.

## 2. Encryption Architecture Summary

| Protection objective | Implemented mechanism | Scope | Verification requirement |
|---|---|---|---|
| Direct-identifier encryption at rest | Fernet field encryption | Selected PII and secret fields stored in encrypted database columns | Verify encrypted columns, key configuration, and migration completion in the target environment |
| Integrity/authentication of encrypted fields | Fernet HMAC-SHA256 | Ciphertext authentication and tamper detection for Fernet-encrypted values | Verify application cryptography dependency and decryption tests |
| Search without plaintext storage | HMAC blind index | Eligible PII lookup fields with distinct `PII_HMAC_KEY` | Verify separate key, index scope, and no plaintext lookup storage |
| Transport encryption | HTTPS and WSS | Browser, API, WebSocket, integration, and Front Door/public ingress traffic | Verify certificate chain, TLS settings, HTTPS redirect, and endpoint scan results |
| Cloud KMS capability | Azure Key Vault provider | Envelope encryption and key wrapping when `KMS_PROVIDER=azure` | Verify deployed provider, managed identity, Key Vault key, access policy, and rotation evidence |
| Backup encryption | GPG AES-256 when backup passphrase is supplied | Database backup files before Azure Blob upload | Verify `BACKUP_ENCRYPTION_KEY`, encrypted backup artifact, checksum, and restore drill |
| Offline minimization | PowerSync Sync Streams exclusions | Browser-local PowerSync SQLite projection | Verify encrypted direct identifiers and keys are excluded from sync streams |

## 3. Data at Rest: Fernet Field Encryption

### 3.1 Algorithm and Implementation

The current local KMS provider uses the Python `cryptography` Fernet implementation. Fernet provides:

- AES-128-CBC encryption for confidentiality.
- HMAC-SHA256 authentication for ciphertext integrity and authenticity.
- URL-safe base64 encoded ciphertext representation.
- A 32-byte base64-encoded Fernet key supplied through `ENCRYPTION_KEY`.

The local provider is implemented in `hmis.apps.core.kms.local.LocalKMSProvider`. It validates the Fernet key format at initialization and encrypts/decrypts bytes or strings through the configured KMS-provider abstraction.

### 3.2 Encrypted Field Pattern

Vitora uses `encrypted_pii_property()` to provide transparent encrypted field access. A model exposes a logical property, such as `phone_number`, while persistent storage uses a separate encrypted column, such as `phone_number_encrypted`.

```text
Application write
  -> encrypted_pii_property setter
  -> configured KMS provider encrypt_string(value)
  -> <field>_encrypted database column

Application read
  -> encrypted_pii_property getter
  -> configured KMS provider decrypt_string(ciphertext)
  -> plaintext only within the authorized application process
```

If a corresponding `<field>_hmac` column exists, the setter computes a blind-index value using `PII_HMAC_KEY`. The HMAC key is required to be distinct from `ENCRYPTION_KEY`.

### 3.3 Covered Data Categories

The encrypted-field pattern is used for selected direct identifiers and secrets, including the following categories:

| Category | Examples |
|---|---|
| Patient direct identifiers | Identification number, national ID, phone number, email, address, principal national ID |
| Contacts and communications | Emergency contact name/phone, alternative phone, facility contact phone/email, SMS/email recipients |
| Insurance and payment credentials | Member/policy identifiers, provider credentials, API keys, API secrets, tokens, usernames, passwords |
| Staff-related direct identifiers | Professional or HWR identifier, staff contact fields where configured |
| Integration secrets | SMTP, payer, and external-service credentials represented through encrypted properties |
| Sensitive operational fields | Selected reporting, tracing, and notification contact values |

Clinical content, patient names, and other non-encrypted operational fields remain protected by tenant isolation, RBAC, sensitive-patient filtering, authenticated transport, auditability, and infrastructure controls. Encryption of selected direct identifiers does not grant unrestricted plaintext access to authorized application processes.

### 3.4 Audit-Log Redaction

Before audit-log details are persisted, the application redacts configured direct-identifier and secret field names. Redacted categories include national ID, phone number, email, address, contact values, insurance identifiers, API credentials, SMTP credentials, and related nested change structures.

Audit logging must not be used as a secondary plaintext store for PII. Changes to PII field names or serializers require review of the audit-redaction set.

## 4. Key Management

### 4.1 KMS Provider Abstraction

Vitora selects its key-management provider through `KMS_PROVIDER`:

| Provider | Configuration | Implementation status | Intended use |
|---|---|---|---|
| Local | `KMS_PROVIDER=local`, `ENCRYPTION_KEY` | Implemented | Development, testing, single-server/controlled deployments |
| Azure Key Vault | `KMS_PROVIDER=azure`, `AZURE_KEY_VAULT_URL`, `AZURE_KEY_NAME` | Implemented and configured with separate staging/production KEKs | Cloud production key wrapping for organization-scoped v2 PII keys |
| GCP KMS | `KMS_PROVIDER=gcp` and GCP key settings | Stub/future path | Not a production claim |

The application caches the configured provider as a process singleton. A missing required provider setting causes provider initialization to fail rather than silently using another provider.

### 4.2 Legacy Local KMS Posture

The local provider uses `ENCRYPTION_KEY` from application settings. It is cryptographically valid Fernet encryption but is not a managed HSM or cloud KMS boundary. The local provider does not independently enforce key rotation; its configured rotation interval is metadata and operational policy, not automatic cryptographic re-encryption.

The local provider shall not be described as Azure Key Vault, Managed HSM, hardware-backed encryption, or automatically rotated key management. It remains available for legacy v1 ciphertext compatibility while organization-scoped v2 migration is completed.

### 4.3 Azure Key Vault Provider

When configured, the Azure Key Vault provider uses `DefaultAzureCredential` and Azure Key Vault cryptography APIs. It supports:

- Managed identity or supported Azure credential-chain authentication.
- RSA-OAEP-256 encryption for small payloads or data-encryption-key wrapping.
- Envelope encryption for larger payloads.
- A generated Fernet data-encryption key for the data payload.
- Azure Key Vault wrapping of that data-encryption key.
- Ciphertext format markers that distinguish direct and envelope encryption.

For payloads larger than direct RSA-OAEP limits, the implementation generates an ephemeral Fernet DEK, encrypts the payload locally, wraps the DEK with the Key Vault key, and stores both wrapped key and ciphertext. The raw DEK is not persisted as a standalone application field.

### 4.4 Production Key Management Status and Requirements

Staging and production use separate Azure Key Vaults and KEKs, with each API managed identity limited to its own environment vault. Retain evidence of:

1. `KMS_PROVIDER=azure` in the active production runtime configuration.
2. Azure Key Vault or Managed HSM name, key name, version strategy, region, and owner.
3. Managed identity assignment and least-privilege cryptographic permissions.
4. Separation between encryption keys, PII HMAC keys, JWT secrets, database credentials, and backup passphrases.
5. Key rotation schedule, previous-key decryption continuity, re-encryption process, rollback, and test record.
6. Key-compromise response procedure and audit-log review process.
7. Key-recovery and restore test evidence for backup, disaster-recovery, and hub scenarios.

### 4.5 Rotation and Compromise Handling

The configured KMS rotation policy defaults to 365 days. Rotation is an operational process that must preserve the ability to decrypt historical ciphertext until data is re-encrypted or the applicable retention period expires.

If a key is suspected compromised:

1. Open a Severity 1 security incident unless the Security Officer determines a lower severity is justified.
2. Restrict or disable the affected key version where this can be done without unsafe care-data loss.
3. Create and authorize a replacement key/version.
4. Identify affected fields, environments, backups, hubs, and integrations.
5. Re-encrypt affected data under controlled change management.
6. Review key-access, authentication, and audit evidence for unauthorized use.
7. Complete DPO breach assessment and required controller notification support.

## 5. Encryption in Transit

### 5.1 Public Web and API Traffic

Production Django settings implement the following controls:

| Control | Implementation |
|---|---|
| HTTPS redirect | `SECURE_SSL_REDIRECT=True` |
| Secure proxy handling | `SECURE_PROXY_SSL_HEADER` trusts the configured HTTPS proxy signal |
| Session cookie protection | `SESSION_COOKIE_SECURE=True` |
| CSRF cookie protection | `CSRF_COOKIE_SECURE=True` |
| HttpOnly authentication cookie | `AUTH_COOKIE_SECURE=True` in production |
| HSTS | One-year `SECURE_HSTS_SECONDS`, subdomain inclusion, and preload settings |
| Browser content protections | `X_FRAME_OPTIONS=DENY`, content-type nosniff, and configured referrer policy |

Browser REST traffic shall use HTTPS. Django Channels real-time traffic shall use WSS when exposed through production public ingress. API clients and integrations shall reject invalid certificates and use HTTPS/TLS endpoints unless a documented local-only exception applies.

### 5.2 TLS Protocol Requirement

Vitora requires TLS 1.2 or higher for public production traffic. TLS certificate issuance, renewal, chain validation, hostname validation, and cipher configuration are managed at the applicable ingress layer, such as Azure Front Door, Vercel, Azure Container Apps, or another approved production proxy.

TLS 1.2+ must be verified by an external endpoint scan and certificate inspection for every public production domain. A source-code setting alone is insufficient evidence of the deployed protocol version or certificate chain.

### 5.3 Client and Integration Transport

| Client or interface | Transport requirement |
|---|---|
| Web browser | HTTPS for API traffic; WSS for WebSocket traffic; secure HttpOnly cookie settings in production |
| Desktop application | HTTPS to cloud API; local sidecar traffic is restricted to loopback origin where applicable |
| Mobile application | HTTPS; includes SSL public-key-pinning capability in the mobile dependency set where configured for the release |
| Facility hub | LAN traffic must use an approved facility network and secure deployment configuration; cloud synchronization uses HTTPS when online |
| SHA/DHA, FHIR, HL7, payment, AI, and third-party APIs | TLS-protected endpoints, credential protection, endpoint allowlisting/validation, and integration-specific security review |

## 6. Offline Synchronization and Encryption Boundaries

### 6.1 Browser PowerSync

The PowerSync Sync Streams configuration explicitly excludes encrypted direct identifiers, including national ID and phone number, from browser SQLite synchronization. Browser clients receive only permitted columns scoped through signed, server-issued organization/facility/read-permission claims.

The application does not distribute `ENCRYPTION_KEY`, `PII_HMAC_KEY`, Azure Key Vault credentials, or server decryption capability to browser clients. PowerSync credentials are issued by a dedicated authenticated backend endpoint and use claims required by the Sync Streams policy.

### 6.2 Desktop, Mobile, and Hub Data

Desktop, mobile, and hub deployments may retain locally authorized data to support care continuity. These deployments require device/host access controls, supported operating-system security updates, storage protection, credential revocation, offline retention limits, reconciliation procedures, and incident assessment for lost or compromised devices.

Facility hubs use SQLite with WAL mode. Windows hub deployments may use DPAPI-protected secret bundles; this is separate from the desktop client and does not replace cloud KMS requirements.

### 6.3 Hub Key Management Requirements

Hubs that are authorized to retain encrypted data locally require controlled key provisioning to support offline operation. Hub key material shall be issued only to registered and authorized installations, protected by the host operating system's approved secret-storage controls, and governed by documented rotation, revocation, recovery, and incident procedures.

For multi-tenant cloud operation, key management shall limit key access to the authorized organization or facility scope and avoid unnecessary cross-tenant key exposure. Detailed key-distribution, device-wrapping, and migration design is maintained in restricted internal security architecture documentation.

### 6.4 SQLCipher Facility Hub Database Encryption

Facility Hub deployments default to SQLCipher encryption for `hub.sqlite3`. The hub requires `HUB_DATABASE_ENCRYPTION_KEY` before opening the database and fails closed when the protected runtime key is unavailable. The key is unique per hub and is independent from the Django secret, PII encryption key, and backup-bundle encryption key.

The installers generate and retain this key through the platform protected secret path: DPAPI `LocalMachine` bundles on Windows and `systemd-creds` encrypted credentials on Linux. Existing plaintext hubs follow a controlled verify-convert-verify update path before encrypted startup is enabled. SQLCipher database snapshots are additionally encrypted inside Fernet backup bundles.

Recovery escrow stores only Azure Key Vault-wrapped database-key ciphertext. Recovery material is delivered only through an X25519 device-bound envelope after installation, organization, and facility authorization; plaintext database keys are not stored in cloud records or activation payloads.

## 7. Backup Encryption

The active database backup script supports:

- PostgreSQL dump creation and compression.
- SHA-256 checksum generation.
- Optional GPG symmetric encryption using AES-256 when `BACKUP_ENCRYPTION_KEY` is supplied.
- Azure Blob upload using SAS token or managed identity.
- Backup artifact and checksum upload.

The script can upload an unencrypted backup when no backup encryption key is supplied. Therefore, production backup encryption is a mandatory deployment verification item, not a control that may be assumed solely from the script's existence.

Production evidence must show:

1. `BACKUP_ENCRYPTION_KEY` is supplied through approved secret management.
2. Uploaded backup artifacts use the encrypted `.gpg` format.
3. SHA-256 checksum verification succeeds.
4. Restore drills decrypt and restore the expected backup successfully.

### 7.1 Facility Hub Backup Encryption and Interim Azure Blob Delivery

Hub backups use a WAL-safe SQLCipher snapshot and include the persisted sync watermark/state. Each bundle is encrypted with the independent `HUB_BACKUP_ENCRYPTION_KEY`, checksummed, retained locally, and queued if off-site delivery is unavailable.

The interim off-site implementation issues device-bound, short-lived Azure Blob SAS upload credentials for the authorized installation. The cloud backend retains the storage-account key and grants hub credentials only create/write/add permissions. Backup paths are constructed under organization, facility, and installation identifiers. Expired credentials retain local queued bundles until renewal.

Azure Blob Storage in South Africa North is an interim target only and must not be represented as Kenya-resident storage. Production Kenya residency requires migration to a contractually Kenya-resident object-storage or gateway provider.
5. Backup retention, Azure Blob access, and recovery-key access are restricted and reviewed.

## 8. Cryptographic Data Handling Requirements

1. Plaintext PII shall not be stored in encrypted-field columns, logs, screenshots, support bundles, or analytics exports unless a documented and approved support/care purpose requires controlled access.
2. Encryption keys and secrets shall be stored in approved secret-management systems or protected runtime configuration, never in source code or public client bundles.
3. PII HMAC values are deterministic lookup aids and shall not be treated as anonymous data. Access to them is restricted as confidential/restricted metadata.
4. Encrypted backups and ciphertext must remain available with their required key/version metadata for approved recovery and retention periods.
5. Cryptographic exceptions, unsupported client operating systems, expired certificates, key-rotation delays, and failed decryption events shall be logged, investigated, and escalated according to severity.
6. Changes to encryption algorithms, key providers, field coverage, TLS ingress, certificate configuration, backup encryption, or offline replication require security review, regression testing, and specification update.

## 9. Compliance Evidence Checklist

Before submission or annual review, retain:

- Field-encryption unit/integration test results and sample encrypted-column verification.
- Active KMS provider configuration and key-custody evidence.
- PII HMAC separation and search-control evidence.
- Current TLS certificate chain, protocol scan, HSTS, and public-ingress evidence.
- PowerSync stream configuration proving encrypted PII exclusions and signed claim enforcement.
- Desktop/mobile/hub local-data security configuration and device-management evidence.
- Encrypted backup artifact, checksum, restore, and key-recovery test evidence.
- Key rotation, key-compromise, and decryption-failure incident records or exercises.
- Security-policy approval, DPIA alignment, privacy notice, and incident-response evidence.

## 10. Approval and Review

This specification shall be reviewed at least annually and after a material encryption, KMS, data flow, client storage, cloud region, public ingress, backup, or regulatory change.

| Version | Date | Change | Owner | Approval |
|---|---|---|---|---|
| 1.0 | 2026-10-02 | Initial encryption implementation specification. | Security Officer | Pending CTO, DPO, platform owner, and DHA review |
