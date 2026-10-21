// In-memory stand-in for the Supabase client, covering the query shapes used by
// the sync modules. It mirrors the schema rules sync depends on: updates bump
// `sync_version`, primary keys are unique, one cover per entry
// (`entry_media_one_cover_idx`), entry deletes cascade to media and To-Dos, and
// `entries.deleted_at` takes the server's time and keeps the first one
// (`entries_apply_deletion_time`).

const uniqueKeys = {
  entries: [['id']],
  entry_media: [['id'], ['storage_path']],
  journal_sections: [['id'], ['user_id', 'built_in_key']],
  sync_tombstones: [['user_id', 'entity_type', 'entity_id']],
  todo_items: [['id']],
  trips: [['id']],
};

let clock = Date.parse('2026-09-24T10:00:00Z');
function now() {
  clock += 1000;
  return new Date(clock).toISOString();
}

export const db = {
  failUploads: false,
  requests: [],
  storage: new Map(),
  tables: {},
  reset() {
    this.failUploads = false;
    this.requests = [];
    this.storage = new Map();
    this.tables = {};
  },
  rows(table) {
    this.tables[table] ??= [];
    return this.tables[table];
  },
};

function duplicateError(table, name) {
  return { code: '23505', message: `duplicate key value violates unique constraint "${name ?? `${table}_pkey`}"` };
}

// Like Postgres, a uuid column rejects anything that is not a UUID (todo_items.id is one).
const uuidColumns = { todo_items: ['id', 'entry_id'] };
const uuidText = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function violation(table, candidate, ignore) {
  for (const column of uuidColumns[table] ?? []) {
    if (candidate[column] !== undefined && !uuidText.test(String(candidate[column]))) {
      return { code: '22P02', message: `invalid input syntax for type uuid: "${candidate[column]}"` };
    }
  }
  const rows = db.rows(table).filter((row) => row !== ignore);
  for (const key of uniqueKeys[table] ?? [['id']]) {
    // Like SQL, a NULL in a unique key never conflicts.
    if (key.some((column) => candidate[column] === null || candidate[column] === undefined)) continue;
    if (rows.some((row) => key.every((column) => row[column] === candidate[column]))) {
      return duplicateError(table, key[0] === 'id' ? undefined : `${table}_${key.join('_')}_key`);
    }
  }
  if (
    table === 'entry_media' &&
    candidate.is_cover &&
    rows.some((row) => row.is_cover && row.entry_id === candidate.entry_id)
  ) {
    return duplicateError(table, 'entry_media_one_cover_idx');
  }
  return null;
}

// Mirrors the entries_apply_deletion_time trigger in supabase/migrations/20261001234204_recently_deleted.sql.
function applyDeletionTime(table, previous, next, timestamp) {
  if (table !== 'entries' || next.deleted_at === undefined || next.deleted_at === null) return;
  next.deleted_at = previous?.deleted_at ?? timestamp;
}

function insertRow(table, values) {
  const timestamp = now();
  const row = { created_at: timestamp, sync_version: 1, updated_at: timestamp, ...values };
  applyDeletionTime(table, null, row, timestamp);
  row.id ??= crypto.randomUUID();
  const error = violation(table, row);
  if (error) return { error };
  db.rows(table).push(row);
  return { row };
}

function updateRow(table, row, values) {
  const next = { ...row, ...values, sync_version: row.sync_version + 1, updated_at: now() };
  if ('deleted_at' in values) applyDeletionTime(table, row, next, next.updated_at);
  const error = violation(table, next, row);
  if (error) return { error };
  Object.assign(row, next);
  return { row };
}

function deleteRows(table, rows) {
  db.tables[table] = db.rows(table).filter((row) => !rows.includes(row));
  if (table === 'entries') {
    const ids = new Set(rows.map((row) => row.id));
    db.tables.entry_media = db.rows('entry_media').filter((row) => !ids.has(row.entry_id));
    db.tables.todo_items = db.rows('todo_items').filter((row) => !ids.has(row.entry_id));
  }
}

function project(table, row, columns) {
  if (!columns || columns === '*') return { ...row };
  const result = {};
  const embed = columns.match(/(\w+)\(([^)]*)\)/);
  for (const column of columns
    .replace(/,?\w+\([^)]*\)/, '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)) {
    if (column === '*') Object.assign(result, row);
    else result[column] = row[column];
  }
  if (embed && table === 'entries') {
    result[embed[1]] = db
      .rows(embed[1])
      .filter((child) => child.entry_id === row.id)
      .map((child) => project(embed[1], child, embed[2]));
  }
  return result;
}

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.operation = 'select';
    this.columns = '*';
    this.returning = null;
    this.cardinality = 'many';
  }

  select(columns = '*') {
    if (this.operation === 'select') this.columns = columns;
    else this.returning = columns;
    return this;
  }

  insert(values) {
    this.operation = 'insert';
    this.values = values;
    return this;
  }
  update(values) {
    this.operation = 'update';
    this.values = values;
    return this;
  }
  upsert(values, options = {}) {
    this.operation = 'upsert';
    this.values = values;
    this.conflictColumns = (options.onConflict ?? 'id').split(',');
    return this;
  }
  delete() {
    this.operation = 'delete';
    return this;
  }
  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column, values) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  // Dates are ISO strings here, so text order is date order.
  lte(column, value) {
    this.filters.push((row) => row[column] <= value);
    return this;
  }
  gte(column, value) {
    this.filters.push((row) => row[column] >= value);
    return this;
  }
  limit(count) {
    this.maxRows = count;
    return this;
  }
  maybeSingle() {
    this.cardinality = 'maybe';
    return this;
  }
  single() {
    this.cardinality = 'one';
    return this;
  }

  matching() {
    return db.rows(this.table).filter((row) => this.filters.every((filter) => filter(row)));
  }

  run() {
    db.requests.push({ operation: this.operation, table: this.table, values: this.values });
    let rows = [];
    if (this.operation === 'select') {
      rows = this.matching().slice(0, this.maxRows ?? Infinity);
    } else if (this.operation === 'insert') {
      for (const values of [this.values].flat()) {
        const { error, row } = insertRow(this.table, values);
        if (error) return { data: null, error };
        rows.push(row);
      }
    } else if (this.operation === 'update') {
      for (const row of this.matching()) {
        const { error } = updateRow(this.table, row, this.values);
        if (error) return { data: null, error };
        rows.push(row);
      }
    } else if (this.operation === 'upsert') {
      for (const values of [this.values].flat()) {
        const existing = db
          .rows(this.table)
          .find((row) => this.conflictColumns.every((column) => row[column] === values[column]));
        const { error, row } = existing ? updateRow(this.table, existing, values) : insertRow(this.table, values);
        if (error) return { data: null, error };
        rows.push(row);
      }
    } else {
      rows = this.matching();
      deleteRows(this.table, rows);
    }

    const columns = this.operation === 'select' ? this.columns : this.returning;
    if (this.operation !== 'select' && columns === null) return { data: null, error: null };
    const data = rows.map((row) => project(this.table, row, columns));
    if (this.cardinality === 'many') return { data, error: null };
    if (data.length > 1 || (this.cardinality === 'one' && data.length === 0)) {
      return {
        data: null,
        error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      };
    }
    return { data: data[0] ?? null, error: null };
  }

  then(resolve, reject) {
    return Promise.resolve()
      .then(() => this.run())
      .then(resolve, reject);
  }
}

export const supabase = {
  from(table) {
    return new Query(table);
  },
  storage: {
    from() {
      return {
        async createSignedUrl(path) {
          return { data: { signedUrl: `https://storage.test/${path}` }, error: null };
        },
        async remove(paths) {
          for (const path of paths) db.storage.delete(path);
          return { data: null, error: null };
        },
        async upload(path, bytes) {
          // true is a lost connection; an error object is returned as Storage's answer.
          if (db.failUploads)
            return {
              data: null,
              error: db.failUploads === true ? { message: 'The network connection was lost.' } : db.failUploads,
            };
          db.storage.set(path, bytes);
          return { data: { path }, error: null };
        },
      };
    },
  },
};
