# SDMX Implementation

> **Gap #29**: SDMX Implementation  
> **Sprint**: 3.B — Advanced Interoperability  
> **Priority**: P3 (Enhancement)  
> **Status**: ✅ Complete  
> **Completed**: March 13, 2026

---

## Overview

Vitora HMIS now supports **SDMX-ML (Statistical Data and Metadata eXchange)** export for aggregate health statistics. This enables interoperability with national health information systems, international organizations (WHO, UNICEF), and statistical offices that consume SDMX-formatted data.

SDMX-ML export is available for:
- **Quarterly Reports** — facility clinical statistics
- **Annual Reports** — yearly aggregates
- **IDSR Weekly Reports** — disease surveillance data

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SDMX Export Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Vitora Aggregate Data                                          │
│  ┌──────────────────────────────────────────┐                   │
│  │ QuarterlyReport / AnnualReport / IDSR    │                   │
│  │ ┌────────────────────────────────────┐   │                   │
│  │ │ total_visits, new_visits, ...      │   │                   │
│  │ │ priority_red, priority_orange, ... │   │                   │
│  │ │ under_5_visits, anc_visits, ...    │   │                   │
│  │ └────────────────────────────────────┘   │                   │
│  └──────────┬───────────────────────────────┘                   │
│             │                                                    │
│  ┌──────────▼──────────────────────────────────────┐            │
│  │  SDMXExportService                              │            │
│  │  ┌──────────────────────┐                       │            │
│  │  │ build_dataset()      │ → SDMX-ML DataSet     │            │
│  │  │ build_dsd_ref()      │ → DSD reference        │            │
│  │  │ _build_observation() │ → Individual obs        │            │
│  │  └──────────────────────┘                       │            │
│  └──────────┬──────────────────────────────────────┘            │
│             │                                                    │
│  ┌──────────▼──────────────────────────────────────┐            │
│  │  SDMX-ML 2.1 XML Document                      │            │
│  │  <mes:GenericData>                              │            │
│  │    <mes:DataSet>                                │            │
│  │      <gen:Series><gen:Obs>...</gen:Obs></Series>│            │
│  │    </mes:DataSet>                               │            │
│  │  </mes:GenericData>                             │            │
│  └─────────────────────────────────────────────────┘            │
│                                                                  │
│  Output: application/xml download                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### SDMXExportService

**File**: `hmis/apps/quality/services/sdmx_service.py`

Core service for generating SDMX-ML 2.1 Generic Data messages.

```python
class SDMXExportService:
    def export_quarterly(report: QuarterlyReport) -> str    # SDMX-ML XML
    def export_annual(report: AnnualReport) -> str           # SDMX-ML XML
    def export_idsr(report: IDSRWeeklyReport) -> str         # SDMX-ML XML
```

### SDMX Data Structure

The service maps Vitora aggregate data to SDMX concepts:

| Vitora Field | SDMX Concept | Dimension |
|-------------|-------------|-----------|
| `total_visits` | `TOTAL_VISITS` | `INDICATOR` |
| `new_visits` | `NEW_VISITS` | `INDICATOR` |
| `priority_red` | `PRIORITY_RED` | `TRIAGE_PRIORITY` |
| `under_5_visits` | `UNDER_5_VISITS` | `AGE_GROUP` |
| `anc_first_visits` | `ANC_FIRST_VISITS` | `MCH_SERVICE` |
| IDSR `total_cases` | `TOTAL_CASES` | `SURVEILLANCE` |
| IDSR `total_deaths` | `TOTAL_DEATHS` | `SURVEILLANCE` |

### SDMX-ML Format

Output follows SDMX 2.1 Generic Data format:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mes:GenericData
    xmlns:mes="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message"
    xmlns:gen="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic"
    xmlns:com="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common">
  <mes:Header>
    <mes:ID>VITORA_Q1_2026</mes:ID>
    <mes:Prepared>2026-03-13T12:00:00</mes:Prepared>
    <mes:Sender id="VITORA_HMIS"/>
    <mes:Structure>
      <com:Structure>
        <Ref agencyID="VITORA" id="HEALTH_STATS" version="1.0"/>
      </com:Structure>
    </mes:Structure>
  </mes:Header>
  <mes:DataSet>
    <gen:Series>
      <gen:SeriesKey>
        <gen:Value id="INDICATOR" value="TOTAL_VISITS"/>
        <gen:Value id="FREQ" value="Q"/>
        <gen:Value id="FACILITY" value="FACILITY_001"/>
      </gen:SeriesKey>
      <gen:Obs>
        <gen:ObsDimension value="2026-Q1"/>
        <gen:ObsValue value="1250"/>
      </gen:Obs>
    </gen:Series>
  </mes:DataSet>
</mes:GenericData>
```

---

## API Endpoints

### Quarterly Report SDMX Export

```
POST /api/quality/quarterly-reports/{id}/export_sdmx/
```

**Response**: `application/xml` (SDMX-ML file download)

### Annual Report SDMX Export

```
POST /api/quality/annual-reports/{id}/export_sdmx/
```

**Response**: `application/xml` (SDMX-ML file download)

### IDSR Weekly Report SDMX Export

```
POST /api/surveillance/idsr-reports/{id}/export_sdmx/
```

**Response**: `application/xml` (SDMX-ML file download)

---

## Usage

### Export via API

```bash
# Export a quarterly report as SDMX-ML
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:9088/api/quality/quarterly-reports/1/export_sdmx/ \
  -o quarterly_report.xml

# Export IDSR report as SDMX-ML
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:9088/api/surveillance/idsr-reports/42/export_sdmx/ \
  -o idsr_week8.xml
```

### Validate Output

SDMX-ML output can be validated against the SDMX 2.1 XSD schema available at:
`http://www.sdmx.org/resources/sdmxml/schemas/v2_1/`

---

## Tests

**File**: `tests/core/test_sdmx.py`  
**Count**: 17 tests

| Test Class | Tests | Covers |
|------------|:-----:|--------|
| `TestSDMXExportService` | 9 | Quarterly/annual/IDSR XML generation, structure, indicators |
| `TestSDMXEndpoints` | 8 | API auth, response format, content-type, content-disposition |

---

## Future Enhancements

- **SDMX Registry Integration**: Read indicator definitions from an external SDMX registry to auto-map to internal quality measures
- **SDMX-JSON**: Add JSON format option alongside XML
- **DSD Publishing**: Publish Vitora's Data Structure Definition for external consumers
