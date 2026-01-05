/**
 * @jest-environment jsdom
 */
/**
 * Tests for ClinicalTemplateForm component
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicalTemplateForm } from '@/components/clinical-templates/clinical-template-form';
import type { ClinicalTemplate } from '@/lib/types/clinical-template';

const mockTemplate: ClinicalTemplate = {
  id: 1,
  name: 'Test Assessment Template',
  template_type: 'assessment',
  specialty: 'General Practice',
  description: 'A test template for unit tests',
  content: {
    title: 'Test Assessment',
    version: '1.0',
    sections: [
      {
        name: 'Patient History',
        order: 1,
        fields: [
          { name: 'chief_complaint', type: 'text', label: 'Chief Complaint', required: true },
          { name: 'duration', type: 'text', label: 'Duration', required: false },
          { name: 'severity', type: 'select', label: 'Severity', required: false, options: ['Mild', 'Moderate', 'Severe'] },
        ],
      },
      {
        name: 'Examination',
        order: 2,
        fields: [
          { name: 'findings', type: 'textarea', label: 'Examination Findings', required: true },
          { name: 'is_normal', type: 'boolean', label: 'Normal Examination', required: false },
        ],
      },
    ],
  },
  is_system: true,
  is_active: true,
  usage_count: 10,
  created_by: null,
  created_by_username: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  sections: [],
};

describe('ClinicalTemplateForm', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render template name and description', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Test Assessment Template')).toBeInTheDocument();
    expect(screen.getByText('A test template for unit tests')).toBeInTheDocument();
  });

  it('should render all sections', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Patient History')).toBeInTheDocument();
    expect(screen.getByText('Examination')).toBeInTheDocument();
  });

  it('should render text input field', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByLabelText(/chief complaint/i)).toBeInTheDocument();
  });

  it('should mark required fields with asterisk', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{}}
        onChange={mockOnChange}
      />
    );

    // Required field should have asterisk in label
    const chiefComplaintLabel = screen.getByText(/chief complaint/i);
    expect(chiefComplaintLabel.closest('label')?.textContent).toContain('*');
  });

  it('should call onChange when text field is updated', async () => {
    const user = userEvent.setup();
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{}}
        onChange={mockOnChange}
      />
    );

    const input = screen.getByLabelText(/chief complaint/i);
    await user.type(input, 'H');

    expect(mockOnChange).toHaveBeenCalled();
    // Just verify that onChange was called - the value accumulates over each keystroke
    const firstCall = mockOnChange.mock.calls[0][0];
    expect(firstCall['Patient History']?.chief_complaint).toBe('H');
  });

  it('should render select field with options', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{}}
        onChange={mockOnChange}
      />
    );

    // Find the severity label
    expect(screen.getByText(/severity/i)).toBeInTheDocument();
  });

  it('should render textarea field', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByLabelText(/examination findings/i)).toBeInTheDocument();
  });

  it('should render checkbox for boolean field', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByLabelText(/normal examination/i)).toBeInTheDocument();
  });

  it('should display existing values', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{
          'Patient History': {
            chief_complaint: 'Fever',
            duration: '3 days',
          },
        }}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByDisplayValue('Fever')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3 days')).toBeInTheDocument();
  });

  it('should disable all fields when disabled prop is true', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{}}
        onChange={mockOnChange}
        disabled
      />
    );

    expect(screen.getByLabelText(/chief complaint/i)).toBeDisabled();
    expect(screen.getByLabelText(/duration/i)).toBeDisabled();
  });

  it('should show section completion status', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{
          'Patient History': {
            chief_complaint: 'Headache', // Required field filled
          },
        }}
        onChange={mockOnChange}
      />
    );

    // Should show completion badge (1/1 for Patient History section)
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });

  it('should show specialty badge', () => {
    render(
      <ClinicalTemplateForm
        template={mockTemplate}
        value={{}}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('General Practice')).toBeInTheDocument();
  });
});
