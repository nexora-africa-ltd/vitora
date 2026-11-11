# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
Purpose: DHA evidence summary for Neon PostgreSQL database encryption at rest and database transport encryption.
Use: Attach with the cited Neon security overview and sanitized Neon Console context image.
Inputs: docs/dha/submissions/SEC-ENC-001/neon-security-overview.md and 04-neon-console-project-context-sanitized.png.
-->

# Database Encryption at Rest — Neon PostgreSQL

**Evidence date:** 11 November 2026
**Database provider:** Neon PostgreSQL
**Evidence source:** `neon-security-overview.md`, copied from Neon Security & Compliance documentation and dated 5 November 2026.

## Provider control statement

Neon's security overview states that inactive data stored on NVMe SSD volumes is encrypted using an **AES-256 block cipher implemented in a hardware module**. It also states that all database connections require **SSL/TLS**, supports PostgreSQL `verify-full`, and describes TLS 1.2/1.3 for service traffic.

| DHA criterion | Evidence | Source reference |
| --- | --- | --- |
| Database encryption at rest | Neon encrypts NVMe instance storage with AES-256 | `neon-security-overview.md`, lines 49–52 |
| Database connection encryption | Neon requires SSL/TLS and supports PostgreSQL `verify-full` | `neon-security-overview.md`, lines 15–21 |
| Provider key management | Neon documents AES-256 encryption at rest, TLS 1.2/1.3, KMS/Key Vault controls, rotation, and audited access | `neon-security-overview.md`, lines 65–69, 81–86 |
| Target system context | Sanitized Neon Console project/production-branch context | `04-neon-console-project-context-sanitized.png` |

## Application-side transport enforcement

Vitora staging and production Django settings configure PostgreSQL connections with `ssl_require=True`; the production direct-connection fallback also sets `sslmode=require`. This application configuration is separate from, and complements, Neon's provider-level encryption controls.

## Sanitization statement

The attached Neon Console context image removes browser URL, signed-in user identity, project/branch IDs, timestamps, and usage values. It retains only the provider context, project name, production branch name, and region needed to associate the provider evidence with the deployment.

No patient data, database credentials, connection strings, tokens, or private keys are included in this evidence.
