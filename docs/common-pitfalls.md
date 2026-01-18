# Common Pitfalls & Troubleshooting Guide

> **Purpose**: Document high-value stubborn issues encountered during Vitora HMIS development and their resolutions. This serves as a quick reference for developers facing similar problems.

---

## Table of Contents

1. [External API Integration](#external-api-integration)
   - [DHA Practitioner Search 404 Despite Successful API Call](#dha-practitioner-search-404-despite-successful-api-call)
   - [Frontend Calling Wrong Backend URL](#frontend-calling-wrong-backend-url)
2. [Authentication & Authorization](#authentication--authorization)
   - [JWT Token Expiry Issues](#jwt-token-expiry-issues)
3. [Database & Migrations](#database--migrations)
4. [Testing](#testing)

---

## External API Integration

### DHA Practitioner Search 404 Despite Successful API Call

**Symptoms:**
- Backend logs show successful external DHA API call (Status 200)
- Valid practitioner data is returned from `https://uat.dha.go.ke/v1/practitioner-search`
- But internal endpoint returns 404 "No practitioner found"

**Example Log Output:**
```
INFO  DHA Practitioner Search API Response:
  Status Code: 200
  Response Body: {"message":{"membership":{"id":"PUID-0022840-4","status":"Licensed",...}}}
WARNING Not Found: /api/sha/practitioner/validate/
```

**Root Cause:**
The DHA API response format differs from what our code expected. The API returns data directly in `message.membership` without an explicit `found` boolean field. Our code was checking:

```python
# WRONG - assumes found=False when field doesn't exist
found = message_data.get('found', False)
if not found:
    return None  # Always returns None!
```

**Solution:**
Check for the presence of actual data rather than relying on an explicit `found` field:

```python
# CORRECT - check if membership data exists
found = message_data.get('found')
if found is not None:
    # Explicit found field exists - use it
    if isinstance(found, str):
        found = found.lower() == 'true'
    if not found:
        return None
else:
    # No explicit found field - check if membership data exists
    if not message_data.get('membership'):
        return None
```

**File Changed:** `backend/hmis/apps/billing/services/dha_search.py`

**Lesson Learned:** Always log the full API response during integration development. Don't assume external APIs follow the expected response format - verify with actual calls.

---

### Frontend Calling Wrong Backend URL

**Symptoms:**
- Backend has the endpoint working (verified via curl)
- Frontend requests return 404
- Server logs show requests to a different URL than expected

**Example:**
```
# Frontend was calling:
/api/billing/dha/practitioner-search/

# But backend endpoint is actually at:
/api/sha/practitioner/validate/
```

**Root Cause:**
URL configuration drift between frontend and backend. The backend has multiple URL patterns (`billing/urls.py` and `sha_urls.py`) and the frontend was using a legacy or incorrect path.

**Debugging Steps:**
1. Check Django URL configuration:
   ```bash
   cd backend && DJANGO_SETTINGS_MODULE=hmis.settings.development \
     poetry run python -c "
     import django; django.setup()
     from django.urls import reverse
     print(reverse('sha:practitioner-validate'))
     "
   ```

2. Verify the actual registered URL patterns in `hmis/urls.py`:
   ```python
   path("api/sha/", include("hmis.apps.billing.sha_urls", namespace="sha")),
   path("api/billing/", include("hmis.apps.billing.urls", namespace="billing")),
   ```

**Solution:**
Update the frontend API client to use the correct URL:

```typescript
// web-app/lib/api/sha.ts
// WRONG:
const response = await apiClient.get(`/api/billing/dha/practitioner-search/?${queryString}`);

// CORRECT:
const response = await apiClient.get(`/api/sha/practitioner/validate/?${queryString}`);
```

**Lesson Learned:** Maintain a single source of truth for API endpoints. Consider using OpenAPI/Swagger specs generated from Django to keep frontend and backend in sync.

---

## Authentication & Authorization

### JWT Token Expiry Issues

**Symptoms:**
- API calls work initially then start failing with 401
- Works in tests but fails in manual testing
- HIE (Health Information Exchange) tokens expire faster than expected

**Root Cause:**
External APIs like Kenya's DHA/SHA have short-lived tokens (often 20 seconds for HIE auth tokens). If there's network latency or debugging pauses, the token expires mid-request.

**Example - SHA HIE Auth Token:**
```python
# Token obtained here
INFO sha_auth Fetching new SHA authentication token
INFO sha_auth Successfully obtained SHA authentication token

# By the time this request is made (if delayed), token may be expired
INFO dha_search DHA Practitioner Search API Request...
```

**Solution:**
1. The `SHAAuthService` already implements token caching with expiry tracking
2. For manual testing, always obtain a fresh token immediately before use:
   ```bash
   TOKEN=$(curl -s -X POST http://127.0.0.1:9088/api/token/ \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin123"}' | jq -r '.access') && \
   curl -s "http://127.0.0.1:9088/api/sha/practitioner/validate/?..." \
     -H "Authorization: Bearer $TOKEN"
   ```

3. For integration tests, mock the external API calls rather than relying on live tokens

**Configuration:** JWT lifetimes are set in `backend/hmis/settings/base.py`:
```python
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    ...
}
```

---

## Database & Migrations

### Migration Dependency Conflicts

**Symptoms:**
- `makemigrations` creates circular dependencies
- `migrate` fails with "relation already exists" errors
- Tests fail with database schema mismatches

**Solution:**
1. Check migration dependencies carefully
2. Use `--fake-initial` for initial migrations on existing tables:
   ```bash
   python manage.py migrate --fake-initial
   ```
3. For circular dependencies, use string references in ForeignKey:
   ```python
   # Instead of importing the model directly
   patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE)
   ```

---

## Testing

### Test Fixtures Not Found

**Symptoms:**
- `pytest` errors with "fixture 'xyz' not found"
- Tests pass locally but fail in CI

**Root Cause:**
Fixtures defined in `conftest.py` are scoped to their directory. If a test file is in a subdirectory, it may not have access to parent fixtures.

**Solution:**
Ensure `conftest.py` is in the tests root:
```
backend/tests/
├── conftest.py          # Main fixtures: authenticated_client, sample_patient, etc.
├── billing/
│   └── test_api/
│       └── test_dha_practitioner_search_api.py
```

**Common Fixtures Available:**
```python
# Authentication
api_client              # Unauthenticated DRF APIClient
authenticated_client    # APIClient with force_authenticate(test_user)
test_user               # User instance (username: testuser)

# Kenya Locations
sample_county           # County(code=1, name="Mombasa")
sample_sub_county       # SubCounty linked to sample_county
sample_ward             # Ward linked to sample_sub_county

# Patient & Encounter
patient_data            # Dict with valid patient fields
sample_patient          # Patient instance
sample_encounter        # Encounter instance
```

---

## Quick Debugging Commands

### Check Django URL Configuration
```bash
cd backend && DJANGO_SETTINGS_MODULE=hmis.settings.development \
  poetry run python -c "
import django; django.setup()
from django.urls import get_resolver
for pattern in get_resolver().url_patterns:
    print(pattern)
"
```

### Test API Endpoint with Authentication
```bash
cd backend && \
TOKEN=$(curl -s -X POST http://127.0.0.1:9088/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.access') && \
curl -s "http://127.0.0.1:9088/api/YOUR_ENDPOINT/" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### View Recent Git Changes
```bash
git log --oneline -10
git diff HEAD~1
```

### Run Specific Test File with Verbose Output
```bash
cd backend && poetry run pytest tests/path/to/test_file.py -v --tb=short -s
```

---

## Contributing to This Document

When you encounter and resolve a stubborn issue:

1. **Document the symptoms** - What did you observe? Copy relevant log output.
2. **Explain the root cause** - Why did this happen? Be specific.
3. **Show the solution** - Include code snippets, file paths, and commands.
4. **Add lessons learned** - How can we prevent this in the future?

---

**Last Updated:** January 15, 2026
**Maintainers:** Engineering Team
