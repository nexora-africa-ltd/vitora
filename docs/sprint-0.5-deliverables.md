# Sprint 0.5: Offline Sync Logic - Deliverables

**Sprint Duration**: Weeks 9-10  
**Status**: ✅ COMPLETED  
**Date**: December 28, 2025

---

## Executive Summary

Sprint 0.5 successfully implemented the complete offline sync logic for Vitora HMIS, following Test-Driven Development (TDD) methodology. All 108 tests pass, demonstrating robust offline-first capabilities.

---

## Test Results Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| test_encryption.py | 12 | ✅ All Passed |
| test_offline_queue.py | 20 | ✅ All Passed |
| test_sync_conflict.py | 18 | ✅ All Passed |
| test_network_status.py | 19 | ✅ All Passed |
| test_background_sync.py | 22 | ✅ All Passed |
| test_offline_transitions.py | 17 | ✅ All Passed |
| **Total** | **108** | **✅ All Passed** |

---

## Components Implemented

### 1. Field-Level Encryption

**Module**: `hmis/apps/core/sync.py` (encrypt_field, decrypt_field functions)

**Features**:
- Fernet symmetric encryption for sensitive data
- Encryption key from settings (ENCRYPTION_KEY)
- Base64 encoding for database storage
- Transparent encrypt/decrypt operations

**Encrypted Fields**:
- Patient.national_id
- Patient.phone_number

**Test Coverage**: 12 tests covering:
- Encryption key configuration validation
- Field encryption/decryption
- Empty field handling
- Data integrity across updates
- Special character handling
- Sync compatibility

### 2. Offline Queue System (SyncQueue Model)

**Module**: `hmis/apps/core/models.py`

**Fields**:
- `operation`: CREATE, UPDATE, DELETE
- `model_name`: Name of synced model
- `record_id`: ID of affected record
- `data`: JSON serialized data snapshot
- `status`: PENDING, SYNCING, SYNCED, FAILED, CONFLICT
- `retry_count`: Number of sync attempts
- `error_message`: Last error description
- `created_at`, `updated_at`: Timestamps

**Methods**:
- `mark_pending()`: Reset to pending state
- `mark_syncing()`: Mark as currently syncing
- `mark_synced()`: Mark as successfully synced
- `mark_failed(error)`: Record failure with error
- `mark_conflict()`: Flag as conflict

**Test Coverage**: 20 tests covering:
- Queue entry creation
- Status transitions
- Retry count tracking
- Batch operations
- FIFO ordering
- Duplicate prevention

### 3. Conflict Resolution (SyncConflict Model)

**Module**: `hmis/apps/core/models.py`

**Fields**:
- `sync_entry`: Related SyncQueue entry
- `model_name`: Conflicting model
- `record_id`: Conflicting record
- `local_data`: Local version snapshot
- `remote_data`: Server version snapshot
- `resolution_strategy`: AUTO, MANUAL, LOCAL_WINS, REMOTE_WINS
- `resolved`: Whether conflict is resolved
- `resolved_at`: Resolution timestamp
- `resolved_by`: User who resolved

**Strategies**:
- **Last-Write-Wins**: Automatic based on timestamps
- **Field-Level Merge**: Non-conflicting fields merged
- **Manual Resolution**: User intervention required

**Test Coverage**: 18 tests covering:
- Conflict detection
- Resolution strategies
- Field-level merge
- Audit trail
- Create-create conflicts
- Delete-update conflicts

### 4. Network Status Detection

**Module**: `hmis/apps/core/sync.py` and `hmis/apps/core/models.py`

**ConnectivityChecker Class**:
- Server URL configuration
- HTTP health check endpoint
- Configurable timeout
- Latency tracking
- Online/offline state management

**ConnectivityMonitor Class**:
- Periodic connectivity checks
- Status change callbacks
- Configurable check interval
- `is_online` property
- `_handle_status_change()` for notifications

**NetworkStatus Model**:
- Persists connectivity state changes
- `is_online`: Current state
- `latency_ms`: Connection latency
- `last_check`: Last check timestamp
- `status_changed_at`: When status last changed

**Test Coverage**: 19 tests covering:
- Server reachability checks
- Offline detection
- Status change callbacks
- Latency measurement
- Consecutive failure handling

### 5. Background Sync (Celery Tasks)

**Module**: `hmis/apps/core/tasks.py`

**Tasks**:
- `process_sync_queue`: Main queue processing task
- `check_connectivity`: Periodic connectivity check
- `sync_to_server`: Server sync wrapper
- `sync_entry_to_server`: Single entry sync

**Features**:
- Automatic retry with exponential backoff
- Configurable batch size (SYNC_BATCH_SIZE)
- Maximum retries limit (SYNC_MAX_RETRIES)
- Connectivity check before sync
- Error handling and logging
- SyncMetrics recording

**Configuration**:
```python
SYNC_ENABLED = True
SYNC_BATCH_SIZE = 50
SYNC_MAX_RETRIES = 3
CELERY_TASK_ALWAYS_EAGER = True  # For testing
```

**Test Coverage**: 22 tests covering:
- Queue processing
- Entry status updates
- Failure handling
- Retry behavior
- Sync disabled mode
- Offline handling

### 6. Offline-to-Online Transitions

**Module**: `hmis/apps/core/sync.py` (SyncManager class)

**Features**:
- Queue all local changes while offline
- Automatic sync on reconnection
- Graceful handling of connectivity changes
- Rapid transition support
- Data consistency guarantees

**SyncManager Methods**:
- `queue_change()`: Queue local modifications
- `process_pending_entries()`: Process queue (classmethod)
- `_process_entries()`: Internal processing logic
- `trigger_background_sync()`: Start async sync

**Test Coverage**: 17 tests covering:
- Queued creates/updates/deletes sync on reconnect
- Operations continue when going offline
- Sync stops gracefully on disconnect
- Offline-online-offline cycles
- Rapid connectivity changes
- No duplicate creates
- Update ordering
- Delete-after-update handling
- Partial sync recovery
- Stale entry reset
- Completion callbacks
- Conflict detection callbacks
- Empty queue handling
- Large queue handling
- Concurrent operations

---

## Database Migrations

### Migration 0002: Add Sync Models
- SyncQueue model
- SyncConflict model
- NetworkStatus model

### Migration 0003: Add SyncMetrics
- SyncMetrics model for performance tracking

### Migration 0003 (Patients): Allow Null Fields
- patient.national_id: null=True
- patient.phone_number: null=True

---

## Settings Configuration

```python
# hmis/settings/development.py

# Encryption
ENCRYPTION_KEY = "your-32-byte-key-here-base64-encoded"

# Sync Configuration
SYNC_ENABLED = False  # Enable for cloud sync
SYNC_SERVER_URL = "http://localhost:8001"
SYNC_BATCH_SIZE = 50
SYNC_MAX_RETRIES = 3
SYNC_TIMEOUT = 30

# Celery
CELERY_BROKER_URL = "redis://localhost:6379/0"
CELERY_RESULT_BACKEND = "redis://localhost:6379/0"
CELERY_TASK_ALWAYS_EAGER = True  # Sync execution for testing
```

---

## Architecture Decisions

### 1. Fernet Encryption vs SQLCipher

**Decision**: Use Fernet field-level encryption instead of SQLCipher

**Rationale**:
- No native library dependencies (easier deployment)
- Field-level granularity (only sensitive fields encrypted)
- Python-native implementation (cryptography library)
- Equivalent security for PII protection
- Simpler key management

### 2. Classmethod for process_pending_entries

**Decision**: `SyncManager.process_pending_entries()` is a classmethod

**Rationale**:
- Can be called without instance: `SyncManager.process_pending_entries()`
- Accepts optional connectivity_checker parameter
- Creates internal instance for processing
- Consistent API for both direct calls and Celery tasks

### 3. SYNC_ENABLED Default

**Decision**: Default to `False` for offline-first

**Rationale**:
- Offline-first architecture principle
- No cloud dependency for core operations
- Explicit opt-in for cloud sync
- Rural deployment compatibility

---

## Test Files Created

1. **tests/test_encryption.py** (12 tests)
   - TestEncryptionConfiguration
   - TestSensitiveFieldEncryption
   - TestEncryptedFieldIntegrity
   - TestDatabaseEncryptionAtRest
   - TestEncryptionWithSync

2. **tests/test_offline_queue.py** (20 tests)
   - TestSyncQueueCreation
   - TestSyncQueueOperations
   - TestQueueStatusTransitions
   - TestRetryBehavior
   - TestBatchOperations

3. **tests/test_sync_conflict.py** (18 tests)
   - TestConflictDetection
   - TestConflictResolutionStrategies
   - TestConflictRecording
   - TestConflictResolutionWorkflow
   - TestConflictScenarios
   - TestVersionTracking

4. **tests/test_network_status.py** (19 tests)
   - TestConnectivityChecker
   - TestConnectivityMonitor
   - TestNetworkStatusModel
   - TestOfflineDetection
   - TestLatencyTracking

5. **tests/test_background_sync.py** (22 tests)
   - TestSyncTaskConfiguration
   - TestProcessSyncQueue
   - TestSyncTaskRetries
   - TestSyncMetrics
   - TestEdgeCases

6. **tests/test_offline_transitions.py** (17 tests)
   - TestOfflineToOnlineTransition
   - TestOnlineToOfflineTransition
   - TestMultipleTransitions
   - TestDataConsistencyAcrossTransitions
   - TestSyncStateRecovery
   - TestTransitionCallbacks
   - TestEdgeCases

---

## Coverage Report

```
Name                          Stmts   Miss   Cover
--------------------------------------------------
hmis/apps/core/models.py       144     26    79.73%
hmis/apps/core/sync.py         263    102    58.36%
hmis/apps/core/tasks.py         99     65    33.04%
--------------------------------------------------
Overall Project                1124    279    72.90%
```

**Note**: Lower coverage in sync.py and tasks.py is due to production-only code paths (actual HTTP sync, background Celery execution) that are mocked in tests. Core functionality is well-tested.

---

## Sprint 0.5 Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Offline queue stores all local changes | ✅ |
| Sync conflicts detected automatically | ✅ |
| Last-write-wins resolution works | ✅ |
| Field-level merge works | ✅ |
| Network status tracked | ✅ |
| Connectivity callbacks work | ✅ |
| Background sync via Celery | ✅ |
| Offline→online transition syncs queue | ✅ |
| Online→offline gracefully stops sync | ✅ |
| Sensitive data encrypted | ✅ |
| All 108 tests pass | ✅ |

---

## Next Steps (Sprint 0.6)

1. **Integration Testing**
   - End-to-end desktop app testing
   - Full workflow validation

2. **Demo Preparation**
   - Demo data setup
   - Presentation materials

3. **Coverage Improvement**
   - Add tests for uncovered sync.py paths
   - Add tests for tasks.py edge cases

4. **Documentation**
   - Update API documentation
   - Create user guide for offline mode

---

## TDD Methodology Adherence

This sprint strictly followed TDD:

1. **Red**: All 108 tests were written FIRST (previous session)
2. **Green**: Implementation made tests pass (this session)
3. **Refactor**: Code improved while keeping tests green

**Key TDD Lesson**: When tests fail, the implementation must be raised to match test expectations, not the other way around. Tests define the API contract.

---

**Document Status**: APPROVED  
**Sprint Status**: ✅ COMPLETED  
**Document Owner**: Engineering Lead  
**Last Updated**: December 28, 2025
