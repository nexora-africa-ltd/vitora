# Key Management System (KMS) Documentation

> **Version**: 1.0  
> **Created**: February 25, 2026  
> **Feature**: DHA Compliance - Key Management System Integration

---

## Overview

Vitora HMIS implements a Key Management System (KMS) abstraction layer that supports multiple backends for cryptographic key management. This ensures:

- **Compliance**: Kenya DPA 2019 and DHA requirements for data encryption
- **Flexibility**: Easy switching between local and cloud KMS providers
- **Security**: Hardware Security Module (HSM) support via cloud providers
- **Auditability**: Key rotation tracking and audit logging

## Supported Providers

| Provider | Use Case | Auto-Rotation | HSM Support |
|----------|----------|:-------------:|:-----------:|
| **Local (Fernet)** | Development, Testing, Single-server | ❌ | ❌ |
| **Azure Key Vault** | Production (Primary) | ✅ | ✅ |
| **Google Cloud KMS** | Production (Alternative) | ✅* | ✅ |

*GCP provider is a stub - implement when needed.

---

## Configuration

### Environment Variables

```bash
# Provider selection: "local", "azure", or "gcp"
KMS_PROVIDER=local

# Key rotation policy (days between rotations, minimum 365 per DHA)
KMS_KEY_ROTATION_DAYS=365

# Local provider (development/testing)
ENCRYPTION_KEY=<base64-encoded-fernet-key>

# Azure Key Vault (production)
AZURE_KEY_VAULT_URL=https://your-vault.vault.azure.net
AZURE_KEY_NAME=vitora-hmis-key
# Authentication via Managed Identity (recommended) or:
AZURE_TENANT_ID=<tenant-id>
AZURE_CLIENT_ID=<client-id>
AZURE_CLIENT_SECRET=<client-secret>

# Google Cloud KMS (future)
GCP_PROJECT_ID=your-project-id
GCP_KMS_LOCATION=global
GCP_KMS_KEYRING=vitora-hmis
GCP_KMS_KEY=vitora-key
```

### Django Settings

Settings are configured in `hmis/settings/base.py`:

```python
# KMS Configuration
KMS_PROVIDER = os.getenv("KMS_PROVIDER", "local")
KMS_KEY_ROTATION_DAYS = int(os.getenv("KMS_KEY_ROTATION_DAYS", "365"))

# Azure Key Vault
AZURE_KEY_VAULT_URL = os.getenv("AZURE_KEY_VAULT_URL", "")
AZURE_KEY_NAME = os.getenv("AZURE_KEY_NAME", "vitora-hmis-key")

# Google Cloud KMS (not yet implemented)
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")
GCP_KMS_LOCATION = os.getenv("GCP_KMS_LOCATION", "global")
GCP_KMS_KEYRING = os.getenv("GCP_KMS_KEYRING", "vitora-hmis")
GCP_KMS_KEY = os.getenv("GCP_KMS_KEY", "vitora-key")
```

---

## Usage

### Basic Encryption/Decryption

```python
from hmis.apps.core.kms import get_kms_provider

# Get the configured provider
kms = get_kms_provider()

# Encrypt/decrypt bytes
ciphertext = kms.encrypt(b"sensitive data")
plaintext = kms.decrypt(ciphertext)

# Encrypt/decrypt strings (base64 encoded output)
encrypted = kms.encrypt_string("National ID: 12345678")
decrypted = kms.decrypt_string(encrypted)

# With audit context
ciphertext = kms.encrypt(b"data", context={
    "patient_id": "123",
    "field": "national_id",
    "purpose": "registration"
})
```

### Key Rotation Service

```python
from hmis.apps.core.kms.rotation import KeyRotationService

# Create service
service = KeyRotationService()

# Check if rotation is needed
if service.needs_rotation():
    result = service.rotate()
    print(f"Key rotated: {result.new_key_id}")

# Rotate with optional re-encryption (local provider)
result = service.rotate_and_reencrypt()
```

### Management Commands

```bash
# Check KMS status
python manage.py kms status

# Check KMS health
python manage.py kms health

# Rotate key
python manage.py kms rotate

# Force rotation even if not needed
python manage.py kms rotate --force

# Generate new Fernet key (for local provider)
python manage.py kms generate-key

# JSON output
python manage.py kms status --json
```

---

## Provider Details

### Local Provider (Fernet)

The local provider uses the `cryptography` library's Fernet implementation (AES-128-CBC + HMAC-SHA256).

**Generating a key:**
```bash
python manage.py kms generate-key
# Or:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Key format:** 32 bytes, base64-encoded (44 characters)

**When to use:**
- Development environments
- Testing
- Single-server deployments without cloud access

**Limitations:**
- No automatic key rotation
- No HSM backing
- Manual key management required

### Azure Key Vault Provider

The Azure provider supports RSA-OAEP encryption with envelope encryption for large payloads.

**Setup:**

1. Create an Azure Key Vault:
```bash
az keyvault create --name vitora-hmis-kv \
  --resource-group your-rg \
  --location southafrica
```

2. Create an RSA key:
```bash
az keyvault key create --vault-name vitora-hmis-kv \
  --name vitora-hmis-key \
  --kty RSA \
  --size 2048
```

3. Configure automatic rotation policy:
```bash
az keyvault key rotation-policy update --vault-name vitora-hmis-kv \
  --name vitora-hmis-key \
  --value @rotation-policy.json
```

4. Grant access (Managed Identity recommended):
```bash
az keyvault set-policy --name vitora-hmis-kv \
  --object-id <managed-identity-object-id> \
  --key-permissions encrypt decrypt get list rotate
```

**Installation:**
```bash
poetry add azure-identity azure-keyvault-keys
# Or with extras:
poetry install -E azure
```

**Environment Variables:**
```bash
KMS_PROVIDER=azure
AZURE_KEY_VAULT_URL=https://vitora-hmis-kv.vault.azure.net
AZURE_KEY_NAME=vitora-hmis-key
```

**Envelope Encryption:**

For data larger than ~190 bytes (RSA-OAEP limit), the provider uses envelope encryption:

1. Generate ephemeral DEK (Data Encryption Key)
2. Encrypt data with DEK using Fernet
3. Wrap DEK with Azure Key Vault (RSA-OAEP)
4. Return: wrapped DEK + encrypted data

This ensures efficient encryption of large payloads while maintaining HSM protection for the key.

---

## Key Rotation

### Policy

Per DHA compliance requirements:
- **Minimum rotation period**: 365 days (annual)
- **Recommended**: 90-180 days for sensitive healthcare data
- **Audit logging**: All rotation events must be logged

### Rotation Process

1. **Cloud Providers (Azure/GCP):**
   - Creates a new key version
   - Old versions remain available for decryption
   - No immediate re-encryption needed (but recommended)

2. **Local Provider:**
   - Generates a new Fernet key
   - Requires manual update of `ENCRYPTION_KEY`
   - Re-encryption of existing data recommended

### Scheduled Rotation (Celery Task)

Add to your Celery beat schedule:

```python
# hmis/celery.py
from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'check-key-rotation': {
        'task': 'hmis.apps.core.tasks.check_key_rotation',
        'schedule': crontab(hour=0, minute=0, day_of_week='sunday'),
    },
}
```

```python
# hmis/apps/core/tasks.py
from celery import shared_task
from hmis.apps.core.kms.rotation import KeyRotationService

@shared_task
def check_key_rotation():
    service = KeyRotationService()
    if service.needs_rotation():
        result = service.rotate()
        # Send alert/notification
        return f"Key rotated: {result.new_key_id}"
    return "Rotation not needed"
```

---

## Security Considerations

### Key Storage

| Environment | Storage Method | Security Level |
|-------------|----------------|----------------|
| Development | Environment variable | ⚠️ Low |
| Staging | Azure Key Vault | ✅ High |
| Production | Azure Key Vault + HSM | ✅ Very High |

### Access Control

- **Least Privilege**: Only services needing encryption should have KMS access
- **Managed Identity**: Use Azure Managed Identity instead of client secrets
- **Audit Logging**: Enable Azure Monitor or Cloud Audit Logs

### Incident Response

If a key is compromised:

1. **Immediately** disable the compromised key version
2. Rotate to a new key version
3. Re-encrypt all data with the new key
4. Review audit logs for unauthorized access
5. Report to DPO per Kenya DPA requirements

---

## API Reference

### KMSProvider (Abstract Base Class)

```python
class KMSProvider(ABC):
    def encrypt(self, plaintext: bytes, context: dict | None = None) -> bytes
    def decrypt(self, ciphertext: bytes, context: dict | None = None) -> bytes
    def encrypt_string(self, plaintext: str, context: dict | None = None) -> str
    def decrypt_string(self, ciphertext: str, context: dict | None = None) -> str
    def rotate_key(self) -> KeyMetadata
    def get_key_metadata(self) -> KeyMetadata
    def is_healthy(self) -> bool
    def supports_automatic_rotation(self) -> bool
```

### KeyMetadata

```python
@dataclass
class KeyMetadata:
    key_id: str
    key_name: str
    state: KeyState  # ENABLED, DISABLED, PENDING_DELETION, DESTROYED
    created_at: datetime | None
    updated_at: datetime | None
    rotation_period_days: int | None
    last_rotated_at: datetime | None
    next_rotation_at: datetime | None
    algorithm: str
    provider: str
    version: str | None
    tags: dict[str, str] | None
```

### Exceptions

```python
class KMSError(Exception): ...
class EncryptionError(KMSError): ...
class DecryptionError(KMSError): ...
class KeyRotationError(KMSError): ...
class KeyNotFoundError(KMSError): ...
```

---

## Testing

Run KMS tests:
```bash
poetry run pytest tests/core/test_kms.py -v
```

Test coverage includes:
- Local provider encryption/decryption
- Key rotation
- Error handling
- Edge cases (empty data, Unicode, large payloads)
- Provider factory

---

## Module Structure

```
hmis/apps/core/kms/
├── __init__.py      # Factory function, exports
├── base.py          # Abstract base class, exceptions, dataclasses
├── local.py         # Fernet-based local provider
├── azure.py         # Azure Key Vault provider
├── gcp.py           # GCP KMS provider (stub)
└── rotation.py      # Key rotation service

hmis/apps/core/management/commands/
└── kms.py           # Management command for KMS operations
```

---

## Changelog

### v1.0 (February 25, 2026)
- Initial implementation
- Local (Fernet) provider
- Azure Key Vault provider with envelope encryption
- GCP KMS stub
- Key rotation service
- Management commands
- 33 unit tests
