# Hub Code Protection Plan

> **Status**: Design Plan
> **Author**: Engineering
> **Date**: 2026-06-12
> **Scope**: Protect Vitora HMIS intellectual property on customer-managed hub installations
> **Related**: [hub-cloud-sync-plan.md](./hub-cloud-sync-plan.md), [hub-installer-plan.md](./hub-installer-plan.md)

---

## Problem Statement

Vitora HMIS hubs are installed on customer premises (Linux/Windows servers in clinics and hospitals). Today the installer ships **plain Python source files** under `/opt/vitora-hub/` (or equivalent). This creates concrete risks:

1. **Source extraction** — a technically capable operator can `cat`, `tar`, or `git init` the directory and walk away with the full codebase.
2. **Rebranding** — `sed -i 's/Nexora/Acme/g'` across `templates/`, settings, and email signatures rebrands the product in minutes.
3. **Feature unlocking** — license checks, MFA enforcement, RBAC gates, and SHA submission guards are all readable and editable.
4. **Forking** — a competitor or disgruntled customer can stand up a parallel product without ever logging into our cloud.
5. **Trade-secret exposure** — DHA HIE integration logic, SHA claim adjudication rules, and clinical templates represent years of domain work that we don't want copied wholesale.

Pure source obfuscation (renaming identifiers, base64-encoding strings) is a speed bump, not a wall. The robust answer is **defense in depth**: compile what we can, move what matters to the cloud, gate runtime behaviour on a signed license, and put legal teeth on top.

---

## Design Principles

| # | Principle | Rationale |
|---|-----------|-----------|
| 1 | **No single control is sufficient** | Each layer is bypassable in isolation; the combination is what raises the cost above the value of stealing it. |
| 2 | **Cloud-issued, cloud-revocable** | Anything verified solely on the hub can be patched out. License, integrity, and feature gates must be answerable from the cloud. |
| 3 | **Offline-tolerant but bounded** | Hubs must work without internet for clinical safety, but indefinite offline operation is a piracy vector. Cap the grace period. |
| 4 | **Don't brick paying customers** | Aggressive enforcement (kill-switch, encrypted DB) must have manual override paths and clear support escalation. |
| 5 | **Legal is the long arm** | Technical controls buy time; the EULA + Kenya trademark/copyright registration is what makes piracy actionable. |
| 6 | **Detect, don't just prevent** | Assume some hubs will be tampered with; design check-in to surface this so we can revoke and pursue. |

---

## Threat Model

| Actor | Motivation | Capability | Mitigation Layer |
|-------|------------|------------|------------------|
| Operator (curious) | Look at source out of interest | Read filesystem | Compiled binaries (P2) |
| Operator (rebranding) | Replace "Nexora/Vitora" with own brand to resell | `sed`, basic Python edits | Compiled binaries + integrity check-in (P2, P3) |
| IT staff (feature unlock) | Remove MFA, license check, RBAC | Read + edit Python, restart service | Cloud-gated features + license check-in (P3, P4) |
| Competitor (extraction) | Lift modules (SHA, DHA, AI) into own product | Reverse engineering, decompilers | Cloud-only modules + compiled core + legal (P1, P2, P6) |
| Forker | Stand up parallel product | Full development capability | Combined controls + legal action (P6) |
| Pirate distributor | Resell hub images to multiple sites | Docker save/load, image cloning | Per-installation license binding + revocation (P3) |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLOUD                                       │
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────────┐   │
│  │  License     │   │  Integrity   │   │  Feature-flagged services   │   │
│  │  Authority   │   │  Manifest    │   │  (SHA, DHA, AI, Analytics)  │   │
│  │  (RS256 JWT) │   │  (per-build) │   │                             │   │
│  └──────┬───────┘   └──────┬───────┘   └──────────────┬──────────────┘   │
│         │                  │                          │                  │
│         │  signed JWT      │  expected hashes         │  cloud API       │
│         ▼                  ▼                          ▼                  │
└─────────┼──────────────────┼──────────────────────────┼──────────────────┘
          │                  │                          │
          │                  │                          │
┌─────────┼──────────────────┼──────────────────────────┼──────────────────┐
│         ▼                  ▼                          ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                          HUB                                     │    │
│  │                                                                  │    │
│  │  ┌────────────────────┐   ┌─────────────────────────────────┐    │    │
│  │  │ Nuitka-compiled    │   │ Plain Python (must stay open)   │    │    │
│  │  │ - apps/core/*      │   │ - manage.py                     │    │    │
│  │  │ - apps/licensing/* │   │ - settings/*.py                 │    │    │
│  │  │ - apps/sync/*      │   │ - migrations/*                  │    │    │
│  │  │ - apps/sha/*       │   │                                 │    │    │
│  │  │ - apps/encounters/*│   │                                 │    │    │
│  │  │ - all branding     │   │                                 │    │    │
│  │  └────────────────────┘   └─────────────────────────────────┘    │    │
│  │                                                                  │    │
│  │  ┌────────────────────────────────────────────────────────────┐  │    │
│  │  │ LicenseGuard (verifies JWT, enforces grace period)         │  │    │
│  │  │ IntegrityReporter (hashes binaries, sends to cloud)        │  │    │
│  │  │ FeatureGate (consults flags from license + cloud)          │  │    │
│  │  └────────────────────────────────────────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 0 — Baseline Hardening (No Code Changes)

**Goal:** Reduce trivial attack surface and establish legal footing before any technical work lands.

| Task | Owner | Effort | Outcome |
|------|-------|--------|---------|
| Draft EULA with anti-reverse-engineering, anti-rebranding, no-redistribution clauses | Legal | 1 wk | Signed at activation; enforceable in Kenya |
| Register "Vitora" and "Nexora Consulting" wordmarks at KIPI | Legal | 4–6 wks (filing) | Trademark infringement claims become possible |
| Add copyright headers to every source file (`© 2026 Nexora Consulting Ltd. All rights reserved.`) | Eng | 1 day | Strings table evidence in any extracted form |
| Designate the codebase as a **trade secret** internally (NDA refresh, access logs) | Legal + Eng | 1 wk | Strengthens claims under Industrial Property Act |
| Restrict on-prem install directory permissions (`chown root`, `chmod 750`) and run service as a dedicated unprivileged user | Eng | 1 day | Casual `cat` blocked; doesn't stop root |
| Remove `.git`, `.github`, `tests/`, `docs/` from installed artifact | Eng | 1 day | Strip dev-only context from shipped tree |
| Audit `.env.example`, README, comments for internal hostnames, credentials, or roadmap leaks | Eng | 1 day | No accidental disclosure in installer |

**Exit criteria:** EULA approved by counsel; trademark filings submitted; first installer build excludes dev artefacts and runs as `vitora` service user.

---

## Phase 1 — Cloud-Only Differentiators (Architectural Protection)

**Goal:** Make a cloned/stolen hub **worth less** by ensuring our highest-value capabilities only function when talking to our cloud.

### Inventory: what moves to cloud-only

| Module | Today | Phase 1 target | Rationale |
|--------|-------|----------------|-----------|
| SHA / DHA HIE submission | Hub-local code, calls DHA directly | Hub calls Vitora cloud → cloud calls DHA | Already needs internet; centralise creds, audit, retries |
| TibaBot / AI features | Already cloud | Keep cloud | No change |
| KHIS / DHIS2 reporting | Hub-local code | Hub pushes raw data → cloud generates and submits reports | Aggregation is cross-facility anyway |
| Cross-facility analytics, BI dashboards | N/A (not yet built) | Build cloud-native from the start | Inherently multi-tenant |
| License issuance + activation code generation | Cloud already | Keep cloud | Phase 3 hardens verification |
| Software updates + integrity manifests | Manual today | Cloud-published, hub-pulled, signed | Phase 3 |
| Reference data (ICD, drugs, SHA package matrix) | Loaded from CSV on hub | Cloud is source of truth; hub pulls signed snapshots | Already designed in sync plan |

### Anti-pattern to retire

Today, a hub has its own SHA credentials, calls DHA directly, and stores `SHA_AGENT` / signing keys in its `.env`. Anyone with filesystem access can scrape these. Moving submission to cloud lets us:

- Hold SHA/DHA credentials in **one place** (Azure Key Vault), never on hubs.
- Revoke a hub's ability to submit by disabling its license server-side, even if the hub itself is patched.
- Audit every SHA submission centrally (already a compliance win).

### Deliverables

1. **`POST /api/cloud/sha/submit/`** — hub posts a claim, cloud forwards to DHA, returns response. Hub no longer holds SHA credentials.
2. **`POST /api/cloud/khis/report/`** — hub posts aggregated period data, cloud submits to KHIS.
3. **Hub-side feature flags** keyed off license JWT: `sha_enabled`, `dha_hie_enabled`, `analytics_enabled`. If flag is false, the corresponding hub UI is hidden and APIs return 403.
4. **Remove DHA/SHA secret material from hub `.env`** in the installer.

**Exit criteria:** A hub with no internet still does clinical workflows. A hub with no valid license can't submit SHA claims, generate KHIS reports, or use AI.

---

## Phase 2 — Compile the Code (Make It Unreadable)

**Goal:** Replace shipped `.py` files with native-compiled binaries so source extraction yields machine code, not Python.

### Tool choice: Nuitka

We evaluated four options:

| Tool | Output | Pros | Cons | Verdict |
|------|--------|------|------|---------|
| **Nuitka** | Native `.so`/`.pyd` + optional standalone | Whole-app compile, Django-compatible, no source in binary | Build time, occasional edge cases with metaclasses | **Selected** |
| Cython (`cythonize --3str`) | `.so` per module | Mature, fine-grained control | Per-module config burden, mixed-language project | Fallback for edge cases |
| mypyc | `.so` per typed module | Used by Black/mypy in prod | Requires full type hints; we're not there yet | Future option |
| PyInstaller `--onefile` | Bundled interpreter + `.pyc` | Easy | `.pyc` decompiles trivially with `decompyle3` | **Rejected** as a protection layer |

### What gets compiled vs stays plain

| Layer | Treatment | Why |
|-------|-----------|-----|
| `hmis/apps/**/*.py` (models, views, services, signals) | **Nuitka-compiled** to `.so` | Bulk of IP |
| `hmis/apps/core/licensing/*`, `hmis/apps/core/sync/*` | **Nuitka-compiled** | High-value enforcement code |
| Branding constants, email templates baked into Python | **Nuitka-compiled** | "sed Nexora" requires binary editing |
| `manage.py`, `wsgi.py`, `asgi.py`, `celery.py` | **Plain `.py`** | Entry points; must be importable by interpreter |
| `hmis/settings/*.py` | **Plain `.py`** | Operators need to set env vars; doesn't contain IP |
| `migrations/*.py` | **Plain `.py`** | Django requires them as source for `makemigrations` history |
| Jinja/HTML templates, JS, CSS | Plain | Already client-visible; protected by trademark, not compilation |
| `.po` translations | Plain | Standard format |

### Build pipeline

```
GitHub Actions (release branch)
  │
  ├─ Lint, test, type-check (existing CI)
  │
  ├─ Build matrix: linux/amd64, linux/arm64, windows/amd64
  │     │
  │     ├─ poetry install
  │     ├─ python -m nuitka --module hmis.apps.<each_app> \
  │     │     --include-package=hmis.apps.<each_app> \
  │     │     --output-dir=build/compiled/
  │     ├─ Replace .py with .so in build/payload/
  │     ├─ Strip __pycache__
  │     └─ Sign each .so with cosign / GPG detached signature
  │
  ├─ Generate integrity manifest:
  │     manifest.json = { "version": "1.4.5", "files": [ { "path": "...", "sha256": "..." } ] }
  │     Sign manifest with release key.
  │
  ├─ Publish to release CDN:
  │     /releases/<version>/hub-linux-amd64.tar.gz
  │     /releases/<version>/manifest.json
  │     /releases/<version>/manifest.json.sig
  │
  └─ Update cloud DB: Release(version, manifest_url, published_at, signed_by)
```

### Compatibility concerns and mitigations

| Risk | Mitigation |
|------|------------|
| Django's app autodiscovery expects `apps.py` | Keep `apps.py` plain; compile everything else in the app |
| `makemigrations` needs source-level model definitions | We don't run `makemigrations` on the hub; migrations are pre-generated and shipped as plain `.py` |
| Celery autodiscovery of `tasks.py` | Verify `celery -A hmis worker` works with compiled `tasks`; Nuitka has a Django plugin |
| Stack traces become harder to debug | Ship symbol files separately to support; hub log shipping (Phase 4) sends traces to us, where we can resolve |
| Build time blows out CI | Cache Nuitka build artifacts per module; parallelise per-app compilation |
| Bug reports reference compiled lines | Map compiled line → source line via Nuitka's `--debug` build kept internally |

### Deliverables

1. `backend/Makefile` target: `make build-compiled-hub` producing `dist/hub-<version>-<arch>.tar.gz`.
2. GitHub Actions workflow `.github/workflows/build-hub.yml`.
3. Installer fetches the **compiled** tarball, not source.
4. Smoke-test job runs the compiled hub through key endpoints (login, create patient, create encounter, run sync) in CI before publishing.
5. Internal debug build kept private with full source maps.

**Exit criteria:** An installed hub contains no `.py` files outside `manage.py`, `settings/`, `migrations/`, and `apps.py`. Grep for "Nexora" on the installed tree returns matches only in HTML/email templates and binary strings tables.

---

## Phase 3 — Cloud-Gated License & Integrity Enforcement

**Goal:** Make a hub that isn't checking in regularly with our cloud unable to operate fully, and make any binary tampering detectable from the cloud.

### License JWT hardening

| Field | Today | Phase 3 |
|-------|-------|---------|
| Signing algorithm | HS256 (shared secret) | **RS256 / Ed25519** (private key on cloud only) |
| Public key location | N/A | Embedded in Nuitka-compiled `licensing` module; removing it requires binary patching |
| Issued lifetime | Long-lived | **14 days max**; renewed every check-in |
| Claims | `org_id`, `facility_id`, `installation_id` | Add `features` (map of bools), `binary_manifest_id`, `not_before`, `expires_at`, `revocation_epoch` |
| Revocation | None | Cloud increments `revocation_epoch`; hubs reject older tokens at next check-in |

### Mandatory check-in

```
POST /api/licensing/check-in/
{
  "installation_id": "hub-...-1717...",
  "license_jti": "<current JWT id>",
  "version": "1.4.5",
  "uptime_seconds": 86400,
  "hostname": "clinic-srv-01",
  "os": "Ubuntu 24.04",
  "ip_address": "10.0.5.4",
  "user_count_24h": 8,
  "encounter_count_24h": 45,
  "binary_hashes": {
    "hmis/apps/core/licensing.so": "<sha256>",
    "hmis/apps/sha/services.so": "<sha256>",
    ...
  },
  "hardware_fingerprint": "<sha256 of CPU + MB serial + disk UUID>"
}

Response:
{
  "license": "<new JWT>",
  "expires_at": "...",
  "binary_manifest_id": "1.4.5-r3",
  "actions": [
    { "type": "update_available", "version": "1.4.6" }
  ]
}
```

### LicenseGuard behaviour on the hub

```
On every request (middleware):
  1. Read cached license JWT from /var/lib/vitora-hub/license.jwt
  2. Verify signature against embedded public key
  3. Check expires_at:
       - if valid → proceed
       - if expired but within 7-day soft grace → log warning, proceed, raise UI banner
       - if expired by 7–14 days → read-only mode (no writes except check-in)
       - if expired by >14 days → block all requests except check-in + login (for unlock)
  4. Check feature flag for the requested route (Phase 1 integration)

Background check-in (Celery beat, every 6 hours):
  - POST /api/licensing/check-in/
  - On success: replace cached JWT
  - On HTTP 401 (revoked): wipe cached JWT → next request triggers full-block
  - On network failure: retry with backoff; tolerate up to grace period
```

### Integrity reporting

The check-in payload includes `binary_hashes`. Cloud compares against the **expected manifest** for the reported `version`:

| Comparison result | Cloud action |
|-------------------|--------------|
| All hashes match | Issue normal JWT |
| Hashes don't match expected for that version | Issue JWT with `features.tamper_detected = true` |
| Tamper persists for >7 days | Flag installation in admin dashboard, page on-call, optionally revoke |
| Same `installation_id` reporting from many IPs / hostnames | Probable cloned hub → revoke, alert sales |

We **do not** auto-brick on hash mismatch — false positives from package updates, partial deployments, or filesystem corruption are real. Tamper detection feeds a human-reviewed workflow.

### Per-installation binding

- Each activation code is single-use; redemption records `installation_id`, hardware fingerprint, first-seen timestamp.
- Subsequent check-ins must match the recorded fingerprint within a tolerance (e.g. CPU or motherboard change OK, full hardware swap requires re-activation).
- Attempting to activate an already-redeemed code returns 409.

### Deliverables

1. RS256/Ed25519 key pair generated; private key in Azure Key Vault, public key embedded in `apps/core/licensing/` (compiled in Phase 2).
2. `LicenseGuard` middleware enforcing grace tiers (valid → soft → read-only → blocked).
3. Celery beat task `licensing.check_in` running every 6 hours.
4. Cloud `Installation` model gains `binary_manifest_id`, `hardware_fingerprint`, `tamper_flagged_at`, `revoked_at`.
5. Cloud admin page: list installations, view check-in history, force revoke.
6. Documented operator unlock path (support issues a one-time override JWT for genuine offline emergencies).

**Exit criteria:** A hub that stops checking in degrades gracefully over 14 days. A revoked installation cannot serve writes within 6 hours. Tampered binaries are visible in the cloud admin within one check-in cycle.

---

## Phase 4 — Distribution Hardening

**Goal:** Eliminate the "folder of files" deployment model; make the installed unit opaque, atomic, and signed end-to-end.

### Containerised delivery (Linux)

Ship the hub as a signed OCI image rather than a tarball:

```
Customer installer:
  - Installs Docker + docker-compose (or uses existing)
  - Pulls registry.vitora.digital/hub:<version>@sha256:<digest>
  - Verifies image signature with cosign against our public key
  - Renders docker-compose.yml from template using activation response
  - Runs `docker compose up -d`

Advantages:
  - Filesystem inside container is layered; no obvious "edit a file" surface
  - Atomic updates: `docker pull` + restart; local edits are blown away
  - Image signing makes substitution detectable
  - Resource limits (CPU, memory) enforced by container runtime
  - Logs flow to stdout → easy to ship to cloud
```

### Native installer (Windows / facilities without Docker)

For sites that can't run Docker (some Windows-only clinics, network-restricted environments):

- MSI / NSIS installer signed with Authenticode certificate
- Installs to `C:\Program Files\Vitora\Hub\` with **ACLs that deny modify to non-admin**
- Runs as a Windows Service under a dedicated low-privilege account
- Updater is a signed binary checking the cloud release feed

### Code signing keys & key management

| Asset | Storage | Rotation |
|-------|---------|----------|
| Release signing key (cosign / GPG) | Azure Key Vault HSM | Annual; old keys remain trusted for verification of historical builds |
| Authenticode certificate (Windows) | Hardware token held by release engineer | Per cert expiry |
| License JWT signing key (RS256/Ed25519) | Azure Key Vault HSM | Bi-annual; overlap window where hub trusts both keys |
| Cloud TLS cert | Managed by Azure / cert-manager | Automated |

### Update channel

- `stable` (default), `beta` (opt-in)
- Cloud publishes `current_version` per channel; hub checks at check-in
- Updates downloaded to a staging path, verified, then atomically swapped on restart
- Customer can defer up to N days; after that, mandatory update window enforced (configurable)

### Deliverables

1. OCI image build + sign pipeline (`cosign sign --key azurekms://...`).
2. Private registry `registry.vitora.digital` with token-gated pulls (license JWT acts as bearer).
3. Windows MSI build pipeline with Authenticode signing.
4. Installer rewrite: from "untar files" to "pull signed image" / "run signed MSI".
5. Auto-update service on hub: detect new version, download, verify, swap, restart.
6. Rollback path: keep previous version on disk for one cycle; failed health check triggers rollback.

**Exit criteria:** No customer-managed install is a folder of files. Every binary on every hub traces back to a CI-signed artifact published from `main`. A modified image fails signature verification and refuses to start.

---

## Phase 5 — Optional Aggressive Controls

**Goal:** For high-risk deployments or after observed piracy, add measures that meaningfully raise the cost of running a hub off-network. **All optional, all reversible, all require explicit support unlock for genuine emergencies.**

### A. Encrypted local database

- SQLite DB encrypted with SQLCipher
- Encryption key composed of two parts:
  - **Local part**: derived from hardware fingerprint
  - **Cloud part**: delivered at check-in, cached in memory only
- After 14+ days offline, the cloud part expires → DB won't open until next successful check-in
- Support can issue a one-time recovery key for legitimate prolonged outages

**Cost:** Real risk of bricking a genuinely offline rural clinic. Use only for customers explicitly on this tier (or after demonstrated bad-faith actors).

### B. Code attestation via TPM

- Where TPM 2.0 is available, hub measures its own binary set into a PCR
- Quotes the PCR in check-in; cloud verifies against expected manifest
- Cryptographic proof of tamper, not just a hash report

**Cost:** TPM availability varies; non-trivial to implement; high assurance level.

### C. Watermarking

- Each compiled build embeds a unique build ID
- Internal log lines, generated PDFs, and exported reports include the build ID in metadata
- If a Vitora-derived product surfaces in the market, the build ID identifies the source installation

**Cost:** Low; do this in Phase 2 alongside compilation.

### D. Honeypot strings & canary tokens

- Compiled binaries contain unique trap strings ("internal use only — installation `abc123`")
- If those strings show up in a competitor's codebase or a public dump, we have evidence of provenance

**Cost:** Low; mostly evidentiary value for legal cases.

### E. Per-customer binary builds

- For top-tier customers (and as a deterrent), produce a build keyed to their installation
- Binaries refuse to load without matching license fingerprint embedded in the build
- Eliminates the "one binary, many cloned licenses" attack

**Cost:** Operational complexity (per-customer release pipeline). Reserve for enterprise tier.

---

## Phase 6 — Legal & Commercial Reinforcement

**Goal:** Make technical evasion legally actionable, and align commercial controls with technical ones.

### Contractual

| Clause | Purpose |
|--------|---------|
| **No reverse engineering, decompilation, or disassembly** | Direct cause of action against extraction attempts |
| **No removal of proprietary notices, branding, or copyright headers** | Direct cause of action against rebranding |
| **No redistribution, sublicensing, or use for third parties** | Blocks "service bureau" use of one license for many sites |
| **Audit right** | We may inspect installation, with notice, to verify compliance |
| **Telemetry consent** | Customer agrees to check-in payload contents (versions, counts, hashes) |
| **Termination on breach** | Detected tamper or revocation justifies licence termination + injunctive relief |
| **Kenya jurisdiction + injunctive relief** | Local courts can issue restraining orders quickly |
| **Liquidated damages clause for confirmed piracy** | Pre-agreed sum avoids damages litigation |

### Intellectual property registrations

| Asset | Registry | Status |
|-------|----------|--------|
| "Vitora" wordmark | KIPI (Kenya Industrial Property Institute) | File in Phase 0 |
| "Nexora Consulting" wordmark | KIPI | File in Phase 0 |
| Vitora logo | KIPI | File in Phase 0 |
| Copyright notice in source files | Automatic under Kenya Copyright Act, but **register** for evidentiary weight | File annually |
| Trade-secret designation | Internal policy + NDA refresh | Phase 0 |

### Operational

- **All employees and contractors** sign IP assignment + NDA before repo access.
- **Access logs** for source repos retained 3 years (already standard via GitHub).
- **Departing engineer offboarding** revokes all repo access within 1 business day; signed exit attestation about returned/destroyed materials.
- **Customer activation** requires acknowledgement of EULA in writing or click-through; record stored against the installation.

---

## Implementation Sequence

```
2026-Q3  ─┬─ Phase 0  (legal + baseline hardening)
          │
          ├─ Phase 1  (cloud-only differentiators: SHA, KHIS, analytics)
          │
2026-Q4  ─┼─ Phase 2  (Nuitka compilation pipeline)
          │
          └─ Phase 3  (license + integrity check-in)
2027-Q1  ─┬─ Phase 4  (containerised / signed distribution)
          │
          └─ Phase 6  (ongoing legal: contracts, KIPI registrations, audit)
2027-Q2+ ─── Phase 5  (optional aggressive controls — per-customer / per-deployment)
```

### Dependencies

- Phase 2 depends on Phase 0 (copyright headers must exist before binaries bake them in).
- Phase 3 depends on Phase 2 (public key embedded in compiled binaries — otherwise it can be swapped out).
- Phase 4 depends on Phase 2 (we ship compiled binaries inside the container/MSI, not source).
- Phase 1 is independent and can run in parallel with Phase 2.

---

## Success Metrics

| Metric | Baseline (today) | Target (post-Phase 4) |
|--------|------------------|----------------------|
| `.py` files in installed hub | ~2,500 | < 50 (entry points + settings + migrations) |
| Time to "rebrand" a stolen hub | < 5 minutes | Days–weeks (binary patching required) |
| Detection time for tampered hub | None | ≤ 6 hours (next check-in) |
| Detection time for cloned installation | None | ≤ 24 hours (duplicate fingerprints) |
| Hub functionality with no internet > 14 days | Full | Read-only after grace; full block on writes |
| SHA submission possible without cloud | Yes | No (cloud-only) |
| AI features possible without cloud | No | No (unchanged) |
| Legal cause of action against rebranding | Weak | Strong (EULA + trademark + copyright) |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Compiled build breaks a Django edge case in production | Medium | High | Extensive CI smoke tests; staged rollout; rollback path |
| LicenseGuard bricks a legitimate offline rural clinic | Medium | High | 14-day grace + support-issued override JWT + clear UI warnings |
| Customers refuse telemetry in check-in payload | Low | Medium | Telemetry consent in EULA; minimum viable payload is just license JTI + version |
| Nuitka can't compile a critical dependency | Low | Medium | Fallback to Cython per-module; or keep that module plain and rely on other layers |
| Hardware fingerprint changes on routine maintenance (disk swap) | Medium | Low | Tolerance windows + support-driven re-binding flow |
| Cloud outage prevents legitimate check-ins | Low | High | 7-day soft grace; cloud SLA + multi-region |
| Determined attacker still cracks compiled binaries | High (over time) | Medium | Combined controls + legal pursuit; defense in depth was always the plan |
| EULA unenforceable in some jurisdictions | Medium | Medium | Combined with technical controls; Kenya focus limits exposure |

---

## What This Plan Explicitly Does Not Do

- **Does not claim uncrackability.** A motivated attacker with enough time can extract Python source from Nuitka binaries (the AST is reconstructable in principle). The plan raises cost above value, not to infinity.
- **Does not rely on security-through-obscurity alone.** Every layer assumes the previous one can be defeated.
- **Does not block legitimate forensics or debugging.** Internal debug builds with symbols are kept private but available to support.
- **Does not introduce DRM that risks patient safety.** Clinical workflows always work offline within the grace period; aggressive controls (Phase 5) are opt-in per deployment.
- **Does not replace good security hygiene.** PII encryption, RBAC, audit logging, MFA — all remain primary controls for the data layer regardless of code protection.

---

## Open Questions

1. Do we want to support an **air-gapped** deployment tier (no internet ever)? If yes, that tier needs offline license tokens with long expiry — and we accept reduced piracy protection for those customers.
2. What's our policy on **third-party security researchers** decompiling the hub? Bug bounty + safe harbour, or pursue as EULA breach?
3. Should the **community / open-source edition** exist? A clearly-licensed (AGPL?) limited edition could draw the heat away from the commercial product.
4. Who owns the **revocation decision**? Support, sales, or engineering on-call? Needs a documented runbook before Phase 3 ships.
5. How do we handle **acquired customer hubs** (M&A scenarios where a Vitora customer is acquired and the parent wants to relicense)?

---

## Appendix A — File Treatment Reference

```
backend/
├── manage.py                       PLAIN  (entry point)
├── hmis/
│   ├── settings/                   PLAIN  (env-driven config)
│   ├── celery.py                   PLAIN  (entry point)
│   ├── urls.py                     COMPILED
│   ├── wsgi.py / asgi.py           PLAIN  (entry points)
│   └── apps/
│       ├── core/
│       │   ├── apps.py             PLAIN
│       │   ├── migrations/         PLAIN
│       │   ├── licensing/          COMPILED  ← embeds RS256 public key
│       │   ├── sync/               COMPILED
│       │   ├── events/             COMPILED
│       │   └── *.py                COMPILED
│       ├── patients/               COMPILED  (apps.py + migrations plain)
│       ├── encounters/             COMPILED  (apps.py + migrations plain)
│       ├── sha/                    COMPILED  (high-value IP)
│       ├── pharmacy/               COMPILED
│       ├── laboratory/             COMPILED
│       └── ...                     COMPILED
├── templates/                      PLAIN (HTML; protected by trademark)
└── locale/                         PLAIN
```

## Appendix B — Check-in Payload Schema (Phase 3)

See `backend/hmis/apps/core/licensing/schemas.py` (to be created in Phase 3) for the canonical Pydantic schema. Initial shape:

```python
class CheckInPayload(BaseModel):
    installation_id: str
    license_jti: str
    version: str
    uptime_seconds: int
    hostname: str
    os: str
    ip_address: str
    user_count_24h: int
    encounter_count_24h: int
    binary_hashes: dict[str, str]   # relpath -> sha256
    hardware_fingerprint: str
    last_successful_sync_at: datetime | None
    pending_sync_queue_depth: int
```

## Appendix C — Glossary

| Term | Meaning |
|------|---------|
| **Hub** | Customer-premises Vitora installation (Linux/Windows server) |
| **Cloud** | `api.vitora.digital` — Vitora's managed services |
| **Installation** | A single hub deployment, identified by `installation_id` |
| **Activation code** | One-time code issued by cloud, redeemed by hub at install |
| **License JWT** | Short-lived signed token granting hub feature access |
| **Check-in** | Periodic POST from hub to cloud reporting status + receiving fresh license |
| **Integrity manifest** | Per-release map of file path → expected SHA-256, signed by release key |
| **Grace period** | Window during which an expired license still allows operation (degraded) |
| **Revocation epoch** | Monotonic counter; cloud increments to invalidate older JWTs |
| **Tamper flag** | Cloud-side marker on an installation when reported hashes don't match manifest |

---

**Last Updated**: 2026-06-12
**Maintainer**: Engineering Lead
**Version**: 1.0 (initial draft)
