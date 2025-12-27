# Coding Standards & Review Process for Vitora HMIS

**Version**: 1.0  
**Last Updated**: December 27, 2025  
**Status**: Active  
**Enforcement**: Required for all contributions

---

## Table of Contents

1. [Introduction](#introduction)
2. [General Principles](#general-principles)
3. [Python/Django Standards](#pythondjango-standards)
4. [JavaScript/TypeScript Standards](#javascripttypescript-standards)
5. [Database Standards](#database-standards)
6. [API Design Standards](#api-design-standards)
7. [Security Standards](#security-standards)
8. [Documentation Standards](#documentation-standards)
9. [Git & Version Control](#git--version-control)
10. [Code Review Process](#code-review-process)
11. [Definition of Done](#definition-of-done)
12. [Tools & Automation](#tools--automation)

---

## Introduction

This document establishes coding standards for Vitora HMIS to ensure:
- **Consistency**: Code looks like it was written by a single developer
- **Quality**: High standards for maintainability and reliability
- **Security**: Adherence to security best practices
- **Compliance**: Kenya Data Protection Act and healthcare standards
- **Collaboration**: Clear expectations for all contributors

### Scope

These standards apply to:
- All backend code (Python/Django)
- All frontend code (JavaScript/TypeScript/React)
- All database migrations and schemas
- All API endpoints and integrations
- All documentation and comments
- All configuration files

### Enforcement

Standards are enforced through:
- **Automated Tools**: Ruff, Black, ESLint (CI/CD)
- **Code Reviews**: Mandatory review before merge
- **CI/CD Pipeline**: Blocks merge if standards violated
- **Documentation**: This living document

---

## General Principles

### 1. Code for Humans First

> "Programs must be written for people to read, and only incidentally for machines to execute."  
> — Harold Abelson

**Guidelines**:
- Write self-documenting code with clear variable names
- Add comments only when code cannot be self-explanatory
- Optimize for readability over cleverness
- Consider the next developer (often yourself in 6 months)

**Example**:
```python
# ❌ Bad - Unclear intent
def proc_pt(p, t):
    return p.filter(c_at__gte=t).count()

# ✅ Good - Clear intent
def count_patients_registered_after_date(patients_queryset, cutoff_date):
    """
    Count patients registered after a specific date.
    
    Args:
        patients_queryset: QuerySet of Patient objects
        cutoff_date: Date to filter by (inclusive)
    
    Returns:
        int: Count of patients registered after cutoff_date
    """
    return patients_queryset.filter(
        created_at__gte=cutoff_date
    ).count()
```

### 2. DRY (Don't Repeat Yourself)

**Guidelines**:
- Extract repeated code into functions/classes
- Use inheritance and composition appropriately
- Create reusable utilities for common operations
- But: Don't over-abstract (wait for 3rd repetition)

**Example**:
```python
# ❌ Bad - Repeated validation logic
def create_patient(data):
    if not data.get('first_name'):
        raise ValidationError("First name required")
    if not data.get('last_name'):
        raise ValidationError("Last name required")
    if not data.get('date_of_birth'):
        raise ValidationError("Date of birth required")
    ...

def update_patient(patient, data):
    if not data.get('first_name'):
        raise ValidationError("First name required")
    if not data.get('last_name'):
        raise ValidationError("Last name required")
    ...

# ✅ Good - Extracted validation
def validate_patient_required_fields(data):
    """Validate required fields for patient creation/update."""
    required_fields = ['first_name', 'last_name', 'date_of_birth']
    missing_fields = [
        field for field in required_fields 
        if not data.get(field)
    ]
    
    if missing_fields:
        raise ValidationError(
            f"Required fields missing: {', '.join(missing_fields)}"
        )

def create_patient(data):
    validate_patient_required_fields(data)
    ...

def update_patient(patient, data):
    validate_patient_required_fields(data)
    ...
```

### 3. SOLID Principles

- **S**ingle Responsibility: One class, one reason to change
- **O**pen/Closed: Open for extension, closed for modification
- **L**iskov Substitution: Subtypes must be substitutable for their base types
- **I**nterface Segregation: Many specific interfaces > one general interface
- **D**ependency Inversion: Depend on abstractions, not concretions

### 4. YAGNI (You Aren't Gonna Need It)

- Don't build features "just in case"
- Implement only what's needed now
- Wait for actual requirements before adding complexity
- Exception: Architecture decisions (e.g., offline-first design)

### 5. Fail Fast

- Validate inputs early
- Raise exceptions for invalid states
- Don't silently ignore errors
- Log errors comprehensively

---

## Python/Django Standards

### Code Style

**Tool**: Black + Ruff + isort

**Line Length**: 100 characters (Black default)

**Imports**: Organized by isort
```python
# Standard library
import os
import sys
from datetime import datetime, timedelta

# Third-party
import requests
from django.db import models
from django.contrib.auth import get_user_model

# Local
from hmis.models import Patient
from hmis.utils import generate_mrn
```

**String Quotes**: Double quotes (Black default)
```python
# ✅ Good
name = "John Doe"
message = "Patient {name} registered"

# ❌ Bad (inconsistent)
name = 'John Doe'
message = "Patient {name} registered"
```

### Naming Conventions

**Variables and Functions**: `snake_case`
```python
patient_count = 10
def calculate_patient_age(date_of_birth):
    ...
```

**Classes**: `PascalCase`
```python
class Patient(models.Model):
    ...

class PatientSerializer(serializers.ModelSerializer):
    ...
```

**Constants**: `UPPER_SNAKE_CASE`
```python
MAX_RETRY_ATTEMPTS = 3
DEFAULT_TIMEOUT_SECONDS = 30
MRN_PREFIX = "KE"
```

**Private Methods**: Leading underscore
```python
class Patient(models.Model):
    def save(self, *args, **kwargs):
        self._generate_mrn_if_needed()
        super().save(*args, **kwargs)
    
    def _generate_mrn_if_needed(self):
        """Private method - not part of public API."""
        if not self.mrn:
            self.mrn = generate_mrn(self.facility.site_code)
```

### Type Hints

**Required** for all new code (Python 3.12+):

```python
from typing import Optional, List, Dict, Any
from datetime import date

def calculate_age(date_of_birth: date) -> int:
    """Calculate age from date of birth."""
    today = date.today()
    return today.year - date_of_birth.year

def get_patients_by_age_range(
    min_age: int,
    max_age: Optional[int] = None
) -> List[Patient]:
    """Get patients within age range."""
    patients = Patient.objects.all()
    # Filter logic...
    return list(patients)

def parse_patient_data(raw_data: Dict[str, Any]) -> Patient:
    """Parse raw data into Patient object."""
    ...
```

### Django Models

**Guidelines**:
- Always define `__str__()` method
- Use `related_name` for foreign keys
- Add `db_index=True` for frequently queried fields
- Include `help_text` for complex fields
- Add `verbose_name` and `verbose_name_plural`

```python
from django.db import models
from django.utils.translation import gettext_lazy as _

class Patient(models.Model):
    """
    Patient master record following Kenya HMIS standards.
    
    Stores patient demographics, identifiers, and consent information.
    All PII fields are encrypted at rest (see Security Standards).
    """
    
    # Primary Identifier
    mrn = models.CharField(
        _("Medical Record Number"),
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Auto-generated unique identifier: KE-{SITE}-{DATE}-{SEQ}"
    )
    
    # Demographics
    first_name = models.CharField(
        _("First Name"),
        max_length=100,
        db_index=True
    )
    last_name = models.CharField(
        _("Last Name"),
        max_length=100,
        db_index=True
    )
    date_of_birth = models.DateField(
        _("Date of Birth"),
        db_index=True
    )
    
    GENDER_CHOICES = [
        ('M', _('Male')),
        ('F', _('Female')),
        ('O', _('Other')),
        ('U', _('Unknown')),
    ]
    gender = models.CharField(
        _("Gender"),
        max_length=1,
        choices=GENDER_CHOICES
    )
    
    # Kenya-specific identifiers
    national_id = models.CharField(
        _("National ID"),
        max_length=20,
        blank=True,
        null=True,
        db_index=True,
        help_text="Kenyan National ID number"
    )
    
    # Privacy & Consent
    is_sensitive = models.BooleanField(
        _("Sensitive Case"),
        default=False,
        help_text="HIV/GBV/VIP - requires additional access controls"
    )
    
    # Audit fields
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.PROTECT,
        related_name='patients_created'
    )
    
    class Meta:
        verbose_name = _("Patient")
        verbose_name_plural = _("Patients")
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['last_name', 'first_name']),
            models.Index(fields=['date_of_birth']),
        ]
    
    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name} ({self.mrn})"
    
    @property
    def age(self) -> int:
        """Calculate patient age in years."""
        from datetime import date
        today = date.today()
        return today.year - self.date_of_birth.year - (
            (today.month, today.day) < 
            (self.date_of_birth.month, self.date_of_birth.day)
        )
    
    def save(self, *args, **kwargs):
        """Override save to auto-generate MRN."""
        if not self.mrn:
            from hmis.utils import generate_mrn
            self.mrn = generate_mrn(
                site_code=self.facility.site_code if self.facility else "DEFAULT"
            )
        super().save(*args, **kwargs)
```

### Django Views & Serializers

**Use Class-Based Views (ViewSets) for REST APIs**:

```python
from rest_framework import viewsets, permissions, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

class PatientViewSet(viewsets.ModelViewSet):
    """
    API endpoints for patient management.
    
    Endpoints:
    - GET /api/v1/patients/ - List patients (paginated)
    - POST /api/v1/patients/ - Create patient
    - GET /api/v1/patients/{id}/ - Retrieve patient
    - PUT /api/v1/patients/{id}/ - Update patient
    - DELETE /api/v1/patients/{id}/ - Delete patient
    - GET /api/v1/patients/search/ - Search patients (custom action)
    """
    
    queryset = Patient.objects.select_related('facility', 'created_by')
    serializer_class = PatientSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter
    ]
    filterset_fields = ['gender', 'is_sensitive']
    search_fields = ['first_name', 'last_name', 'mrn', 'national_id']
    ordering_fields = ['created_at', 'last_name', 'date_of_birth']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter queryset based on user permissions."""
        queryset = super().get_queryset()
        
        # Non-admin users can only see their facility's patients
        if not self.request.user.is_superuser:
            queryset = queryset.filter(
                facility=self.request.user.profile.facility
            )
        
        # Sensitive cases require special permission
        if not self.request.user.has_perm('hmis.view_sensitive_patient'):
            queryset = queryset.filter(is_sensitive=False)
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """
        Advanced patient search.
        
        Query params:
        - q: Search query (name, MRN, national ID)
        - age_min: Minimum age
        - age_max: Maximum age
        """
        queryset = self.get_queryset()
        
        # Search logic...
        
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)
```

**Serializers**:

```python
from rest_framework import serializers
from hmis.models import Patient

class PatientSerializer(serializers.ModelSerializer):
    """Serializer for Patient model."""
    
    age = serializers.IntegerField(read_only=True)
    created_by_name = serializers.CharField(
        source='created_by.get_full_name',
        read_only=True
    )
    
    class Meta:
        model = Patient
        fields = [
            'id', 'mrn', 'first_name', 'last_name',
            'date_of_birth', 'age', 'gender',
            'national_id', 'phone_number',
            'is_sensitive', 'created_at', 'updated_at',
            'created_by_name'
        ]
        read_only_fields = ['id', 'mrn', 'created_at', 'updated_at']
    
    def validate_national_id(self, value):
        """Validate Kenyan National ID format."""
        if value and len(value) not in [7, 8]:
            raise serializers.ValidationError(
                "Kenyan National ID must be 7 or 8 digits"
            )
        return value
    
    def validate_date_of_birth(self, value):
        """Ensure date of birth is not in the future."""
        from datetime import date
        if value > date.today():
            raise serializers.ValidationError(
                "Date of birth cannot be in the future"
            )
        return value
    
    def create(self, validated_data):
        """Create patient with audit trail."""
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)
```

### Error Handling

**Always catch specific exceptions**:

```python
# ❌ Bad - Catches everything
try:
    patient = Patient.objects.get(mrn=mrn)
except:
    return None

# ✅ Good - Catches specific exception
try:
    patient = Patient.objects.get(mrn=mrn)
except Patient.DoesNotExist:
    logger.warning(f"Patient not found: {mrn}")
    return None
except MultipleObjectsReturned:
    logger.error(f"Multiple patients with MRN: {mrn}")
    raise IntegrityError("Duplicate MRN detected")
```

### Logging

**Use structured logging**:

```python
import logging

logger = logging.getLogger(__name__)

# ✅ Good - Structured, contextual logging
logger.info(
    "Patient registered",
    extra={
        'patient_mrn': patient.mrn,
        'facility': patient.facility.code,
        'user': request.user.username,
        'action': 'patient_registration'
    }
)

logger.error(
    "MRN generation failed",
    extra={
        'facility': facility_code,
        'error': str(e),
        'action': 'mrn_generation'
    },
    exc_info=True  # Include stack trace
)
```

---

## JavaScript/TypeScript Standards

### Code Style

**Tool**: ESLint + Prettier

**File Organization**:
```
src/
├── components/
│   ├── PatientList/
│   │   ├── PatientList.tsx
│   │   ├── PatientList.test.tsx
│   │   ├── PatientList.module.css
│   │   └── index.ts
│   └── ...
├── hooks/
│   ├── usePatients.ts
│   └── useAuth.ts
├── services/
│   ├── api.ts
│   └── patient.service.ts
├── types/
│   └── patient.ts
└── utils/
    └── validators.ts
```

### TypeScript Usage

**Required** for all new frontend code:

```typescript
// types/patient.ts
export interface Patient {
  id: number;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;  // ISO 8601 format
  age: number;
  gender: 'M' | 'F' | 'O' | 'U';
  nationalId?: string;
  phoneNumber?: string;
  isSensitive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientCreateData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Patient['gender'];
  nationalId?: string;
  phoneNumber?: string;
}

// services/patient.service.ts
import { Patient, PatientCreateData } from '../types/patient';

export class PatientService {
  private baseUrl = '/api/v1/patients';
  
  async listPatients(params?: {
    search?: string;
    page?: number;
  }): Promise<{ results: Patient[]; count: number }> {
    const queryParams = new URLSearchParams(
      params as Record<string, string>
    );
    const response = await fetch(
      `${this.baseUrl}/?${queryParams}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch patients');
    }
    
    return response.json();
  }
  
  async createPatient(data: PatientCreateData): Promise<Patient> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create patient');
    }
    
    return response.json();
  }
}
```

### React Components

**Use Functional Components with Hooks**:

```typescript
// components/PatientList/PatientList.tsx
import React, { useState, useEffect } from 'react';
import { Patient } from '../../types/patient';
import { usePatients } from '../../hooks/usePatients';
import styles from './PatientList.module.css';

interface PatientListProps {
  facilityId?: number;
  onPatientSelect?: (patient: Patient) => void;
}

export const PatientList: React.FC<PatientListProps> = ({
  facilityId,
  onPatientSelect,
}) => {
  const { patients, loading, error, fetchPatients } = usePatients();
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    fetchPatients({ facilityId, search: searchQuery });
  }, [facilityId, searchQuery]);
  
  if (loading) {
    return <div className={styles.loading}>Loading patients...</div>;
  }
  
  if (error) {
    return <div className={styles.error}>Error: {error.message}</div>;
  }
  
  return (
    <div className={styles.container}>
      <input
        type="text"
        placeholder="Search patients..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className={styles.searchInput}
      />
      
      <div className={styles.list}>
        {patients.map((patient) => (
          <div
            key={patient.id}
            className={styles.item}
            onClick={() => onPatientSelect?.(patient)}
          >
            <div className={styles.name}>
              {patient.firstName} {patient.lastName}
            </div>
            <div className={styles.details}>
              MRN: {patient.mrn} | Age: {patient.age}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### Custom Hooks

```typescript
// hooks/usePatients.ts
import { useState, useCallback } from 'react';
import { Patient } from '../types/patient';
import { PatientService } from '../services/patient.service';

export function usePatients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const patientService = new PatientService();
  
  const fetchPatients = useCallback(async (params?: {
    facilityId?: number;
    search?: string;
  }) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await patientService.listPatients(params);
      setPatients(response.results);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);
  
  return { patients, loading, error, fetchPatients };
}
```

---

## Database Standards

### Migration Files

**Guidelines**:
- One logical change per migration
- Always test migrations on production-like data
- Include both `migrate` and `rollback` operations
- Add comments for complex migrations

```python
# migrations/0015_add_patient_consent_tracking.py
from django.db import migrations, models

class Migration(migrations.Migration):
    """
    Add patient consent tracking for data sharing.
    
    This migration adds a new PatientConsent model to track:
    - Data sharing consent
    - Research participation consent
    - Marketing consent
    
    Rollback: Safe to rollback, no data loss.
    """
    
    dependencies = [
        ('hmis', '0014_previous_migration'),
    ]
    
    operations = [
        migrations.CreateModel(
            name='PatientConsent',
            fields=[
                ('id', models.BigAutoField(primary_key=True)),
                ('patient', models.ForeignKey(
                    on_delete=models.CASCADE,
                    related_name='consents',
                    to='hmis.patient'
                )),
                ('consent_type', models.CharField(
                    max_length=50,
                    choices=[
                        ('data_sharing', 'Data Sharing'),
                        ('research', 'Research Participation'),
                        ('marketing', 'Marketing'),
                    ]
                )),
                ('consented', models.BooleanField(default=False)),
                ('consented_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'unique_together': [('patient', 'consent_type')],
            },
        ),
    ]
```

### Database Queries

**Use select_related() and prefetch_related()**:

```python
# ❌ Bad - N+1 query problem
patients = Patient.objects.all()
for patient in patients:
    print(patient.facility.name)  # Hits DB for each patient
    print(patient.encounters.count())  # Hits DB for each patient

# ✅ Good - Optimized queries
patients = Patient.objects.select_related('facility').prefetch_related('encounters')
for patient in patients:
    print(patient.facility.name)  # No additional DB hit
    print(patient.encounters.count())  # No additional DB hit
```

**Use queryset methods, not Python loops**:

```python
# ❌ Bad - Loads all records into memory
patients = Patient.objects.all()
active_patients = [p for p in patients if p.is_active]

# ✅ Good - Database filtering
active_patients = Patient.objects.filter(is_active=True)
```

### Indexing Strategy

**Add indexes for**:
- Foreign keys (automatic in PostgreSQL)
- Fields used in WHERE clauses
- Fields used in ORDER BY
- Composite indexes for common query patterns

```python
class Patient(models.Model):
    ...
    
    class Meta:
        indexes = [
            models.Index(fields=['last_name', 'first_name']),  # Search by name
            models.Index(fields=['date_of_birth']),  # Filter by DOB
            models.Index(fields=['facility', 'created_at']),  # Facility reports
        ]
```

---

## API Design Standards

### RESTful Principles

**Endpoint Structure**:
```
GET    /api/v1/patients/              # List patients
POST   /api/v1/patients/              # Create patient
GET    /api/v1/patients/{id}/         # Get patient details
PUT    /api/v1/patients/{id}/         # Update patient (full)
PATCH  /api/v1/patients/{id}/         # Update patient (partial)
DELETE /api/v1/patients/{id}/         # Delete patient

# Custom actions
GET    /api/v1/patients/search/       # Custom search
POST   /api/v1/patients/{id}/archive/ # Custom action
```

### Response Format

**Success**:
```json
{
  "id": 123,
  "mrn": "KE-NAI01-20260115-0001",
  "firstName": "Jane",
  "lastName": "Doe",
  "dateOfBirth": "1990-05-15",
  "age": 35,
  "gender": "F",
  "createdAt": "2026-01-15T10:30:00Z",
  "updatedAt": "2026-01-15T10:30:00Z"
}
```

**Error**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "firstName": ["This field is required"],
      "dateOfBirth": ["Date cannot be in the future"]
    }
  }
}
```

**List** (with pagination):
```json
{
  "count": 150,
  "next": "/api/v1/patients/?page=2",
  "previous": null,
  "results": [
    { "id": 1, "mrn": "...", ... },
    { "id": 2, "mrn": "...", ... }
  ]
}
```

### HTTP Status Codes

Use appropriate status codes:
- `200 OK`: Successful GET, PUT, PATCH
- `201 Created`: Successful POST
- `204 No Content`: Successful DELETE
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Missing/invalid authentication
- `403 Forbidden`: Authenticated but not authorized
- `404 Not Found`: Resource doesn't exist
- `409 Conflict`: Duplicate resource (e.g., MRN exists)
- `500 Internal Server Error`: Server error (avoid exposing details)

---

## Security Standards

### Authentication & Authorization

**Always require authentication**:

```python
# views.py
from rest_framework.permissions import IsAuthenticated

class PatientViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    ...
```

**Use permission classes**:

```python
# permissions.py
from rest_framework import permissions

class CanViewSensitivePatient(permissions.BasePermission):
    """
    Permission to view sensitive patient records.
    
    Requires specific permission and audit log entry.
    """
    
    def has_object_permission(self, request, view, obj):
        if not obj.is_sensitive:
            return True
        
        if not request.user.has_perm('hmis.view_sensitive_patient'):
            return False
        
        # Log sensitive access
        from hmis.models import AuditLog
        AuditLog.objects.create(
            user=request.user,
            action='view_sensitive_patient',
            patient=obj,
            ip_address=request.META.get('REMOTE_ADDR')
        )
        
        return True
```

### Input Validation

**Always validate user input**:

```python
# serializers.py
from rest_framework import serializers
from hmis.utils.validators import validate_kenyan_phone

class PatientSerializer(serializers.ModelSerializer):
    def validate_phone_number(self, value):
        """Validate Kenyan phone format."""
        validate_kenyan_phone(value)
        return value
    
    def validate(self, data):
        """Cross-field validation."""
        if data.get('national_id'):
            # Check if national_id already exists
            if Patient.objects.filter(
                national_id=data['national_id']
            ).exclude(id=self.instance.id if self.instance else None).exists():
                raise serializers.ValidationError({
                    'national_id': 'Patient with this National ID already exists'
                })
        return data
```

### SQL Injection Prevention

**Always use Django ORM or parameterized queries**:

```python
# ❌ Bad - SQL injection vulnerability
def get_patient_by_mrn(mrn):
    query = f"SELECT * FROM patients WHERE mrn = '{mrn}'"
    cursor.execute(query)

# ✅ Good - Parameterized query
def get_patient_by_mrn(mrn):
    return Patient.objects.get(mrn=mrn)

# ✅ Good - Raw SQL with parameters (if needed)
from django.db import connection
def get_patient_by_mrn(mrn):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM hmis_patient WHERE mrn = %s",
            [mrn]
        )
        return cursor.fetchone()
```

### XSS Prevention

**Escape output in templates**:

```html
<!-- ✅ Good - Django auto-escapes -->
<div>{{ patient.first_name }}</div>

<!-- ❌ Bad - Bypasses escaping -->
<div>{{ patient.first_name|safe }}</div>
```

### CSRF Protection

**Always use CSRF token in forms**:

```html
<form method="post">
  {% csrf_token %}
  <!-- Form fields -->
</form>
```

### Sensitive Data

**Encrypt sensitive fields**:

```python
from django_cryptography.fields import encrypt

class Patient(models.Model):
    # Encrypted fields
    national_id = encrypt(models.CharField(max_length=20, blank=True))
    hiv_status = encrypt(models.CharField(max_length=20, blank=True))
    
    # Audit sensitive access
    is_sensitive = models.BooleanField(default=False)
```

---

## Documentation Standards

### Code Comments

**When to comment**:
- Complex algorithms
- Non-obvious business logic
- Temporary workarounds (with TODO)
- Security-sensitive code
- Performance optimizations

**When NOT to comment**:
- Self-explanatory code
- Restating code in English

```python
# ❌ Bad - Restates code
# Loop through patients
for patient in patients:
    # Print patient name
    print(patient.name)

# ✅ Good - Explains WHY
# Process patients in batches to avoid memory issues with large datasets
for patient_batch in patients.batch(100):
    process_batch(patient_batch)
```

### Docstrings

**Required** for all public functions/classes/methods:

```python
def calculate_patient_risk_score(
    patient: Patient,
    include_demographics: bool = True
) -> float:
    """
    Calculate patient risk score for sepsis prediction.
    
    Uses multi-factor model combining:
    - Vital signs (temperature, HR, BP, RR)
    - Lab values (WBC, lactate, procalcitonin)
    - Demographics (age, comorbidities)
    
    Args:
        patient: Patient object with loaded vitals and labs
        include_demographics: Whether to factor in age/comorbidities
    
    Returns:
        float: Risk score between 0.0 (low risk) and 1.0 (high risk)
    
    Raises:
        ValueError: If patient has no recent vitals
        
    Examples:
        >>> patient = Patient.objects.get(mrn="KE-NAI01-20260115-0001")
        >>> risk = calculate_patient_risk_score(patient)
        >>> print(f"Risk: {risk:.2%}")
        Risk: 15.30%
    
    References:
        - Sepsis-3 criteria (JAMA 2016)
        - SOFA score calculation
    """
    ...
```

### API Documentation

**Use OpenAPI/Swagger**:

```python
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

class PatientViewSet(viewsets.ModelViewSet):
    @swagger_auto_schema(
        operation_description="Create a new patient record",
        request_body=PatientSerializer,
        responses={
            201: PatientSerializer,
            400: "Invalid input data"
        }
    )
    def create(self, request):
        ...
```

### README Files

**Every module should have a README**:

```markdown
# Patient Management Module

## Overview
Handles patient registration, search, and demographics management.

## Features
- Patient registration with MRN auto-generation
- Advanced search (name, MRN, national ID)
- Consent tracking (data sharing, research)
- Sensitive case flagging (HIV/GBV)

## Usage
```python
from hmis.models import Patient

# Create patient
patient = Patient.objects.create(
    first_name="Jane",
    last_name="Doe",
    date_of_birth="1990-05-15",
    gender="F"
)

# Search patients
patients = Patient.objects.filter(last_name__icontains="Doe")
```

## API Endpoints
- `GET /api/v1/patients/` - List patients
- `POST /api/v1/patients/` - Create patient
- `GET /api/v1/patients/{id}/` - Get patient details

## Tests
Run tests: `pytest tests/models/test_patient.py`

## Dependencies
- Django 5.0+
- djangorestframework 3.14+
```

---

## Git & Version Control

### Commit Messages

**Format**: `<type>(<scope>): <subject>`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

**Examples**:
```
feat(patient): Add consent tracking model

- Add PatientConsent model with consent types
- Implement consent recording API endpoint
- Add tests for consent creation and validation

Closes #123

---

fix(mrn): Prevent duplicate MRN generation

Race condition in MRN sequence could cause duplicates
under high load. Added select_for_update() lock.

Tests: test_mrn_generation_concurrent
Coverage: 95%

---

docs(api): Update patient API documentation

- Add OpenAPI schema for patient endpoints
- Include usage examples
- Document error codes
```

### Branch Naming

**Format**: `<type>/<description>`

**Examples**:
- `feature/patient-consent-tracking`
- `fix/duplicate-mrn-generation`
- `docs/api-documentation-update`
- `refactor/patient-model-optimization`

### Pull Requests

**PR Template**:

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactoring

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Code follows style guide
- [ ] All tests passing
- [ ] Coverage ≥80%
- [ ] No security vulnerabilities

## Testing
Describe testing done:
- Unit tests: 15 new tests added
- Integration tests: patient workflow tested
- Manual testing: Tested in local environment

## Screenshots (if UI changes)
[Attach screenshots]

## Related Issues
Closes #123
Relates to #456
```

---

## Code Review Process

### Before Requesting Review

**Author checklist**:
- [ ] All tests pass locally (`make test`)
- [ ] Code coverage ≥80% (`make coverage`)
- [ ] Linters pass (`make lint`)
- [ ] Code formatted (`make format`)
- [ ] Type checks pass (`make type-check`)
- [ ] Security scan clean (`make security`)
- [ ] Pre-commit checks pass (`make pre-commit`)
- [ ] Documentation updated
- [ ] Commit messages follow standards
- [ ] PR description complete
- [ ] Self-review completed

### Review Guidelines

**Reviewers should check**:
- [ ] **Functionality**: Does code do what it claims?
- [ ] **Tests**: Are there tests? Do they test the right things?
- [ ] **Coverage**: Is coverage ≥80%?
- [ ] **Code Quality**: Is code readable, maintainable?
- [ ] **Standards**: Does code follow this document?
- [ ] **Security**: Any vulnerabilities?
- [ ] **Performance**: Any obvious performance issues?
- [ ] **Documentation**: Are complex parts documented?
- [ ] **Error Handling**: Are errors handled appropriately?
- [ ] **Edge Cases**: Are edge cases considered?

### Review Comments

**Be constructive**:
```markdown
# ❌ Bad
This code is terrible.

# ✅ Good
Consider extracting this logic into a separate function for reusability.
This would also make it easier to test in isolation.

# ✅ Good (with suggestion)
**Suggestion**: Use `select_related()` here to avoid N+1 queries:

```python
patients = Patient.objects.select_related('facility').all()
```

This would reduce database queries from 101 to 2 for 100 patients.
```

### Approval Criteria

**Require 2 approvals**:
- 1 from team member
- 1 from tech lead or senior developer

**Auto-block merge if**:
- Tests failing
- Coverage below 80%
- Linters failing
- Security vulnerabilities
- Merge conflicts

---

## Definition of Done

### For Features

A feature is "done" when:
- [ ] **Code Written**: Feature implemented per requirements
- [ ] **Tests Written**: Unit, integration, E2E tests added
- [ ] **Tests Passing**: All tests pass (including existing)
- [ ] **Coverage**: ≥80% coverage maintained
- [ ] **Code Review**: Approved by 2 reviewers
- [ ] **Documentation**: User docs and API docs updated
- [ ] **Standards**: Follows all coding standards
- [ ] **Security**: No vulnerabilities introduced
- [ ] **Performance**: No significant performance regression
- [ ] **Deployed**: Merged to main and deployed to staging
- [ ] **Acceptance**: Product owner acceptance obtained
- [ ] **Demo**: Demoed in sprint review

### For Bug Fixes

A bug fix is "done" when:
- [ ] **Root Cause**: Root cause identified and documented
- [ ] **Fix Implemented**: Bug fixed with minimal changes
- [ ] **Test Added**: Test added that fails before fix, passes after
- [ ] **Regression Test**: Existing tests still pass
- [ ] **Code Review**: Approved by 2 reviewers
- [ ] **Documentation**: Updated if behavior changed
- [ ] **Deployed**: Merged and deployed
- [ ] **Verified**: Bug verified fixed in staging/production

---

## Tools & Automation

### Installed Tools

**Backend (Python)**:
- **Ruff**: Linter (600+ rules)
- **Black**: Code formatter
- **isort**: Import sorter
- **mypy**: Type checker
- **Bandit**: Security scanner
- **pytest**: Test framework
- **coverage.py**: Code coverage

**Frontend (JavaScript/TypeScript)**:
- **ESLint**: Linter
- **Prettier**: Code formatter
- **TypeScript**: Type checking
- **Jest**: Test framework

### Editor Configuration

**.editorconfig**:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{py,js,ts,tsx}]
indent_style = space
indent_size = 4

[*.{json,yml,yaml}]
indent_size = 2
```

### VS Code Settings

**.vscode/settings.json**:
```json
{
  "python.linting.enabled": true,
  "python.linting.ruffEnabled": true,
  "python.formatting.provider": "black",
  "python.analysis.typeCheckingMode": "basic",
  "editor.formatOnSave": true,
  "editor.rulers": [100],
  "[python]": {
    "editor.codeActionsOnSave": {
      "source.organizeImports": true
    }
  }
}
```

### Pre-Commit Hooks

**.pre-commit-config.yaml**:
```yaml
repos:
  - repo: https://github.com/psf/black
    rev: 23.12.0
    hooks:
      - id: black
  
  - repo: https://github.com/charliermarsh/ruff-pre-commit
    rev: v0.1.9
    hooks:
      - id: ruff
        args: [--fix]
  
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
```

### CI/CD Integration

All tools run automatically in CI/CD pipeline:
- PR opened → CI runs checks
- Checks fail → PR blocked
- Checks pass → PR ready for review
- Approved + passing → Can merge

---

## Exceptions & Waivers

### Requesting Exception

Sometimes standards may need to be temporarily violated (e.g., external library incompatibility).

**Process**:
1. Document reason in code comment
2. Create GitHub issue to track
3. Add `# noqa` or `# type: ignore` with reason
4. Get approval from tech lead
5. Plan remediation

**Example**:
```python
# TODO(#456): Remove this once django-cryptography supports Django 5.0
# Current workaround needed due to library limitation
import legacy_encryption  # noqa: F401 - required for Django 4.2 compatibility

# type: ignore[import] - third-party library without type stubs
from untyped_library import some_function
```

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-12-27 | Initial standards document | Engineering Team |

---

**Document Owner**: Engineering Lead  
**Last Review**: December 27, 2025  
**Next Review**: March 1, 2026  
**Questions?**: Contact @engineering-lead or post in #dev-standards Slack channel
