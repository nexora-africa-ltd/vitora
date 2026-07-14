# Public ID Deprecation Analytics Queries

Use this report to track legacy integer lookup usage (`public_id_lookup_deprecation_int`) and pick a safe cutoff date for removing int-based external lookups.

## Event Source

`PublicIdLookupMixin` emits two structured log events:

- `public_id_lookup` (all lookups)
- `public_id_lookup_deprecation_int` (legacy int lookups only)

In addition, Prometheus now exports:

- `vitora_public_id_lookup_total{lookup_kind,...}`

The default Grafana dashboard `monitoring/grafana/dashboards/vitora-django-api.json`
includes panels for int-vs-uuid lookup rate, int ratio, and top legacy routes/viewsets.

Expected log fields on both events:

- `viewset`
- `model`
- `lookup_kind` (`int` or `uuid`)
- `lookup_value`
- `endpoint` (request path)
- `method` (HTTP method)
- `view_name` (Django route name, when available)

## Objective Cutoff Criteria

Recommended readiness criteria before disabling int lookup support:

- `public_id_lookup_deprecation_int` is `0` for 14 consecutive days on write endpoints.
- `public_id_lookup_deprecation_int` is `<= 0.1%` of total lookups for 14 consecutive days on read endpoints.
- No top client/version still generating int lookups in the same period.

## Azure Log Analytics (KQL)

### 1) Daily int-lookup trend by endpoint and viewset

```kusto
AppTraces
| where Message == "public_id_lookup_deprecation_int"
| extend endpoint = tostring(Properties.endpoint), viewset = tostring(Properties.viewset)
| summarize int_lookup_count = count() by bin(TimeGenerated, 1d), endpoint, viewset
| order by TimeGenerated desc
```

### 2) Int vs UUID ratio over time

```kusto
let all_lookups =
    AppTraces
    | where Message == "public_id_lookup"
    | summarize all_count = count() by day = bin(TimeGenerated, 1d);
let int_lookups =
    AppTraces
    | where Message == "public_id_lookup_deprecation_int"
    | summarize int_count = count() by day = bin(TimeGenerated, 1d);
all_lookups
| join kind=leftouter int_lookups on day
| extend int_count = coalesce(int_count, 0)
| extend int_pct = iif(all_count == 0, 0.0, todouble(int_count) / todouble(all_count) * 100.0)
| project day, all_count, int_count, int_pct
| order by day desc
```

### 3) Top offending endpoints in last 7 days

```kusto
AppTraces
| where TimeGenerated > ago(7d)
| where Message == "public_id_lookup_deprecation_int"
| summarize int_lookup_count = count() by endpoint = tostring(Properties.endpoint), viewset = tostring(Properties.viewset), method = tostring(Properties.method)
| top 20 by int_lookup_count desc
```

## Loki / LogQL (Grafana)

Assumes JSON-parsed logs and labels include app/environment.

### 1) Int lookup count over time

```logql
sum by (endpoint, viewset) (
  count_over_time({app="hmis-backend"} |= "public_id_lookup_deprecation_int" | json [1d])
)
```

### 2) Int lookup ratio

```logql
(
  sum(count_over_time({app="hmis-backend"} |= "public_id_lookup_deprecation_int" [1d]))
/
  sum(count_over_time({app="hmis-backend"} |= "public_id_lookup" [1d]))
) * 100
```

## SQL/Superset (if logs are warehoused)

Assuming a `app_logs` table with columns:

- `ts` (timestamp)
- `event_name`
- `viewset`
- `endpoint`
- `method`

```sql
WITH daily AS (
  SELECT
    date_trunc('day', ts) AS day,
    COUNT(*) FILTER (WHERE event_name = 'public_id_lookup') AS all_count,
    COUNT(*) FILTER (WHERE event_name = 'public_id_lookup_deprecation_int') AS int_count
  FROM app_logs
  WHERE event_name IN ('public_id_lookup', 'public_id_lookup_deprecation_int')
    AND ts >= now() - interval '30 days'
  GROUP BY 1
)
SELECT
  day,
  all_count,
  int_count,
  CASE WHEN all_count = 0 THEN 0 ELSE (int_count::numeric / all_count::numeric) * 100 END AS int_pct
FROM daily
ORDER BY day DESC;
```

## Weekly Review Template

Track these in release reviews:

- Top 10 endpoints by `public_id_lookup_deprecation_int` (7d)
- Int lookup ratio (`int_pct`) by day (30d)
- Write endpoint int lookup count (`POST`/`PATCH`/`PUT`/`DELETE`)
- Remaining clients/flows still using int routes

When all cutoff criteria are met, schedule removal of int lookup compatibility in the next release window.
