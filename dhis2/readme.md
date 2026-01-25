# DHIS2 (Local / Staging Deployment)

This directory contains the **DHIS2 infrastructure setup** used for **local development, testing, and integration validation** with the Vitora backend.

> ⚠️ **Important:** DHIS2 is treated as **external infrastructure**, not as part of the application backend.  
> In production environments, DHIS2 may be hosted on a **separate server** (e.g. County / Ministry of Health–managed), and this directory may not be used at all.

---

## Purpose of This Directory

This setup exists to:

- Run a **local DHIS2 instance** for development and testing
- Validate **HMIS → DHIS2 API integrations**
- Test indicator mappings and reporting logic
- Simulate real-world DHIS2 deployments without coupling them to the backend

This directory is **not**:
- Part of the backend application codebase
- A production-grade national DHIS2 deployment
- A replacement for Ministry- or County-hosted DHIS2 instances

---

## What Is Included

- DHIS2 Core (Dockerized)
- PostgreSQL + PostGIS (DHIS2 database)
- Persistent Docker volumes
- Optional backups directory

---

## What Is NOT Included

- Backend integration logic (lives in `/backend`)
- Reverse proxies (nginx / Traefik)
- Monitoring stacks (Grafana / Prometheus)
- Multi-tenant or multi-environment orchestration

Those concerns are handled elsewhere or externally.

---

## Directory Structure

```text
dhis2/
├── compose.yml          # Docker Compose definition for DHIS2
├── .env                 # Environment variables (NOT committed)
├── backups/             # Optional DB and filestore backups
└── README.md            # This file
```
---

## Prerequisites

You must have:

* Docker Engine (v24+ recommended)
* Docker Compose v2 (available as `docker compose`)
* At least:

  * 4 GB RAM (8 GB recommended)
  * 2 CPU cores
  * 20 GB free disk space

Verify Docker setup:

```bash
docker -v
docker compose version
```

---

## Environment Configuration

Create a `.env` file in this directory.

Minimum example:

```env
POSTGRES_DB=dhis2
POSTGRES_USER=dhis
POSTGRES_PASSWORD=dhis

DHIS2_DATABASE_HOST=db
DHIS2_DATABASE_NAME=dhis2
DHIS2_DATABASE_USERNAME=dhis
DHIS2_DATABASE_PASSWORD=dhis
```

> 🔐 **Do not commit `.env` files**.
> Use `.env.example` if you need to document variables.

---

## Starting DHIS2

From the `dhis2` directory:

```bash
docker compose up -d
```

First startup may take **2–5 minutes**.

To view logs:

```bash
docker compose logs -f
```

---

## Accessing DHIS2

By default (depending on `compose.yml` port mapping):

```text
http://localhost:8082
```

Default credentials (change immediately):

```text
Username: admin
Password: district
```

---

## Stopping DHIS2

```bash
docker compose down
```

To stop and remove volumes (⚠️ destructive):

```bash
docker compose down -v
```

---

## Data Persistence

* PostgreSQL data is stored in a Docker volume
* DHIS2 file storage is persistent across restarts
* Removing volumes will **wipe all data**

---

## Backups (Optional)

If backups are enabled:

* Database dumps should be stored in `./backups`
* Filestore backups should be stored separately or mounted

This local setup **does not automatically schedule backups**.

For production:

* Use external backups
* Test restore procedures regularly

---

## Networking & Ports

Ports are intentionally **bound explicitly** to avoid conflicts.

Example:

```yaml
ports:
  - "127.0.0.1:8082:8080"
```

This ensures:

* No accidental exposure to the network
* No clashes with nginx, ICD-11, or other services

---

## Integration with Backend

The backend **does not depend** on this directory at runtime.

Instead, it communicates with DHIS2 via:

```env
DHIS2_BASE_URL=http://localhost:8082
DHIS2_USERNAME=...
DHIS2_PASSWORD=...
```

In staging or production:

* `DHIS2_BASE_URL` may point to an external server
* This directory may not be present

---

## Versioning Policy

* DHIS2 image versions should be **explicitly pinned**
* Avoid `latest` tags
* Upgrades should be tested locally before rollout

Example:

```yaml
image: dhis2/core:2.40
```

---

## When NOT to Use This Setup

Do **not** use this directory when:

* Deploying national or county production DHIS2
* Hosting multiple DHIS2 environments on one server
* You require high availability or clustering
* Ministry of Health mandates a specific deployment model

---

## Architectural Principle

> DHIS2 is **external reporting infrastructure**.
> The application adapts **to DHIS2**, not the other way around.

This separation is intentional and should be preserved.

---

## Maintainers

* Vitora / Nexora Engineering Team
* This directory is owned by **infrastructure**, not application logic

---

## Notes

* Changes here should be deliberate and documented
* Avoid tight coupling with backend workflows
* Treat DHIS2 as replaceable infrastructure

---