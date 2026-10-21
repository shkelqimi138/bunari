// Writes supabase/migrations/20261002183818_prompt_library_v2.sql from the app's prompt list (src/domain/prompts.ts).
// Run with `npm run prompts:sql` after changing prompts, then run the file in the Supabase SQL editor.
import { writeFileSync } from 'node:fs';

import { journalPrompts } from '../src/domain/prompts.ts';

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const categoryCount = new Set(journalPrompts.map((prompt) => prompt.categoryId)).size;
const rows = journalPrompts.map(
  (prompt) =>
    `  (${quote(prompt.id)}, ${quote(prompt.categoryId)}, ${quote(prompt.text)}, ${prompt.minutes}, 'curated', true)`,
);

const sql = `-- Prompt library: ${journalPrompts.length} prompts in ${categoryCount} categories. Generated from journalPrompts in
-- src/domain/prompts.ts by \`npm run prompts:sql\`; do not edit by hand. Saved prompts (prompt_favorites)
-- point at these rows, so a prompt has to exist here before it can be saved. Safe to run again:
-- existing prompts are updated.
insert into public.prompts(id, category_id, text, estimated_minutes, source, active)
values
${rows.join(',\n')}
on conflict (id) do update set
  category_id = excluded.category_id,
  text = excluded.text,
  estimated_minutes = excluded.estimated_minutes,
  source = excluded.source,
  active = excluded.active,
  updated_at = now();
`;

writeFileSync(new URL('../supabase/migrations/20261002183818_prompt_library_v2.sql', import.meta.url), sql);
console.log(`Wrote ${journalPrompts.length} prompts to supabase/migrations/20261002183818_prompt_library_v2.sql`);
