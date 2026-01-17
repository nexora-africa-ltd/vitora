/**
 * Chart Configuration Utilities for Vitora HMIS
 *
 * Pre-configured chart themes and color schemes for healthcare dashboards.
 * Uses the Vitora brand colors from globals.css.
 */

import { type ChartConfig } from "@/components/ui/chart";

/**
 * Healthcare-specific chart color schemes
 */
export const chartColors = {
  // Primary brand colors
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--secondary))",
  accent: "hsl(var(--accent))",

  // Semantic colors for status indicators
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  critical: "hsl(var(--critical))",
  info: "hsl(var(--info))",

  // Chart palette (5 colors for multi-series charts)
  chart1: "hsl(var(--chart-1))",
  chart2: "hsl(var(--chart-2))",
  chart3: "hsl(var(--chart-3))",
  chart4: "hsl(var(--chart-4))",
  chart5: "hsl(var(--chart-5))",

  // Muted variants for backgrounds
  muted: "hsl(var(--muted))",
  mutedForeground: "hsl(var(--muted-foreground))",
} as const;

/**
 * Pre-built chart configurations for common HMIS use cases
 */

// Patient demographics (gender distribution)
export const genderChartConfig = {
  male: {
    label: "Male",
    color: "hsl(var(--gender-male))",
  },
  female: {
    label: "Female",
    color: "hsl(var(--gender-female))",
  },
  other: {
    label: "Other",
    color: "hsl(var(--gender-other))",
  },
} satisfies ChartConfig;

// Encounter types
export const encounterTypeConfig = {
  opd: {
    label: "Outpatient",
    color: "hsl(var(--chart-1))",
  },
  ipd: {
    label: "Inpatient",
    color: "hsl(var(--chart-2))",
  },
  emergency: {
    label: "Emergency",
    color: "hsl(var(--critical))",
  },
} satisfies ChartConfig;

// Vital signs status
export const vitalStatusConfig = {
  normal: {
    label: "Normal",
    color: "hsl(var(--success))",
  },
  warning: {
    label: "Abnormal",
    color: "hsl(var(--warning))",
  },
  critical: {
    label: "Critical",
    color: "hsl(var(--critical))",
  },
} satisfies ChartConfig;

// Sync status for offline-first features
export const syncStatusConfig = {
  synced: {
    label: "Synced",
    color: "hsl(var(--sync-synced))",
  },
  pending: {
    label: "Pending",
    color: "hsl(var(--sync-pending))",
  },
  syncing: {
    label: "Syncing",
    color: "hsl(var(--sync-syncing))",
  },
  failed: {
    label: "Failed",
    color: "hsl(var(--sync-failed))",
  },
  conflict: {
    label: "Conflict",
    color: "hsl(var(--sync-conflict))",
  },
} satisfies ChartConfig;

// Billing/Revenue charts
export const revenueConfig = {
  collected: {
    label: "Collected",
    color: "hsl(var(--success))",
  },
  pending: {
    label: "Pending",
    color: "hsl(var(--warning))",
  },
  overdue: {
    label: "Overdue",
    color: "hsl(var(--critical))",
  },
} satisfies ChartConfig;

// Lab test status
export const labStatusConfig = {
  completed: {
    label: "Completed",
    color: "hsl(var(--success))",
  },
  pending: {
    label: "Pending",
    color: "hsl(var(--warning))",
  },
  inProgress: {
    label: "In Progress",
    color: "hsl(var(--info))",
  },
} satisfies ChartConfig;

// Pharmacy/Inventory
export const inventoryConfig = {
  inStock: {
    label: "In Stock",
    color: "hsl(var(--success))",
  },
  lowStock: {
    label: "Low Stock",
    color: "hsl(var(--warning))",
  },
  outOfStock: {
    label: "Out of Stock",
    color: "hsl(var(--critical))",
  },
  expiring: {
    label: "Expiring Soon",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig;

// SHA Claims status
export const claimsStatusConfig = {
  approved: {
    label: "Approved",
    color: "hsl(var(--success))",
  },
  pending: {
    label: "Pending",
    color: "hsl(var(--warning))",
  },
  rejected: {
    label: "Rejected",
    color: "hsl(var(--critical))",
  },
  submitted: {
    label: "Submitted",
    color: "hsl(var(--info))",
  },
} satisfies ChartConfig;

// Monthly trends (generic)
export const monthlyTrendConfig = {
  current: {
    label: "Current Period",
    color: "hsl(var(--primary))",
  },
  previous: {
    label: "Previous Period",
    color: "hsl(var(--muted-foreground))",
  },
} satisfies ChartConfig;

// Patient flow / Queue
export const queueStatusConfig = {
  waiting: {
    label: "Waiting",
    color: "hsl(var(--warning))",
  },
  inConsultation: {
    label: "In Consultation",
    color: "hsl(var(--info))",
  },
  completed: {
    label: "Completed",
    color: "hsl(var(--success))",
  },
} satisfies ChartConfig;

/**
 * Helper function to create a chart config from data keys
 */
export function createChartConfig(
  keys: string[],
  options?: {
    labels?: Record<string, string>;
    colors?: Record<string, string>;
  }
): ChartConfig {
  const defaultColors = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];

  return keys.reduce((config, key, index) => {
    config[key] = {
      label: options?.labels?.[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
      color: options?.colors?.[key] ?? defaultColors[index % defaultColors.length],
    };
    return config;
  }, {} as ChartConfig);
}

/**
 * Format number for display in charts
 */
export function formatChartValue(value: number, type: "number" | "currency" | "percent" = "number"): string {
  switch (type) {
    case "currency":
      return new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    default:
      return value.toLocaleString("en-KE");
  }
}

/**
 * Month names for chart labels
 */
export const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Short month names
 */
export const monthNamesShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
