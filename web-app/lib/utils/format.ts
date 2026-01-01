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
export function formatDate(date: string | Date, pattern = 'MMM d, yyyy'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, pattern);
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
export function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(dateObj, { addSuffix: true });
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
