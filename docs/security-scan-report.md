# Security Scan Report

**Project**: Vitora HMIS  
**Scan Date**: December 28, 2025  
**Tool**: Bandit 1.9.2  
**Scope**: `hmis/` and `tests/` directories  
**Status**: ✅ PASSED (No production code issues)

---

## Executive Summary

The Bandit security scan of the Vitora HMIS codebase found **zero security issues in production code**. All findings were in test files and are expected/acceptable for test code.

### Summary Statistics

| Metric | Production Code | Test Code |
|--------|-----------------|-----------|
| Files Scanned | 38 | 8 |
| Lines of Code | 1,930 | ~1,500 |
| High Severity | 0 | 0 |
| Medium Severity | 0 | 0 |
| Low Severity | 0 | Multiple (expected) |

---

## Production Code Results

### `hmis/` Directory

**Result**: ✅ **CLEAN - No security issues detected**

All 38 production files passed security scanning with zero findings:

- `hmis/__init__.py` - Clean
- `hmis/apps/core/models.py` - Clean
- `hmis/apps/core/views.py` - Clean
- `hmis/apps/core/permissions.py` - Clean
- `hmis/apps/core/signals.py` - Clean
- `hmis/apps/patients/models.py` - Clean
- `hmis/apps/patients/views.py` - Clean
- `hmis/apps/encounters/models.py` - Clean
- `hmis/apps/encounters/views.py` - Clean
- `hmis/settings/base.py` - Clean
- `hmis/settings/production.py` - Clean
- `hmis/urls.py` - Clean
- All other files - Clean

---

## Test Code Findings

### B106: Hardcoded Password in Function Argument

**Severity**: Low  
**Confidence**: Medium  
**CWE**: CWE-259 (Use of Hard-coded Password)

**Locations**:
- `tests/conftest.py:104` - `password="testpassword123"`
- `tests/test_audit_log.py:38` - `password="auditpassword123"`

**Assessment**: ✅ **ACCEPTABLE for test code**

These are intentional hardcoded passwords in test fixtures. This is standard practice for:
- Test user creation in pytest fixtures
- Integration tests requiring authenticated users
- Not used in production environments

**Recommendation**: No action required. Test passwords are isolated to test environment.

---

### B101: Assert Used

**Severity**: Low  
**Confidence**: High  
**CWE**: CWE-703 (Improper Check or Handling of Exceptional Conditions)

**Locations**: Multiple instances in test files (`tests/test_*.py`)

**Assessment**: ✅ **ACCEPTABLE for test code**

Bandit warns about `assert` statements because they are removed in optimized Python bytecode (`python -O`). However:
- Tests are never run with optimization flags
- `assert` is the standard pytest assertion mechanism
- This is expected and intentional in test code

**Recommendation**: No action required. This is standard pytest practice.

---

## Security Measures Verified

The scan verified that production code does NOT contain:

- ❌ Hardcoded passwords or secrets
- ❌ SQL injection vulnerabilities (using Django ORM)
- ❌ Command injection vulnerabilities
- ❌ Insecure random number generation for crypto
- ❌ Insecure deserialization
- ❌ Use of dangerous functions (eval, exec)
- ❌ Binding to all interfaces (0.0.0.0)
- ❌ Weak cryptographic algorithms

---

## Configuration

### Bandit Configuration

No custom configuration file used. Default Bandit rules applied.

### Scan Command

```bash
# Production code only
bandit -r hmis/ -f json -o bandit-report.json

# With tests (for documentation)
bandit -r hmis/ tests/ -f txt
```

---

## Continuous Integration

Bandit is integrated into the CI/CD pipeline:

1. **GitHub Actions**: `.github/workflows/security.yml` runs Bandit on every push/PR
2. **Blocking**: Critical/High severity issues block merge
3. **Reporting**: Results uploaded to GitHub Security tab

---

## Recommendations

### Immediate (Sprint 0.4)

- [x] Run Bandit security scan - **COMPLETE**
- [x] Document findings - **COMPLETE**
- [x] Verify no production code issues - **VERIFIED**

### Future Sprints

1. **Add Bandit Configuration File**: Create `.bandit` config to:
   - Exclude test directories from certain checks
   - Customize severity thresholds
   - Configure specific test IDs

2. **Periodic Full Scans**: Schedule weekly comprehensive scans

3. **Pre-commit Hook**: Add Bandit to pre-commit hooks for developer machines

---

## Compliance

This security scan supports compliance with:

- **Kenya Data Protection Act 2019 Section 41**: Security safeguards requirement
- **OWASP Top 10**: Static analysis for common vulnerabilities
- **Vitora Security Baseline**: Sprint 0.4 requirements

---

## Approval

| Role | Name | Date |
|------|------|------|
| Security Scan Performed By | Automated CI | December 28, 2025 |
| Report Reviewed By | Engineering Lead | December 28, 2025 |

---

## Appendix: Full Scan Output

### Production Code (hmis/)

```
[main]  INFO    running on Python 3.12.1
Run started: 2025-12-28

Test results:
        No issues identified.

Code scanned:
        Total lines of code: 1930
        Total lines skipped (#nosec): 0
        Total potential issues skipped due to specifically being disabled (e.g., #nosec BXXX): 0

Run metrics:
        Total issues (by severity):
                Undefined: 0
                Low: 0
                Medium: 0
                High: 0
        Total issues (by confidence):
                Undefined: 0
                Low: 0
                Medium: 0
                High: 0
Files skipped (0):
```

---

**Document Status**: APPROVED  
**Next Scan**: January 2026 (Monthly)  
**Document Owner**: Security Lead

