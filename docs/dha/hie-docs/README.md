# DHA HIE Docs — Catalog Export

Source: https://hie-docs.dha.go.ke/catalog (5 OpenAPI 3.1 specs)

| API | Operations | Markdown | OpenAPI JSON |
|---|---:|---|---|
| Authentication and Authorization | 1 | [auth.md](./auth.md) | [auth.openapi.json](./auth.openapi.json) |
| HIE Registries | 3 | [registries.md](./registries.md) | [registries.openapi.json](./registries.openapi.json) |
| Consent Services APIs | 5 | [consent.md](./consent.md) | [consent.openapi.json](./consent.openapi.json) |
| eClaims and Preauth APIs | 46 | [eclaims.md](./eclaims.md) | [eclaims.openapi.json](./eclaims.openapi.json) |
| SHR Service APIs | 99 | [sharedhealthrecord.md](./sharedhealthrecord.md) | [sharedhealthrecord.openapi.json](./sharedhealthrecord.openapi.json) |

**Total:** 154 operations across 106 paths.

Server (UAT): `https://ilm-dev.dha.go.ke/uat-middleware`

The OpenAPI JSON files are extracted directly from the published Zudoku site bundle. Markdown is generated from those specs (operations grouped by tag, with parameters, request/response schemas, and example payloads).
