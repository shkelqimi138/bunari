// Folder screen listing a folder's entries with filters, map view, and folder deletion
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowDownUp,
  CalendarDays,
  ChevronLeft,
  Filter,
  Image as ImageIcon,
  List,
  LockKeyhole,
  Map as MapIcon,
  MapPin,
  Navigation,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SwipeableEntryRow, useEntryActions } from '@/components/entry/entry-row-actions';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { openInAppleMaps } from '@/lib/maps';
import {
  entryMoods,
  findFolder,
  formatEntryDate,
  isDeletableFolder,
  type EntryMood,
  type JournalFolder,
  type JournalEntry,
  type JournalSectionId,
} from '@/domain/journal';
import { useJournal } from '@/state/journal-context';
import { usePrivateJournal } from '@/state/private-journal-context';
import { colors, layout, radii, spacing } from '@/theme/tokens';

type ViewMode = 'list' | 'calendar' | 'media' | 'map';
type DateFilter = 'all' | 'week' | 'month' | 'year';

const viewModes: { icon: typeof List; id: ViewMode; label: string }[] = [
  { id: 'list', label: 'List', icon: List },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'map', label: 'Map', icon: MapIcon },
];

const dateFilters: { id: DateFilter; label: string }[] = [
  { id: 'all', label: 'Any date' },
  { id: 'week', label: 'Past 7 days' },
  { id: 'month', label: 'Past 30 days' },
  { id: 'year', label: 'This year' },
];

export default function JournalSectionScreen() {
  const { folderId, sectionId } = useLocalSearchParams<{ folderId?: string; sectionId: string }>();
  const router = useRouter();
  const { deleteFolder, entries: regularEntries, folders } = useJournal();
  const privateJournal = usePrivateJournal();
  const isPrivate = sectionId === 'private';
  // A protected folder is a view of Private entries whose encrypted payload names it.
  const protectedFolder =
    isPrivate && folderId ? privateJournal.protectedFolders.find((candidate) => candidate.id === folderId) : undefined;
  const privateFolder = findFolder(folders, 'private');
  const section = protectedFolder
    ? { emoji: protectedFolder.emoji, id: 'private', name: protectedFolder.name }
    : findFolder(folders, sectionId);
  const canDelete = Boolean(protectedFolder) || (section ? isDeletableFolder(section.id) : false);
  const entries = isPrivate ? privateJournal.entries : regularEntries;
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [moodFilter, setMoodFilter] = useState<EntryMood | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<JournalSectionId | null>(section?.id ?? null);
  const [sortNewest, setSortNewest] = useState(true);

  const filteredEntries = useMemo(() => {
    const now = new Date();
    return entries
      .filter((entry) => {
        if (isPrivate ? entry.sectionId !== 'private' : entry.sectionId === 'private') return false;
        if (isPrivate && (entry.folderId ?? null) !== (protectedFolder?.id ?? null)) return false;
        if (categoryFilter && entry.sectionId !== categoryFilter) return false;
        if (moodFilter && entry.mood !== moodFilter) return false;
        if (dateFilter === 'all') return true;

        const created = new Date(entry.createdAt);
        if (dateFilter === 'year') return created.getFullYear() === now.getFullYear();
        const elapsedDays = (now.getTime() - created.getTime()) / 86_400_000;
        return elapsedDays <= (dateFilter === 'week' ? 7 : 30);
      })
      .sort((a, b) => {
        const difference = Date.parse(b.createdAt) - Date.parse(a.createdAt);
        return sortNewest ? difference : -difference;
      });
  }, [categoryFilter, dateFilter, entries, isPrivate, moodFilter, protectedFolder, sortNewest]);

  const confirmDelete = () => {
    if (!section) return;
    const count = protectedFolder
      ? privateJournal.entries.filter((entry) => entry.folderId === protectedFolder.id).length
      : regularEntries.filter((entry) => entry.sectionId === section.id).length;
    const destination = protectedFolder ? (privateFolder?.name ?? 'Private') : 'Notes';
    const moved =
      count === 0
        ? 'It has no entries.'
        : `Its ${count} ${count === 1 ? 'entry moves' : 'entries move'} to ${destination}. Nothing is deleted.`;
    Alert.alert(`Delete “${section.name}”?`, moved, [
      { style: 'cancel', text: 'Cancel' },
      {
        onPress: () => {
          if (protectedFolder) void privateJournal.deleteProtectedFolder(protectedFolder.id);
          else deleteFolder(section.id);
          router.back();
        },
        style: 'destructive',
        text: 'Delete folder',
      },
    ]);
  };

  if (!section) {
    return (
      <Screen style={styles.centered}>
        <AppText variant="cardTitle">Journal unavailable</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.textButton}>
          <AppText color="accent" variant="caption">
            Go back
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  if (isPrivate && privateJournal.status !== 'unlocked') {
    return (
      <Screen style={styles.centered}>
        <AppText variant="cardTitle">Private is locked</AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/private' as Href)}
          style={styles.textButton}
        >
          <AppText color="accent" variant="caption">
            Unlock Private
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Go back" icon={ChevronLeft} onPress={() => router.back()} />
        <View style={styles.headerTitle}>
          <AppText style={styles.emoji}>{section.emoji}</AppText>
          <AppText numberOfLines={1} variant="screenTitle">
            {section.name}
          </AppText>
        </View>
        <View style={styles.headerActions}>
          {canDelete && (
            <IconButton accessibilityLabel={`Delete folder ${section.name}`} icon={Trash2} onPress={confirmDelete} />
          )}
          {isPrivate && (
            <IconButton
              accessibilityLabel="Lock Private"
              icon={LockKeyhole}
              onPress={() => {
                privateJournal.lock();
                router.back();
              }}
            />
          )}
          <IconButton
            accessibilityLabel={`Add entry to ${section.name}`}
            icon={Plus}
            onPress={() =>
              router.push({
                pathname: '/entry/new',
                params: protectedFolder
                  ? { folderId: protectedFolder.id, sectionId: 'private' }
                  : { sectionId: section.id },
              })
            }
            tone="accent"
          />
        </View>
      </View>

      <View style={styles.modeBar}>
        {viewModes.map(({ icon: Icon, id, label }) => {
          const active = viewMode === id;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={id}
              onPress={() => setViewMode(id)}
              style={[styles.modeButton, active && styles.modeButtonActive]}
            >
              <Icon color={active ? colors.accent : colors.textDim} size={16} strokeWidth={1.8} />
              <AppText color={active ? 'accent' : 'dim'} variant="caption">
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {isPrivate && !protectedFolder && privateJournal.protectedFolders.length > 0 && (
        <ScrollView
          contentContainerStyle={styles.folderChips}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.folderChipRow}
        >
          {privateJournal.protectedFolders.map((folder) => (
            <Pressable
              accessibilityLabel={`Open protected folder ${folder.name}`}
              accessibilityRole="button"
              key={folder.id}
              onPress={() =>
                router.push({ pathname: '/journal/[sectionId]', params: { folderId: folder.id, sectionId: 'private' } })
              }
              style={styles.folderChip}
            >
              <AppText variant="caption">
                {folder.emoji} {folder.name}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.controls}>
        <Pressable accessibilityRole="button" onPress={() => setFilterOpen(true)} style={styles.controlButton}>
          <Filter color={colors.textDim} size={16} strokeWidth={1.8} />
          <AppText color="dim" variant="caption">
            Filter
          </AppText>
        </Pressable>
        <Pressable
          accessibilityLabel={`Sort entries, currently ${sortNewest ? 'newest first' : 'oldest first'}`}
          accessibilityRole="button"
          onPress={() => setSortNewest((current) => !current)}
          style={styles.controlButton}
        >
          <ArrowDownUp color={colors.textDim} size={16} strokeWidth={1.8} />
          <AppText color="dim" variant="caption">
            {sortNewest ? 'Newest' : 'Oldest'}
          </AppText>
        </Pressable>
        <AppText color="dim" numeric style={styles.resultCount} variant="caption">
          {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
        </AppText>
      </View>

      <View style={styles.content}>
        {viewMode === 'list' && <EntryList entries={filteredEntries} />}
        {viewMode === 'calendar' && <CalendarView entries={filteredEntries} streakEntries={entries} />}
        {viewMode === 'media' && <MediaView entries={filteredEntries} />}
        {viewMode === 'map' && <MapView entries={filteredEntries} />}
      </View>

      <FilterModal
        category={categoryFilter}
        date={dateFilter}
        folders={folders}
        mood={moodFilter}
        onCategoryChange={setCategoryFilter}
        onClose={() => setFilterOpen(false)}
        onDateChange={setDateFilter}
        onMoodChange={setMoodFilter}
        visible={filterOpen}
      />
    </Screen>
  );
}

function EntryList({ entries }: { entries: JournalEntry[] }) {
  const router = useRouter();
  const { rowProps, toggleTodoItem } = useEntryActions();
  if (entries.length === 0) return <EmptyState icon={List} text="No entries match these filters." />;

  return (
    <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
      {entries.map((entry) => (
        <SwipeableEntryRow entry={entry} key={entry.id}>
          <Card style={styles.entryCard}>
            <Pressable
              {...rowProps(entry)}
              accessibilityLabel={`Open entry: ${entry.title}`}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/entry/[entryId]', params: { entryId: entry.id } })}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <View style={styles.entryMeta}>
                <AppText color="accent" numeric variant="label">
                  {formatEntryDate(entry.createdAt)}
                </AppText>
                {entry.mood && (
                  <AppText color="dim" variant="caption">
                    {entry.mood}
                  </AppText>
                )}
              </View>
              <AppText numberOfLines={1} style={styles.entryCardTitle} variant="cardTitle">
                {entry.title}
              </AppText>
              <AppText color="dim" numberOfLines={2} variant="caption">
                {entry.description || entry.plainText}
              </AppText>
            </Pressable>
            {!!entry.todoItems?.length && (
              <View style={styles.todoPreview}>
                {entry.todoItems.slice(0, 3).map((item) => (
                  <Pressable
                    accessibilityLabel={item.completed ? `Mark ${item.text} incomplete` : `Complete ${item.text}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.completed }}
                    key={item.id}
                    onPress={() => toggleTodoItem(entry, item.id)}
                    style={styles.todoPreviewRow}
                  >
                    <View style={[styles.todoCheck, item.completed && styles.todoCheckDone]}>
                      {item.completed && <View style={styles.todoCheckMark} />}
                    </View>
                    <AppText
                      color={item.completed ? 'dim' : 'primary'}
                      numberOfLines={1}
                      style={[styles.todoPreviewText, item.completed && styles.todoPreviewDone]}
                      variant="caption"
                    >
                      {item.text}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>
        </SwipeableEntryRow>
      ))}
    </ScrollView>
  );
}

function CalendarView({ entries, streakEntries }: { entries: JournalEntry[]; streakEntries: JournalEntry[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const entryDays = new Set(
    entries
      .map((entry) => new Date(entry.createdAt))
      .filter((date) => date.getFullYear() === year && date.getMonth() === month)
      .map((date) => date.getDate()),
  );
  const globalDays = new Set(
    streakEntries
      .filter((entry) => entry.sectionId !== 'private')
      .map((entry) => new Date(entry.createdAt))
      .filter((date) => date.getFullYear() === year && date.getMonth() === month)
      .map((date) => date.getDate()),
  );
  const cells = [
    ...Array.from({ length: mondayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <ScrollView contentContainerStyle={styles.calendarContent}>
      <AppText variant="screenTitle">{new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now)}</AppText>
      <View style={styles.weekRow}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
          <AppText color="dim" key={`${day}-${index}`} style={styles.calendarCell} variant="label">
            {day}
          </AppText>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {cells.map((day, index) => (
          <View key={`${day ?? 'blank'}-${index}`} style={styles.calendarCell}>
            {day && (
              <>
                <View style={[styles.calendarDay, globalDays.has(day) && styles.streakDay]}>
                  <AppText color={entryDays.has(day) ? 'accent' : 'dim'} numeric>
                    {day}
                  </AppText>
                </View>
                {entryDays.has(day) && <View style={styles.dayDot} />}
              </>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function MediaView({ entries }: { entries: JournalEntry[] }) {
  const media = entries.flatMap((entry) => [
    ...(entry.coverUri ? [{ id: `${entry.id}-cover`, uri: entry.coverUri, date: entry.createdAt }] : []),
    ...entry.attachments.map((attachment) => ({ id: attachment.id, uri: attachment.uri, date: attachment.createdAt })),
  ]);
  if (media.length === 0) return <EmptyState icon={ImageIcon} text="Photos attached to entries will appear here." />;

  return (
    <ScrollView contentContainerStyle={styles.mediaGrid}>
      {media.map((item) => (
        <View key={item.id} style={styles.mediaItem}>
          <Image source={{ uri: item.uri }} style={styles.mediaImage} />
          <AppText color="dim" numeric style={styles.mediaDate} variant="caption">
            {formatEntryDate(item.date)}
          </AppText>
        </View>
      ))}
    </ScrollView>
  );
}

function MapView({ entries }: { entries: JournalEntry[] }) {
  const locatedEntries = entries.filter((entry) => entry.locationLabel);
  const openAppleMaps = (entry: JournalEntry) => {
    void openInAppleMaps({
      label: entry.locationLabel ?? entry.title,
      latitude: entry.latitude,
      longitude: entry.longitude,
    });
  };
  return (
    <View style={styles.mapShell}>
      <MapIcon color={colors.accent} size={38} strokeWidth={1.4} />
      <AppText style={styles.mapTitle} variant="cardTitle">
        Apple Maps view
      </AppText>
      <AppText color="dim" style={styles.mapDescription} variant="caption">
        Tap a location to open it in Apple Maps. Native map rendering is verified later on iOS.
      </AppText>
      {locatedEntries.map((entry) => (
        <Pressable
          accessibilityLabel={`Open ${entry.locationLabel} in Apple Maps`}
          accessibilityRole="link"
          key={entry.id}
          onPress={() => openAppleMaps(entry)}
          style={styles.locationRow}
        >
          <MapPin color={colors.accent} size={16} strokeWidth={1.8} />
          <AppText style={styles.locationTitle} variant="caption">
            {entry.title}
          </AppText>
          <AppText color="dim" variant="caption">
            {entry.locationLabel}
          </AppText>
          <Navigation color={colors.accent} size={15} strokeWidth={1.8} />
        </Pressable>
      ))}
      {!locatedEntries.length && (
        <AppText color="dim" variant="caption">
          No location-tagged entries yet.
        </AppText>
      )}
    </View>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof List; text: string }) {
  return (
    <View style={styles.emptyState}>
      <Icon color={colors.accent} size={28} strokeWidth={1.6} />
      <AppText color="dim" style={styles.emptyText} variant="caption">
        {text}
      </AppText>
    </View>
  );
}

type FilterModalProps = {
  category: JournalSectionId | null;
  folders: JournalFolder[];
  date: DateFilter;
  mood: EntryMood | null;
  onCategoryChange: (value: JournalSectionId | null) => void;
  onClose: () => void;
  onDateChange: (value: DateFilter) => void;
  onMoodChange: (value: EntryMood | null) => void;
  visible: boolean;
};

function FilterModal(props: FilterModalProps) {
  return (
    <Modal animationType="slide" onRequestClose={props.onClose} transparent visible={props.visible}>
      <Pressable accessible={false} onPress={props.onClose} style={styles.modalBackdrop}>
        <Pressable
          accessible={false}
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.filterSheet}
        >
          <View style={styles.filterHeader}>
            <AppText variant="cardTitle">Filter entries</AppText>
            <IconButton accessibilityLabel="Close filters" icon={X} onPress={props.onClose} />
          </View>
          <FilterGroup label="Date">
            {dateFilters.map((option) => (
              <FilterChip
                active={props.date === option.id}
                key={option.id}
                label={option.label}
                onPress={() => props.onDateChange(option.id)}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Mood">
            <FilterChip active={!props.mood} label="Any mood" onPress={() => props.onMoodChange(null)} />
            {entryMoods.map((mood) => (
              <FilterChip
                active={props.mood === mood}
                key={mood}
                label={mood}
                onPress={() => props.onMoodChange(mood)}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Category">
            <FilterChip active={!props.category} label="All journals" onPress={() => props.onCategoryChange(null)} />
            {props.folders
              .filter((item) => item.id !== 'private')
              .map((item) => (
                <FilterChip
                  active={props.category === item.id}
                  key={item.id}
                  label={`${item.emoji} ${item.name}`}
                  onPress={() => props.onCategoryChange(item.id)}
                />
              ))}
          </FilterGroup>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FilterGroup({ children, label }: React.PropsWithChildren<{ label: string }>) {
  return (
    <View style={styles.filterGroup}>
      <AppText color="dim" variant="label">
        {label}
      </AppText>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <AppText color={active ? 'accent' : 'dim'} variant="caption">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  textButton: { padding: spacing[4] },
  header: { alignItems: 'center', flexDirection: 'row', marginTop: spacing[2] },
  headerActions: { flexDirection: 'row', gap: spacing[2] },
  headerTitle: { alignItems: 'center', flex: 1, flexDirection: 'row', justifyContent: 'center' },
  emoji: { fontSize: 21, lineHeight: 26, marginRight: spacing[2] },
  modeBar: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: spacing[4],
    padding: spacing[1],
  },
  modeButton: { alignItems: 'center', borderRadius: radii.control, flex: 1, gap: 2, paddingVertical: spacing[2] },
  modeButtonActive: { backgroundColor: colors.accentSoft },
  // A horizontal ScrollView otherwise stretches to fill the screen's height, making the chips tall bars.
  folderChipRow: { flexGrow: 0 },
  folderChips: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] },
  folderChip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  controls: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], minHeight: 46 },
  controlButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  resultCount: { flex: 1, textAlign: 'right' },
  content: { flex: 1, marginHorizontal: -layout.screenPadding },
  listContent: { gap: spacing[3], paddingBottom: spacing[8], paddingHorizontal: layout.screenPadding },
  entryCard: { gap: spacing[2] },
  entryMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  entryCardTitle: { marginTop: spacing[1] },
  todoPreview: { borderTopColor: colors.line, borderTopWidth: 1, marginTop: spacing[3], paddingTop: spacing[2] },
  todoPreviewRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], minHeight: 34 },
  todoCheck: { borderColor: colors.textDim, borderRadius: 4, borderWidth: 1, height: 18, width: 18 },
  todoCheckDone: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    justifyContent: 'center',
  },
  todoCheckMark: { backgroundColor: colors.onAccent, borderRadius: 2, height: 6, width: 6 },
  todoPreviewText: { flex: 1 },
  todoPreviewDone: { textDecorationLine: 'line-through' },
  pressed: { opacity: 0.65 },
  calendarContent: { padding: layout.screenPadding },
  weekRow: { flexDirection: 'row', marginTop: spacing[6] },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing[2] },
  calendarCell: { alignItems: 'center', height: 42, justifyContent: 'center', width: '14.2857%' },
  calendarDay: { alignItems: 'center', borderRadius: radii.round, height: 29, justifyContent: 'center', width: 29 },
  streakDay: { backgroundColor: colors.accentSoft },
  dayDot: { backgroundColor: colors.accent, borderRadius: 2, height: 4, marginTop: 3, width: 4 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], padding: layout.screenPadding },
  mediaItem: { aspectRatio: 1, borderRadius: radii.card, overflow: 'hidden', width: '48.5%' },
  mediaImage: { height: '100%', width: '100%' },
  mediaDate: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    bottom: 0,
    left: 0,
    padding: spacing[2],
    position: 'absolute',
    right: 0,
  },
  mapShell: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.prompt,
    borderWidth: 1,
    margin: layout.screenPadding,
    padding: spacing[6],
  },
  mapTitle: { marginTop: spacing[3] },
  mapDescription: { marginBottom: spacing[5], marginTop: spacing[2], textAlign: 'center' },
  locationRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 44,
  },
  locationTitle: { flex: 1 },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: spacing[12] },
  emptyText: { marginTop: spacing[3], textAlign: 'center' },
  modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.65)', flex: 1, justifyContent: 'flex-end' },
  filterSheet: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopLeftRadius: radii.prompt,
    borderTopRightRadius: radii.prompt,
    borderTopWidth: 1,
    paddingBottom: spacing[8],
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing[3],
  },
  filterHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  filterGroup: { marginTop: spacing[4] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] },
  chip: {
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
});
