/**
 * TDD Tests for EmptyState Component
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileQuestion, AlertCircle } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';

describe('EmptyState Component', () => {
  it('should render title', () => {
    render(<EmptyState title="No results found" />);

    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('should render description when provided', () => {
    render(
      <EmptyState
        title="No results"
        description="Try adjusting your search criteria"
      />
    );

    expect(screen.getByText('Try adjusting your search criteria')).toBeInTheDocument();
  });

  it('should not render description when not provided', () => {
    render(<EmptyState title="No results" />);

    // Title should be there, but no description
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });

  it('should render default icon (FileQuestion)', () => {
    const { container } = render(<EmptyState title="Empty" />);

    // Should have an icon in the muted background circle
    const iconContainer = container.querySelector('.rounded-full.bg-muted');
    expect(iconContainer).toBeInTheDocument();
  });

  it('should render custom icon when provided', () => {
    render(<EmptyState title="Error" icon={AlertCircle} />);

    // Component should render with custom icon
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('should render action button when provided', () => {
    const handleClick = jest.fn();

    render(
      <EmptyState
        title="No data"
        action={{
          label: 'Add New',
          onClick: handleClick,
        }}
      />
    );

    const button = screen.getByRole('button', { name: 'Add New' });
    expect(button).toBeInTheDocument();
  });

  it('should call action onClick when button is clicked', () => {
    const handleClick = jest.fn();

    render(
      <EmptyState
        title="No data"
        action={{
          label: 'Refresh',
          onClick: handleClick,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should not render button when action is not provided', () => {
    render(<EmptyState title="Empty" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should be centered with proper spacing', () => {
    const { container } = render(<EmptyState title="Empty" />);

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center');
  });

  it('should have title with proper styling', () => {
    render(<EmptyState title="No Items" />);

    const title = screen.getByText('No Items');
    expect(title.tagName).toBe('H3');
    expect(title).toHaveClass('text-lg', 'font-semibold');
  });

  it('should have description with muted styling', () => {
    render(<EmptyState title="Empty" description="Description text" />);

    const description = screen.getByText('Description text');
    expect(description).toHaveClass('text-muted-foreground');
  });
});
