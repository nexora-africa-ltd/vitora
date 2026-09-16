<!-- Operational scaling policy for Vitora HMIS. Use with the Azure deployment workflow and Locust runbook. -->
# Operational Scaling Policy

## Deployment Topology

## Budget Mode

Budget mode is the default deployment profile. Set the GitHub environment variable
`ASYNC_WORKERS_ENABLED=false` and leave `REDIS_URL` empty. The deployment workflow then
keeps the API at exactly one replica, sets `CELERY_TASK_ALWAYS_EAGER=true`, and skips
the Redis, worker, and Beat deployment steps.

This profile supports synchronous clinical requests for a single facility. It does not
provide cross-replica WebSocket broadcasting, durable asynchronous task queues, or
independent periodic task execution. Do not enable automated reminders, scheduled
claims polling, or other Beat-dependent workflows unless the managed async topology is enabled.

## Managed Async Mode

Vitora runs three independently deployed Azure Container Apps from the same backend image:

| Process | Purpose | Replica policy |
| --- | --- | --- |
| API | Daphne HTTP and WebSocket service | Min 1, max 6, HTTP concurrency target 80 |
| Worker | Celery consumer for all routed queues | Min 1, max 4 |
| Beat | Celery periodic scheduler | Exactly 1 |

The scheduler must never be horizontally scaled. More than one Beat replica schedules duplicate clinical and billing tasks.

All three apps require the same database, encryption, and feature configuration. `REDIS_URL` is an Azure Container App secret and must use `rediss://`; it backs both Celery and Django Channels. Provision the three apps with `scripts/azure-provision-sa-api-apps.sh`, then apply runtime secrets to every process app before enabling traffic.

Use the existing environment scripts once for each app, retaining the same source environment values. For example, staging requires the API default plus the worker and scheduler targets:

```bash
cd backend
set -a; source .env.staging; set +a
bash scripts/azure-update-env.sh
ACA_NAME=vitora-worker-private-sa bash scripts/azure-update-env.sh
ACA_NAME=vitora-beat-private-sa bash scripts/azure-update-env.sh
```

The deployment workflow updates image, process role, Redis, and scale bounds thereafter. It deliberately fails when the worker or Beat app is missing rather than silently running asynchronous work inside the API process.

## Service Objectives

| Signal | Target | Alert threshold |
| --- | --- | --- |
| API availability | 99.9% monthly | Any five-minute availability below 99.5% |
| Read API latency | p95 below 1 second, p99 below 2 seconds | p95 above 2 seconds for 15 minutes |
| Clinical write latency | p95 below 2 seconds | p95 above 4 seconds for 15 minutes |
| HTTP 5xx rate | Below 0.5% | Above 1% for 5 minutes |
| WebSocket event delivery | p95 below 2 seconds | p95 above 5 seconds for 15 minutes |
| Celery queue age | Below 5 minutes | Above 10 minutes for 15 minutes |
| Backup recovery point | At most 24 hours until PITR is enabled | Latest verified backup older than 26 hours |
| Restore objective | Complete validated restore within 4 hours | Monthly drill exceeds 4 hours or fails |

## Database Guardrails

Scale API and worker replicas only after verifying the PostgreSQL pool limit. The aggregate database connection budget must include Daphne processes, Celery concurrency, migrations, dashboards, and administrative access. Keep normal application use below 70% of the pool limit.

Before increasing replica caps, review Prometheus database query latency, active connections, slow-query logs, and the largest tenant tables. Audit/event and sync tables require an archival or partitioning design before their retention volume makes common tenant queries slow. Do not add read replicas until read traffic and replica-lag measurements justify them; clinical writes remain primary-database operations.

## Capacity Validation

Locust is the capacity gate for authenticated clinical traffic. It runs only against isolated local or staging data, defaults to read-only traffic, and requires explicit environment variables for the load-test account and facility.

```bash
cd backend
poetry install --with load-test
LOCUST_USERNAME=... LOCUST_PASSWORD=... LOCUST_FACILITY_ID=... \
  make load-test-smoke LOCUST_HOST=https://staging-api.vitora.digital
```

Record concurrent users, duration, request count, error rate, p95/p99 latency, database connection count, CPU, memory, Redis metrics, and Celery queue age for each accepted capacity baseline. Never run generic Locust traffic against production or use real patient data.

### Interactive Locust UI

Use the built-in Locust UI for exploratory staging or local runs. It is intentionally bound to
`127.0.0.1`, so its traffic controls and results are never publicly reachable:

```bash
cd backend
LOCUST_USERNAME=... LOCUST_PASSWORD=... LOCUST_FACILITY_ID=... \
  make load-test-ui LOCUST_HOST=https://staging-api.vitora.digital
```

Open `http://127.0.0.1:8089`, select a small user count and spawn rate, then start the run.
Use the headless `make load-test-smoke` target and GitHub workflow for repeatable baselines and
artifacts. Do not use either target with production credentials, real patient data, or a
publicly exposed Locust UI.

## Recovery Validation

`restore-drill.yml` runs monthly in an isolated PostgreSQL service, downloads the latest encrypted Azure Blob backup, validates its checksum, restores it, and checks migration data exists. Review its duration and result against the recovery objectives after every run. A failed drill is a production incident until corrected.
