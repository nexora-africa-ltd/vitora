import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx.
 * Handles class conflicts properly using tailwind-merge.
 *
 * @param inputs - Class values to merge (strings, arrays, objects, conditionals)
 * @returns Merged class string with conflicts resolved
 *
 * @example
 * cn('p-4', 'p-2') // 'p-2' - last wins for conflicts
 * cn('p-4', { 'm-2': true, 'text-lg': false }) // 'p-4 m-2'
 * cn('p-4', false && 'm-2', 'text-sm') // 'p-4 text-sm'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
