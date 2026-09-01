# South Africa Migration Runbook (Session Implementation)

## Purpose

This runbook captures what was implemented in this migration session and how to operate, validate, cut over, and roll back safely.

## Scope Implemented

- Parallel SA region foundation resources and API apps.
- Backend startup hardening (heavy tasks moved out of startup path).
- Database migration to SA Azure PostgreSQL targets.
- Phase 2 private-access scaffolding (VNet, private endpoints, private ACA env/apps).
- Secret/config sync and DB URL re-pointing for private apps.

## Files Added/Updated in This Session

- `scripts/azure-provision-sa.sh`: SA base infrastructure provisioning.
- `scripts/azure-provision-sa-api-apps.sh`: SA API app provisioning.
- `scripts/azure-provision-sa-webapps.sh`: optional SA web app provisioning path.
- `scripts/azure-sync-api-config.py`: sync secrets/env from source to target apps.
- `scripts/azure-phase2-private-access.sh`: end-to-end Phase 2 private-access orchestration.
- `scripts/azure-phase2-preflight.sh`: automated go/no-go checks before DB privatization/decommission.
- `scripts/azure-cost-control-prod.sh`: deallocate/resume/destroy helper for production cost control.
- `backend/scripts/aca-start.sh`: lightweight startup only.
- `backend/scripts/aca-postdeploy.sh`: post-deploy maintenance tasks.
- `backend/scripts/aca-run-postdeploy.sh`: manual runbook helper.
- `.github/workflows/deploy-backend.yml`: post-deploy maintenance execution.
- `backend/Dockerfile`, `backend/README.md`: deployment/runtime updates.

## Current SA Topology (After Implementation)

- Base ACA environment: `vitora-env-sa` (public).
- Private ACA environment: `vitora-env-private-sa` (VNet-integrated).
- Private VNet: `vitora-vnet-sa`.
- Subnets:
  - `aca-infra-sa` (delegated to `Microsoft.App/environments`)
  - `private-endpoints-sa`
- Private DNS zone: `privatelink.postgres.database.azure.com`
- Private endpoints:
  - `vitora-staging-pg2-sa-pe` -> `vitora-staging-pg2-sa`
  - `vitora-prod-pg3-sa-pe` -> `vitora-prod-pg3-sa`
- Private apps:
  - `vitora-api-private-sa` (staging)
  - `vitora-api-prod-private-sa` (prod)

## Standard Operation Commands

### 1) Provision SA Foundation

```bash
bash scripts/azure-provision-sa.sh
```

### 2) Provision SA API Apps

```bash
bash scripts/azure-provision-sa-api-apps.sh
```

### 3) Sync App Config/Secrets

```bash
python3 scripts/azure-sync-api-config.py
```

### 4) Run Phase 2 Private-Access Automation

```bash
bash scripts/azure-phase2-private-access.sh
```

Optional DB lock-down in same step:

```bash
LOCK_DOWN_PUBLIC=true bash scripts/azure-phase2-private-access.sh
```

### 5) Manual Post-Deploy Maintenance (if needed)

```bash
bash backend/scripts/aca-run-postdeploy.sh <app-name> <resource-group>
```

### 6) Run Phase 2 Preflight Gate

```bash
bash scripts/azure-phase2-preflight.sh
```

Optional Tibabot DNS cutover enforcement in the same preflight:

```bash
REQUIRE_TIBABOT_DNS_CUTOVER=true bash scripts/azure-phase2-preflight.sh
```

### 7) Cost Control (deallocate/resume/destroy)

Default is safe dry-run:

```bash
bash scripts/azure-cost-control-prod.sh
```

Examples:

```bash
# Deallocate SA private prod resources (execute for real)
DRY_RUN=false MODE=deallocate PROFILE=sa-private bash scripts/azure-cost-control-prod.sh

# Resume SA private prod resources
DRY_RUN=false MODE=resume PROFILE=sa-private bash scripts/azure-cost-control-prod.sh

# Destroy SA private prod resources (requires explicit confirmation)
DRY_RUN=false MODE=destroy PROFILE=sa-private CONFIRM_DESTROY=yes bash scripts/azure-cost-control-prod.sh
```

## Readiness Gate Before DB Privatization

Complete **all** checks below before setting DB public access to `none`:

1. Private app revisions healthy and stable for soak period (recommended >= 24h).
2. Private apps return successful health/business checks under expected load.
3. `database-url` for both private apps points to SA Azure PostgreSQL hosts:
   - `vitora-staging-pg2-sa.postgres.database.azure.com`
   - `vitora-prod-pg3-sa.postgres.database.azure.com`
4. Private DNS has A records for both servers in `privatelink.postgres.database.azure.com`.
5. No dependency still routed to old public SA apps (`vitora-api-sa`, `vitora-api-prod-sa`).
6. Rollback plan tested (traffic switch back + DB public access revert).

## DB Privatization Procedure (When Ready)

```bash
az postgres flexible-server update -g vitora-rg-sa -n vitora-staging-pg2-sa --public-access none
az postgres flexible-server update -g vitora-rg-sa -n vitora-prod-pg3-sa --public-access none
```

Verify:

```bash
az postgres flexible-server show -g vitora-rg-sa -n vitora-staging-pg2-sa --query network.publicNetworkAccess -o tsv
az postgres flexible-server show -g vitora-rg-sa -n vitora-prod-pg3-sa --query network.publicNetworkAccess -o tsv
```

## Decommission Legacy SA App Sets (After Soak)

Only remove legacy app sets once cutover is stable and rollback window has passed.

Suggested order:

1. Remove old public SA apps:
   - `vitora-api-sa`
   - `vitora-api-prod-sa`
2. Optionally remove temporary private transition apps if renaming/consolidating.
3. Keep DBs, Key Vault, and network resources intact.

Example:

```bash
az containerapp delete -g vitora-rg-sa -n vitora-api-sa -y
az containerapp delete -g vitora-rg-sa -n vitora-api-prod-sa -y
```

## Rollback Plan

If private cutover fails:

1. Route traffic back to last known-good app endpoints.
2. If DB was privatized, temporarily re-enable public access:

   ```bash
   az postgres flexible-server update -g vitora-rg-sa -n vitora-staging-pg2-sa --public-access all
   az postgres flexible-server update -g vitora-rg-sa -n vitora-prod-pg3-sa --public-access all
   ```

3. Restart affected apps and re-run smoke checks.
4. Review Container App system logs and app logs before retry.

## Notes

- `az containerapp exec` may fail in non-interactive CI/CLI contexts due TTY requirements; use revision/system logs for diagnostics in that case.
- Keep at least one known-good app revision and a tested rollback route until cutover is fully signed off.
