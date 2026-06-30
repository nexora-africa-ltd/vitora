# Production Deployment Checklist

> Pre-flight checklist for deploying Vitora HMIS to production. Complete **every** item before the first production deploy.

---

## 1. Azure Infrastructure

- [x] **Production Container App** created: `vitora-api-prod` in `vitora-rg`
  ```bash
  az containerapp create -n vitora-api-prod -g vitora-rg \
    --environment vitora-env \
    --registry-server vitoraacr.azurecr.io \
    --registry-identity system \
    --ingress external --target-port 8000 \
    --min-replicas 1 --max-replicas 5 \
    --cpu 1.0 --memory 2.0Gi
  ```
- [x] **Web App** deployed to Vercel with `app.vitora.digital` custom domain
- [ ] **Custom domain** for API:
  - `api.vitora.digital` → `vitora-api-prod` (FQDN: `vitora-api-prod.agreeabledune-6cc420cc.eastus.azurecontainerapps.io`)
  - Add CNAME record: `api.vitora.digital` → `vitora-api-prod.agreeabledune-6cc420cc.eastus.azurecontainerapps.io`
  - Then bind: `az containerapp hostname add -n vitora-api-prod -g vitora-rg --hostname api.vitora.digital`
  - Then TLS: `az containerapp hostname bind -n vitora-api-prod -g vitora-rg --hostname api.vitora.digital --environment vitora-env --validation-method CNAME`
- [ ] **TLS certificate** bound to custom domain (Azure managed)
- [ ] **Scale rules** configured (HTTP concurrent requests, CPU/memory thresholds)

## 2. Database

- [x] **Production PostgreSQL** provisioned (Neon or Azure Database for PostgreSQL)
  - Separate from staging database
  - SSL enforced
  - Connection pooling enabled (PgBouncer or Neon pooler)
- [ ] **Backup schedule** configured (daily automated + point-in-time recovery)
- [x] `DATABASE_URL` secret set in Azure Container App
- [ ] Migrations tested against production schema: `python manage.py migrate --plan`
- [ ] PowerSync publication created on production DB:
  ```sql
  ALTER PUBLICATION powersync ADD TABLE ...;
  ```

## 3. Secrets (Azure Container App)

All secrets must be set before first deploy. Use `azure-update-env-production.sh` or set manually:

| Secret | Required | Notes |
|--------|----------|-------|
| `database-url` | **YES** | Production PostgreSQL connection string |
| `django-secret-key` | **YES** | Generate: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `encryption-key` | **YES** | Fernet key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `pii-hmac-key` | **YES** | HMAC key for PII hashing |
| `sha-username` | If SHA enabled | DHA production credentials |
| `sha-password` | If SHA enabled | DHA production credentials |
| `sha-consumer-key` | If SHA enabled | DHA production credentials |
| `sha-client-secret` | If SHA enabled | DHA production credentials |
| `sha-encrypted-pin` | If SHA enabled | DHA production credentials |
| `mpesa-consumer-key` | If M-Pesa enabled | Safaricom production credentials |
| `mpesa-consumer-secret` | If M-Pesa enabled | Safaricom production credentials |
| `mpesa-passkey` | If M-Pesa enabled | Safaricom production credentials |
| `resend-api-key` | **YES** | Production email sending |
| `tibabot-api-key` | If AI enabled | TibaBot API key |
| `tibabot-jwt-secret` | If AI enabled | TibaBot JWT signing |
| `tibabot-jwt-private-key` | If AI enabled | TibaBot JWT private key |
| `tibabot-admin-key` | If AI enabled | TibaBot admin key |
| `vapid-private-key` | For push notifications | Web Push VAPID key |
| `license-signing-key` | **YES** | License validation |
| `at-api-key` | If SMS enabled | Africa's Talking API key |

## 4. GitHub Environment Setup

- [ ] Create `production` environment in GitHub repo settings
- [ ] Add **environment protection rules**:
  - Required reviewers (at least 1)
  - Wait timer (optional, e.g., 5 minutes)
  - Restrict to `main` branch only
- [ ] Set environment secrets:
  - `AZURE_CLIENT_ID`
  - `AZURE_TENANT_ID`
  - `AZURE_SUBSCRIPTION_ID`
- [ ] Set environment variables (`vars.*`):
  - `ALLOWED_HOSTS` = `vitora-api-prod.agreeabledune-6cc420cc.eastus.azurecontainerapps.io,api.vitora.digital,app.vitora.digital`
  - `CORS_ALLOWED_ORIGINS` = `https://app.vitora.digital`
  - `CSRF_TRUSTED_ORIGINS` = `https://app.vitora.digital,https://vitora-api-prod.agreeabledune-6cc420cc.eastus.azurecontainerapps.io`
  - `FRONTEND_URL` = `https://app.vitora.digital`
  - `API_URL` = `https://vitora-api-prod.agreeabledune-6cc420cc.eastus.azurecontainerapps.io` (or `https://api.vitora.digital` after custom domain)
  - `WEBAUTHN_RP_ID` = `app.vitora.digital`
  - `WEBAUTHN_ORIGIN` = `https://app.vitora.digital`
  - `POWERSYNC_URL` (production instance)
  - `POWERSYNC_JWT_AUDIENCE` (production instance URL)
  - `SENTRY_DSN` (production Sentry project)

## 5. Production Settings Verification

Verify these are correct in `hmis/settings/production.py`:

- [ ] `DEBUG = False`
- [ ] `DEMO_MODE = False`
- [ ] `ACTIVE_SHIFT_ENFORCEMENT = True`
- [ ] `ONBOARDING_ENFORCEMENT = True`
- [ ] `MFA_ENFORCEMENT = True`
- [ ] `SYNC_ENABLED = True`
- [ ] `SECURE_SSL_REDIRECT = True`
- [ ] `SECURE_HSTS_SECONDS = 31536000` (1 year)
- [ ] `SESSION_COOKIE_SECURE = True`
- [ ] `CSRF_COOKIE_SECURE = True`
- [ ] `AUTH_COOKIE_SECURE = True`
- [ ] No default/fallback `ENCRYPTION_KEY` (must be from env)
- [ ] `CELERY_TASK_ALWAYS_EAGER = false` (use real task queue)

## 6. External Services

- [ ] **Redis** provisioned (Azure Cache for Redis, TLS enabled)
  - For Celery task queue + Django Channels WebSocket
  - Set `REDIS_URL` with `rediss://` scheme
- [ ] **Sentry** project created for error tracking
  - `SENTRY_DSN` set in web-app build args
- [ ] **Email provider** configured (Resend API key set)
- [ ] **SMS provider** configured (Africa's Talking production credentials)
- [ ] **M-Pesa** production credentials (if billing enabled)
  - `MPESA_ENVIRONMENT=production`
  - Real shortcode (not sandbox `174379`)
  - Production callback URL
- [ ] **DHA/SHA** production credentials (if SHA integration enabled)
  - Production API base URL (not UAT)
  - Facility FR code registered with DHA
- [ ] **PowerSync Cloud** production instance configured
  - Connected to production Neon DB
  - sync-streams.yaml deployed
  - JWT signing key configured

## 7. Monitoring & Alerts

- [ ] Health check verified: `GET /api/health/` returns `200`
- [ ] Azure Container App health probes configured
- [ ] Log Analytics workspace connected
- [ ] Alert rules configured:
  - Container restart count > 3
  - HTTP 5xx error rate > 1%
  - Response time P95 > 5s
  - CPU/memory utilization > 80%
- [ ] Uptime monitoring (external): `https://api.vitora.digital/api/health/`

## 8. Data & Compliance

- [ ] **Kenya DPA 2019** DPIA completed and filed
- [ ] Data processing agreements signed with cloud providers
- [ ] Audit log retention configured (7 years per Kenya DPA)
- [ ] Patient data consent flow tested end-to-end
- [ ] Sensitive patient filtering verified (HIV/GBV/Mental Health)
- [ ] No demo/seed data in production database
- [ ] PII encryption verified: national_id, phone_number, email encrypted at rest

## 9. Pre-Deploy Testing

- [ ] All CI tests pass on `main`: `make test` (80%+ coverage)
- [ ] Quality gates pass: `make quality`
- [ ] Contract tests pass: `make test-contracts`
- [ ] Manual smoke test on staging with production-like config
- [ ] Load test completed (target concurrent users)
- [ ] Security scan clean: `make security`

## 10. Deploy Procedure

```bash
# 1. Ensure main branch is clean and tested
git checkout main && git pull

# 2. Tag for production deployment
git tag production -f
git push origin production -f

# 3. Monitor CI/CD pipeline in GitHub Actions
# The deploy-backend.yml and deploy-webapp.yml workflows will trigger

# 4. Verify deployment
curl -sf https://api.vitora.digital/api/health/ | python3 -m json.tool

# 5. Run migrations (if not auto-run by aca-start.sh)
# Migrations run automatically via aca-start.sh on container start

# 6. Verify frontend
curl -sf https://app.vitora.digital -o /dev/null -w "%{http_code}"
```

## 11. Post-Deploy Verification

- [ ] Health check returns `200`: `curl https://api.vitora.digital/api/health/`
- [ ] Login works: test with admin credentials
- [ ] MFA enforcement active for required roles
- [ ] Patient CRUD works (create, read, update)
- [ ] Encounter creation works with vitals
- [ ] Audit logs being created
- [ ] WebSocket connection works (if Redis configured)
- [ ] Email delivery works (password reset, invitations)
- [ ] Push notifications work (if VAPID configured)

## 12. Rollback Procedure

```bash
# Option 1: Revert to previous image
az containerapp revision list -n vitora-api-prod -g vitora-rg -o table
az containerapp ingress traffic set -n vitora-api-prod -g vitora-rg \
  --revision-weight <previous-revision>=100

# Option 2: Redeploy previous commit
cd backend
TAG=<previous-commit-sha>
az containerapp update -n vitora-api-prod -g vitora-rg \
  --image vitoraacr.azurecr.io/vitora-api:$TAG
```
