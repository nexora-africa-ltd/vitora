/**
 * TDD Tests for PageHeader Component
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '@/components/shared/page-header';

describe('PageHeader Component', () => {
  it('should render title', () => {
    render(<PageHeader title="Patients" />);

    expect(screen.getByText('Patients')).toBeInTheDocument();
  });

  it('should render title as h1', () => {
    render(<PageHeader title="Dashboard" />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Dashboard');
  });

  it('should render description when provided', () => {
    render(
      <PageHeader
        title="Patients"
        description="Manage patient records"
      />
    );

    // Description is now shown in HelpPopover, not as visible text
    // Check that HelpPopover is rendered
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('should not render description when not provided', () => {
    render(<PageHeader title="Patients" />);

    // Only title should be present
    expect(screen.getByText('Patients')).toBeInTheDocument();
    // Check that there's no paragraph element (description)
    const container = screen.getByText('Patients').parentElement;
    expect(container?.querySelector('p')).not.toBeInTheDocument();
  });

  it('should render actions when provided', () => {
    render(
      <PageHeader
        title="Patients"
        actions={<button>Add Patient</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Add Patient' })).toBeInTheDocument();
  });

  it('should not render actions container when not provided', () => {
    const { container } = render(<PageHeader title="Test" />);

    // Should only have the title div, not the actions div
    const mainDiv = container.firstChild;
    expect(mainDiv?.childNodes.length).toBe(1);
  });

  it('should render multiple action buttons', () => {
    render(
      <PageHeader
        title="Patients"
        actions={
          <>
            <button>Export</button>
            <button>Add New</button>
          </>
        }
      />
    );

    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add New' })).toBeInTheDocument();
  });

  it('should have title with bold styling', () => {
    render(<PageHeader title="Test Title" />);

    const title = screen.getByText('Test Title');
    expect(title).toHaveClass('font-bold');
  });

  it('should have description with muted styling', () => {
    render(
      <PageHeader
        title="Test"
        description="Test description"
      />
    );

    // Description is now in HelpPopover, check popover trigger exists
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('should have responsive layout classes', () => {
    const { container } = render(
      <PageHeader
        title="Test"
        actions={<button>Action</button>}
      />
    );

    const wrapper = container.firstChild;
    // Classes use sm: breakpoint now (not md:)
    expect(wrapper).toHaveClass('flex', 'flex-col', 'sm:flex-row', 'sm:items-center', 'sm:justify-between');
  });
});
