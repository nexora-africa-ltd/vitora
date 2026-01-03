/**
 * TDD Tests for TriageThresholdsSettings Component
 *
 * Based on BDD scenarios from: features/triage/triage-thresholds.feature
 *
 * Test Categories:
 * 1. Viewing Thresholds (@view)
 * 2. Editing Thresholds (@edit)
 * 3. Validation (@validation)
 * 4. Reset & Defaults (@reset)
 * 5. Activation/Deactivation (@activate, @deactivate)
 * 6. Export/Import (@export, @import)
 * 7. Permissions (@permissions)
 * 8. Loading & Empty States
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriageThresholdsSettings } from '@/components/triage/triage-thresholds-settings';
import type { TriageVitalThreshold, VitalType } from '@/lib/types/triage';

// =============================================================================
// MOCK DATA
// =============================================================================

const createThreshold = (overrides: Partial<TriageVitalThreshold> = {}): TriageVitalThreshold => ({
  id: Math.floor(Math.random() * 1000),
  vital_type: 'SPO2',
  critical_low: 90,
  warning_low: 95,
  warning_high: null,
  critical_high: null,
  is_active: true,
  created_at: '2025-12-01T00:00:00Z',
  updated_at: '2025-12-15T00:00:00Z',
  ...overrides,
});

const mockThresholds: TriageVitalThreshold[] = [
  createThreshold({
    id: 1,
    vital_type: 'SPO2',
    critical_low: 90,
    warning_low: 95,
    warning_high: null,
    critical_high: null,
    is_active: true,
  }),
  createThreshold({
    id: 2,
    vital_type: 'SYSTOLIC_BP',
    critical_low: 90,
    warning_low: 100,
    warning_high: 140,
    critical_high: 180,
    is_active: true,
  }),
  createThreshold({
    id: 3,
    vital_type: 'DIASTOLIC_BP',
    critical_low: null,
    warning_low: null,
    warning_high: 90,
    critical_high: 120,
    is_active: true,
  }),
  createThreshold({
    id: 4,
    vital_type: 'HEART_RATE',
    critical_low: 40,
    warning_low: 50,
    warning_high: 100,
    critical_high: 150,
    is_active: true,
  }),
  createThreshold({
    id: 5,
    vital_type: 'TEMPERATURE',
    critical_low: 35.0,
    warning_low: 36.0,
    warning_high: 38.5,
    critical_high: 40.0,
    is_active: true,
  }),
  createThreshold({
    id: 6,
    vital_type: 'RESPIRATORY_RATE',
    critical_low: 8,
    warning_low: 10,
    warning_high: 24,
    critical_high: 30,
    is_active: true,
  }),
];

const defaultProps = {
  thresholds: mockThresholds,
  isLoading: false,
  canEdit: true,
  onSave: jest.fn(),
  onReset: jest.fn(),
  onToggleActive: jest.fn(),
  onExport: jest.fn(),
  onImport: jest.fn(),
};

// =============================================================================
// VIEWING THRESHOLDS TESTS
// =============================================================================

describe('TriageThresholdsSettings - Viewing Thresholds', () => {
  describe('@smoke @view - View current thresholds', () => {
    it('should display page title', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);
      expect(screen.getByRole('heading', { name: /vital.*threshold/i })).toBeInTheDocument();
    });

    it('should display thresholds table', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);
      expect(screen.getByTestId('thresholds-table')).toBeInTheDocument();
    });

    it('should display all vital types', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);

      expect(screen.getByText(/spo2/i)).toBeInTheDocument();
      expect(screen.getByText(/systolic.*bp|systolic/i)).toBeInTheDocument();
      expect(screen.getByText(/diastolic.*bp|diastolic/i)).toBeInTheDocument();
      expect(screen.getByText(/heart rate/i)).toBeInTheDocument();
      expect(screen.getByText(/temperature/i)).toBeInTheDocument();
      expect(screen.getByText(/respiratory rate/i)).toBeInTheDocument();
    });

    it('should display threshold values', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);

      // SpO2 critical_low is 90
      const spo2Row = screen.getByTestId('threshold-row-SPO2');
      expect(within(spo2Row).getByText('90')).toBeInTheDocument();
      // SpO2 warning_low is 95
      expect(within(spo2Row).getByText('95')).toBeInTheDocument();
    });

    it('should display empty values as dash', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);

      // SpO2 has no warning_high or critical_high
      const spo2Row = screen.getByTestId('threshold-row-SPO2');
      const dashes = within(spo2Row).getAllByText('-');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });

    it('should display active status for each threshold', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);

      // All mock thresholds are active
      const activeIndicators = screen.getAllByTestId(/active-indicator/);
      expect(activeIndicators.length).toBe(6);
    });
  });

  describe('@view - Table headers', () => {
    it('should display column headers', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);
      const table = screen.getByTestId('thresholds-table');

      expect(within(table).getByText(/vital.*type|vital/i)).toBeInTheDocument();
      expect(within(table).getByText(/critical.*low/i)).toBeInTheDocument();
      expect(within(table).getByText(/warning.*low/i)).toBeInTheDocument();
      expect(within(table).getByText(/warning.*high/i)).toBeInTheDocument();
      expect(within(table).getByText(/critical.*high/i)).toBeInTheDocument();
      expect(within(table).getByText(/active|status/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// EDITING THRESHOLDS TESTS
// =============================================================================

describe('TriageThresholdsSettings - Editing Thresholds', () => {
  describe('@smoke @edit - Edit threshold', () => {
    it('should display edit button for each threshold when canEdit is true', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      expect(editButtons.length).toBeGreaterThanOrEqual(6);
    });

    it('should open edit dialog when edit button is clicked', async () => {
      const user = userEvent.setup();
      render(<TriageThresholdsSettings {...defaultProps} />);

      const spo2Row = screen.getByTestId('threshold-row-SPO2');
      const editButton = within(spo2Row).getByRole('button', { name: /edit/i });
      await user.click(editButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/edit.*spo2|spo2.*threshold/i)).toBeInTheDocument();
    });

    it('should display current values in edit form', async () => {
      const user = userEvent.setup();
      render(<TriageThresholdsSettings {...defaultProps} />);

      const spo2Row = screen.getByTestId('threshold-row-SPO2');
      const editButton = within(spo2Row).getByRole('button', { name: /edit/i });
      await user.click(editButton);

      const criticalLowInput = screen.getByLabelText(/critical.*low/i);
      expect(criticalLowInput).toHaveValue(90);

      const warningLowInput = screen.getByLabelText(/warning.*low/i);
      expect(warningLowInput).toHaveValue(95);
    });

    it('should call onSave when save button is clicked', async () => {
      const user = userEvent.setup();
      const handleSave = jest.fn();
      render(<TriageThresholdsSettings {...defaultProps} onSave={handleSave} />);

      const spo2Row = screen.getByTestId('threshold-row-SPO2');
      const editButton = within(spo2Row).getByRole('button', { name: /edit/i });
      await user.click(editButton);

      const warningLowInput = screen.getByLabelText(/warning.*low/i);
      await user.clear(warningLowInput);
      await user.type(warningLowInput, '94');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          warning_low: 94,
        })
      );
    });
  });

  describe('@edit @validation - Validation', () => {
    it('should show error when critical_low >= warning_low', async () => {
      const user = userEvent.setup();
      render(<TriageThresholdsSettings {...defaultProps} />);

      const hrRow = screen.getByTestId('threshold-row-HEART_RATE');
      const editButton = within(hrRow).getByRole('button', { name: /edit/i });
      await user.click(editButton);

      // Set critical_low > warning_low
      const criticalLowInput = screen.getByLabelText(/critical.*low/i);
      await user.clear(criticalLowInput);
      await user.type(criticalLowInput, '60');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      expect(screen.getByText(/critical.*less than.*warning|invalid.*order/i)).toBeInTheDocument();
    });

    it('should validate SpO2 range (0-100)', async () => {
      const user = userEvent.setup();
      render(<TriageThresholdsSettings {...defaultProps} />);

      const spo2Row = screen.getByTestId('threshold-row-SPO2');
      const editButton = within(spo2Row).getByRole('button', { name: /edit/i });
      await user.click(editButton);

      const warningLowInput = screen.getByLabelText(/warning.*low/i);
      await user.clear(warningLowInput);
      await user.type(warningLowInput, '105');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      expect(screen.getByText(/must be between 0 and 100|invalid.*range/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// RESET & DEFAULTS TESTS
// =============================================================================

describe('TriageThresholdsSettings - Reset & Defaults', () => {
  describe('@reset - Reset individual threshold', () => {
    it('should display reset button in edit dialog', async () => {
      const user = userEvent.setup();
      render(<TriageThresholdsSettings {...defaultProps} />);

      const spo2Row = screen.getByTestId('threshold-row-SPO2');
      const editButton = within(spo2Row).getByRole('button', { name: /edit/i });
      await user.click(editButton);

      expect(screen.getByRole('button', { name: /reset.*default/i })).toBeInTheDocument();
    });

    it('should call onReset when reset is confirmed', async () => {
      const user = userEvent.setup();
      const handleReset = jest.fn();
      render(<TriageThresholdsSettings {...defaultProps} onReset={handleReset} />);

      const spo2Row = screen.getByTestId('threshold-row-SPO2');
      const editButton = within(spo2Row).getByRole('button', { name: /edit/i });
      await user.click(editButton);

      const resetButton = screen.getByRole('button', { name: /reset.*default/i });
      await user.click(resetButton);

      // Confirm dialog
      const confirmButton = await screen.findByRole('button', { name: /confirm|yes/i });
      await user.click(confirmButton);

      expect(handleReset).toHaveBeenCalledWith(1);
    });
  });

  describe('@reset-all - Reset all thresholds', () => {
    it('should display reset all button', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);
      expect(screen.getByRole('button', { name: /reset.*all/i })).toBeInTheDocument();
    });
  });
});

// =============================================================================
// ACTIVATION/DEACTIVATION TESTS
// =============================================================================

describe('TriageThresholdsSettings - Activation/Deactivation', () => {
  describe('@deactivate - Deactivate threshold', () => {
    it('should display toggle switch for each threshold', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);

      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBe(6);
    });

    it('should call onToggleActive when switch is clicked', async () => {
      const user = userEvent.setup();
      const handleToggle = jest.fn();
      render(<TriageThresholdsSettings {...defaultProps} onToggleActive={handleToggle} />);

      const spo2Row = screen.getByTestId('threshold-row-SPO2');
      const toggle = within(spo2Row).getByRole('switch');
      await user.click(toggle);

      expect(handleToggle).toHaveBeenCalledWith(1, false);
    });
  });

  describe('@activate - Show inactive threshold differently', () => {
    it('should visually indicate inactive thresholds', () => {
      const baseThreshold = mockThresholds[0]!;
      const inactiveThreshold: TriageVitalThreshold = { 
        id: baseThreshold.id,
        vital_type: baseThreshold.vital_type,
        critical_low: baseThreshold.critical_low,
        warning_low: baseThreshold.warning_low,
        warning_high: baseThreshold.warning_high,
        critical_high: baseThreshold.critical_high,
        is_active: false,
        created_at: baseThreshold.created_at,
        updated_at: baseThreshold.updated_at,
      };
      render(
        <TriageThresholdsSettings
          {...defaultProps}
          thresholds={[inactiveThreshold, ...mockThresholds.slice(1)]}
        />
      );

      const spo2Row = screen.getByTestId('threshold-row-SPO2');
      expect(spo2Row).toHaveClass('opacity-50');
    });
  });
});

// =============================================================================
// EXPORT/IMPORT TESTS
// =============================================================================

describe('TriageThresholdsSettings - Export/Import', () => {
  describe('@export - Export configuration', () => {
    it('should display export button', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    it('should call onExport when export button is clicked', async () => {
      const user = userEvent.setup();
      const handleExport = jest.fn();
      render(<TriageThresholdsSettings {...defaultProps} onExport={handleExport} />);

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      expect(handleExport).toHaveBeenCalled();
    });
  });

  describe('@import - Import configuration', () => {
    it('should display import button', () => {
      render(<TriageThresholdsSettings {...defaultProps} />);
      expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
    });
  });
});

// =============================================================================
// PERMISSIONS TESTS
// =============================================================================

describe('TriageThresholdsSettings - Permissions', () => {
  describe('@permissions @view - Non-admin view', () => {
    it('should hide edit buttons when canEdit is false', () => {
      render(<TriageThresholdsSettings {...defaultProps} canEdit={false} />);

      const editButtons = screen.queryAllByRole('button', { name: /edit/i });
      expect(editButtons.length).toBe(0);
    });

    it('should disable toggle switches when canEdit is false', () => {
      render(<TriageThresholdsSettings {...defaultProps} canEdit={false} />);

      const switches = screen.getAllByRole('switch');
      switches.forEach((toggle) => {
        expect(toggle).toBeDisabled();
      });
    });

    it('should show permission message when canEdit is false', () => {
      render(<TriageThresholdsSettings {...defaultProps} canEdit={false} />);
      expect(screen.getByText(/administrator.*required|view.*only/i)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// LOADING & EMPTY STATES
// =============================================================================

describe('TriageThresholdsSettings - Loading & Empty States', () => {
  it('should display loading state', () => {
    render(<TriageThresholdsSettings {...defaultProps} isLoading />);
    expect(screen.getByTestId('thresholds-loading')).toBeInTheDocument();
  });

  it('should display empty state when no thresholds', () => {
    render(<TriageThresholdsSettings {...defaultProps} thresholds={[]} />);
    // Check for the empty state heading specifically
    expect(screen.getByText('No Thresholds Configured')).toBeInTheDocument();
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

describe('TriageThresholdsSettings - Accessibility', () => {
  it('should have accessible table structure', () => {
    render(<TriageThresholdsSettings {...defaultProps} />);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1); // Header + data rows
  });

  it('should have accessible labels in edit form', async () => {
    const user = userEvent.setup();
    render(<TriageThresholdsSettings {...defaultProps} />);

    const spo2Row = screen.getByTestId('threshold-row-SPO2');
    const editButton = within(spo2Row).getByRole('button', { name: /edit/i });
    await user.click(editButton);

    expect(screen.getByLabelText(/critical.*low/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/warning.*low/i)).toBeInTheDocument();
  });
});
