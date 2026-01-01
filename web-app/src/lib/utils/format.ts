import { format, formatDistance } from 'date-fns';

/**
 * Format a date string to a readable format.
 * @param dateString ISO date string
 * @returns Formatted date (e.g., "Jan 15, 2026")
 */
export function formatDate(dateString: string): string {
  try {
    return format(new Date(dateString), 'MMM d, yyyy');
  } catch {
    return dateString;
  }
}

/**
 * Format a date string to relative time.
 * @param dateString ISO date string
 * @returns Relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateString: string): string {
  try {
    return formatDistance(new Date(dateString), new Date(), { addSuffix: true });
  } catch {
    return dateString;
  }
}

/**
 * Format a date and time string to a readable format.
 * @param dateString ISO datetime string
 * @returns Formatted datetime (e.g., "Jan 15, 2026 at 2:30 PM")
 */
export function formatDateTime(dateString: string): string {
  try {
    return format(new Date(dateString), 'MMM d, yyyy \'at\' h:mm a');
  } catch {
    return dateString;
  }
}
