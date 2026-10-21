// Dates typed on the number pad as day, month, year (DD.MM.YYYY); stored as YYYY-MM-DD
const typedPattern = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const storedPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const firstYear = 1900;
const lastYear = 2100;

// Shapes whatever was typed or pasted into DD.MM.YYYY: only digits count, and each dot appears once
// the next digit is typed, so deleting goes back one digit at a time.
export function formatTypedDate(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export type TextSelection = { end: number; start: number };

// Day, month and year are fixed parts of the field: editing one never moves the others.
const partLengths = [2, 2, 4] as const;
// The highest day and month while typing; the whole date is checked on saving.
const partMaximums = [31, 12] as const;

type Caret = { offset: number; part: number };

// What an edit in a DD.MM.YYYY field becomes: `previous` was the field's text, `selection` the cursor
// (or selected range) just before the edit, and `changed` the text the keyboard produced. Returns the
// new text and where the cursor goes. Deleting empties a digit's place in its own part, and typing
// fills the part at the cursor (a full day or month goes on into the next part); a day above 31 or a
// month above 12 cannot be typed, and a digit that cannot start one (a day of 4–9, a month of 2–9)
// becomes 04–09. Backspace just after a dot deletes the digit before it. Anything else, such as
// pasted text, is reshaped from its digits with the cursor at the end.
export function editTypedDate(previous: string, selection: TextSelection, changed: string) {
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  const after = previous.slice(end);
  const deleted = previous.length - changed.length;
  const parts = previous
    .split('.')
    .slice(0, 3)
    .map((part) => part.replace(/\D/g, ''));
  const reshaped = () => {
    const text = formatTypedDate(changed);
    return { caret: text.length, text };
  };

  let caret: Caret;
  let typed = '';
  if (start === end && deleted > 0 && deleted <= start && changed === previous.slice(0, start - deleted) + after) {
    // Backspace at the cursor.
    if (deleted === 1 && previous.charAt(start - 1) === '.') {
      caret = caretAt(parts, start - 1);
      const part = parts[caret.part] ?? '';
      if (part.length > 0) {
        parts[caret.part] = part.slice(0, -1);
        caret = { offset: part.length - 1, part: caret.part };
      }
    } else {
      caret = removeRange(parts, start - deleted, start);
    }
  } else if (
    changed.length >= start + after.length &&
    changed.startsWith(previous.slice(0, start)) &&
    changed.endsWith(after)
  ) {
    // Typing one digit, or deleting a selected range (and typing a digit over it).
    typed = changed.slice(start, changed.length - after.length);
    // Nothing typed and nothing selected, yet the text changed: the cursor did not come from before the
    // edit, so rebuild from all the digits rather than lose one.
    if (!/^\d?$/.test(typed) || (!typed && start === end)) return reshaped();
    caret = removeRange(parts, start, end);
  } else {
    return reshaped();
  }

  if (typed) {
    const next = insertDigit(parts, caret, typed);
    if (!next) return { caret: start, text: previous };
    caret = next;
  }
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  const text = parts.join('.');
  return { caret: Math.min(partStart(parts, caret.part) + caret.offset, text.length), text };
}

function partStart(parts: string[], index: number) {
  let position = 0;
  for (let part = 0; part < index; part += 1) position += (parts[part]?.length ?? 0) + 1;
  return position;
}

// The part and offset of a cursor position: just before a dot is the end of the part before it, just
// after a dot the start of the next one.
function caretAt(parts: string[], position: number): Caret {
  let start = 0;
  for (let part = 0; part < parts.length; part += 1) {
    const length = parts[part]?.length ?? 0;
    if (position <= start + length) return { offset: Math.max(0, position - start), part };
    start += length + 1;
  }
  const last = Math.max(0, parts.length - 1);
  return { offset: parts[last]?.length ?? 0, part: last };
}

// Removes the digits between two positions (dots stay) and returns where the cursor goes.
function removeRange(parts: string[], from: number, to: number): Caret {
  const caret = caretAt(parts, from);
  let start = 0;
  for (let part = 0; part < parts.length; part += 1) {
    const digits = parts[part] ?? '';
    parts[part] = [...digits].filter((_, index) => start + index < from || start + index >= to).join('');
    start += digits.length + 1;
  }
  return caret;
}

function insertDigit(parts: string[], caret: Caret, digit: string): Caret | null {
  let { offset, part } = caret;
  // At the end of a full day or month, typing goes on into the next part.
  if (part < 2 && offset === (parts[part]?.length ?? 0) && offset === partLengths[part]) {
    part += 1;
    offset = 0;
  }
  const current = parts[part] ?? '';
  if (current.length >= (partLengths[part] ?? 0)) return null;
  let next = current.slice(0, offset) + digit + current.slice(offset);
  const maximum = partMaximums[part];
  if (maximum !== undefined) {
    if (next.length === 1 && Number(digit) > Math.floor(maximum / 10)) next = `0${digit}`;
    if (next.length === 2 && (Number(next) < 1 || Number(next) > maximum)) return null;
  }
  while (parts.length < part) parts.push('');
  parts[part] = next;
  return { offset: next.length - current.length === 2 ? 2 : offset + 1, part };
}

// The stored YYYY-MM-DD for a complete, real date (no 31.02, years 1900–2100), otherwise null.
export function typedDateToStored(text: string) {
  const match = typedPattern.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match.map(Number) as [number, number, number, number];
  if (year < firstYear || year > lastYear) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

// What is wrong with a typed date range, as the form says it while the user types (and again on
// saving), or null when both dates are complete, real and in order.
export function dateRangeProblem(startText: string, endText: string) {
  const start = typedDateToStored(startText);
  const end = typedDateToStored(endText);
  const hint = 'Use day, month and year, for example 05.10.2026.';
  if (!start && !end) return `Invalid dates. ${hint}`;
  if (!start) return `Invalid start date. ${hint}`;
  if (!end) return `Invalid end date. ${hint}`;
  if (start > end) return 'The end date is before the start date.';
  return null;
}

// DD.MM.YYYY for a stored YYYY-MM-DD date; anything else is returned unchanged.
export function storedDateToTyped(value: string) {
  const match = storedPattern.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}
