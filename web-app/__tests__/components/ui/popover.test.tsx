/**
 * TDD Tests for Popover UI Component
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

describe('Popover Component', () => {
  it('should render trigger', () => {
    render(
      <Popover>
        <PopoverTrigger>Open Popover</PopoverTrigger>
        <PopoverContent>Popover Content</PopoverContent>
      </Popover>
    );

    expect(screen.getByText('Open Popover')).toBeInTheDocument();
  });

  it('should show content when clicked', async () => {
    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>
    );

    // Click trigger
    fireEvent.click(screen.getByText('Open'));

    // Content should appear
    expect(await screen.findByText('Content')).toBeInTheDocument();
  });

  it('should accept custom className on content', async () => {
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent className="custom-popover">Content</PopoverContent>
      </Popover>
    );

    const content = await screen.findByText('Content');
    expect(content.closest('[class*="custom-popover"]')).toBeInTheDocument();
  });

  it('should support controlled open state', () => {
    const { rerender } = render(
      <Popover open={false}>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    rerender(
      <Popover open={true}>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>
    );

    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should call onOpenChange', () => {
    const onOpenChange = jest.fn();

    render(
      <Popover onOpenChange={onOpenChange}>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>
    );

    fireEvent.click(screen.getByText('Open'));

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('should render trigger as button by default', () => {
    render(
      <Popover>
        <PopoverTrigger>Click Me</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should support asChild on trigger', () => {
    render(
      <Popover>
        <PopoverTrigger asChild>
          <button type="button">Custom Button</button>
        </PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>
    );

    expect(screen.getByRole('button', { name: 'Custom Button' })).toBeInTheDocument();
  });
});
