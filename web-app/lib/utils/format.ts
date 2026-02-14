import { format, formatDistanceToNow, parseISO, differenceInYears } from 'date-fns';

/**
 * Format a date string to a readable format.
 *
 * @param date - ISO date string or Date object
 * @param pattern - date-fns format pattern (default: 'MMM d, yyyy')
 * @returns Formatted date string
 *
 * @example
 * formatDate('2025-12-25') // 'Dec 25, 2025'
 * formatDate('2025-12-25', 'yyyy-MM-dd') // '2025-12-25'
 */
export function formatDate(date: string | Date | null | undefined, pattern = 'MMM d, yyyy'): string {
  if (!date) return '-';
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(dateObj.getTime())) return '-';
    return format(dateObj, pattern);
  } catch {
    return '-';
  }
}

/**
 * Format a date and time string to a readable format.
 *
 * @param date - ISO date string or Date object
 * @param pattern - date-fns format pattern (default: 'MMM d, yyyy h:mm a')
 * @returns Formatted date-time string
 *
 * @example
 * formatDateTime('2025-12-25T14:30:00') // 'Dec 25, 2025 2:30 PM'
 */
export function formatDateTime(date: string | Date | null | undefined, pattern = 'MMM d, yyyy h:mm a'): string {
  if (!date) return '-';
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(dateObj.getTime())) return '-';
    return format(dateObj, pattern);
  } catch {
    return '-';
  }
}

/**
 * Format a date as relative time (e.g., "2 hours ago").
 *
 * @param date - ISO date string or Date object
 * @returns Relative time string
 *
 * @example
 * formatRelativeTime('2025-12-31T10:00:00') // 'about 2 hours ago'
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(dateObj.getTime())) return '-';
    return formatDistanceToNow(dateObj, { addSuffix: true });
  } catch {
    return '-';
  }
}

/**
 * Calculate age from date of birth.
 *
 * @param dateOfBirth - ISO date string or Date object
 * @returns Age in years
 *
 * @example
 * calculateAge('1990-01-01') // 35 (if current year is 2025)
 */
export function calculateAge(dateOfBirth: string | Date): number {
  const dob = typeof dateOfBirth === 'string' ? parseISO(dateOfBirth) : dateOfBirth;
  return differenceInYears(new Date(), dob);
}

/**
 * Format phone number for display.
 * Handles Kenyan phone number formats.
 *
 * @param phone - Phone number string
 * @returns Formatted phone number
 *
 * @example
 * formatPhoneNumber('+254712345678') // '+254 712 345 678'
 * formatPhoneNumber('0712345678') // '0712 345 678'
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';

  // Already formatted, return as-is
  if (phone.includes(' ')) return phone;

  // Format Kenyan phone numbers +254
  if (phone.startsWith('+254') && phone.length === 13) {
    return phone.replace(/(\+254)(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4');
  }

  // Format local Kenyan 0xxx numbers
  if (phone.startsWith('0') && phone.length === 10) {
    return phone.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
  }

  return phone;
}

/**
 * Format currency (KES - Kenyan Shilling).
 *
 * @param amount - Numeric amount
 * @returns Formatted currency string
 *
 * @example
 * formatCurrency(1500) // 'KES 1,500'
 * formatCurrency(1500000) // 'KES 1,500,000'
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format MRN for display.
 * MRN is already in the correct format (MRN-YYYYMMDD-XXXX).
 *
 * @param mrn - Medical Record Number
 * @returns Formatted MRN (unchanged)
 */
export function formatMRN(mrn: string): string {
  return mrn;
}

/**
 * Format bytes to human-readable string.
 *
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string (e.g., "1.5 MB")
 *
 * @example
 * formatBytes(1024) // '1 KB'
 * formatBytes(1536000) // '1.5 MB'
 */
export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (bytes === null || bytes === undefined || bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format time string (HH:MM:SS or HH:MM) to readable format.
 *
 * @param time - Time string in HH:MM:SS or HH:MM format
 * @returns Formatted time string (e.g., "2:30 PM")
 *
 * @example
 * formatTime('14:30:00') // '2:30 PM'
 * formatTime('09:00') // '9:00 AM'
 */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '-';

  try {
    // Parse time string
    const parts = time.split(':');
    if (parts.length < 2 || !parts[0] || !parts[1]) return time;

    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12 || 12;

    return `${hours}:${minutes} ${ampm}`;
  } catch {
    return time;
  }
}
