/**
 * TDD Tests for VitalAlertsPanel Component
 *
 * Based on BDD scenarios from: features/triage/triage-alerts.feature
 *
 * Test Categories:
 * 1. Critical Alerts (@critical)
 * 2. Warning Alerts (@warning)
 * 3. Multiple Alerts & Priority (@multiple-alerts, @alert-priority)
 * 4. Alert Panel UI (@alert-panel, @collapse)
 * 5. Acknowledgement (@dismiss, @no-dismiss-critical)
 * 6. No Alerts State (@no-alerts)
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VitalAlertsPanel } from '@/components/triage/vital-alerts-panel';
import type { TriageAlert, AlertSeverity, VitalType } from '@/lib/types/triage';

// =============================================================================
// TEST DATA HELPERS
// =============================================================================

const createAlert = (
  overrides: Partial<TriageAlert> = {}
): TriageAlert => ({
  id: `alert-${Math.random().toString(36).substr(2, 9)}`,
  severity: 'WARNING',
  vital_type: 'SPO2',
  message: 'Test alert',
  value: 93,
  threshold: 95,
  ...overrides,
});

const createCriticalSpO2Alert = (): TriageAlert =>
  createAlert({
    id: 'critical-spo2',
    severity: 'CRITICAL',
    vital_type: 'SPO2',
    message: 'Severe hypoxemia - SpO2 85%',
    value: 85,
    threshold: 90,
    clinical_note: 'Immediate intervention required',
  });

const createWarningSpO2Alert = (): TriageAlert =>
  createAlert({
    id: 'warning-spo2',
    severity: 'WARNING',
    vital_type: 'SPO2',
    message: 'Low oxygen saturation - SpO2 93%',
    value: 93,
    threshold: 95,
    clinical_note: 'Monitor closely, consider supplemental oxygen',
  });

const createCriticalBPAlert = (): TriageAlert =>
  createAlert({
    id: 'critical-bp',
    severity: 'CRITICAL',
    vital_type: 'SYSTOLIC_BP',
    message: 'Severe hypotension - Systolic BP 82 mmHg',
    value: 82,
    threshold: 90,
    clinical_note: 'Risk of organ hypoperfusion',
  });

const createWarningTachycardiaAlert = (): TriageAlert =>
  createAlert({
    id: 'warning-hr',
    severity: 'WARNING',
    vital_type: 'HEART_RATE',
    message: 'Tachycardia - HR 108 bpm',
    value: 108,
    threshold: 100,
  });

// =============================================================================
// CRITICAL ALERTS TESTS
// =============================================================================

describe('VitalAlertsPanel - Critical Alerts', () => {
  describe('@critical @spo2 - Severe hypoxemia alert', () => {
    it('should display critical alert message for SpO2 < 90%', () => {
      const alerts = [createCriticalSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      expect(screen.getByText(/Severe hypoxemia/)).toBeInTheDocument();
      expect(screen.getByText(/SpO2 85%/)).toBeInTheDocument();
    });

    it('should style critical alerts in red', () => {
      const alerts = [createCriticalSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      const alertItem = screen.getByTestId('alert-critical-spo2');
      expect(alertItem).toHaveClass('bg-red-50', 'border-red-200');
    });

    it('should show CRITICAL severity badge', () => {
      const alerts = [createCriticalSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    });
  });

  describe('@critical @hypotension - Severe hypotension alert', () => {
    it('should display critical alert for systolic BP < 90', () => {
      const alerts = [createCriticalBPAlert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      expect(screen.getByText(/Severe hypotension/)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// WARNING ALERTS TESTS
// =============================================================================

describe('VitalAlertsPanel - Warning Alerts', () => {
  describe('@warning @spo2 - Low oxygen saturation warning', () => {
    it('should display warning alert message for SpO2 < 95%', () => {
      const alerts = [createWarningSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      expect(screen.getByText(/Low oxygen saturation/)).toBeInTheDocument();
    });

    it('should style warning alerts in orange/yellow', () => {
      const alerts = [createWarningSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      const alertItem = screen.getByTestId('alert-warning-spo2');
      expect(alertItem).toHaveClass('bg-orange-50', 'border-orange-200');
    });

    it('should show WARNING severity badge', () => {
      const alerts = [createWarningSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      expect(screen.getByText('WARNING')).toBeInTheDocument();
    });
  });

  describe('@warning @heart-rate - Tachycardia warning', () => {
    it('should display warning for heart rate > 100 bpm', () => {
      const alerts = [createWarningTachycardiaAlert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      expect(screen.getByText(/Tachycardia/)).toBeInTheDocument();
      expect(screen.getByText(/108 bpm/)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// MULTIPLE ALERTS & PRIORITY TESTS
// =============================================================================

describe('VitalAlertsPanel - Multiple Alerts', () => {
  describe('@multiple-alerts - Display multiple alerts', () => {
    it('should display all alerts when multiple vitals are abnormal', () => {
      const alerts = [
        createWarningSpO2Alert(),
        createWarningTachycardiaAlert(),
        createAlert({
          id: 'warning-temp',
          severity: 'WARNING',
          vital_type: 'TEMPERATURE',
          message: 'Fever - Temperature 38.9°C',
          value: 38.9,
          threshold: 38.5,
        }),
      ];
      render(<VitalAlertsPanel alerts={alerts} />);

      expect(screen.getByText(/Low oxygen saturation/)).toBeInTheDocument();
      expect(screen.getByText(/Tachycardia/)).toBeInTheDocument();
      expect(screen.getByText(/Fever/)).toBeInTheDocument();
    });

    it('should show correct count in header', () => {
      const alerts = [
        createWarningSpO2Alert(),
        createWarningTachycardiaAlert(),
        createAlert({ id: 'alert-3', message: 'Alert 3' }),
        createAlert({ id: 'alert-4', message: 'Alert 4' }),
      ];
      render(<VitalAlertsPanel alerts={alerts} />);

      expect(screen.getByText(/4 Alerts/)).toBeInTheDocument();
    });
  });

  describe('@alert-priority - Critical alerts before warnings', () => {
    it('should display critical alerts before warning alerts', () => {
      const alerts = [
        createWarningTachycardiaAlert(), // Warning - should be second
        createCriticalSpO2Alert(), // Critical - should be first
      ];
      render(<VitalAlertsPanel alerts={alerts} />);

      const alertItems = screen.getAllByTestId(/^alert-/);
      expect(alertItems[0]).toHaveAttribute('data-testid', 'alert-critical-spo2');
      expect(alertItems[1]).toHaveAttribute('data-testid', 'alert-warning-hr');
    });
  });
});

// =============================================================================
// ALERT PANEL UI TESTS
// =============================================================================

describe('VitalAlertsPanel - Panel UI', () => {
  describe('@smoke @alert-panel - Summary display', () => {
    it('should display summary with critical and warning counts', () => {
      const alerts = [
        createCriticalSpO2Alert(),
        createCriticalBPAlert(),
        createWarningTachycardiaAlert(),
      ];
      render(<VitalAlertsPanel alerts={alerts} />);

      expect(screen.getByText(/3 Alerts/)).toBeInTheDocument();
      expect(screen.getByText(/2 Critical/)).toBeInTheDocument();
      expect(screen.getByText(/1 Warning/)).toBeInTheDocument();
    });

    it('should be expanded by default', () => {
      const alerts = [createWarningSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      const content = screen.getByTestId('alerts-content');
      expect(content).toBeVisible();
    });
  });

  describe('@alert-icon - Icon reflects severity', () => {
    it('should show red icon when there are critical alerts', () => {
      const alerts = [createCriticalSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      const icon = screen.getByTestId('alerts-severity-icon');
      expect(icon).toHaveClass('text-red-500');
    });

    it('should show orange icon when only warnings exist', () => {
      const alerts = [createWarningSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      const icon = screen.getByTestId('alerts-severity-icon');
      expect(icon).toHaveClass('text-orange-500');
    });

    it('should show green icon when no alerts', () => {
      render(<VitalAlertsPanel alerts={[]} />);

      const icon = screen.getByTestId('alerts-severity-icon');
      expect(icon).toHaveClass('text-green-500');
    });
  });

  describe('@collapse - Collapsible panel', () => {
    it('should collapse when header is clicked', async () => {
      const user = userEvent.setup();
      const alerts = [createWarningSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      const header = screen.getByTestId('alerts-header');
      await user.click(header);

      const content = screen.getByTestId('alerts-content');
      // Check for collapsed classes (max-h-0 and invisible)
      expect(content).toHaveClass('max-h-0', 'invisible');
    });

    it('should expand when header is clicked again', async () => {
      const user = userEvent.setup();
      const alerts = [createWarningSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} defaultExpanded={false} />);

      const header = screen.getByTestId('alerts-header');
      await user.click(header);

      const content = screen.getByTestId('alerts-content');
      expect(content).toBeVisible();
    });

    it('should show chevron icon indicating collapse state', () => {
      const alerts = [createWarningSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      expect(screen.getByTestId('chevron-icon')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// ACKNOWLEDGEMENT TESTS
// =============================================================================

describe('VitalAlertsPanel - Acknowledgement', () => {
  describe('@dismiss - Warning alerts can be acknowledged', () => {
    it('should show acknowledge button for warning alerts', () => {
      const alerts = [createWarningSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} onAcknowledge={() => {}} />);

      expect(screen.getByRole('button', { name: /acknowledge/i })).toBeInTheDocument();
    });

    it('should call onAcknowledge when acknowledge button is clicked', async () => {
      const user = userEvent.setup();
      const handleAcknowledge = jest.fn();
      const alerts = [createWarningSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} onAcknowledge={handleAcknowledge} />);

      const ackButton = screen.getByRole('button', { name: /acknowledge/i });
      await user.click(ackButton);

      expect(handleAcknowledge).toHaveBeenCalledWith('warning-spo2');
    });
  });

  describe('@no-dismiss-critical - Critical alerts cannot be dismissed', () => {
    it('should not show acknowledge button for critical alerts', () => {
      const alerts = [createCriticalSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} onAcknowledge={() => {}} />);

      const criticalAlert = screen.getByTestId('alert-critical-spo2');
      const ackButton = within(criticalAlert).queryByRole('button', { name: /acknowledge/i });
      expect(ackButton).not.toBeInTheDocument();
    });

    it('should show tooltip explaining why critical alerts cannot be dismissed', () => {
      const alerts = [createCriticalSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} onAcknowledge={() => {}} />);

      const criticalAlert = screen.getByTestId('alert-critical-spo2');
      expect(within(criticalAlert).getByText(/cannot be dismissed/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// NO ALERTS STATE TESTS
// =============================================================================

describe('VitalAlertsPanel - No Alerts State', () => {
  describe('@no-alerts - Empty state', () => {
    it('should display reassuring message when no alerts', () => {
      render(<VitalAlertsPanel alerts={[]} />);

      expect(screen.getByText(/All vitals within normal limits/i)).toBeInTheDocument();
    });

    it('should show green indicator when no alerts', () => {
      render(<VitalAlertsPanel alerts={[]} />);

      const panel = screen.getByTestId('alerts-panel');
      expect(panel).toHaveClass('border-green-200');
    });

    it('should show check icon when no alerts', () => {
      render(<VitalAlertsPanel alerts={[]} />);

      expect(screen.getByTestId('no-alerts-icon')).toBeInTheDocument();
    });
  });
});

// =============================================================================
// CLINICAL GUIDANCE TESTS
// =============================================================================

describe('VitalAlertsPanel - Clinical Guidance', () => {
  describe('@guidance - Clinical notes', () => {
    it('should display clinical note when provided', () => {
      const alerts = [createCriticalSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} showClinicalNotes />);

      expect(screen.getByText(/Immediate intervention required/)).toBeInTheDocument();
    });

    it('should hide clinical notes by default', () => {
      const alerts = [createCriticalSpO2Alert()];
      render(<VitalAlertsPanel alerts={alerts} />);

      // Clinical notes should not be visible by default
      expect(screen.queryByText(/Immediate intervention required/)).not.toBeInTheDocument();
    });
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

describe('VitalAlertsPanel - Accessibility', () => {
  it('should have appropriate ARIA role', () => {
    const alerts = [createWarningSpO2Alert()];
    render(<VitalAlertsPanel alerts={alerts} />);

    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('should have aria-label describing the panel', () => {
    const alerts = [createWarningSpO2Alert()];
    render(<VitalAlertsPanel alerts={alerts} />);

    expect(screen.getByLabelText(/vital signs alerts/i)).toBeInTheDocument();
  });

  it('should announce alert count to screen readers', () => {
    const alerts = [createCriticalSpO2Alert(), createWarningSpO2Alert()];
    render(<VitalAlertsPanel alerts={alerts} />);

    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('2')
    );
  });
});

// =============================================================================
// ADDITIONAL PROPS TESTS
// =============================================================================

describe('VitalAlertsPanel - Additional Props', () => {
  it('should accept and apply custom className', () => {
    render(<VitalAlertsPanel alerts={[]} className="my-custom-class" />);

    const panel = screen.getByTestId('alerts-panel');
    expect(panel).toHaveClass('my-custom-class');
  });

  it('should support controlled expanded state', async () => {
    const user = userEvent.setup();
    const handleExpandedChange = jest.fn();
    const alerts = [createWarningSpO2Alert()];

    render(
      <VitalAlertsPanel
        alerts={alerts}
        expanded={true}
        onExpandedChange={handleExpandedChange}
      />
    );

    const header = screen.getByTestId('alerts-header');
    await user.click(header);

    expect(handleExpandedChange).toHaveBeenCalledWith(false);
  });

  it('should support compact mode', () => {
    const alerts = [createWarningSpO2Alert()];
    render(<VitalAlertsPanel alerts={alerts} compact />);

    const panel = screen.getByTestId('alerts-panel');
    expect(panel).toHaveClass('compact');
  });
});
