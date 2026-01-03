/**
 * TDD Tests for TriageCategoryBadge Component
 *
 * Based on BDD scenarios from: features/triage/triage-category-badge.feature
 *
 * Test Categories:
 * 1. Visual Appearance (@colors, @labels, @sizes, @icon)
 * 2. Accessibility (@a11y)
 * 3. Interactive States (@hover, @click)
 * 4. Edge Cases (@unknown-category, @loading, @empty)
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriageCategoryBadge } from '@/components/triage/triage-category-badge';
import type { TriageCategory } from '@/lib/types/triage';
import { TRIAGE_CATEGORY_CONFIG } from '@/lib/types/triage';

// =============================================================================
// VISUAL APPEARANCE TESTS
// =============================================================================

describe('TriageCategoryBadge - Visual Appearance', () => {
  describe('@colors - Category badges display correct colors', () => {
    const colorTestCases: Array<{
      category: TriageCategory;
      expectedBgColor: string;
      expectedTextColor: string;
    }> = [
      { category: 'RED', expectedBgColor: 'bg-red-600', expectedTextColor: 'text-white' },
      { category: 'ORANGE', expectedBgColor: 'bg-orange-500', expectedTextColor: 'text-white' },
      { category: 'YELLOW', expectedBgColor: 'bg-yellow-500', expectedTextColor: 'text-black' },
      { category: 'GREEN', expectedBgColor: 'bg-green-500', expectedTextColor: 'text-white' },
      { category: 'BLUE', expectedBgColor: 'bg-blue-500', expectedTextColor: 'text-white' },
    ];

    colorTestCases.forEach(({ category, expectedBgColor, expectedTextColor }) => {
      it(`should display ${category} badge with correct background color`, () => {
        render(<TriageCategoryBadge category={category} />);

        const badge = screen.getByRole('status');
        expect(badge).toHaveClass(expectedBgColor);
      });

      it(`should display ${category} badge with correct text color`, () => {
        render(<TriageCategoryBadge category={category} />);

        const badge = screen.getByRole('status');
        expect(badge).toHaveClass(expectedTextColor);
      });
    });
  });

  describe('@labels - Category badges display correct labels', () => {
    const labelTestCases: Array<{
      category: TriageCategory;
      shortLabel: string;
      fullLabel: string;
    }> = [
      { category: 'RED', shortLabel: 'RED', fullLabel: 'Emergency - Immediate' },
      { category: 'ORANGE', shortLabel: 'ORANGE', fullLabel: 'Very Urgent - <10 min' },
      { category: 'YELLOW', shortLabel: 'YELLOW', fullLabel: 'Urgent - <60 min' },
      { category: 'GREEN', shortLabel: 'GREEN', fullLabel: 'Standard - <240 min' },
      { category: 'BLUE', shortLabel: 'BLUE', fullLabel: 'Non-Urgent/Referral' },
    ];

    labelTestCases.forEach(({ category, shortLabel, fullLabel }) => {
      it(`should display "${shortLabel}" as the visible text for ${category}`, () => {
        render(<TriageCategoryBadge category={category} />);

        expect(screen.getByText(shortLabel)).toBeInTheDocument();
      });

      it(`should have title attribute "${fullLabel}" for ${category}`, () => {
        render(<TriageCategoryBadge category={category} />);

        const badge = screen.getByRole('status');
        expect(badge).toHaveAttribute('title', fullLabel);
      });
    });
  });

  describe('@sizes - Category badges support multiple sizes', () => {
    const sizeTestCases: Array<{
      size: 'sm' | 'default' | 'lg' | 'xl';
      expectedHeight: string;
      expectedFontSize: string;
    }> = [
      { size: 'sm', expectedHeight: 'h-5', expectedFontSize: 'text-xs' },
      { size: 'default', expectedHeight: 'h-6', expectedFontSize: 'text-sm' },
      { size: 'lg', expectedHeight: 'h-8', expectedFontSize: 'text-base' },
      { size: 'xl', expectedHeight: 'h-10', expectedFontSize: 'text-lg' },
    ];

    sizeTestCases.forEach(({ size, expectedHeight, expectedFontSize }) => {
      it(`should render ${size} size with height ${expectedHeight}`, () => {
        render(<TriageCategoryBadge category="RED" size={size} />);

        const badge = screen.getByRole('status');
        expect(badge).toHaveClass(expectedHeight);
      });

      it(`should render ${size} size with font size ${expectedFontSize}`, () => {
        render(<TriageCategoryBadge category="RED" size={size} />);

        const badge = screen.getByRole('status');
        expect(badge).toHaveClass(expectedFontSize);
      });
    });
  });

  describe('@icon - Category badges include severity icon', () => {
    const iconTestCases: Array<{ category: TriageCategory; iconName: string }> = [
      { category: 'RED', iconName: 'alert-circle' },
      { category: 'ORANGE', iconName: 'alert-triangle' },
      { category: 'YELLOW', iconName: 'clock' },
      { category: 'GREEN', iconName: 'check-circle' },
      { category: 'BLUE', iconName: 'info' },
    ];

    iconTestCases.forEach(({ category, iconName }) => {
      it(`should include ${iconName} icon for ${category} when showIcon is true`, () => {
        render(<TriageCategoryBadge category={category} showIcon />);

        const icon = screen.getByTestId(`triage-icon-${iconName}`);
        expect(icon).toBeInTheDocument();
      });
    });

    it('should not show icon by default', () => {
      render(<TriageCategoryBadge category="RED" />);

      expect(screen.queryByTestId(/triage-icon/)).not.toBeInTheDocument();
    });
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

describe('TriageCategoryBadge - Accessibility', () => {
  describe('@a11y @screen-reader - Badge is accessible to screen readers', () => {
    it('should have role="status"', () => {
      render(<TriageCategoryBadge category="RED" />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have appropriate aria-label for RED category', () => {
      render(<TriageCategoryBadge category="RED" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute('aria-label', 'Triage Category: Emergency - Immediate');
    });

    it('should have appropriate aria-label for each category', () => {
      const categories: TriageCategory[] = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'];

      categories.forEach((category) => {
        const { unmount } = render(<TriageCategoryBadge category={category} />);
        const badge = screen.getByRole('status');
        const config = TRIAGE_CATEGORY_CONFIG[category];

        expect(badge).toHaveAttribute('aria-label', `Triage Category: ${config.label}`);
        unmount();
      });
    });
  });
});

// =============================================================================
// INTERACTIVE STATES TESTS
// =============================================================================

describe('TriageCategoryBadge - Interactive States', () => {
  describe('@click - Clickable badge behavior', () => {
    it('should call onClick when badge is clicked and clickable', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(<TriageCategoryBadge category="YELLOW" onClick={handleClick} />);

      const badge = screen.getByRole('status');
      await user.click(badge);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should have cursor-pointer class when onClick is provided', () => {
      render(<TriageCategoryBadge category="YELLOW" onClick={() => {}} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('cursor-pointer');
    });

    it('should not have cursor-pointer class when onClick is not provided', () => {
      render(<TriageCategoryBadge category="YELLOW" />);

      const badge = screen.getByRole('status');
      expect(badge).not.toHaveClass('cursor-pointer');
    });
  });

  describe('@animation @critical - RED category pulse animation', () => {
    it('should have pulse animation class for RED category when animate is true', () => {
      render(<TriageCategoryBadge category="RED" animate />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('animate-pulse');
    });

    it('should not have pulse animation by default', () => {
      render(<TriageCategoryBadge category="RED" />);

      const badge = screen.getByRole('status');
      expect(badge).not.toHaveClass('animate-pulse');
    });
  });
});

// =============================================================================
// EDGE CASES TESTS
// =============================================================================

describe('TriageCategoryBadge - Edge Cases', () => {
  describe('@unknown-category - Handle unknown category gracefully', () => {
    it('should display "UNKNOWN" for invalid category', () => {
      // @ts-expect-error - Testing invalid category handling
      render(<TriageCategoryBadge category="PURPLE" />);

      expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    });

    it('should have gray background for invalid category', () => {
      // @ts-expect-error - Testing invalid category handling
      render(<TriageCategoryBadge category="INVALID" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('bg-gray-400');
    });
  });

  describe('@loading - Badge shows loading state', () => {
    it('should show skeleton loader when loading is true', () => {
      render(<TriageCategoryBadge category="RED" loading />);

      expect(screen.getByTestId('triage-badge-skeleton')).toBeInTheDocument();
    });

    it('should not show category text when loading', () => {
      render(<TriageCategoryBadge category="RED" loading />);

      expect(screen.queryByText('RED')).not.toBeInTheDocument();
    });
  });

  describe('@empty - Handle missing category', () => {
    it('should display "Not Triaged" when category is undefined', () => {
      // @ts-expect-error - Testing undefined category handling
      render(<TriageCategoryBadge category={undefined} />);

      expect(screen.getByText('Not Triaged')).toBeInTheDocument();
    });

    it('should display "Not Triaged" when category is null', () => {
      // @ts-expect-error - Testing null category handling
      render(<TriageCategoryBadge category={null} />);

      expect(screen.getByText('Not Triaged')).toBeInTheDocument();
    });

    it('should have muted/gray style when category is missing', () => {
      // @ts-expect-error - Testing missing category handling
      render(<TriageCategoryBadge category={undefined} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('bg-gray-300');
    });
  });
});

// =============================================================================
// DARK MODE TESTS
// =============================================================================

describe('TriageCategoryBadge - Dark Mode', () => {
  it('should have dark mode variant classes', () => {
    render(<TriageCategoryBadge category="RED" />);

    const badge = screen.getByRole('status');
    // Should have dark: prefix classes for dark mode support
    expect(badge).toHaveClass('dark:bg-red-500');
  });
});

// =============================================================================
// ADDITIONAL PROPS TESTS
// =============================================================================

describe('TriageCategoryBadge - Additional Props', () => {
  it('should accept and apply custom className', () => {
    render(<TriageCategoryBadge category="RED" className="my-custom-class" />);

    const badge = screen.getByRole('status');
    expect(badge).toHaveClass('my-custom-class');
  });

  it('should pass through data-testid attribute', () => {
    render(<TriageCategoryBadge category="RED" data-testid="custom-badge" />);

    expect(screen.getByTestId('custom-badge')).toBeInTheDocument();
  });
});
