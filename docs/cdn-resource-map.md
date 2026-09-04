# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
What this file is for:
- Quick operator reference for Vitora public download/docs CDN resource naming.

How to use it:
- Use this table to choose the correct Azure resource when uploading blobs vs configuring Front Door routes/rules.

Supported inputs/args:
- None (documentation artifact).
-->

# CDN Resource Map

| Layer | Azure resource name | Resource type | Use for |
|---|---|---|---|
| Public domain | `get.vitora.digital` | AFD custom domain | User-facing URL for downloads/docs |
| Front Door profile | `vitora-cdn` | `Microsoft.Cdn/profiles` | Global CDN configuration container |
| Front Door endpoint | `vitorareleases` | `Microsoft.Cdn/profiles/afdendpoints` | Route/rule/purge target in `az afd` commands |
| Storage origin | `vitorareleasessa` | `Microsoft.Storage/storageAccounts` | Blob upload/delete/list target |
| Storage container | `releases` | Blob container | Stores published artifacts and docs payloads |

## Command split (important)

- Use `vitorareleasessa` for blob commands:
  - `az storage blob upload ... --account-name vitorareleasessa`
- Use `vitorareleases` for Front Door commands:
  - `az afd route|rule|endpoint purge ... --endpoint-name vitorareleases`
