/**
 * Parameterized SQL Query Builders for PowerSync
 *
 * All functions return { sql, params } tuples with positional ? placeholders.
 * NEVER interpolate user input into SQL strings — always use parameters.
 */

export interface SqlQuery {
  sql: string;
  params: (string | number | null)[];
}

export interface ListQueryOptions {
  /** Column name → value for exact match WHERE clauses */
  filters?: Record<string, string | number | null>;
  /** Columns to search with LIKE %term% */
  searchColumns?: string[];
  /** The search term (applied across all searchColumns with OR) */
  searchTerm?: string;
  /** ORDER BY clause, e.g. 'last_name ASC' or 'created_at DESC' */
  orderBy?: string;
  /** Maximum rows to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Build a SELECT query for listing rows with optional filtering,
 * search, ordering, and pagination.
 *
 * @param table - PowerSync table name (e.g. 'patients_patient')
 * @param options - Query options
 * @param selectColumns - Columns to select (default: '*')
 */
export function buildListQuery(
  table: string,
  options: ListQueryOptions = {},
  selectColumns = '*'
): SqlQuery {
  const { filters, searchColumns, searchTerm, orderBy, limit, offset } = options;
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  // Exact match filters
  if (filters) {
    for (const [col, val] of Object.entries(filters)) {
      if (val !== undefined && val !== null) {
        conditions.push(`${col} = ?`);
        params.push(val);
      }
    }
  }

  // LIKE search across multiple columns
  if (searchTerm && searchColumns && searchColumns.length > 0) {
    const likeClauses = searchColumns.map(col => `${col} LIKE ?`);
    conditions.push(`(${likeClauses.join(' OR ')})`);
    const pattern = `%${searchTerm}%`;
    for (let i = 0; i < searchColumns.length; i++) {
      params.push(pattern);
    }
  }

  let sql = `SELECT ${selectColumns} FROM ${table}`;
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }
  if (limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(limit);
  }
  if (offset !== undefined) {
    sql += ` OFFSET ?`;
    params.push(offset);
  }

  return { sql, params };
}

/**
 * Build a COUNT query matching the same filters/search as buildListQuery.
 */
export function buildCountQuery(
  table: string,
  options: Pick<ListQueryOptions, 'filters' | 'searchColumns' | 'searchTerm'> = {}
): SqlQuery {
  const { sql: listSql, params } = buildListQuery(table, options, 'COUNT(*) as count');
  return { sql: listSql, params };
}

/**
 * Build a SELECT query for a single row by ID.
 */
export function buildDetailQuery(table: string, id: string | number): SqlQuery {
  return {
    sql: `SELECT * FROM ${table} WHERE id = ?`,
    params: [typeof id === 'number' ? String(id) : id],
  };
}

/**
 * Build an INSERT query from a data object.
 * The `id` field should be pre-generated via generateId().
 */
export function buildInsertQuery(
  table: string,
  data: Record<string, string | number | null | undefined>
): SqlQuery {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  const columns = entries.map(([k]) => k);
  const placeholders = entries.map(() => '?');
  const params = entries.map(([, v]) => v ?? null);

  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    params,
  };
}

/**
 * Build an UPDATE query for a single row by ID.
 */
export function buildUpdateQuery(
  table: string,
  id: string | number,
  data: Record<string, string | number | null | undefined>
): SqlQuery {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  const setClauses = entries.map(([k]) => `${k} = ?`);
  const params: (string | number | null)[] = entries.map(([, v]) => v ?? null);
  params.push(typeof id === 'number' ? String(id) : id);

  return {
    sql: `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
  };
}

/**
 * Build a DELETE query for a single row by ID.
 */
export function buildDeleteQuery(table: string, id: string | number): SqlQuery {
  return {
    sql: `DELETE FROM ${table} WHERE id = ?`,
    params: [typeof id === 'number' ? String(id) : id],
  };
}
