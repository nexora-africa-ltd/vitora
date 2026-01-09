# Stock Alerts E2E Test Report

**Date:** January 10, 2026  
**Test File:** `web-app/e2e/pharmacy/alerts.spec.ts`  
**Browser:** Chromium  
**Duration:** ~2.0 minutes

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total Tests** | 39 |
| **Passed** | 6 (15%) |
| **Failed** | 33 (85%) |
| **Test Suites** | 8 |

---

## Test Results by Category

### ✅ Passing Tests (6)

| Test Suite | Test Name |
|------------|-----------|
| Panel View | should display alerts tab on pharmacy page |
| Panel View | should show unresolved alert count badge |
| Panel View | should display alert severity |
| Panel View | should display alert message |
| Acknowledge | should have acknowledge button for unacknowledged alerts |
| Acknowledge | should acknowledge alert on click |

---

## ❌ Failure Analysis by Category

### Category 1: Panel View Display Issues (4 failures)

**Root Cause:** Alert items missing required `data-testid`, drug names not displayed, batch numbers missing, timestamps not shown

| Test | Expected Element | Error |
|------|------------------|-------|
| should display alert list | `[data-testid="alerts-panel"]` with alert types | Text "out of stock" not found |
| should display alert type | Text "out of stock", "expiring soon", "low stock" | Not all types visible |
| should color-code alerts by severity | `[data-testid="alert-item"]` with class `critical` | No data-testid on alert items |
| should display drug name in alert | Text "metformin", "paracetamol" | Drug names not shown |
| should display batch number for batch-specific alerts | Text "BATCH-2025-010" | Batch number not displayed |
| should show alert creation timestamp | Text with date (jan/january/2026) | Timestamp not shown |

**Resolution:**

```tsx
// In AlertsPanel or alert-item component:

<div 
  data-testid="alert-item"
  className={cn(
    "p-4 rounded-lg border",
    alert.severity === 'CRITICAL' && "critical bg-red-50 border-red-200",
    alert.severity === 'HIGH' && "high bg-orange-50 border-orange-200",
    alert.severity === 'MEDIUM' && "medium bg-yellow-50 border-yellow-200",
    alert.severity === 'LOW' && "low bg-blue-50 border-blue-200"
  )}
>
  {/* Alert Type */}
  <Badge>{formatAlertType(alert.alert_type)}</Badge>
  {/* LOW_STOCK -> "Low Stock", OUT_OF_STOCK -> "Out of Stock", etc. */}
  
  {/* Severity */}
  <Badge variant={getSeverityVariant(alert.severity)}>
    {alert.severity}
  </Badge>
  
  {/* Drug Name */}
  <p className="font-medium">{alert.drug_name}</p>
  
  {/* Message */}
  <p>{alert.message}</p>
  
  {/* Batch Number (if applicable) */}
  {alert.batch_number && (
    <p className="text-sm text-muted-foreground">
      Batch: {alert.batch_number}
    </p>
  )}
  
  {/* Creation Timestamp */}
  <p className="text-xs text-muted-foreground">
    Created: {format(new Date(alert.created_at), 'MMM d, yyyy HH:mm')}
  </p>
</div>
```

---

### Category 2: Filtering Issues (6 failures)

**Root Cause:** No filter controls for alert type, severity, or resolved status

| Test | Expected Element |
|------|------------------|
| should filter by alert type | Combobox with name "type" or `data-testid="alert-type-filter"` |
| should filter by severity | Combobox with name "severity" or `data-testid="severity-filter"` |
| should toggle resolved/unresolved alerts | Checkbox/switch for resolved or `data-testid="resolved-toggle"` |
| should have quick filter for low stock alerts | Button "Low Stock" or `data-testid="low-stock-filter"` |
| should have quick filter for expiring alerts | Button "Expiring" or `data-testid="expiring-filter"` |
| should filter to show only critical alerts | Severity filter works to show only critical |

**Resolution:**

```tsx
// Add filter controls to AlertsPanel:

const [alertType, setAlertType] = useState<string>('all');
const [severity, setSeverity] = useState<string>('all');
const [showResolved, setShowResolved] = useState(false);

<div className="flex gap-4 mb-4 flex-wrap">
  {/* Alert Type Filter */}
  <div>
    <Label htmlFor="alert-type">Type</Label>
    <Select 
      value={alertType} 
      onValueChange={setAlertType}
      data-testid="alert-type-filter"
    >
      <SelectTrigger id="alert-type" aria-label="Type">
        <SelectValue placeholder="All Types" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Types</SelectItem>
        <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
        <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
        <SelectItem value="EXPIRING_SOON">Expiring Soon</SelectItem>
        <SelectItem value="EXPIRING_CRITICAL">Expiring Critical</SelectItem>
        <SelectItem value="EXPIRED">Expired</SelectItem>
        <SelectItem value="RECALLED">Recalled</SelectItem>
      </SelectContent>
    </Select>
  </div>
  
  {/* Severity Filter */}
  <div>
    <Label htmlFor="severity">Severity</Label>
    <Select 
      value={severity} 
      onValueChange={setSeverity}
      data-testid="severity-filter"
    >
      <SelectTrigger id="severity" aria-label="Severity">
        <SelectValue placeholder="All Severities" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Severities</SelectItem>
        <SelectItem value="CRITICAL">Critical</SelectItem>
        <SelectItem value="HIGH">High</SelectItem>
        <SelectItem value="MEDIUM">Medium</SelectItem>
        <SelectItem value="LOW">Low</SelectItem>
      </SelectContent>
    </Select>
  </div>
  
  {/* Resolved Toggle */}
  <div className="flex items-center gap-2">
    <Switch 
      id="show-resolved"
      checked={showResolved}
      onCheckedChange={setShowResolved}
      data-testid="resolved-toggle"
      aria-label="Show Resolved"
    />
    <Label htmlFor="show-resolved">Show Resolved</Label>
  </div>
  
  {/* Quick Filters */}
  <Button 
    variant={alertType === 'LOW_STOCK' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setAlertType('LOW_STOCK')}
    data-testid="low-stock-filter"
  >
    Low Stock
  </Button>
  
  <Button 
    variant={alertType.includes('EXPIRING') ? 'default' : 'outline'}
    size="sm"
    onClick={() => setAlertType('EXPIRING_SOON')}
    data-testid="expiring-filter"
  >
    Expiring
  </Button>
</div>
```

---

### Category 3: Acknowledge Flow Issues (3 failures)

**Root Cause:** Acknowledged alerts don't show who acknowledged them or when, and acknowledged alerts still show acknowledge button

| Test | Expected Behavior |
|------|-------------------|
| should show acknowledged by user | Text "Acknowledged by [user]" or "admin.user" |
| should show acknowledged timestamp | Text "Acknowledged at" with date |
| should disable acknowledge button for already acknowledged alerts | Button disabled or hidden |

**Note:** One test has a code error: `acknowledgeButton.not.toBeVisible()` should be `expect(acknowledgeButton).not.toBeVisible()`

**Resolution:**

```tsx
// In alert item component:

{/* Acknowledge Status */}
{alert.acknowledged ? (
  <div className="text-sm text-muted-foreground">
    <p>Acknowledged by: {alert.acknowledged_by_name || 'Admin User'}</p>
    <p>Acknowledged at: {format(new Date(alert.acknowledged_at), 'MMM d, yyyy HH:mm')}</p>
  </div>
) : (
  <Button 
    variant="outline" 
    size="sm"
    onClick={() => handleAcknowledge(alert.id)}
    data-testid="acknowledge-button"
  >
    Acknowledge
  </Button>
)}

// Fix test code line 234:
// ❌ Current:
await expect(acknowledgeButton).toBeDisabled().or(acknowledgeButton.not.toBeVisible());
// ✅ Should be:
await expect(acknowledgeButton).not.toBeVisible();
```

---

### Category 4: Resolve Flow Issues (5 failures)

**Root Cause:** Resolve button not found, resolve dialog not implemented, resolved toggle not working

| Test | Expected Behavior |
|------|-------------------|
| should have resolve button for alerts | Resolve button on each alert item |
| should open resolve dialog with notes field | Dialog with resolution notes field |
| should resolve alert with notes | Submit resolution with notes |
| should remove resolved alerts from default view | Resolved alerts hidden by default |
| should show resolved alerts when filter toggled | Toggle shows resolved alerts |

**Resolution:**

```tsx
// 1. Add resolve button to alert items:
<Button 
  variant="outline" 
  size="sm"
  onClick={() => setResolveAlert(alert)}
  data-testid="resolve-button"
>
  Resolve
</Button>

// 2. Create ResolveAlertDialog:
export function ResolveAlertDialog({ alert, open, onOpenChange, onResolve }) {
  const [notes, setNotes] = useState('');
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve Alert</DialogTitle>
        </DialogHeader>
        
        <div>
          <p className="mb-4">{alert?.message}</p>
          
          <div>
            <Label htmlFor="resolution-notes">Resolution Notes</Label>
            <Textarea 
              id="resolution-notes"
              aria-label="Resolution Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter resolution details..."
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onResolve(alert.id, notes)}>
            Confirm Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 3. Filter resolved alerts by default:
const filteredAlerts = alerts.filter(a => showResolved || !a.resolved);
```

---

### Category 5: Navigation/Quick Actions (4 failures)

**Root Cause:** No clickable links to drug/batch pages, no quick action buttons for common tasks

| Test | Expected Element |
|------|------------------|
| should navigate to drug when clicking drug name | Link to drug or "View Drug" button |
| should navigate to batch when clicking batch number | Link to batch or "View Batch" button |
| should have quick action to reorder stock for low stock alerts | "Reorder" button or `data-testid="reorder-button"` |
| should have quick action to view expiring batches | "View Batch" or "Manage" button |

**Resolution:**

```tsx
// Make drug name clickable:
<Link href={`/pharmacy/drugs/${alert.drug}`} className="font-medium hover:underline">
  {alert.drug_name}
</Link>

// Make batch number clickable:
{alert.batch_number && (
  <Link 
    href={`/pharmacy/stock/${alert.stock_batch}`} 
    className="text-sm hover:underline"
  >
    Batch: {alert.batch_number}
  </Link>
)}

// Quick actions based on alert type:
{(alert.alert_type === 'LOW_STOCK' || alert.alert_type === 'OUT_OF_STOCK') && (
  <Button 
    variant="outline" 
    size="sm"
    onClick={() => router.push(`/pharmacy/stock/receive?drug=${alert.drug}`)}
    data-testid="reorder-button"
  >
    <Package className="h-4 w-4 mr-1" />
    Reorder
  </Button>
)}

{alert.alert_type.includes('EXPIRING') && (
  <Button 
    variant="outline" 
    size="sm"
    onClick={() => router.push(`/pharmacy/stock/${alert.stock_batch}`)}
    data-testid="view-batch-button"
  >
    View Batch
  </Button>
)}
```

---

### Category 6: Dashboard Widget Issues (3 failures)

**Root Cause:** No alerts summary widget on pharmacy dashboard

| Test | Expected Element |
|------|------------------|
| should show critical alerts on pharmacy dashboard | `[data-testid="alerts-widget"]` or `.alerts-summary` |
| should show alert count summary | Text like "3 Critical" or "Critical 3" |
| should link to full alerts view | "View All" or "See All" link |

**Resolution:**

```tsx
// Create AlertsSummaryWidget component:

export function AlertsSummaryWidget({ alerts }: Props) {
  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL' && !a.resolved).length;
  const highCount = alerts.filter(a => a.severity === 'HIGH' && !a.resolved).length;
  
  return (
    <div data-testid="alerts-widget" className="alerts-summary p-4 rounded-lg border">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">Stock Alerts</h3>
        <Link href="/pharmacy?tab=alerts">
          <Button variant="link" size="sm">
            View All
          </Button>
        </Link>
      </div>
      
      <div className="space-y-2">
        {criticalCount > 0 && (
          <div className="flex justify-between items-center">
            <Badge variant="destructive">Critical</Badge>
            <span>{criticalCount}</span>
          </div>
        )}
        
        {highCount > 0 && (
          <div className="flex justify-between items-center">
            <Badge className="bg-orange-500">High</Badge>
            <span>{highCount}</span>
          </div>
        )}
      </div>
      
      {/* Recent critical alerts */}
      {alerts.filter(a => a.severity === 'CRITICAL').slice(0, 3).map(alert => (
        <div key={alert.id} className="text-sm mt-2 p-2 bg-red-50 rounded">
          {alert.drug_name}: {alert.message}
        </div>
      ))}
    </div>
  );
}
```

---

### Category 7: Auto-Generation Indicators (3 failures)

**Root Cause:** No indication of auto-generated vs manual alerts, no refresh functionality

| Test | Expected Element |
|------|------------------|
| should indicate auto-generated alerts | Text "auto" or "system" or "generated" |
| should have refresh alerts button | "Refresh" or "Regenerate" button |
| should show last refresh timestamp | Text "Last updated" or "Refreshed" |

**Resolution:**

```tsx
// Add to AlertsPanel header:

<div className="flex justify-between items-center mb-4">
  <div>
    <h2 className="text-lg font-semibold">Stock Alerts</h2>
    <p className="text-sm text-muted-foreground">
      Last updated: {format(lastRefresh, 'MMM d, yyyy HH:mm')}
    </p>
  </div>
  
  <Button 
    variant="outline" 
    size="sm"
    onClick={handleRefreshAlerts}
    data-testid="refresh-alerts-button"
  >
    <RefreshCw className="h-4 w-4 mr-2" />
    Refresh
  </Button>
</div>

// In alert items, indicate if system-generated:
{!alert.created_by && (
  <Badge variant="secondary" className="text-xs">
    Auto-generated
  </Badge>
)}
```

---

### Category 8: Alert Settings (3 failures)

**Root Cause:** No settings panel for configuring alert thresholds

| Test | Expected Element |
|------|------------------|
| should have alert settings button | "Settings" or "Configure" button |
| should configure expiry warning days | Input for expiry warning days |
| should configure low stock threshold | Input for stock threshold |

**Resolution:**

```tsx
// 1. Add settings button to AlertsPanel:
<Button 
  variant="outline" 
  size="sm"
  onClick={() => setShowSettings(true)}
  data-testid="alert-settings-button"
>
  <Settings className="h-4 w-4 mr-2" />
  Settings
</Button>

// 2. Create AlertSettingsDialog:
export function AlertSettingsDialog({ open, onOpenChange, settings, onSave }) {
  const [expiryDays, setExpiryDays] = useState(settings.expiryWarningDays || 90);
  const [stockThreshold, setStockThreshold] = useState(settings.lowStockThreshold || 10);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alert Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Expiry Warning Days */}
          <div>
            <Label htmlFor="expiry-days">Expiry Warning Days</Label>
            <Input 
              id="expiry-days"
              type="number"
              aria-label="Expiry Warning Days"
              value={expiryDays}
              onChange={(e) => setExpiryDays(+e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Alert when stock expires within this many days
            </p>
          </div>
          
          {/* Low Stock Threshold */}
          <div>
            <Label htmlFor="stock-threshold">Low Stock Threshold</Label>
            <Input 
              id="stock-threshold"
              type="number"
              aria-label="Stock Threshold"
              value={stockThreshold}
              onChange={(e) => setStockThreshold(+e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Alert when stock falls below this level (or reorder level)
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave({ expiryDays, stockThreshold })}>
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Priority Implementation Plan

### 🔴 High Priority (Core Functionality)

1. **Alert Item Display** (4 tests) - Show drug names, batch numbers, timestamps
2. **Resolve Flow** (5 tests) - Core workflow for handling alerts
3. **Filtering** (6 tests) - Essential for managing alert volume

### 🟡 Medium Priority (Important UX)

4. **Acknowledge Details** (3 tests) - Audit trail for acknowledged alerts
5. **Navigation/Quick Actions** (4 tests) - Workflow efficiency
6. **Dashboard Widget** (3 tests) - Visibility of critical alerts

### 🟢 Lower Priority (Enhancements)

7. **Auto-Generation Indicators** (3 tests) - Nice to have
8. **Alert Settings** (3 tests) - Admin configuration

---

## Implementation Checklist

### Alert Item Display
- [ ] Add `data-testid="alert-item"` to each alert card
- [ ] Add severity-based CSS classes (`critical`, `high`, `medium`, `low`)
- [ ] Display drug name prominently
- [ ] Display batch number for batch-specific alerts
- [ ] Display creation timestamp

### Filtering
- [ ] Add alert type filter (`data-testid="alert-type-filter"`)
- [ ] Add severity filter (`data-testid="severity-filter"`)
- [ ] Add resolved toggle switch (`data-testid="resolved-toggle"`)
- [ ] Add "Low Stock" quick filter button
- [ ] Add "Expiring" quick filter button
- [ ] Implement filter logic

### Acknowledge Flow
- [ ] Display "Acknowledged by" user name
- [ ] Display "Acknowledged at" timestamp
- [ ] Hide acknowledge button for already acknowledged alerts

### Resolve Flow
- [ ] Add resolve button to each alert (`data-testid="resolve-button"`)
- [ ] Create `ResolveAlertDialog` component
- [ ] Add resolution notes field
- [ ] Implement resolve API call
- [ ] Hide resolved alerts by default
- [ ] Show resolved alerts when toggle enabled

### Navigation/Quick Actions
- [ ] Make drug name a clickable link
- [ ] Make batch number a clickable link
- [ ] Add "Reorder" button for low stock alerts
- [ ] Add "View Batch" button for expiring alerts

### Dashboard Widget
- [ ] Create `AlertsSummaryWidget` component
- [ ] Display alert counts by severity
- [ ] Add "View All" link
- [ ] Show recent critical alerts

### Auto-Generation
- [ ] Add "Auto-generated" badge for system alerts
- [ ] Add refresh button
- [ ] Display last refresh timestamp

### Settings
- [ ] Add settings button
- [ ] Create `AlertSettingsDialog` component
- [ ] Add expiry warning days input
- [ ] Add low stock threshold input

---

## Test Code Bugs to Fix 
✅ Completed

**File:** `e2e/pharmacy/alerts.spec.ts`  
**Line:** 234

```typescript
// ❌ Current (broken):
await expect(acknowledgeButton).toBeDisabled().or(acknowledgeButton.not.toBeVisible());

// ✅ Should be:
await expect(acknowledgeButton).not.toBeVisible(); 
```

---

## Files Requiring Changes

| File | Changes Needed |
|------|----------------|
| `components/pharmacy/alerts-panel.tsx` | Add filters, display improvements, actions |
| `components/pharmacy/alert-item.tsx` | Create new - individual alert card component |
| `components/pharmacy/resolve-alert-dialog.tsx` | Create new - resolve workflow |
| `components/pharmacy/alert-settings-dialog.tsx` | Create new - settings configuration |
| `components/pharmacy/alerts-summary-widget.tsx` | Create new - dashboard widget |
| `app/(dashboard)/pharmacy/page.tsx` | Add alerts widget to main view |
| `components/pharmacy/index.ts` | Export new components |
| `e2e/pharmacy/alerts.spec.ts` | Fix test bug on line 234 |

---

## Estimated Effort

| Category | Tests | Est. Hours |
|----------|-------|------------|
| Alert Item Display | 4 | 2-3 |
| Filtering | 6 | 3-4 |
| Resolve Flow | 5 | 3-4 |
| Acknowledge Details | 3 | 1-2 |
| Navigation/Quick Actions | 4 | 2-3 |
| Dashboard Widget | 3 | 2-3 |
| Auto-Generation | 3 | 1-2 |
| Alert Settings | 3 | 2-3 |
| **Total** | **33** | **16-24 hours** |

---

## API Endpoints Required

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/pharmacy/alerts/` | GET | List alerts with filters |
| `GET /api/pharmacy/alerts/{id}/` | GET | Get alert details |
| `POST /api/pharmacy/alerts/{id}/acknowledge/` | POST | Acknowledge alert |
| `POST /api/pharmacy/alerts/{id}/resolve/` | POST | Resolve alert with notes |
| `GET /api/pharmacy/alerts/low_stock/` | GET | Get low stock alerts |
| `GET /api/pharmacy/alerts/expiring/` | GET | Get expiring stock alerts |

---

*Report generated from Playwright test run on January 10, 2026*
