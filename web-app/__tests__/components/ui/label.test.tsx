/**
 * TDD Tests for Label UI Component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Label } from '@/components/ui/label';

describe('Label Component', () => {
  it('should render label text', () => {
    render(<Label>Field Label</Label>);

    expect(screen.getByText('Field Label')).toBeInTheDocument();
  });

  it('should render as label element', () => {
    render(<Label>Test</Label>);

    expect(screen.getByText('Test').tagName).toBe('LABEL');
  });

  it('should accept htmlFor attribute', () => {
    render(<Label htmlFor="input-id">Label</Label>);

    expect(screen.getByText('Label')).toHaveAttribute('for', 'input-id');
  });

  it('should accept custom className', () => {
    render(<Label className="custom-label">Label</Label>);

    expect(screen.getByText('Label')).toHaveClass('custom-label');
  });

  it('should have default styling', () => {
    render(<Label data-testid="label">Label</Label>);

    const label = screen.getByTestId('label');
    expect(label).toHaveClass('text-sm');
    expect(label).toHaveClass('font-medium');
  });

  it('should forward ref', () => {
    const ref = React.createRef<HTMLLabelElement>();
    render(<Label ref={ref}>Label</Label>);

    expect(ref.current).toBeInstanceOf(HTMLLabelElement);
  });

  it('should pass through other props', () => {
    render(<Label data-testid="test-label" id="custom-id">Label</Label>);

    expect(screen.getByTestId('test-label')).toHaveAttribute('id', 'custom-id');
  });
});
