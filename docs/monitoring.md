# Monitoring & Analytics — Vitora HMIS

> **Stack**: Prometheus + Grafana (observability), Umami (web analytics)

---

## Architecture

```
┌─────────────────┐     /metrics      ┌─────────────────┐
│  Django API      │◄──── scrape ──────│  Prometheus      │
│  (django-        │                   │  (time-series)   │
│   prometheus)    │                   └────────┬─────────┘
└─────────────────┘                            │ query
                                       ┌────────▼─────────┐
                                       │    Grafana        │
                                       │  (dashboards)     │
                                       └──────────────────┘

┌─────────────────┐     <script>       ┌──────────────────┐
│  Web App         │────── beacon ─────►│   Umami          │
│  (Next.js)       │                   │  (analytics)      │
├─────────────────┤                   │  PostgreSQL DB    │
│  Marketing Site  │────── beacon ─────►│                  │
│  (Next.js)       │                   └──────────────────┘
└─────────────────┘
```

---

## 1. Prometheus + Grafana (Backend Observability)

### What's Instrumented

`django-prometheus` auto-exports these metrics at `GET /metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `django_http_requests_total_by_method` | Counter | Requests by HTTP method |
| `django_http_responses_total_by_status` | Counter | Responses by status code |
| `django_http_requests_latency_seconds_by_view_method` | Histogram | Request duration per view |
| `django_http_requests_body_total_bytes` | Histogram | Request body sizes |
| `django_http_responses_body_total_bytes` | Histogram | Response body sizes |
| `django_db_new_connections_total` | Counter | New DB connections |
| `django_db_errors_total` | Counter | DB query errors |

### Local Development

```bash
# Start the monitoring stack
docker compose -f monitoring/compose.yml up -d

# Start Django backend (must be running for Prometheus to scrape)
cd backend && make api

# Access:
#   Prometheus:  http://localhost:9090
#   Grafana:     http://localhost:3456  (admin / vitora-grafana)
```

The pre-configured Grafana dashboard ("Vitora HMIS — Django API") auto-loads via provisioning.

### Azure Deployment

#### Option A: Self-Hosted on Azure Container Apps (Simple)

```bash
bash monitoring/scripts/azure-deploy-monitoring.sh
```

This deploys Grafana and Umami as Azure Container Apps. For Prometheus, you need to configure Grafana to use **Azure Monitor Managed Prometheus** (Option B is recommended for production).

#### Option B: Azure Monitor Managed Prometheus (Recommended for Production)

For production, use Azure's managed Prometheus service instead of self-hosted:

1. **Enable Azure Monitor** on the Container Apps environment:
   ```bash
   az monitor account create \
     --name vitora-monitor \
     --resource-group vitora-rg \
     --location eastus

   # Link to Container Apps environment
   az containerapp env telemetry data-dog create \
     --name vitora-env \
     --resource-group vitora-rg \
     --enable-open-telemetry-traces true
   ```

2. **Configure Prometheus scraping** via Azure Monitor:
   The Django `/metrics` endpoint is already compatible with Azure Monitor's Prometheus scraping.

3. **Connect Grafana to Azure Monitor**:
   Use the "Azure Monitor" data source in Grafana instead of direct Prometheus.

### Securing `/metrics`

The `/metrics` endpoint is open by default (required for Prometheus scraping). In production:

- **Azure Container Apps**: The endpoint is only accessible within the ACA environment's virtual network if ingress is set to `internal`. For external ingress, restrict via Azure networking rules.
- **Alternatively**, restrict at the Django level by adding an IP allowlist middleware (not included by default to keep scraping simple).

---

## 2. Umami (Web Analytics)

### Why Umami?

- **Privacy-first**: No cookies, no personal data collection → GDPR/Kenya DPA compliant
- **Self-hosted**: Data stays on your infrastructure
- **Lightweight**: ~2KB script, no impact on page load
- **Open-source**: MIT license, active community

### Local Development

Umami starts with the monitoring compose file:

```bash
docker compose -f monitoring/compose.yml up -d umami umami-db

# Access: http://localhost:3457
# Login: admin / umami (change immediately)
```

After logging in:
1. Go to **Settings → Websites → Add website**
2. Create two websites:
   - `Vitora HMIS` (for the web app)
   - `Vitora Marketing` (for the marketing site)
3. Copy each website's ID

### Environment Variables (Frontend)

Set these in your `.env.local` or Vercel dashboard:

```env
# Web App (.env.local in web-app/)
NEXT_PUBLIC_UMAMI_URL=https://your-umami-instance.example.com
NEXT_PUBLIC_UMAMI_WEBSITE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Marketing Site (.env.local in vitora-marketing/)
NEXT_PUBLIC_UMAMI_URL=https://your-umami-instance.example.com
NEXT_PUBLIC_UMAMI_WEBSITE_ID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
```

When these env vars are not set (e.g., local dev without Umami), the tracking script simply doesn't render — no errors, no network requests.

### Azure Deployment

Umami is deployed as part of the monitoring stack:

```bash
bash monitoring/scripts/azure-deploy-monitoring.sh
```

After deployment:
1. Access Umami at the URL printed by the script
2. Change the default admin password
3. Create websites and get their IDs
4. Add the env vars to your Vercel project:
   - `NEXT_PUBLIC_UMAMI_URL` = the Umami FQDN (e.g., `https://vitora-umami.agreeabledune-6cc420cc.eastus.azurecontainerapps.io`)
   - `NEXT_PUBLIC_UMAMI_WEBSITE_ID` = the website ID from Umami dashboard

### Custom Event Tracking

Umami supports custom events via `window.umami.track()`:

```typescript
// Track a custom event (e.g., patient registration)
if (typeof window !== 'undefined' && window.umami) {
  window.umami.track('patient-registered', { method: 'form' });
}
```

---

## 3. File Reference

| File | Purpose |
|------|---------|
| `monitoring/compose.yml` | Docker Compose for local Prometheus + Grafana + Umami |
| `monitoring/prometheus/prometheus.yml` | Prometheus scrape config |
| `monitoring/grafana/provisioning/` | Auto-provisioned datasources + dashboard provider |
| `monitoring/grafana/dashboards/vitora-django-api.json` | Pre-built Django API dashboard |
| `monitoring/scripts/azure-deploy-monitoring.sh` | Azure Container Apps deployment |
| `backend/hmis/settings/base.py` | `django-prometheus` in INSTALLED_APPS + middleware |
| `backend/hmis/settings/staging.py` | Prometheus DB engine wrapper (PostgreSQL) |
| `backend/hmis/settings/production.py` | Prometheus DB engine wrapper (PostgreSQL) |
| `backend/hmis/urls.py` | `/metrics` endpoint (via `django_prometheus.urls`) |
| `web-app/components/analytics/umami.tsx` | Umami script component (web app) |
| `web-app/app/layout.tsx` | `<UmamiAnalytics />` in root layout |
| `vitora-marketing/components/analytics/umami.tsx` | Umami script component (marketing) |
| `vitora-marketing/app/layout.tsx` | `<UmamiAnalytics />` in root layout |

---

## 4. Grafana Dashboard Panels

The pre-provisioned dashboard includes:

| Panel | Description |
|-------|-------------|
| Request Rate | Requests per second by HTTP method |
| Response Status Codes | 2xx/3xx/4xx/5xx rate over time |
| Request Latency | p50, p95, p99 response times |
| 5xx Error Rate | Server error rate (stat with thresholds) |
| 4xx Error Rate | Client error rate |
| Active DB Connections | Database connection count |
| DB Query Errors | Database error rate |
| Requests by View (Top 10) | Busiest API endpoints |
| Request/Response Body Size | p95 payload sizes |

To add custom dashboards, drop JSON files into `monitoring/grafana/dashboards/`.
