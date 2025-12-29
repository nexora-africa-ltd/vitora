# CI/CD Pipeline Documentation

**Version**: 1.0
**Date**: December 27, 2025
**Sprint**: 0.1 Task 5
**Status**: ACTIVE

---

## Overview

This document describes the Continuous Integration and Continuous Deployment (CI/CD) pipeline for the Vitora HMIS project. The pipeline enforces Test-Driven Development (TDD) practices, quality gates, and security standards throughout the development lifecycle.

## Pipeline Architecture

### Workflow Files

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| Main CI/CD | `.github/workflows/ci.yml` | Push, PR, Manual | Primary build, test, and quality checks |
| Security Scanning | `.github/workflows/security.yml` | Push, PR, Schedule, Manual | Security vulnerability detection |

### Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────┐
│                     CI/CD Pipeline Flow                         │
└─────────────────────────────────────────────────────────────────┘

1. Code Push/PR
   ↓
2. Parallel Execution:
   ├─ Backend Tests & Linting (Python 3.12)
   │  ├─ Ruff Linter
   │  ├─ Black Formatter Check
   │  ├─ Pytest with Coverage (≥80%)
   │  └─ mypy Type Checking
   │
   ├─ Frontend Tests & Linting (Node.js 20)
   │  ├─ ESLint
   │  ├─ Jest Tests
   │  └─ Build Validation
   │
   ├─ Security Scanning
   │  ├─ Bandit (Python security)
   │  ├─ Trivy (vulnerabilities)
   │  ├─ CodeQL (code analysis)
   │  └─ Secret scanning
   │
   └─ Documentation Check
      ├─ README validation
      ├─ Markdown linting
      └─ Structure validation
   ↓
3. Quality Gate
   ├─ All tests pass
   ├─ Coverage ≥80%
   ├─ No critical security issues
   └─ Documentation complete
   ↓
4. ✅ Pass / ❌ Fail
```

---

## Jobs Description

### 1. Backend Tests & Quality Gates

**Job Name**: `backend-tests`
**Runs On**: Ubuntu Latest
**Python Version**: 3.12

#### Steps:
1. **Checkout code**: Pull latest code from repository
2. **Setup Python**: Install Python 3.12
3. **Cache dependencies**: Cache Poetry dependencies for faster builds
4. **Install Poetry**: Install Poetry package manager
5. **Install dependencies**: Install project dependencies via Poetry
6. **Run Ruff Linter**: Check code style and quality
   - Output format: GitHub annotations
   - Fail on error: Yes
7. **Run Black Formatter**: Verify code formatting
   - Fail on error: Yes
8. **Run Pytest**: Execute unit and integration tests
   - Coverage target: ≥80%
   - Output: XML and terminal
   - Fail on coverage below 80%: Yes
9. **Upload coverage**: Send coverage data to Codecov
10. **Run mypy**: Type checking (informational)

#### Quality Gates:
- ✅ Ruff linting passes with no errors
- ✅ Black formatting check passes
- ✅ All tests pass
- ✅ Coverage ≥80%

### 2. Security Scanning

**Job Name**: `security-scan`
**Runs On**: Ubuntu Latest

#### Steps:
1. **Checkout code**: Pull latest code
2. **Setup Python**: Install Python 3.12
3. **Install Bandit**: Install security linter
4. **Run Bandit**: Scan Python code for security issues
   - Output: JSON report
   - Check for: SQL injection, XSS, hardcoded passwords, etc.
5. **Run Trivy**: Vulnerability scanner for dependencies and code
   - Output: SARIF format
   - Upload to GitHub Security tab
6. **Upload reports**: Save security reports as artifacts

#### Quality Gates:
- ⚠️ No critical security vulnerabilities (blocking)
- ⚠️ High-severity issues reviewed (non-blocking in Phase 0)

### 3. Frontend Tests & Quality Gates

**Job Name**: `frontend-tests`
**Runs On**: Ubuntu Latest
**Node Version**: 20.x

#### Steps:
1. **Checkout code**: Pull latest code
2. **Setup Node.js**: Install Node 20.x
3. **Cache dependencies**: Cache npm modules
4. **Install frontend dependencies**: Run `npm ci` in frontend-web
5. **Run ESLint**: Check TypeScript/JavaScript code quality
6. **Run Jest tests**: Execute frontend unit tests with coverage
7. **Install desktop dependencies**: Install Electron dependencies
8. **Build desktop app**: Verify Electron app builds successfully

#### Quality Gates:
- ✅ ESLint passes with no errors
- ✅ All frontend tests pass
- ✅ Desktop app builds successfully

### 4. Documentation Check

**Job Name**: `documentation-check`
**Runs On**: Ubuntu Latest

#### Steps:
1. **Checkout code**: Pull latest code
2. **Check README**: Verify README.md exists (required)
3. **Check ROADMAP**: Verify ROADMAP.md exists
4. **Check docs directory**: Verify docs/ structure
5. **Markdown lint**: Run markdownlint on all .md files

#### Quality Gates:
- ✅ README.md exists
- ⚠️ ROADMAP.md exists (warning if missing)
- ⚠️ docs/ directory exists

### 5. Build Validation

**Job Name**: `build-validation`
**Runs On**: Ubuntu Latest
**Depends On**: backend-tests, frontend-tests

#### Steps:
1. **Checkout code**: Pull latest code
2. **Validate structure**: Check for expected directories
3. **Scan for TODOs**: Find TODO/FIXME comments (informational)

#### Quality Gates:
- ✅ Project structure valid
- ℹ️ TODO/FIXME count (informational)

### 6. Coverage Report

**Job Name**: `coverage-report`
**Runs On**: Ubuntu Latest
**Depends On**: backend-tests, frontend-tests

#### Steps:
1. **Download artifacts**: Collect coverage reports
2. **Generate summary**: Display coverage statistics

#### Quality Gates:
- ℹ️ Coverage summary displayed
- ✅ Backend coverage ≥80%
- ✅ Frontend coverage ≥80%

### 7. Quality Gate

**Job Name**: `quality-gate`
**Runs On**: Ubuntu Latest
**Depends On**: All previous jobs

#### Steps:
1. **Check all job statuses**: Verify all quality checks passed
2. **Evaluate gate**: Pass/fail based on criteria
3. **Report status**: Display final gate status

#### Quality Gates:
- ✅ Backend tests passed
- ✅ Security scan passed (or warnings only)
- ✅ Frontend tests passed
- ✅ Documentation check passed

**Result**: Pipeline passes only if all critical gates pass.

---

## Security Workflow

### Jobs:

#### 1. Dependency Vulnerability Scan
- **Tool**: Safety (Python), npm audit (Node.js)
- **Purpose**: Check for known vulnerabilities in dependencies
- **Frequency**: On push, PR, daily at 2 AM UTC

#### 2. CodeQL Analysis
- **Tool**: GitHub CodeQL
- **Languages**: Python, JavaScript/TypeScript
- **Purpose**: Static code analysis for security vulnerabilities
- **Queries**: Security-extended query suite

#### 3. Secret Scanning
- **Tools**: TruffleHog, Gitleaks
- **Purpose**: Detect hardcoded secrets, API keys, passwords
- **Frequency**: On push, PR

#### 4. OWASP Dependency Check
- **Tool**: OWASP Dependency-Check
- **Purpose**: Identify known vulnerabilities in dependencies
- **Output**: HTML report (artifact)

#### 5. License Compliance Check
- **Tools**: licensecheck (Python), license-checker (Node.js)
- **Purpose**: Verify license compatibility
- **Output**: Summary report

---

## Quality Standards

### Test Coverage Requirements

| Component | Minimum Coverage | Target Coverage |
|-----------|------------------|-----------------|
| Backend Models | 95% | 100% |
| Backend APIs | 90% | 95% |
| Backend Utils | 90% | 95% |
| Frontend Components | 80% | 90% |
| Frontend Utils | 85% | 95% |
| **Overall** | **80%** | **85%** |

### Code Quality Standards

| Check | Tool | Requirement |
|-------|------|-------------|
| Python Style | Ruff | Zero errors |
| Python Formatting | Black | 100% formatted |
| Python Types | mypy | Informational |
| JS/TS Style | ESLint | Zero errors |
| Security | Bandit | No critical issues |

### Performance Benchmarks

| Metric | Target |
|--------|--------|
| Pipeline total duration | < 10 minutes |
| Backend tests | < 3 minutes |
| Frontend tests | < 2 minutes |
| Security scan | < 3 minutes |

---

## Triggers

### Automatic Triggers

1. **Push to branches**:
   - `main`
   - `develop`
   - `copilot/**`

2. **Pull Requests to**:
   - `main`
   - `develop`

3. **Scheduled** (Security workflow only):
   - Daily at 2:00 AM UTC

### Manual Triggers

Both workflows support manual dispatch via GitHub Actions UI.

---

## Branch Protection Rules

### Main Branch (`main`)
- ✅ Require pull request reviews (1 approval)
- ✅ Require status checks to pass before merging:
  - `backend-tests`
  - `security-scan`
  - `quality-gate`
- ✅ Require branches to be up to date
- ✅ Require conversation resolution before merging
- ✅ Enforce administrators
- ✅ Restrict push access

### Develop Branch (`develop`)
- ✅ Require pull request reviews (1 approval)
- ✅ Require status checks to pass:
  - `backend-tests`
  - `quality-gate`
- ✅ Require branches to be up to date

---

## Artifacts

### Generated Artifacts

| Artifact | Retention | Purpose |
|----------|-----------|---------|
| `backend-coverage` | 30 days | Code coverage reports |
| `bandit-security-report` | 90 days | Security scan results |
| `trivy-results` | 90 days | Vulnerability scan |
| `owasp-dependency-check-report` | 90 days | OWASP report |

### Accessing Artifacts

1. Go to GitHub Actions
2. Select workflow run
3. Scroll to "Artifacts" section
4. Download desired artifact

---

## Notifications

### Failure Notifications

- GitHub UI: Red X on commit/PR
- Email: To commit author (GitHub default)
- PR Comments: Automated comments on test failures

### Success Notifications

- GitHub UI: Green checkmark
- PR: Allows merge when all checks pass

---

## Local Testing

### Before Pushing Code

Run these commands locally to catch issues early:

```bash
# Backend
cd backend
poetry run ruff check .
poetry run black .
poetry run pytest --cov=hmis --cov-fail-under=80

# Frontend
cd frontend-web
npm run lint
npm test -- --coverage

# Desktop
cd desktop-app
npm run build
```

---

## Troubleshooting

### Common Issues

#### 1. Coverage Below 80%
**Problem**: `pytest` fails with "coverage below 80%"
**Solution**:
- Write more tests for uncovered code
- Check `coverage.xml` for uncovered lines
- Focus on critical paths first

#### 2. Ruff Errors
**Problem**: Ruff linting fails
**Solution**:
```bash
poetry run ruff check . --fix
```

#### 3. Black Formatting
**Problem**: Black check fails
**Solution**:
```bash
poetry run black .
```

#### 4. Security Issues
**Problem**: Bandit reports security vulnerabilities
**Solution**:
- Review Bandit report
- Fix or add `# nosec` comment with justification
- Never ignore critical security issues

#### 5. Pipeline Timeout
**Problem**: Pipeline takes > 10 minutes
**Solution**:
- Check for hanging tests
- Optimize slow tests
- Use caching effectively

---

## Phase 0 Considerations

### Current State (Sprint 0.1)

- ✅ Pipeline configured
- ⏭️ No backend code yet (tests will be skipped)
- ⏭️ No frontend code yet (tests will be skipped)
- ✅ Documentation checks active

### Expected Behavior

In Phase 0, the pipeline will:
- ✅ Pass even with no code (infrastructure validation)
- ⏭️ Skip tests for non-existent components
- ✅ Validate project structure
- ✅ Check documentation
- ✅ Run security scans on configs

As code is added (Sprint 0.2+):
- Tests will start executing
- Coverage requirements will be enforced
- Quality gates will become stricter

---

## Continuous Improvement

### Planned Enhancements

#### Phase 1
- [ ] Add E2E tests with Playwright
- [ ] Performance testing
- [ ] Visual regression testing
- [ ] Mobile app CI/CD

#### Phase 2
- [ ] Deployment pipelines (staging/production)
- [ ] Database migration testing
- [ ] Load testing
- [ ] Automated rollback

#### Phase 3
- [ ] Multi-environment deployments
- [ ] Canary deployments
- [ ] A/B testing infrastructure
- [ ] Advanced monitoring

---

## Metrics & Monitoring

### Pipeline Metrics

Track these metrics monthly:

| Metric | Target |
|--------|--------|
| Pipeline success rate | > 95% |
| Average duration | < 10 min |
| Test flakiness | < 1% |
| Security issues found | Trend down |
| Coverage trend | Trend up |

### Dashboard

View pipeline metrics at:
- GitHub Actions Insights
- Codecov dashboard (when integrated)
- GitHub Security tab

---

## Support & Escalation

### For Pipeline Issues

1. Check workflow logs in GitHub Actions
2. Review this documentation
3. Contact DevOps engineer
4. Escalate to Engineering Lead if blocking

### For Security Issues

1. Never commit secrets
2. Report security findings immediately
3. Create private security advisory if needed
4. Follow incident response plan

---

## Compliance

### TDD Compliance

The CI/CD pipeline enforces TDD practices:
- ✅ Test coverage ≥80% required
- ✅ All tests must pass
- ✅ No code merges without tests

### Security Compliance

The pipeline enforces security standards:
- ✅ No hardcoded secrets
- ✅ Dependency vulnerability scanning
- ✅ Static code analysis
- ✅ License compliance

### Kenya Data Protection Act

Security scans help ensure:
- ✅ No data leaks in code
- ✅ No exposed credentials
- ✅ Secure coding practices

---

## Appendix

### A. Workflow YAML Locations

- Main CI/CD: `.github/workflows/ci.yml`
- Security: `.github/workflows/security.yml`
- Markdown lint config: `.markdownlint.json`
- Git ignore: `.gitignore`

### B. Required Secrets

None required for Phase 0. Future phases may need:
- `CODECOV_TOKEN` (for Codecov integration)
- `AWS_ACCESS_KEY_ID` (for deployments)
- `AWS_SECRET_ACCESS_KEY` (for deployments)

### C. Badge URLs

Add to README.md:

```markdown
[![CI/CD](https://github.com/nexora-africa-ltd/vitora/actions/workflows/ci.yml/badge.svg)](https://github.com/nexora-africa-ltd/vitora/actions/workflows/ci.yml)
[![Security](https://github.com/nexora-africa-ltd/vitora/actions/workflows/security.yml/badge.svg)](https://github.com/nexora-africa-ltd/vitora/actions/workflows/security.yml)
[![codecov](https://codecov.io/gh/nexora-africa-ltd/vitora/branch/main/graph/badge.svg)](https://codecov.io/gh/nexora-africa-ltd/vitora)
```

---

**Document Status**: APPROVED
**Next Action**: Begin Sprint 0.1 Task 6 (Install testing tools)
**Document Owner**: DevOps Engineer
**Last Updated**: December 27, 2025
