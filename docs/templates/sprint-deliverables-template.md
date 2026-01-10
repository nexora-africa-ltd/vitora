# Sprint X.X: [Feature Name] - Deliverables

**Sprint Duration**: Weeks X-X
**Status**: 📋 PLANNED | 🔄 IN PROGRESS | ✅ COMPLETED
**Target Start**: [Date]
**Last Updated**: [Date]

---

## Executive Summary

[2-3 sentence description of what this sprint delivers and its business value]

### Business Value
- [Key benefit 1]
- [Key benefit 2]
- [Key benefit 3]

---

## Test Results Summary

<!-- Update this section as tests are implemented -->

| Test File | Tests | Status |
|-----------|-------|--------|
| test_[feature1].py | 0 | ⬜ Not Started |
| test_[feature2].py | 0 | ⬜ Not Started |
| test_[feature3].py | 0 | ⬜ Not Started |
| **Total** | **0** | **⬜ Not Started** |

**Status Legend**: ⬜ Not Started | 🔄 In Progress | ✅ All Passed | ❌ Failed

---

## Components to Implement

### 1. [Component Name]

**Module**: `hmis/apps/[app]/[file].py`

**Purpose**: [Brief description of what this component does]

**Fields**:
```python
class ModelName(TimeStampedModel):
    """Model docstring."""
    
    # Constants/Choices
    STATUS_CHOICES = [
        ('OPTION1', 'Option 1'),
        ('OPTION2', 'Option 2'),
    ]
    
    # Required fields
    field_name = models.CharField(max_length=100)
    
    # Optional fields
    optional_field = models.TextField(blank=True)
    
    # Relationships
    related_model = models.ForeignKey('app.Model', on_delete=models.CASCADE)
    
    # Computed properties
    @property
    def computed_value(self) -> str:
        """Description of computed property."""
        pass
    
    # Methods
    def action_method(self):
        """Description of method."""
        pass
```

**Test Coverage** (X tests):
- [ ] Test case 1: [Description]
- [ ] Test case 2: [Description]
- [ ] Test case 3: [Description]
- [ ] Test case 4: [Description]
- [ ] Test case 5: [Description]

---

### 2. [Component Name]

**Module**: `hmis/apps/[app]/[file].py`

**Purpose**: [Brief description]

**Fields**:
```python
# Model definition here
```

**Test Coverage** (X tests):
- [ ] Test case 1
- [ ] Test case 2

---

## API Endpoints

**Module**: `hmis/apps/[app]/views.py`, `hmis/apps/[app]/urls.py`

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/[resource]/` | GET | List [resources] | Yes |
| `/api/[resource]/` | POST | Create [resource] | Yes |
| `/api/[resource]/{id}/` | GET | Get [resource] detail | Yes |
| `/api/[resource]/{id}/` | PATCH | Update [resource] | Yes |
| `/api/[resource]/{id}/` | DELETE | Delete [resource] | Yes |
| `/api/[resource]/{id}/[action]/` | POST | [Action description] | Yes |

**API Test Coverage** (X tests):
- [ ] Authentication required on all endpoints
- [ ] Permission checks per endpoint
- [ ] Pagination and filtering
- [ ] Search functionality
- [ ] Error responses (400, 401, 403, 404)
- [ ] Offline sync compatibility

---

## Database Migrations

### Migration XXXX: [Migration Name]
```python
# hmis/apps/[app]/migrations/XXXX_[name].py

# Models/fields added:
# - ModelName
# - ModelName.field_name
```

### Migration XXXX: [Migration Name]
```python
# Description of changes
```

---

## Integration Points

### 1. [Integration Name]
- **Module**: `hmis/apps/[app]/`
- **Description**: [How this integrates with other parts of the system]
- **Dependencies**: [List of dependencies]

### 2. [Integration Name]
- **Module**: `hmis/apps/[app]/`
- **Description**: [Description]
- **Dependencies**: [Dependencies]

---

## Settings Configuration

```python
# hmis/settings/base.py or development.py

# Feature flags
FEATURE_ENABLED = True

# Configuration values
CONFIG_VALUE = 'default'
CONFIG_TIMEOUT = 30

# Third-party integration
EXTERNAL_SERVICE_URL = 'https://example.com/api'
```

---

## UI Components

<!-- For frontend-related sprints -->

### 1. [Component Name]
- **Location**: `web-app/components/[path]/`
- **Description**: [What this component does]
- **Props/Inputs**: [List of props]
- **Dependencies**: [UI library components used]

### 2. [Component Name]
- **Location**: `web-app/components/[path]/`
- **Description**: [Description]

---

## TDD Approach

### Example Test Cases

```python
# Test file: tests/test_[feature].py

import pytest # type: ignore
from rest_framework import status


class Test[Feature]:
    """Tests for [feature]."""
    
    def test_[action]_with_valid_data(self, authenticated_client, sample_data):
        """Should [expected behavior] when [condition]."""
        # Given: [Setup description]
        data = {'field': 'value'}
        
        # When: [Action description]
        response = authenticated_client.post('/api/endpoint/', data)
        
        # Then: [Assertion description]
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['field'] == 'value'
    
    def test_[action]_without_permission_fails(self, api_client, sample_data):
        """Should reject [action] without proper permissions."""
        # Given: Unauthenticated client
        
        # When: Attempting action
        response = api_client.post('/api/endpoint/', {})
        
        # Then: Should be unauthorized
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_[action]_with_invalid_data_fails(self, authenticated_client):
        """Should reject [action] with validation errors."""
        # Given: Invalid data
        data = {'field': 'invalid'}
        
        # When: Attempting action
        response = authenticated_client.post('/api/endpoint/', data)
        
        # Then: Should return validation error
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'field' in response.data
```

---

## Acceptance Criteria Summary

| User Story | Key Acceptance Criteria | Status |
|------------|------------------------|--------|
| KE-XXX-001 | [Criteria summary] | ⬜ |
| KE-XXX-002 | [Criteria summary] | ⬜ |
| KE-XXX-003 | [Criteria summary] | ⬜ |

**Status Legend**: ⬜ Not Started | 🔄 In Progress | ✅ Complete

---

## Dependencies

### Internal Dependencies
- `hmis.apps.[app]` - [Description]
- `hmis.apps.core` - AuditLog, SyncQueue, TimeStampedModel

### External Dependencies
- Django 5.x
- Django REST Framework
- [Other packages]

### Blocking Dependencies
<!-- List any work that must be completed before this sprint can start -->
- [ ] [Dependency 1]
- [ ] [Dependency 2]

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| [Risk description] | High/Medium/Low | High/Medium/Low | [Mitigation strategy] |
| [Risk description] | High/Medium/Low | High/Medium/Low | [Mitigation strategy] |
| [Risk description] | High/Medium/Low | High/Medium/Low | [Mitigation strategy] |

---

## Success Metrics

- [ ] ≥80% test coverage for new code
- [ ] All user story acceptance criteria met
- [ ] API response times <2 seconds
- [ ] Zero critical/high security issues (Bandit scan)
- [ ] Documentation updated
- [ ] Code review approved
- [ ] [Custom metric 1]
- [ ] [Custom metric 2]

---

## Definition of Done

- [ ] All tests written and passing
- [ ] Code coverage ≥80%
- [ ] Code reviewed and approved
- [ ] Documentation updated (README, API docs, inline comments)
- [ ] No linting errors (`make quality` passes)
- [ ] Security scan clean (`bandit`)
- [ ] Migrations tested (forward and backward)
- [ ] Offline functionality verified (if applicable)
- [ ] Audit logging implemented for all CRUD operations
- [ ] FHIR compliance verified (if applicable)
- [ ] Demo ready for stakeholders

---

## Appendix A: Data Model Diagram

```
[ParentModel]
    └── [ChildModel] (1:N)
            ├── [GrandchildModel1] (1:N)
            └── [GrandchildModel2] (1:1)

[RelatedModel]
    └── [ChildModel] (N:1)
```

---

## Appendix B: State Machine Diagrams

### [Entity] Status Transitions
```
STATE_A ──► STATE_B ──► STATE_C
    │           │
    │           └──► STATE_D
    │
    └──► STATE_E
```

---

## Appendix C: Fixtures & Test Data

```python
# tests/conftest.py additions

@pytest.fixture
def sample_[entity](db):
    """Create sample [entity] for testing."""
    return [Entity].objects.create(
        field1='value1',
        field2='value2',
    )

@pytest.fixture
def [entity]_data():
    """Valid [entity] data for API tests."""
    return {
        'field1': 'value1',
        'field2': 'value2',
    }
```

---

## Appendix D: API Request/Response Examples

### Create [Resource]
```http
POST /api/[resource]/
Content-Type: application/json
Authorization: Bearer <token>

{
    "field1": "value1",
    "field2": "value2"
}
```

**Response** (201 Created):
```json
{
    "id": 1,
    "field1": "value1",
    "field2": "value2",
    "created_at": "2026-01-02T10:00:00Z",
    "updated_at": "2026-01-02T10:00:00Z"
}
```

### List [Resources]
```http
GET /api/[resource]/?page=1&status=active
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
    "count": 25,
    "next": "/api/[resource]/?page=2",
    "previous": null,
    "results": [
        {
            "id": 1,
            "field1": "value1"
        }
    ]
}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | [Date] | [Author] | Initial draft |
| 1.0 | [Date] | [Author] | Final specification |

---

*Document prepared by Nexora Africa Ltd Engineering Team*
