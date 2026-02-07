/**
 * TDD Tests for Select UI Component
 * Tests select dropdown functionality
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

describe('Select Component', () => {
  describe('Select', () => {
    it('should render select with children', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Select an option')).toBeInTheDocument();
    });

    it('should show selected value', () => {
      render(
        <Select value="option1">
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByText('Option 1')).toBeInTheDocument();
    });

    it('should open dropdown on trigger click', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
            <SelectItem value="option2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );

      // Click trigger to open
      fireEvent.click(screen.getByRole('combobox'));

      // Options should be visible
      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
    });

    it('should call onValueChange when selecting an item', () => {
      const onValueChange = jest.fn();

      render(
        <Select onValueChange={onValueChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
            <SelectItem value="option2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('combobox'));

      // Select an option
      fireEvent.click(screen.getByText('Option 1'));

      expect(onValueChange).toHaveBeenCalledWith('option1');
    });

    it('should close dropdown after selection', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('combobox'));
      expect(screen.getByText('Option 1')).toBeInTheDocument();

      // Select option
      fireEvent.click(screen.getByText('Option 1'));

      // Content should be hidden (not rendered when closed)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('SelectTrigger', () => {
    it('should render as button', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Click me" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Test</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should accept custom className', () => {
      render(
        <Select>
          <SelectTrigger className="custom-class">
            <SelectValue placeholder="Test" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Test</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByRole('combobox')).toHaveClass('custom-class');
    });
  });

  describe('SelectValue', () => {
    it('should show placeholder when no value', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Test</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Choose option')).toBeInTheDocument();
    });
  });

  describe('SelectItem', () => {
    it('should highlight selected item', () => {
      render(
        <Select value="option1">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
            <SelectItem value="option2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );

      // Open to see items
      fireEvent.click(screen.getByRole('combobox'));

      const selectedOption = screen.getByRole('option', { name: 'Option 1' });
      expect(selectedOption).toHaveAttribute('aria-selected', 'true');
      expect(selectedOption).toHaveClass('bg-accent');
    });
  });

  describe('Context Error Handling', () => {
    // These tests verify error handling when components are used outside context
    it('should throw when SelectTrigger is used outside Select', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<SelectTrigger><span>Test</span></SelectTrigger>);
      }).toThrow('SelectTrigger must be used within Select');

      consoleSpy.mockRestore();
    });

    it('should throw when SelectValue is used outside Select', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<SelectValue placeholder="Test" />);
      }).toThrow('SelectValue must be used within Select');

      consoleSpy.mockRestore();
    });

    it('should throw when SelectContent is used outside Select', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<SelectContent><div>Content</div></SelectContent>);
      }).toThrow('SelectContent must be used within Select');

      consoleSpy.mockRestore();
    });

    it('should throw when SelectItem is used outside Select', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<SelectItem value="test">Test</SelectItem>);
      }).toThrow('SelectItem must be used within Select');

      consoleSpy.mockRestore();
    });
  });
});
