/**
 * TDD Tests for LoadingSpinner Component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '@/components/shared/loading-spinner';

describe('LoadingSpinner Component', () => {
  it('should render spinner', () => {
    const { container } = render(<LoadingSpinner />);

    // Should have the spinning animation class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should render with default medium size', () => {
    const { container } = render(<LoadingSpinner />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('h-6', 'w-6');
  });

  it('should render with small size', () => {
    const { container } = render(<LoadingSpinner size="sm" />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('h-4', 'w-4');
  });

  it('should render with large size', () => {
    const { container } = render(<LoadingSpinner size="lg" />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('h-8', 'w-8');
  });

  it('should accept custom className', () => {
    const { container } = render(<LoadingSpinner className="custom-spinner" />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('custom-spinner');
  });

  it('should have primary text color', () => {
    const { container } = render(<LoadingSpinner />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('text-primary');
  });

  it('should render Loader2 icon from lucide', () => {
    const { container } = render(<LoadingSpinner />);

    // Lucide icons render as SVG
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
