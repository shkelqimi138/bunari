// Entry editor: title, rich text, To-Dos, photos, location, mood, and saving
import { Image } from 'expo-image';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import {
  Bold,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Ellipsis,
  Heart,
  IndentIncrease,
  Italic,
  List,
  ListChecks,
  MapPin,
  Share2,
  Sparkles,
  Trash2,
  Underline,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { usePhotoPicker } from '@/components/photos/photo-picker';
import { SwipeDownToDismiss } from '@/components/ui/swipe-down-to-dismiss';
import { shareNoteAsPdf, shareNoteAsText } from '@/lib/export/share-note';
import { openInAppleMaps } from '@/lib/maps';
import { JournalRichEditor } from './journal-rich-editor';
import {
  documentFromPlainText,
  emptyToolbarState,
  type JournalRichEditorHandle,
} from '@/components/entry/journal-rich-editor.types';
import {
  entryDescriptionMaxLength,
  entryTitleMaxLength,
  formatEntryDate,
  findFolder,
  type EntryAttachment,
  type JournalEntry,
  type JournalSectionId,
  type RichTextDocument,
} from '@/domain/journal';
import { fetchMoodSuggestion } from '@/data/ai';
import { useAiPermission } from '@/hooks/use-ai-permission';
import { moodContentKey, moodSuggestionState } from '@/domain/mood';
import { mediaCache } from '@/data/media-cache';
import { checklistDocument, collectChecklist, withTodosAsChecklist } from '@/domain/checklist';
import { useAuth } from '@/state/auth-context';
import { useJournal } from '@/state/journal-context';
import { usePrivateJournal } from '@/state/private-journal-context';
import { noteTextSizes } from '@/domain/note-text';
import { useSettings } from '@/state/settings-context';
import {
  colors,
  darkPalette,
  fontFamilies,
  layout,
  lightPalette,
  photoOverlay,
  radii,
  spacing,
  typography,
} from '@/theme/tokens';

const emptyDocument: RichTextDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};
const photoSelectionLimit = 20;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EntryEditorScreenProps = {
  entry?: JournalEntry;
  initialBody?: string;
  initialDescription?: string;
  initialFolderId?: string;
  initialSectionId?: JournalSectionId;
  initialTitle?: string;
  initialTripId?: string;
  // After Save the entry is shown for reading (with mood suggestions) instead of editing.
  openSaved?: boolean;
};

type EditorSnapshot = { document: RichTextDocument; text: string };

export function EntryEditorScreen({
  entry: entryProp,
  initialBody = '',
  initialDescription = '',
  initialFolderId,
  initialSectionId = 'home',
  initialTitle = '',
  initialTripId,
  openSaved = false,
}: EntryEditorScreenProps) {
  const router = useRouter();
  const journal = useJournal();
  const { noteTextSize, theme } = useSettings();
  const askForAi = useAiPermission();
  // The title grows with "Larger note text" (More), like the note text below it.
  const titleSize = noteTextSizes[noteTextSize];
  const titleFont = { fontSize: titleSize.title, lineHeight: titleSize.titleLineHeight };
  // The title's lines grow with the iPhone's Text Size, so its two-line limit while writing does too.
  const { fontScale } = useWindowDimensions();
  const compactTitleHeight = Math.ceil(titleSize.titleLineHeight * 2 * fontScale);
  const pickPhotos = usePhotoPicker();
  const privateJournal = usePrivateJournal();
  const { user } = useAuth();
  // A new entry stays on this screen after its first save (instead of reopening as a new screen),
  // so typing is never interrupted and nothing typed during the switch can be lost.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const entry =
    entryProp ?? (createdId ? (journal.getEntry(createdId) ?? privateJournal.getEntry(createdId)) : undefined);
  // Entries open ready to edit: tap into the text and keep writing.
  const [isEditing, setIsEditing] = useState(!openSaved);
  const [menuOpen, setMenuOpen] = useState(false);
  const [title, setTitle] = useState(entry?.title ?? initialTitle);
  const [description, setDescription] = useState(entry?.description ?? initialDescription);
  // New entries have only a title and the note; older entries keep their description.
  const [showDescription] = useState(() => Boolean(entry?.description || initialDescription));
  const [coverUri, setCoverUri] = useState<string | null>(entry?.coverUri ?? null);
  const [coverMediaId, setCoverMediaId] = useState<string | null>(entry?.coverMediaId ?? null);
  const [coverMimeType, setCoverMimeType] = useState<string | null>(entry?.coverMimeType ?? null);
  const [coverStoragePath, setCoverStoragePath] = useState<string | null>(entry?.coverStoragePath ?? null);
  const [attachments, setAttachments] = useState<EntryAttachment[]>(entry?.attachments ?? []);
  const [locationLabel, setLocationLabel] = useState<string | null>(entry?.locationLabel ?? null);
  const [latitude, setLatitude] = useState<number | null>(entry?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(entry?.longitude ?? null);
  const [editorState, setEditorState] = useState(emptyToolbarState);
  const [moodError, setMoodError] = useState<string | null>(null);
  const [moodLoading, setMoodLoading] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const editorRef = useRef<JournalRichEditorHandle>(null);
  const autoGeneratedTitleRef = useRef(false);
  const autosaveBusyRef = useRef(false);
  const createdEntryRef = useRef(false);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const sectionId = entry?.sectionId ?? initialSectionId;
  // The latest note content, kept after every change so it can be saved when the screen closes
  // or the app goes to the background without asking the (possibly suspended) editor for it.
  const latestContentRef = useRef<EditorSnapshot | null>(null);
  const deletedRef = useRef(false);
  // The editor's starting content; a new key reloads the editor if iOS ended its web content.
  const [editorSession, setEditorSession] = useState(() => ({
    document: entryProp
      ? withTodosAsChecklist(entryProp.body, entryProp.todoItems)
      : initialBody
        ? documentFromPlainText(initialBody)
        : sectionId === 'todo'
          ? checklistDocument
          : emptyDocument,
    key: 0,
  }));
  // Swiping down over the title, description, or To-Dos closes the keyboard, as
  // in iOS Notes; the rich text handles the same swipe inside its web view.
  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
    editorRef.current?.blur();
  }, []);
  // While typing, the cover and folder line give way to a slim bar and a long title shows two
  // lines (it scrolls inside itself), so the note text keeps most of the space above the keyboard.
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  // The title keeps its full height while it is the field being edited.
  const [titleFocused, setTitleFocused] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    const hidden = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const isPrivate = sectionId === 'private';
  const folderId = entry?.folderId ?? initialFolderId ?? null;
  const protectedFolder =
    isPrivate && folderId ? privateJournal.protectedFolders.find((candidate) => candidate.id === folderId) : undefined;
  const section = protectedFolder ?? findFolder(journal.folders, sectionId);

  const requestCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.granted) return true;
    Alert.alert('Camera access needed', 'Allow camera access in Settings to take a photo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ]);
    return false;
  };

  // Photos come from Bunari's own picker, which shows only the photos the user allowed.
  const takeOrPick = async (source: 'camera' | 'library', max: number, title: string) => {
    if (source === 'library') return pickPhotos({ max, title });
    if (!(await requestCamera())) return [];
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: max === 1,
      aspect: [16, 9],
      mediaTypes: ['images'],
      quality: 0.85,
    });
    return result.canceled
      ? []
      : result.assets.map((asset) => ({ mimeType: asset.mimeType ?? 'image/jpeg', uri: asset.uri }));
  };

  const pickCover = async (source: 'camera' | 'library') => {
    const [asset] = await takeOrPick(source, 1, 'Choose a cover');
    if (!asset || !user) return;
    const mediaId = randomUUID();
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const uri = isPrivate
      ? await mediaCache.privateDataUri(asset.uri, mimeType)
      : (await mediaCache.persistPicked(user.id, asset.uri, mediaId, mimeType)).uri;
    setCoverUri(uri);
    setCoverMediaId(mediaId);
    setCoverMimeType(mimeType);
    setCoverStoragePath(null);
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    const assets = await takeOrPick(source, photoSelectionLimit, 'Add photos');
    if (assets.length === 0 || !user) return;

    const createdAt = new Date().toISOString();
    const additions = await Promise.all(
      assets.map(async (asset): Promise<EntryAttachment> => {
        const id = randomUUID();
        const mimeType = asset.mimeType ?? 'image/jpeg';
        const uri = isPrivate
          ? await mediaCache.privateDataUri(asset.uri, mimeType)
          : (await mediaCache.persistPicked(user.id, asset.uri, id, mimeType)).uri;
        return {
          createdAt,
          id,
          mimeType,
          storagePath: null,
          uri,
        };
      }),
    );
    setAttachments((current) => [...current, ...additions]);
  };

  const choosePhotoSource = (purpose: 'attachment' | 'cover') => {
    const select = purpose === 'cover' ? pickCover : addPhoto;
    Alert.alert(
      purpose === 'cover' ? 'Add cover photo' : 'Add photo',
      purpose === 'attachment'
        ? `Choose up to ${photoSelectionLimit} of the photos you allowed Bunari to see, or take a new one.`
        : 'Choose one of the photos you allowed Bunari to see, or take a new one.',
      [
        { text: 'Take Photo', onPress: () => void select('camera') },
        {
          text: purpose === 'attachment' ? 'Choose Photos' : 'Choose from Library',
          onPress: () => void select('library'),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const openLocation = () => {
    if (locationLabel) void openInAppleMaps({ label: locationLabel, latitude, longitude });
  };

  // A saved location opens in Apple Maps; while editing it can also be updated or removed.
  const onLocationPress = () => {
    if (!locationLabel) {
      void addCurrentLocation();
      return;
    }
    if (!isEditing) {
      openLocation();
      return;
    }
    const removeLocation = () => {
      setLocationLabel(null);
      setLatitude(null);
      setLongitude(null);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 3,
          destructiveButtonIndex: 2,
          options: ['Open in Maps', 'Use current location', 'Remove location', 'Cancel'],
          title: locationLabel,
        },
        (index) => {
          if (index === 0) openLocation();
          if (index === 1) void addCurrentLocation();
          if (index === 2) removeLocation();
        },
      );
      return;
    }
    Alert.alert(locationLabel, undefined, [
      { onPress: openLocation, text: 'Open in Maps' },
      { onPress: () => void addCurrentLocation(), text: 'Use current location' },
      { onPress: removeLocation, style: 'destructive', text: 'Remove location' },
      { style: 'cancel', text: 'Cancel' },
    ]);
  };

  const addCurrentLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Location not added', 'Location permission is required to tag this entry.');
      return;
    }

    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: nextLatitude, longitude: nextLongitude } = position.coords;
      const places = await Location.reverseGeocodeAsync({ latitude: nextLatitude, longitude: nextLongitude });
      const place = places[0];
      const label = place
        ? [place.name, place.city, place.region]
            .filter((value, index, list) => value && list.indexOf(value) === index)
            .join(', ')
        : `${nextLatitude.toFixed(4)}, ${nextLongitude.toFixed(4)}`;
      setLatitude(nextLatitude);
      setLongitude(nextLongitude);
      setLocationLabel(label);
    } catch {
      Alert.alert('Location unavailable', 'Your current location could not be read.');
    }
  };

  const persistEntry = useCallback(
    async (finishEditing: boolean, silent = false, snapshot?: EditorSnapshot) => {
      let content = snapshot;
      if (!content) {
        if (!editorRef.current) {
          if (!silent) Alert.alert('Entry not saved', 'The editor is not ready.');
          return false;
        }
        const [document, text] = await Promise.all([editorRef.current.getDocument(), editorRef.current.getText()]);
        content = { document, text };
        latestContentRef.current = content;
      }
      const liveDocument = content.document;
      const liveText = content.text;
      // Checklist items are the To-Dos.
      const todoItems = collectChecklist(liveDocument, entry?.id ?? 'new-entry');
      const plainText = liveText;

      let cleanTitle = title.trim();
      if (!cleanTitle || autoGeneratedTitleRef.current) {
        const firstWrittenLine = plainText
          .split('\n')
          .map((line) => line.trim())
          .find(Boolean);
        const fallbackTitle = firstWrittenLine ?? description.trim();
        const hasDraftContent = Boolean(
          fallbackTitle || attachments.length || todoItems.length || coverUri || locationLabel,
        );
        if (!hasDraftContent) {
          if (!silent) Alert.alert('Nothing to save', 'Start writing and Bunari will save the entry automatically.');
          return false;
        }
        cleanTitle = (fallbackTitle || 'Untitled entry').slice(0, 80);
        autoGeneratedTitleRef.current = true;
        if (cleanTitle !== title) setTitle(cleanTitle);
      }

      const changes = {
        attachments,
        body: liveDocument,
        coverMediaId,
        coverMimeType,
        coverStoragePath,
        coverUri,
        description: description.trim(),
        latitude,
        locationLabel,
        longitude,
        plainText,
        title: cleanTitle,
        todoItems,
        tripId: entry?.tripId ?? initialTripId ?? null,
      };
      const signature = JSON.stringify(changes);
      if (silent && signature === lastSavedSignatureRef.current) return true;

      if (entry) {
        if (isPrivate) await privateJournal.updateEntry(entry.id, changes);
        else journal.updateEntry(entry.id, changes);
        lastSavedSignatureRef.current = signature;
        if (finishEditing) setIsEditing(false);
        return true;
      }

      if (createdEntryRef.current) return true;
      createdEntryRef.current = true;
      const created = isPrivate
        ? await privateJournal.createEntry({ ...changes, folderId, sectionId })
        : journal.createEntry({ ...changes, sectionId });
      lastSavedSignatureRef.current = signature;
      setCreatedId(created.id);
      if (finishEditing) setIsEditing(false);
      return true;
    },
    [
      attachments,
      coverMediaId,
      coverMimeType,
      coverStoragePath,
      coverUri,
      description,
      entry,
      folderId,
      initialTripId,
      isPrivate,
      journal,
      latitude,
      locationLabel,
      longitude,
      privateJournal,
      sectionId,
      title,
    ],
  );

  const saveEntry = () => void persistEntry(true);

  // Back, swipe back, or any other way of closing the screen saves the latest content.
  const leaveSaveRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    leaveSaveRef.current = () => {
      if (!isEditing || deletedRef.current) return;
      const fallback = { document: editorSession.document, text: entry?.plainText ?? initialBody };
      void persistEntry(false, true, latestContentRef.current ?? fallback);
    };
  });
  useEffect(() => () => leaveSaveRef.current(), []);

  // Keeps the latest content after each change, for the saves above.
  const captureContent = useCallback(async () => {
    if (!editorRef.current) return;
    try {
      const [document, text] = await Promise.all([editorRef.current.getDocument(), editorRef.current.getText()]);
      latestContentRef.current = { document, text };
    } catch {
      // The next change or autosave captures it again.
    }
  }, []);

  // iOS may end the editor's web content while Bunari is in the background; reload it with the latest content.
  const reloadEditor = useCallback(() => {
    const document = latestContentRef.current?.document;
    setEditorSession((current) => ({ document: document ?? current.document, key: current.key + 1 }));
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    const timer = setTimeout(() => {
      if (autosaveBusyRef.current) return;
      autosaveBusyRef.current = true;
      void persistEntry(false, true).finally(() => {
        autosaveBusyRef.current = false;
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [
    attachments,
    coverUri,
    description,
    editorRevision,
    isEditing,
    latitude,
    locationLabel,
    longitude,
    persistEntry,
    title,
  ]);

  // Leaving for another app saves the latest content already on hand; the editor may be paused by then.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && isEditing) void persistEntry(false, true, latestContentRef.current ?? undefined);
    });
    return () => subscription.remove();
  }, [isEditing, persistEntry]);

  // A note is shared as a PDF page in the app's colors (Notes, Files, Word, Mail) or as plain text.
  const sharingRef = useRef(false);
  const showShareChoices = () => {
    if (!entry || isPrivate || sharingRef.current) return;
    // What is on screen is shared, even if autosave has not stored it yet.
    const shown: JournalEntry = {
      ...entry,
      attachments,
      body: latestContentRef.current?.document ?? entry.body,
      coverMediaId,
      coverMimeType,
      coverStoragePath,
      coverUri,
      title: title.trim() || entry.title,
    };
    // The share sheet opens only after the choice sheet has finished closing; a second tap is
    // ignored until the first share is done.
    const afterSheetCloses = (share: () => Promise<unknown>) => {
      sharingRef.current = true;
      setTimeout(
        () =>
          void share().finally(() => {
            sharingRef.current = false;
          }),
        400,
      );
    };
    const asPdf = () =>
      afterSheetCloses(async () => {
        const result = await shareNoteAsPdf(shown, {
          folderName: section?.name,
          palette: theme === 'light' ? lightPalette : darkPalette,
          saved: entry,
        });
        if (result.error) Alert.alert('Note not shared', result.error);
      });
    const asText = () => afterSheetCloses(() => shareNoteAsText(shown));
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 2,
          options: ['Share as note (PDF)', 'Share as text', 'Cancel'],
          title: shown.title || 'Share note',
        },
        (index) => {
          if (index === 0) asPdf();
          else if (index === 1) asText();
        },
      );
      return;
    }
    Alert.alert(shown.title || 'Share note', undefined, [
      { onPress: asPdf, text: 'Share as note (PDF)' },
      { onPress: asText, text: 'Share as text' },
      { style: 'cancel', text: 'Cancel' },
    ]);
  };

  const confirmDelete = () => {
    if (!entry) return;
    Alert.alert('Delete entry?', 'It moves to Recently Deleted, where you can restore it for 30 days.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deletedRef.current = true;
          if (isPrivate) void privateJournal.deleteEntry(entry.id);
          else journal.deleteEntry(entry.id);
          router.back();
        },
      },
    ]);
  };

  // Share and Delete open their sheet only after the options menu is fully gone: a sheet over a
  // closing menu can leave the menu invisible on screen, blocking every touch.
  const afterMenuRef = useRef<(() => void) | null>(null);
  const openMenu = () => {
    afterMenuRef.current = null;
    setMenuOpen(true);
  };
  const closeMenuThen = (next: () => void) => {
    setMenuOpen(false);
    if (Platform.OS === 'ios') afterMenuRef.current = next;
    else next();
  };
  // iOS reports here once the menu has fully closed.
  const onMenuDismissed = () => {
    const next = afterMenuRef.current;
    afterMenuRef.current = null;
    next?.();
  };

  const moodState = entry ? moodSuggestionState(entry) : 'none';

  const suggestMood = async () => {
    if (!entry || isPrivate) return;
    // The entry's text goes to OpenAI, so this asks first (once per device).
    if (!(await askForAi())) return;
    setMoodError(null);
    setMoodLoading(true);
    try {
      const suggestion = await fetchMoodSuggestion(entry.id);
      // Kept with the entry (and synced), so it is shown again later and not asked for again until
      // the text changes.
      journal.updateEntry(entry.id, {
        moodSuggestion: { contentKey: moodContentKey(entry), mood: suggestion.mood, reason: suggestion.reason },
      });
    } catch (caught) {
      setMoodError(caught instanceof Error ? caught.message : 'Mood suggestion is unavailable.');
    } finally {
      setMoodLoading(false);
    }
  };

  const compactHeader = isEditing && keyboardOpen;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      {compactHeader ? (
        <View style={[styles.compactHeader, { paddingTop: insets.top }]}>
          <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
          {entry && <IconButton accessibilityLabel="Entry menu" icon={Ellipsis} onPress={openMenu} />}
        </View>
      ) : (
        <View style={styles.cover}>
          {coverUri ? (
            <Image contentFit="cover" source={{ uri: coverUri }} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={styles.coverPlaceholder}>
              {isEditing && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => choosePhotoSource('cover')}
                  style={styles.addCover}
                >
                  <Camera color={colors.accent} size={17} strokeWidth={1.8} />
                  <AppText color="accent" variant="caption">
                    Add cover
                  </AppText>
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.coverActions}>
            <IconButton
              accessibilityLabel="Go back"
              icon={ChevronLeft}
              iconColor={coverUri ? photoOverlay.icon : undefined}
              onPress={() => router.back()}
              style={coverUri ? styles.photoButton : styles.coverButton}
            />
            {entry && (
              <IconButton
                accessibilityLabel="Entry menu"
                icon={Ellipsis}
                iconColor={coverUri ? photoOverlay.icon : undefined}
                onPress={openMenu}
                style={coverUri ? styles.photoButton : styles.coverButton}
              />
            )}
          </View>
        </View>
      )}

      <View style={styles.entryContent}>
        <SwipeDownToDismiss onDismiss={dismissKeyboard}>
          {!compactHeader && (
            <View style={styles.kickerRow}>
              <AppText color="accent" numeric variant="label">
                {section?.name ?? 'Journal'} · {entry ? formatEntryDate(entry.createdAt) : 'New entry'}
              </AppText>
              {entry?.reviewed && (
                <CheckCircle2 color={colors.reviewed} fill="rgba(77,163,255,0.14)" size={20} strokeWidth={2} />
              )}
            </View>
          )}

          {isEditing ? (
            <>
              <TextInput
                selectionColor={colors.accent}
                accessibilityLabel="Entry title"
                maxLength={entryTitleMaxLength}
                multiline
                onChangeText={(value) => {
                  autoGeneratedTitleRef.current = false;
                  setTitle(value);
                }}
                placeholder="Entry title"
                placeholderTextColor={colors.textDim}
                onBlur={() => setTitleFocused(false)}
                onFocus={() => setTitleFocused(true)}
                style={[
                  styles.titleInput,
                  titleFont,
                  compactHeader && !titleFocused && { maxHeight: compactTitleHeight },
                ]}
                value={title}
              />
              {showDescription && (
                <TextInput
                  selectionColor={colors.accent}
                  accessibilityLabel="Entry description"
                  maxLength={entryDescriptionMaxLength}
                  onChangeText={setDescription}
                  placeholder="Add description"
                  placeholderTextColor={colors.textDim}
                  style={styles.descriptionInput}
                  value={description}
                />
              )}
            </>
          ) : (
            <>
              <AppText style={[styles.titleText, titleFont]} variant="screenTitle">
                {title}
              </AppText>
              {!!description && (
                <AppText color="dim" style={styles.descriptionText}>
                  {description}
                </AppText>
              )}
            </>
          )}
        </SwipeDownToDismiss>

        <View style={styles.divider} />
        <JournalRichEditor
          autofocus={!entryProp && editorSession.key === 0}
          editable={isEditing}
          initialDocument={editorSession.document}
          key={editorSession.key}
          onContentChange={() => {
            setEditorRevision((value) => value + 1);
            void captureContent();
          }}
          onEditorLost={reloadEditor}
          onToolbarStateChange={setEditorState}
          ref={editorRef}
          style={styles.richText}
        />

        {attachments.length > 0 && (
          <ScrollView
            contentContainerStyle={styles.attachmentStrip}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.attachmentScroll}
          >
            {attachments.map((attachment) => (
              <View key={attachment.id} style={styles.attachment}>
                <Image contentFit="cover" source={{ uri: attachment.uri }} style={styles.attachmentImage} />
                <AppText color="dim" numeric style={styles.attachmentDate} variant="caption">
                  {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                    new Date(attachment.createdAt),
                  )}
                </AppText>
              </View>
            ))}
          </ScrollView>
        )}

        <Pressable
          accessibilityLabel={locationLabel ? `Location: ${locationLabel}` : 'Add location'}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isEditing && !locationLabel }}
          disabled={!isEditing && !locationLabel}
          onPress={onLocationPress}
          style={styles.locationTag}
        >
          <MapPin color={locationLabel ? colors.accent : colors.textDim} size={16} strokeWidth={1.8} />
          <AppText color={locationLabel ? 'accent' : 'dim'} variant="caption">
            {locationLabel ?? 'Add location'}
          </AppText>
        </Pressable>

        {entry && !isPrivate && !isEditing && (
          <View style={styles.moodCard}>
            <View style={styles.moodHeading}>
              <View style={styles.moodTitle}>
                <Sparkles color={colors.accent} size={17} />
                <AppText variant="cardTitle">Mood</AppText>
              </View>
              {entry.mood && (
                <AppText color="accent" variant="caption">
                  {entry.mood}
                </AppText>
              )}
            </View>
            {moodState === 'fresh' && entry.moodSuggestion ? (
              <>
                <AppText>
                  <AppText color="accent">{entry.moodSuggestion.mood}</AppText> · {entry.moodSuggestion.reason}
                </AppText>
                <AppText color="dim" variant="caption">
                  Suggested by AI
                </AppText>
                {entry.mood !== entry.moodSuggestion.mood && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => journal.updateEntry(entry.id, { mood: entry.moodSuggestion!.mood })}
                    style={styles.applyMoodButton}
                  >
                    <AppText color="accent" variant="caption">
                      Apply suggestion
                    </AppText>
                  </Pressable>
                )}
              </>
            ) : uuidPattern.test(entry.id) && (entry.syncVersion ?? 0) > 0 ? (
              <>
                {moodState === 'stale' && (
                  <AppText color="dim" variant="caption">
                    This entry changed since its mood was suggested.
                  </AppText>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy: moodLoading }}
                  disabled={moodLoading}
                  onPress={() => void suggestMood()}
                  style={styles.suggestMoodButton}
                >
                  <AppText color="accent" variant="caption">
                    {moodLoading ? 'Reading entry…' : moodState === 'stale' ? 'Suggest again' : 'Suggest a mood'}
                  </AppText>
                </Pressable>
              </>
            ) : (
              <AppText color="dim" variant="caption">
                Mood suggestions become available after this entry syncs.
              </AppText>
            )}
            {moodError && (
              <AppText style={styles.moodError} variant="caption">
                {moodError}
              </AppText>
            )}
          </View>
        )}
      </View>

      {isEditing && (
        <SwipeDownToDismiss onDismiss={dismissKeyboard}>
          <View style={styles.editorFooter}>
            <View style={styles.toolbar}>
              <FormatButton
                active={editorState.bold}
                icon={Bold}
                label="Bold"
                onPress={() => editorRef.current?.toggleBold()}
              />
              <FormatButton
                active={editorState.italic}
                icon={Italic}
                label="Italic"
                onPress={() => editorRef.current?.toggleItalic()}
              />
              <FormatButton
                active={editorState.underline}
                icon={Underline}
                label="Underline"
                onPress={() => editorRef.current?.toggleUnderline()}
              />
              <View style={styles.toolbarDivider} />
              <FormatButton
                active={editorState.bulletList}
                icon={List}
                label="Bullet list"
                onPress={() => editorRef.current?.toggleBulletList()}
              />
              <FormatButton
                active={editorState.taskList}
                icon={ListChecks}
                label="Checklist"
                onPress={() => editorRef.current?.toggleTaskList()}
              />
              <FormatButton icon={IndentIncrease} label="Indent" onPress={() => editorRef.current?.indent()} />
              <FormatButton
                icon={Camera}
                label="Take or choose photo"
                onPress={() => choosePhotoSource('attachment')}
              />
            </View>
            <Pressable accessibilityRole="button" onPress={saveEntry} style={styles.saveButton}>
              <AppText color="onAccent" variant="cardTitle">
                Save entry
              </AppText>
            </Pressable>
          </View>
        </SwipeDownToDismiss>
      )}

      {entry && (
        <EntryMenu
          entry={entry}
          allowShare={!isPrivate}
          onClose={() => setMenuOpen(false)}
          onDelete={() => closeMenuThen(confirmDelete)}
          onDismissed={onMenuDismissed}
          onEdit={() => {
            setMenuOpen(false);
            setIsEditing(true);
          }}
          onShare={() => closeMenuThen(showShareChoices)}
          onToggleFavorite={() => {
            if (isPrivate) void privateJournal.toggleFavorite(entry.id);
            else journal.toggleFavorite(entry.id);
            setMenuOpen(false);
          }}
          onToggleReviewed={() => {
            if (isPrivate) void privateJournal.toggleReviewed(entry.id);
            else journal.toggleReviewed(entry.id);
            setMenuOpen(false);
          }}
          visible={menuOpen}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function FormatButton({
  active = false,
  icon: Icon,
  label,
  onPress,
}: {
  active?: boolean;
  icon: typeof Bold;
  label: string;
  onPress: () => void | Promise<void>;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.formatButton, active && styles.formatButtonActive]}
    >
      <Icon color={active ? colors.accent : colors.text} size={19} strokeWidth={1.8} />
    </Pressable>
  );
}

type EntryMenuProps = {
  allowShare: boolean;
  entry: JournalEntry;
  onClose: () => void;
  onDelete: () => void;
  onDismissed: () => void;
  onEdit: () => void;
  onShare: () => void;
  onToggleFavorite: () => void;
  onToggleReviewed: () => void;
  visible: boolean;
};

function EntryMenu(props: EntryMenuProps) {
  return (
    <Modal
      animationType="fade"
      onDismiss={props.onDismissed}
      onRequestClose={props.onClose}
      transparent
      visible={props.visible}
    >
      <Pressable accessible={false} onPress={props.onClose} style={styles.menuBackdrop}>
        <Pressable
          accessible={false}
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.menuCard}
        >
          <View style={styles.menuHeader}>
            <AppText variant="cardTitle">Entry options</AppText>
            <IconButton accessibilityLabel="Close menu" icon={X} onPress={props.onClose} />
          </View>
          <MenuAction icon={Bold} label="Edit" onPress={props.onEdit} />
          <MenuAction
            icon={Heart}
            label={props.entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onPress={props.onToggleFavorite}
          />
          <MenuAction
            icon={CheckCircle2}
            label={props.entry.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}
            onPress={props.onToggleReviewed}
          />
          {props.allowShare && <MenuAction icon={Share2} label="Share" onPress={props.onShare} />}
          <MenuAction destructive icon={Trash2} label="Delete" onPress={props.onDelete} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuAction({
  destructive = false,
  icon: Icon,
  label,
  onPress,
}: {
  destructive?: boolean;
  icon: typeof Bold;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuAction}>
      <Icon color={destructive ? '#ef6a6a' : colors.textDim} size={19} strokeWidth={1.8} />
      <AppText style={destructive && styles.destructiveText} variant="body">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  cover: { backgroundColor: colors.surfaceRaised, height: 168 },
  coverPlaceholder: { alignItems: 'center', backgroundColor: colors.surfaceRaised, flex: 1, justifyContent: 'center' },
  addCover: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  coverActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: layout.screenPadding,
    position: 'absolute',
    right: layout.screenPadding,
    top: 50,
  },
  compactHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing[1],
    paddingHorizontal: layout.screenPadding,
  },
  // Over the empty cover the buttons follow the theme; over a photo they keep a dark scrim and a light icon.
  coverButton: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
  photoButton: { backgroundColor: photoOverlay.scrim },
  entryContent: { flex: 1, paddingHorizontal: layout.screenPadding },
  kickerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[3] },
  // The same small bold title while editing and reading, so a long title does not crowd out the note.
  // It uses the system font like the note text (a web view), so it reads as exactly 2 points larger;
  // the app's heading font looked the same size as the note text at 17.
  titleInput: {
    color: colors.text,
    fontFamily: fontFamilies.system,
    fontWeight: '700',
    fontSize: typography.noteTitle.fontSize,
    lineHeight: typography.noteTitle.lineHeight,
    marginTop: spacing[2],
    padding: 0,
  },
  descriptionInput: {
    color: colors.textDim,
    fontFamily: fontFamilies.body.regular,
    fontSize: 14,
    lineHeight: 19,
    marginTop: spacing[2],
    padding: 0,
  },
  titleText: {
    fontFamily: fontFamilies.system,
    fontWeight: '700',
    fontSize: typography.noteTitle.fontSize,
    lineHeight: typography.noteTitle.lineHeight,
    marginTop: spacing[2],
  },
  descriptionText: { fontSize: 14, lineHeight: 19, marginTop: spacing[2] },
  divider: { backgroundColor: colors.line, height: 1, marginVertical: spacing[4] },
  richText: { backgroundColor: colors.background, flex: 1 },
  // A ScrollView grows to fill free space by default; the photo row keeps its own height so the note text gets the rest.
  attachmentScroll: { flexGrow: 0 },
  attachmentStrip: { flexDirection: 'row', gap: spacing[2], paddingVertical: spacing[2] },
  attachment: { borderRadius: radii.small, height: 64, overflow: 'hidden', width: 78 },
  attachmentImage: { height: '100%', width: '100%' },
  attachmentDate: {
    backgroundColor: 'rgba(0,0,0,0.58)',
    bottom: 0,
    left: 0,
    padding: 4,
    position: 'absolute',
    right: 0,
  },
  locationTag: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: spacing[2], minHeight: 40 },
  moodCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing[3],
    marginBottom: spacing[5],
    padding: spacing[4],
  },
  moodHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  moodTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  suggestMoodButton: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  applyMoodButton: {
    alignSelf: 'flex-start',
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  moodError: { color: '#ef8f8f' },
  editorFooter: { backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: 1 },
  toolbar: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  toolbarDivider: { backgroundColor: colors.line, height: 22, marginHorizontal: 2, width: 1 },
  formatButton: { alignItems: 'center', borderRadius: 9, height: 36, justifyContent: 'center', width: 36 },
  formatButtonActive: { backgroundColor: colors.accentSoft },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    marginHorizontal: layout.screenPadding,
    marginBottom: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radii.pill,
  },
  menuBackdrop: { backgroundColor: 'rgba(0,0,0,0.65)', flex: 1, justifyContent: 'flex-end' },
  menuCard: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopLeftRadius: radii.prompt,
    borderTopRightRadius: radii.prompt,
    borderTopWidth: 1,
    paddingBottom: spacing[8],
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing[3],
  },
  menuHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  menuAction: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 48,
  },
  destructiveText: { color: '#ef6a6a' },
});
