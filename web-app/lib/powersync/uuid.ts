/**
 * Client-side UUID generation for PowerSync local writes.
 *
 * PowerSync requires text UUIDs as primary keys in the local SQLite database.
 * The connector strips local IDs on upload; the backend assigns its own integer PK.
 * On sync-down, PowerSync reconciles the local UUID with the server record.
 */

/**
 * Generate a v4 UUID for use as a local PowerSync record ID.
 */
export function generateId(): string {
  return crypto.randomUUID();
}
