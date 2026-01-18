/**
 * TDD Tests for LoadingSpinner Component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner, PageLoading } from '@/components/shared/loading-spinner';

describe('LoadingSpinner Component', () => {
  it('should render spinner with animation', () => {
    const { container } = render(<LoadingSpinner />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should render with default medium size (size-6)', () => {
    const { container } = render(<LoadingSpinner />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('size-6');
  });

  it('should render with small size', () => {
    const { container } = render(<LoadingSpinner size="sm" />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('size-4');
  });

  it('should render with large size', () => {
    const { container } = render(<LoadingSpinner size="lg" />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toHaveClass('size-8');
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

  it('should render as SVG (Lucide icon)', () => {
    const { container } = render(<LoadingSpinner />);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('should have accessible role and label', () => {
    render(<LoadingSpinner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });
});

describe('PageLoading Component', () => {
  it('should render spinner and default message', () => {
    render(<PageLoading />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render custom message', () => {
    render(<PageLoading message="Please wait..." />);

    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });

  it('should apply fullScreen styles when enabled', () => {
    const { container } = render(<PageLoading fullScreen={true} />);

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('min-h-screen');
  });

  it('should not apply fullScreen styles by default', () => {
    const { container } = render(<PageLoading />);

    const wrapper = container.firstChild;
    expect(wrapper).not.toHaveClass('min-h-screen');
  });
});
