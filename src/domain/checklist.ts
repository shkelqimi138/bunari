// Checklist items in any note are the entry's To-Dos
import { todoTextMaxLength, type RichTextDocument, type TodoItem } from '@/domain/journal';

type DocumentNode = {
  attrs?: Record<string, unknown>;
  content?: DocumentNode[];
  marks?: unknown[];
  text?: string;
  type?: string;
};

// Every checklist item in document order, including indented ones.
function taskItems(document: RichTextDocument) {
  const items: DocumentNode[] = [];
  const visit = (node: DocumentNode) => {
    if (node.type === 'taskItem') items.push(node);
    node.content?.forEach(visit);
  };
  (document.content as DocumentNode[]).forEach(visit);
  return items;
}

// The item's own line: its paragraph, without any indented items below it.
function firstParagraph(item: DocumentNode) {
  return item.content?.find((child) => child.type === 'paragraph');
}

function paragraphText(paragraph: DocumentNode | undefined) {
  return (paragraph?.content ?? []).map((node) => node.text ?? '').join('');
}

// A stable UUID per entry and checklist position, so saving again updates the same To-Do.
export function checklistItemId(entryId: string, index: number) {
  let hex = '';
  for (let round = 0; hex.length < 32; round += 1) {
    let hash = 0x811c9dc5;
    for (const character of `${entryId}:${index}:${round}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hex += hash.toString(16).padStart(8, '0');
  }
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function hasChecklist(document: RichTextDocument) {
  return taskItems(document).length > 0;
}

// Reads the To-Dos from a note's checklist: each non-empty item line is one To-Do.
export function collectChecklist(document: RichTextDocument, entryId: string): TodoItem[] {
  const todoItems: TodoItem[] = [];
  taskItems(document).forEach((item, index) => {
    // The note keeps the whole line; the To-Do copy is cut to what the database stores.
    const text = paragraphText(firstParagraph(item)).trim().slice(0, todoTextMaxLength);
    if (text)
      todoItems.push({
        completed: item.attrs?.checked === true,
        dueTag: null,
        id: checklistItemId(entryId, index),
        text,
      });
  });
  return todoItems;
}

// Ticks or unticks the checklist item behind a To-Do; returns null when it is not there.
export function setChecklistItemChecked(
  document: RichTextDocument,
  entryId: string,
  todoItemId: string,
  checked: boolean,
) {
  const result = JSON.parse(JSON.stringify(document)) as RichTextDocument;
  const index = taskItems(result).findIndex((_, position) => checklistItemId(entryId, position) === todoItemId);
  if (index < 0) return null;
  const item = taskItems(result)[index]!;
  item.attrs = { ...item.attrs, checked };
  return result;
}

// Tasks saved before checklists carried To-Dos are added to the note as a checklist, so
// they can be edited in the text.
export function withTodosAsChecklist(document: RichTextDocument, todoItems: TodoItem[] | undefined) {
  if (!todoItems?.length || hasChecklist(document)) return document;
  return {
    ...document,
    content: [
      ...document.content,
      {
        content: todoItems.map((todo) => ({
          attrs: { checked: todo.completed },
          content: [{ content: [{ text: todo.text, type: 'text' }], type: 'paragraph' }],
          type: 'taskItem',
        })),
        type: 'taskList',
      },
    ],
  };
}

// A new To-Do entry starts with an empty checklist item.
export const checklistDocument: RichTextDocument = {
  content: [
    { content: [{ attrs: { checked: false }, content: [{ type: 'paragraph' }], type: 'taskItem' }], type: 'taskList' },
  ],
  type: 'doc',
};

// The To-Dos a new entry is saved with, numbered by its real ID so ticks from lists find
// the right checklist line. Entries without a checklist keep the given tasks.
export function todosForNewEntry(
  entryId: string,
  body: RichTextDocument,
  todoItems: TodoItem[] | undefined,
  makeId: () => string,
) {
  if (hasChecklist(body)) return collectChecklist(body, entryId);
  return (todoItems ?? []).map((item) => ({ ...item, id: makeId() }));
}

// Ticks or unticks a To-Do and its checklist line in the note.
export function toggleEntryTodo(
  entry: { body: RichTextDocument; id: string; todoItems?: TodoItem[] },
  todoItemId: string,
) {
  const todo = entry.todoItems?.find((item) => item.id === todoItemId);
  if (!todo) return null;
  const completed = !todo.completed;
  return {
    body: setChecklistItemChecked(entry.body, entry.id, todoItemId, completed) ?? entry.body,
    todoItems: entry.todoItems!.map((item) => (item.id === todoItemId ? { ...item, completed } : item)),
  };
}
