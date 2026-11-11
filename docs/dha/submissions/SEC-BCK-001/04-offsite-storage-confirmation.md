# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
Purpose: DHA SEC-BCK-001 confirmation of off-site backup-storage controls.
Use: Attach as document-review evidence with sanitized Azure storage configuration output.
Inputs: Azure Blob Storage configuration and the controlled backup access register.
-->

# Off-Site Backup Storage Confirmation

Production Vitora PostgreSQL backups and paired SHA-256 checksum files are held in a private Azure Blob Storage backup container that is separate from the production application runtime. The controlled operations asset register records the account, region, approved recovery personnel, and recovery access path; those operational details are excluded from the DHA attachment to prevent credential or attack-surface disclosure.

The storage baseline requires:

- Azure Storage Service Encryption at rest;
- HTTPS-only transfer with TLS 1.2 minimum;
- no anonymous public blob access;
- least-privilege access for authorized backup and recovery operations;
- GPG AES-256 application-layer backup encryption before upload; and
- a paired SHA-256 checksum for each backup artifact.

The sanitized SEC-ENC-001 Azure evidence confirms these settings and is cross-referenced by the BCK-001 backup artifact and restore-drill report.
