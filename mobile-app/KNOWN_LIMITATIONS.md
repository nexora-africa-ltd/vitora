# Vitora HMIS Mobile App - Known Limitations

**Version**: 0.1.0 (Sprint 1.1-1.2)
**Last Updated**: December 31, 2025

---

## Overview

This document outlines the known limitations, constraints, and planned improvements for the Vitora HMIS mobile application. These limitations are tracked and prioritized for future sprints.

---

## 🔴 Critical Limitations

### 1. Android Only (iOS Not Supported)

**Description**: The current release targets Android devices only.

**Impact**: iOS users cannot use the application.

**Reason**:
- Focus on Android due to higher market share in Kenya (~85%)
- WatermelonDB requires additional iOS configuration
- Resource constraints in Phase 1

**Workaround**: None available.

**Planned Resolution**: Sprint 2.1 (Q3 2026)

---

### 2. Initial Login Requires Internet

**Description**: Users must have internet connectivity for their first login to authenticate and download initial data.

**Impact**: New users in offline areas cannot start using the app immediately.

**Reason**:
- JWT authentication requires server verification
- Initial county/sub-county/ward data must be downloaded
- Security requirement to validate user credentials

**Workaround**:
- Login once with internet before going to field
- Pre-authenticate on clinic WiFi before rural visits

**Planned Resolution**: Sprint 2.2 - Offline PIN authentication after initial login

---

### 3. No Real-Time Sync

**Description**: Data synchronization is manual/triggered, not automatic.

**Impact**: Users must remember to sync when online.

**Reason**:
- Battery optimization concerns
- Network cost considerations for users
- Simpler initial architecture

**Workaround**:
- Sync indicator shows pending changes
- Pull-to-refresh triggers sync attempt

**Planned Resolution**: Sprint 1.3 - Background sync with configurable intervals

---

## 🟡 Moderate Limitations

### 4. Last-Write-Wins Conflict Resolution

**Description**: When the same patient is edited on multiple devices offline, only the most recent change is preserved.

**Impact**: Earlier offline edits may be lost during sync.

**Reason**:
- Simpler initial implementation
- Field-level merge requires significant complexity
- Most real-world usage is single-CHW per patient

**Workaround**:
- Assign patients to specific CHWs
- Sync frequently when online
- Review sync conflicts in Settings

**Planned Resolution**: Sprint 2.1 - Field-level conflict resolution with UI

---

### 5. No Patient Photos

**Description**: Patient photographs cannot be captured or stored.

**Impact**: Visual patient identification not available.

**Reason**:
- Image storage increases database size significantly
- Sync bandwidth concerns
- Privacy and consent considerations

**Workaround**: Use other identifying information (MRN, national ID).

**Planned Resolution**: Sprint 2.2 - Optional patient photos with compression

---

### 6. No Encounter Management

**Description**: Clinical encounters (visits, vitals, diagnoses) are not yet supported in mobile.

**Impact**: CHWs cannot record clinical data in the field.

**Reason**: Mobile foundation sprint focused on patient registry.

**Workaround**: Record encounters on desktop app when back at clinic.

**Planned Resolution**: Sprint 1.3-1.4 - Mobile encounter management

---

### 7. Single Language (English Only)

**Description**: UI is only available in English.

**Impact**: Non-English speakers may have difficulty using the app.

**Reason**: Initial development priority on functionality.

**Workaround**: None available.

**Planned Resolution**: Sprint 2.3 - Swahili localization

---

## 🟢 Minor Limitations

### 8. Static Kenya Location Data

**Description**: County, sub-county, and ward data is pre-loaded and not dynamically updated.

**Impact**: New administrative units won't appear until app update.

**Reason**:
- Kenya administrative boundaries rarely change
- Reduces sync complexity
- Smaller app footprint

**Workaround**: App updates will include location data updates.

**Planned Resolution**: Not prioritized (stable data)

---

### 9. Limited Patient Search

**Description**: Search is limited to name, MRN, and phone number.

**Impact**: Cannot search by national ID or date of birth.

**Reason**: Index optimization for SQLite performance.

**Workaround**: Use available search fields.

**Planned Resolution**: Sprint 1.4 - Extended search fields

---

### 10. No Data Export

**Description**: Patient data cannot be exported to CSV/PDF from mobile.

**Impact**: Reports must be generated from desktop/web.

**Reason**: Mobile-first, sync-to-backend architecture.

**Workaround**: Export from desktop application or web portal.

**Planned Resolution**: Sprint 2.4 - Mobile reports

---

## 📊 Performance Constraints

### Database Limits

| Constraint | Limit | Impact |
|------------|-------|--------|
| Offline patients | ~10,000 | Performance degrades beyond |
| Sync queue | 1,000 operations | Older queued items may be lost |
| Search results | 100 per page | Pagination required |
| Patient name | 100 characters | Truncation for long names |

### Device Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Android Version | 7.0 (API 24) | 10.0+ (API 29+) |
| RAM | 2GB | 4GB+ |
| Storage | 100MB free | 500MB+ free |
| Screen | 4.5" | 5.5"+ |

### Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| App startup | <3 seconds | Cold start |
| Patient list load | <500ms | 100 patients |
| Search response | <200ms | Local search |
| Sync per record | <1 second | Per patient |

---

## 🔒 Security Considerations

### Token Storage
- Access tokens stored in expo-secure-store (encrypted)
- Tokens cleared on logout
- No biometric unlock (planned for v0.3.0)

### Data Protection
- Local database not encrypted (planned for v0.2.0)
- Sensitive fields (national_id, phone) stored as-is locally
- Server-side encryption maintained

### Network Security
- HTTPS required for production
- No certificate pinning (planned)
- Bearer token authentication

---

## 🐛 Known Bugs

### High Priority

1. **Network status sometimes incorrect**
   - Issue: Offline banner may show briefly on reconnect
   - Status: Under investigation
   - Workaround: Wait 2-3 seconds for accurate status

### Medium Priority

2. **Form loses data on orientation change**
   - Issue: Patient form clears on device rotation
   - Status: Fix in progress
   - Workaround: Lock device orientation

3. **Search clears on tab switch**
   - Issue: Navigating away loses search query
   - Status: Planned for Sprint 1.3
   - Workaround: Re-enter search query

### Low Priority

4. **Splash screen flicker on some devices**
   - Issue: Brief white flash after splash
   - Status: Known Expo issue
   - Workaround: None needed (cosmetic)

---

## 📝 Feedback

Report issues or limitations to: mobile-feedback@vitora.ke

Or create an issue on GitHub: https://github.com/nexora-africa-ltd/vitora/issues

---

## 📅 Planned Improvements Timeline

| Feature | Target Sprint | Target Date |
|---------|---------------|-------------|
| Real-time sync | 1.3 | June 2026 |
| Encounter management | 1.3-1.4 | June-July 2026 |
| Conflict resolution UI | 2.1 | August 2026 |
| iOS support | 2.1 | August 2026 |
| Patient photos | 2.2 | September 2026 |
| Swahili localization | 2.3 | October 2026 |
| Offline PIN auth | 2.2 | September 2026 |
| Database encryption | 0.2.0 | July 2026 |

---

*This document is updated with each sprint release.*
