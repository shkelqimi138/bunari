// Route that opens the entry editor for a new entry in the chosen folder or trip
import { useLocalSearchParams } from 'expo-router';

import { EntryEditorScreen } from '@/components/entry/entry-editor-screen';
import { notesFolderId, privateFolderId, resolveEntryFolderId } from '@/domain/journal';
import { useJournal } from '@/state/journal-context';
import { usePrivateJournal } from '@/state/private-journal-context';

export default function NewEntryScreen() {
  const privateJournal = usePrivateJournal();
  const { folders } = useJournal();
  const { body, description, folderId, prompt, sectionId, title, tripId } = useLocalSearchParams<{
    body?: string;
    description?: string;
    folderId?: string;
    prompt?: string;
    sectionId?: string;
    title?: string;
    tripId?: string;
  }>();
  // Entries go to the requested folder; without one (or if it no longer exists) they go to Notes.
  const wantsPrivate = sectionId === privateFolderId;
  const initialSectionId = wantsPrivate
    ? privateJournal.status === 'unlocked'
      ? privateFolderId
      : notesFolderId
    : resolveEntryFolderId(sectionId ?? notesFolderId, folders);
  const initialFolderId =
    initialSectionId === privateFolderId && privateJournal.protectedFolders.some((folder) => folder.id === folderId)
      ? folderId
      : undefined;
  return (
    <EntryEditorScreen
      initialBody={body}
      initialDescription={description}
      initialFolderId={initialFolderId}
      initialSectionId={initialSectionId}
      initialTitle={prompt ?? title}
      initialTripId={tripId}
    />
  );
}
