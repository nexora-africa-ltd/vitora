# Apache Superset — Vitora HMIS

Standalone Docker Compose setup for embedded BI dashboards.

## Quick start

```bash
cd docker/superset
docker compose up -d
```

First boot takes ~60 seconds (DB migrations + admin creation).

**UI**: http://localhost:8088
**Login**: `admin` / `admin`

## Connect to Vitora data

1. Open Superset → **Settings → Database Connections → + Database**
2. Choose **PostgreSQL**
3. SQLAlchemy URI (local dev with Neon):
   ```
   postgresql://user:pass@host.docker.internal:5432/vitora
   ```
   Or paste your Neon connection string directly.
4. **Test Connection** → **Connect**

## Enable dashboard embedding

1. Create a dashboard in Superset
2. On the dashboard → **⋯ → Embed Dashboard**
3. Add allowed domains: `http://localhost:3000` (or your Vercel URL)
4. Copy the **Embedded ID** — the Vitora backend uses this to fetch guest tokens

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPERSET_SECRET_KEY` | `vitora-dev-secret-change-in-production` | JWT signing key for guest tokens. **Change in production.** |
| `SUPERSET_ADMIN_USERNAME` | `admin` | Bootstrap admin username |
| `SUPERSET_ADMIN_PASSWORD` | `admin` | Bootstrap admin password |
| `SUPERSET_DB_PASSWORD` | `superset` | Postgres metadata DB password |
| `SUPERSET_PORT` | `8088` | Host port mapping |

## Architecture

```
┌────────────┐     ┌──────────────┐     ┌───────────────┐
│  superset   │────▶│  superset-db │     │ superset-redis│
│  (web:8088) │     │  (postgres)  │     │   (cache)     │
└──────┬──────┘     └──────────────┘     └───────┬───────┘
       │                                         │
┌──────▼──────┐                                  │
│   worker    │──────────────────────────────────┘
│  (celery)   │
└─────────────┘
```

## Production notes

- Set a strong `SUPERSET_SECRET_KEY` (same value must be in Django's `GUEST_TOKEN_JWT_SECRET` if generating tokens directly)
- Enable `TALISMAN_ENABLED = True` in `superset_config.py` with proper CSP
- Deploy as Azure Container App (similar to current Metabase setup)
- The Django backend talks to Superset's API server-to-server for guest tokens
