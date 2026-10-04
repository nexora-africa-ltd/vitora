# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!-- SQLCipher lifecycle operations for Facility Hub deployments. Use after stopping the hub service. Inputs: HUB_DATABASE_ENCRYPTION_KEY and an optional database path. -->

# Hub Database Encryption

Facility Hub installers provision SQLCipher by default. On a fresh install,
they generate a per-hub key from 64 random bytes and place both
`HUB_DATABASE_ENCRYPTION_REQUIRED=true` and
`HUB_DATABASE_ENCRYPTION_KEY` only in the host-protected secret bundle:

- Linux native hubs use a `systemd-creds` host-encrypted credential.
- Windows hubs use a DPAPI `LocalMachine` bundle.

Neither value is written to `.env`, service configuration, installer output,
or application logs. Re-running an installer and device re-enrollment preserve
an existing database key; they do not rotate it. SQLCipher database encryption
complements, rather than replaces, independently Fernet-encrypted backup
bundles.

Stop the hub service before any lifecycle operation. Do not pass key material
on a command line or place it in a database file.

```bash
# Convert the configured plaintext hub database in place.
DJANGO_ENV=hub python manage.py hub_encrypt_database

# Check only whether the configured key opens the database.
DJANGO_ENV=hub python manage.py hub_database_key_status

# Rotate with a replacement key delivered in the process environment.
export NEXT_HUB_DATABASE_KEY='...'
DJANGO_ENV=hub python manage.py hub_rotate_database_key --new-key-env NEXT_HUB_DATABASE_KEY
# Update HUB_DATABASE_ENCRYPTION_KEY to the same value before restarting.
```

The conversion first exports to a temporary encrypted database and atomically
replaces the original only after key verification. Rotation uses SQLCipher's
`PRAGMA rekey` after authenticating the current key.

Key retrieval, escrow, rotation distribution, and persistence are deployment
adapters. The installers implement the local operating-system secret adapters
described above. Azure Key Vault network escrow is deliberately not implemented
in this hub flow; a cloud deployment adapter may provide escrow according to
the facility's recovery policy without changing the local key lifecycle.
