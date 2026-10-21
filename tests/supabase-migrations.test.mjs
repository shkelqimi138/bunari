import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((name) =>
  name.endsWith('.sql'),
);
const readme = readFileSync(new URL('../supabase/README.md', import.meta.url), 'utf8');

test('migrations are named by the date they were added, so the folder sorts in the order to apply them (2026-10-08)', () => {
  assert.ok(migrations.length >= 12);
  for (const name of migrations) assert.match(name, /^\d{14}_[a-z0-9_]+\.sql$/, name);
  assert.equal(
    new Set(migrations.map((name) => name.slice(0, 14))).size,
    migrations.length,
    'every timestamp is unique',
  );
  assert.equal(migrations.toSorted()[0], '20260904212310_initial_schema.sql', 'the schema comes first');
});

test('supabase/README.md lists every migration, in order', () => {
  const listed = [...readme.matchAll(/`(\d{14}_[a-z0-9_]+\.sql)`/g)].map((match) => match[1]);
  assert.deepEqual(listed, migrations.toSorted());
});
