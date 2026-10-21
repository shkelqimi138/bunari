// Journal types (entries, folders, trips, To-Dos) with the built-in folders, entry limits, and folder and date helpers

// Built-in folder keys stored in `journal_sections.built_in_key`. Custom folders
// have no key and are identified by their row id instead.
export type BuiltInSectionKey = 'home' | 'private' | 'todo' | 'finance' | 'fitness' | 'thoughts' | 'travel' | 'other';

// A folder id: a built-in key, or the uuid of a custom folder.
export type JournalSectionId = string;

export type EntryMood = 'Calm' | 'Grateful' | 'Focused' | 'Restless' | 'Joyful';

// An AI mood suggestion kept with its entry; contentKey fingerprints the text it was written for.
export type EntryMoodSuggestion = { contentKey: string; mood: EntryMood; reason: string };

export type RichTextDocument = {
  content: Record<string, unknown>[];
  type: 'doc';
};

export type EntryAttachment = {
  createdAt: string;
  id: string;
  mimeType?: string;
  storagePath?: string | null;
  uri: string;
};

export type TodoItem = {
  completed: boolean;
  dueTag: string | null;
  id: string;
  text: string;
};

export type Trip = {
  destination: string;
  emoji: string;
  endDate: string;
  id: string;
  startDate: string;
  syncVersion?: number;
  updatedAt?: string;
};

export type JournalEntry = {
  attachments: EntryAttachment[];
  body: RichTextDocument;
  coverUri: string | null;
  coverMediaId?: string | null;
  coverMimeType?: string | null;
  coverStoragePath?: string | null;
  createdAt: string;
  // When the entry was moved to Recently Deleted (set by the server on sync); null or absent
  // for entries that are not deleted.
  deletedAt?: string | null;
  description: string;
  favorite: boolean;
  id: string;
  latitude: number | null;
  locationLabel: string | null;
  longitude: number | null;
  mood: EntryMood | null;
  // The last AI mood suggestion for this entry, with its reason; offered again only after the text
  // changes (src/domain/mood.ts). Regular entries only.
  moodSuggestion?: EntryMoodSuggestion | null;
  plainText: string;
  reviewed: boolean;
  sectionId: JournalSectionId;
  syncVersion?: number;
  title: string;
  todoItems?: TodoItem[];
  tripId?: string | null;
  updatedAt: string;
  // Private entries only (inside the encrypted payload): the protected folder
  // this entry belongs to, or none for the Private root.
  folderId?: string | null;
  // Local only: the entry was stored in the retired Travel folder, so trips still
  // match it by date until it is linked to a trip explicitly.
  legacyTravel?: boolean;
};

export type JournalFolder = {
  builtInKey: BuiltInSectionKey | null;
  emoji: string;
  id: JournalSectionId;
  locked?: boolean;
  name: string;
  position: number;
};

// Notes (stored as the built-in `home` key) is the default folder: entries created
// without a folder go there, and deleted folders move their entries there.
// Longest title, description, and To-Do the app accepts; the database allows a little more
// (`migrations/20260928204805_entry_length_limits.sql`, and 1,000 characters for a To-Do), so saves never fail on length.
// The title allows the longest daily prompt (240 characters, `server/openai.mjs`), since a note
// started from a prompt takes the prompt as its title. Longer titles saved earlier are kept as they are.
export const entryTitleMaxLength = 240;
export const entryDescriptionMaxLength = 2000;
export const todoTextMaxLength = 1000;

export const notesFolderId = 'home';
export const privateFolderId = 'private';
// Folders that no longer exist; their entries are shown in Notes.
export const retiredSectionKeys: readonly string[] = ['travel', 'other'];

const builtInFolders: Record<string, Omit<JournalFolder, 'builtInKey' | 'id' | 'position'>> = {
  home: { emoji: '📝', name: 'Notes' },
  private: { emoji: '🔒', locked: true, name: 'Private' },
  todo: { emoji: '✅', name: 'To-Do' },
  finance: { emoji: '💰', name: 'Finance' },
  fitness: { emoji: '💪', name: 'Fitness' },
  thoughts: { emoji: '🧠', name: 'Thoughts' },
};

export const defaultFolders: JournalFolder[] = Object.entries(builtInFolders).map(([key, folder], position) => ({
  ...folder,
  builtInKey: key as BuiltInSectionKey,
  id: key,
  position,
}));

// Maps a stored folder to what the app shows; built-in folders use the app's names.
export function folderFromRow(row: {
  built_in_key: string | null;
  emoji: string;
  id: string;
  name: string;
  position: number;
}): JournalFolder | null {
  if (row.built_in_key && retiredSectionKeys.includes(row.built_in_key)) return null;
  const builtIn = row.built_in_key ? builtInFolders[row.built_in_key] : undefined;
  if (row.built_in_key && !builtIn) return null;
  return {
    builtInKey: (row.built_in_key as BuiltInSectionKey | null) ?? null,
    emoji: builtIn?.emoji ?? row.emoji,
    id: row.built_in_key ?? row.id,
    locked: builtIn?.locked,
    name: builtIn?.name ?? row.name,
    position: row.position,
  };
}

// The folder an entry is shown in: retired or missing folders fall back to Notes.
export function resolveEntryFolderId(sectionId: string, folders: JournalFolder[]) {
  if (sectionId === privateFolderId) return privateFolderId;
  return folders.some((folder) => folder.id === sectionId) ? sectionId : notesFolderId;
}

// Entries cached from the retired Travel and Other folders are shown in Notes.
export function normalizeRetiredEntry(entry: JournalEntry): JournalEntry {
  if (!retiredSectionKeys.includes(entry.sectionId)) return entry;
  return {
    ...entry,
    ...(entry.sectionId === 'travel' && !entry.tripId ? { legacyTravel: true } : {}),
    sectionId: notesFolderId,
  };
}

export function isDeletableFolder(folderId: string) {
  return folderId !== notesFolderId && folderId !== privateFolderId;
}

export function sortFolders(folders: JournalFolder[]) {
  return [...folders].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export function findFolder(folders: JournalFolder[], folderId: string | undefined) {
  return folders.find((folder) => folder.id === folderId);
}

// The single trip whose date range contains this date, if exactly one does.
export function tripContainingDate(trips: Trip[], isoDate: string) {
  const time = Date.parse(isoDate);
  const matches = trips.filter(
    (trip) =>
      time >= new Date(`${trip.startDate}T00:00:00`).getTime() &&
      time <= new Date(`${trip.endDate}T23:59:59.999`).getTime(),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

// The On This Day year to show: the one the user picked while it is still in the list, otherwise
// the first one (the list changes at midnight while the app stays open).
export function onThisDayYear(years: number[], pickedYear: number | undefined) {
  return pickedYear !== undefined && years.includes(pickedYear) ? pickedYear : years[0];
}

export const entryMoods: EntryMood[] = ['Calm', 'Grateful', 'Focused', 'Restless', 'Joyful'];

export function formatTripDateRange(trip: Trip) {
  const start = new Date(`${trip.startDate}T12:00:00`);
  const end = new Date(`${trip.endDate}T12:00:00`);
  const startLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(start);
  const endLabel = new Intl.DateTimeFormat(undefined, {
    month: start.getMonth() === end.getMonth() ? undefined : 'short',
    day: 'numeric',
    year: start.getFullYear() === end.getFullYear() ? undefined : 'numeric',
  }).format(end);
  return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
}

export function formatEntryDate(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}
