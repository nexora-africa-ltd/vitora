# IP Protection Strategy

> **Status**: Implemented (compilation + licensing + legal). Server-side migration is roadmap.
> **Last reviewed**: 2026-06-14

This document describes the layered approach Vitora HMIS uses to protect
Nexora Consulting Ltd's intellectual property in the facility hub
distribution.

---

## Threat model

The facility hub ships as a self-extracting installer to customer premises.
Once installed, customers (and any attacker who steals a hub disk image)
have root/Administrator access to the bytes. We must therefore assume:

- The attacker has read access to every file in `C:\VitoraHub\` /
  `/opt/vitora/`.
- The attacker can run Python introspection (`dir()`, `__dict__`,
  `inspect.getsource()`) against any loaded module.
- The attacker can read network traffic the hub sends to Nexora cloud.
- The attacker **cannot** access Nexora's cloud infrastructure or the
  private signing keys.

Protection goals (in priority order):

1. Prevent casual code copying / forking by a competitor.
2. Make reverse engineering of clinical-decision and adjudication logic
   expensive enough to be uneconomic.
3. Enable revocation when a license is breached.
4. Establish a clear legal basis for action against violators.

We explicitly do **not** aim for unbreakable protection. No client-side
code-protection scheme is unbreakable; the goal is to raise cost above
the value an attacker could extract.

---

## Tier 1 — Source obfuscation (implemented)

**Mechanism**: Cython per-file compilation. Every `.py` file under
`hmis/` (except files Django needs to read as source) is compiled to a
native `.so` (Linux) / `.pyd` (Windows), and the `.py` source is removed
from the shipped artifact.

**Files**:

- `backend/scripts/compile-hub.py` — compilation driver
- `.github/workflows/build-hub.yml` — CI matrix (Linux + Windows)

**What stays as plain Python** (and why):

| Path / pattern | Reason |
|----------------|--------|
| `manage.py`, `wsgi.py`, `asgi.py` | Entry points read by gunicorn/uvicorn |
| `apps.py` | Django app registry auto-discovery |
| `__init__.py` | Package markers (Cython package init is fragile) |
| `migrations/*.py` | Django migration framework lists .py files |
| `management/commands/*.py` | Django command discovery scans the directory |
| `templates/`, `static/`, `locale/` | Not Python |

**Attacker cost to extract source**: Decompiling Cython `.so` requires
disassembling machine code and reconstructing Python semantics from
CPython API calls. Tooling exists (e.g. `decompyle++` partial support,
ghidra plugins) but produces unreadable output that requires substantial
manual work per file. Cost scales with file count (~600 files).

**Build time**: ~5 min on a 4-CPU GitHub runner. We force `-O0` because
we want opacity, not runtime speed (CPython optimization passes are not
the bottleneck for our IO-bound workload).

---

## Tier 2 — Licensing and activation (implemented)

**Mechanism**: Each hub installation must activate against Nexora's cloud
licensing service before it will serve API requests. The activation
binds the install to a tenant organization and (optionally) the host's
hardware fingerprint.

**Files**:

- `backend/hmis/apps/licensing/` — license token issuance + verification
- `backend/hmis/apps/core/middleware.py::HubLicenseGuardMiddleware` — enforces a license is present and valid on every request
- `backend/keys/license_public.pem` — public key shipped with the hub for offline verification of cloud-issued license tokens
- License private key — held only by Nexora's cloud, never shipped

**Enforcement points**:

1. **Activation**: `install-hub.sh` / `install-hub-windows.ps1` calls
   `POST /api/licensing/activate` on the cloud, receives a signed JWT
   license token, stores it locally.
2. **Startup**: Django app startup verifies the license token signature
   against `license_public.pem`. Invalid tokens prevent startup.
3. **Request-time**: `HubLicenseGuardMiddleware` verifies the cached
   license has not expired and grace period has not been exceeded.
4. **Periodic refresh**: Hub phones home to renew the license token on
   a configurable interval. Revocation propagates within one cycle.
5. **Hardware binding** (optional): Hub fingerprints CPU + motherboard
   - disk serial; cloud refuses to re-issue tokens for a fingerprint
   different from the one on file unless an operator approves a transfer.

**Anti-tamper consideration**: The `HubLicenseGuardMiddleware` itself is
compiled to `.so` (it lives under `hmis/apps/core/middleware.py`), so
removing the license check requires reverse-engineering native code
**and** finding a stable disable point. Combined with periodic phone-home,
a tampered hub will detectably stop refreshing its license.

---

## Tier 3 — Legal layer (implemented)

**Files**:

- `LICENSE.md` (repository root) — proprietary license notice
- `backend/scripts/HUB-EULA.txt` (bundled into every hub install) —
  customer-facing End-User License Agreement explicitly prohibiting
  reverse engineering, license circumvention, and competing-product
  development
- Copyright headers `Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.`
  on every source file

**What this gives us**:

- Clear evidence of trade-secret designation under Kenyan law
- Enforceable basis for injunctive relief and damages
- Removes any "I didn't know it was proprietary" defense

**What this does NOT give us**:

- Practical enforcement against actors outside our jurisdiction
- Protection against employees who leave with knowledge in their heads
  (covered separately by employment contracts and NDAs)

---

## Tier 4 — Server-side IP (roadmap)

The strongest protection for the truly differentiated logic is to keep
it **off the hub entirely**. Compiled binaries can in principle be
reversed; code that never leaves Nexora's cloud cannot.

### Candidates for migration

The following modules contain the bulk of our defensible IP and are
prime candidates for server-side execution:

| Module | Today | Migration option |
|--------|-------|------------------|
| `billing/services/sha_claims.py` | Hub-local claim assembly | Move payer-specific rules to cloud `/api/cloud/claims/prepare/` — hub posts visit data, gets back signed claim envelope |
| `billing/services/ilm_*` | Hub-local DHA HIE flow | Cloud-side adjudication preview; hub stays a thin client |
| `ai/services/*` | Hub fallback responders | Cloud-only AI orchestration with prompts; hub already calls TibaBot via API |
| `clinical_templates/` | Hub-local rule application | Cloud-side rule engine; hub fetches rendered care plans |
| `sha/scoring/` (proposed) | Not yet built | Build directly server-side |

### Trade-offs

- **Pros**: Code never leaves Nexora; updates ship instantly; revocation
  is automatic when the customer stops paying.
- **Cons**: Loses offline capability for those features. SHA claim
  assembly in particular needs to work during ISP outages.
- **Mitigation**: Hybrid pattern — hub has a "degraded mode" cache of
  the last N adjudication results, sufficient for read-only queueing
  during outages, but new submissions require cloud.

### Sequencing

1. **Now** (done): Tier 1–3 above. Adequate protection for current
   distribution scale.
2. **Q3 2026**: Move SHA claim adjudication preview (`ilm_*` modules)
   server-side. Hub becomes a proxy that streams visit data and renders
   results.
3. **Q4 2026**: Move AI prompt orchestration (`ai/services/`)
   server-side. Hub keeps only the fallback responders for offline mode.
4. **2027**: Evaluate moving clinical-decision rule application
   server-side, behind a streaming endpoint that supports offline
   degraded mode.

---

## What is explicitly NOT in scope

- **Hardware Security Modules (HSM)**: Overkill for our threat model
  and hostile to the offline-first deployment story.
- **Anti-debug / packer tricks** (UPX, custom loaders): High maintenance
  cost, breaks every CPython point release, antagonistic to support
  teams who need to debug customer installs.
- **PyArmor and similar commercial obfuscators**: Single-vendor risk;
  protection is equivalent to or weaker than Cython compilation; adds
  per-seat licensing cost.
- **Network-only operation**: Vitora's core value proposition is
  offline-first operation for facilities with unreliable internet.
  Cloud-only operation would defeat the product.

---

## Auditing this strategy

Review annually or when:

- A material breach is reported.
- Cython, the CI runner OS, or CPython releases a major version that
  changes the build pipeline.
- A new module containing high-value IP is added and would benefit from
  server-side execution.

Next scheduled review: **2027-06-14**.
