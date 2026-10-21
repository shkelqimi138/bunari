// In-app photo picker that shows only the photos the user allowed Bunari to see (iOS; other
// platforms use the system picker in photo-picker.tsx, since expo-media-library is iPhone-only here)
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { Check, X } from 'lucide-react-native';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import type { PickedPhoto, PickOptions, PickPhotos } from '@/components/photos/photo-picker.types';
import { AppText } from '@/components/ui/app-text';
import { colors, radii, spacing } from '@/theme/tokens';

export type { PickedPhoto } from '@/components/photos/photo-picker.types';
type Access = 'all' | 'limited' | 'none' | 'loading';
type Request = PickOptions & { resolve: (photos: PickedPhoto[]) => void };

const pageSize = 60;
const columns = 4;

const PhotoPickerContext = createContext<PickPhotos | null>(null);

// Asset IDs are PHAsset identifiers; expo-image shows them directly from the library as ph:// URIs.
function thumbnailUri(id: string) {
  return id.startsWith('ph://') ? id : `ph://${id}`;
}

// A picked photo is copied out of the library as a JPEG, so it works in sync, exports, and PDFs.
async function exportAsJpeg(id: string): Promise<PickedPhoto> {
  let source: string;
  try {
    source = await new MediaLibrary.Asset(id).getUri();
  } catch {
    source = thumbnailUri(id);
  }
  const rendered = await ImageManipulator.manipulate(source).renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  return { mimeType: 'image/jpeg', uri: saved.uri };
}

export function PhotoPickerProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<Request | null>(null);

  const pickPhotos = useCallback<PickPhotos>(
    (options: PickOptions = {}) => new Promise<PickedPhoto[]>((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  const finish = useCallback(
    (photos: PickedPhoto[]) => {
      request?.resolve(photos);
      setRequest(null);
    },
    [request],
  );

  return (
    <PhotoPickerContext.Provider value={pickPhotos}>
      {children}
      <Modal
        animationType="slide"
        onRequestClose={() => finish([])}
        presentationStyle="pageSheet"
        visible={Boolean(request)}
      >
        {request && (
          <PhotoGrid
            max={request.max ?? 1}
            onDone={finish}
            title={request.title ?? (request.max && request.max > 1 ? 'Add photos' : 'Choose a photo')}
          />
        )}
      </Modal>
    </PhotoPickerContext.Provider>
  );
}

export function usePhotoPicker(): PickPhotos {
  const pickPhotos = useContext(PhotoPickerContext);
  if (!pickPhotos) throw new Error('usePhotoPicker must be used inside PhotoPickerProvider.');
  return pickPhotos;
}

function PhotoGrid({ max, onDone, title }: { max: number; onDone: (photos: PickedPhoto[]) => void; title: string }) {
  const { width } = useWindowDimensions();
  const [access, setAccess] = useState<Access>('loading');
  const [ids, setIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const doneLoadingRef = useRef(false);
  const tile = Math.floor((width - spacing[1] * (columns + 1)) / columns);

  const loadPage = useCallback(async (offset: number) => {
    const assets = await new MediaLibrary.Query()
      .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
      .orderBy({ ascending: false, key: MediaLibrary.AssetField.CREATION_TIME })
      .offset(offset)
      .limit(pageSize)
      .exe();
    doneLoadingRef.current = assets.length < pageSize;
    return assets.map((asset) => asset.id);
  }, []);

  const reload = useCallback(async () => {
    let permission = await MediaLibrary.getPermissionsAsync(false);
    if (permission.status === 'undetermined') permission = await MediaLibrary.requestPermissionsAsync(false);
    const privileges = permission.granted ? (permission.accessPrivileges === 'limited' ? 'limited' : 'all') : 'none';
    setAccess(privileges);
    if (privileges === 'none') {
      setIds([]);
      return;
    }
    const firstPage = await loadPage(0);
    setIds(firstPage);
    // Photos the user no longer allows are dropped from the selection.
    setSelected((current) => current.filter((id) => firstPage.includes(id)));
  }, [loadPage]);

  useEffect(() => {
    // The first load starts after the sheet appears; changes to the allowed photos refresh the grid.
    void Promise.resolve().then(reload);
    const subscription = MediaLibrary.addListener(() => void reload());
    return () => subscription.remove();
  }, [reload]);

  const allowMore = () => void MediaLibrary.presentPermissionsPicker(['photo']).then(() => reload());

  const loadMore = async () => {
    if (loadingMoreRef.current || doneLoadingRef.current || access === 'none') return;
    loadingMoreRef.current = true;
    try {
      const next = await loadPage(ids.length);
      setIds((current) => [...current, ...next.filter((id) => !current.includes(id))]);
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (max === 1) return [id];
      return current.length >= max ? current : [...current, id];
    });
  };

  const confirm = async () => {
    if (selected.length === 0) return;
    setPreparing(true);
    setError(null);
    try {
      onDone(await Promise.all(selected.map(exportAsJpeg)));
    } catch {
      setError('A photo could not be loaded. If it is stored in iCloud, try again when you are online.');
      setPreparing(false);
    }
  };

  const disabled = selected.length === 0 || preparing;

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Cancel"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => onDone([])}
          style={styles.headerButton}
        >
          <X color={colors.text} size={20} strokeWidth={1.8} />
        </Pressable>
        <AppText variant="cardTitle">{title}</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => void confirm()}
          style={[styles.addButton, disabled && styles.addButtonDisabled]}
        >
          {preparing ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <AppText color="onAccent" variant="caption">
              {max > 1 && selected.length > 0 ? `Add ${selected.length}` : 'Add'}
            </AppText>
          )}
        </Pressable>
      </View>

      {access === 'limited' && (
        <View style={styles.notice}>
          <AppText color="dim" style={styles.noticeText} variant="caption">
            Bunari can see only the photos you allowed.
          </AppText>
          <Pressable accessibilityRole="button" onPress={allowMore}>
            <AppText color="accent" variant="caption">
              Allow more photos
            </AppText>
          </Pressable>
        </View>
      )}
      {access === 'all' && (
        <View style={styles.notice}>
          <AppText color="dim" style={styles.noticeText} variant="caption">
            Bunari can see your whole library. You can limit it to selected photos in Settings.
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
            <AppText color="accent" variant="caption">
              Settings
            </AppText>
          </Pressable>
        </View>
      )}
      {error && (
        <AppText color="danger" style={styles.error} variant="caption">
          {error}
        </AppText>
      )}

      {access === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : access === 'none' ? (
        <View style={styles.centered}>
          <AppText style={styles.centeredText} variant="cardTitle">
            Photo access is off
          </AppText>
          <AppText color="dim" style={styles.centeredText}>
            In Settings › Bunari › Photos, choose Limited Access and pick the photos Bunari may use. Bunari never sees
            the rest.
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openSettings()}
            style={styles.primaryButton}
          >
            <AppText color="onAccent" variant="caption">
              Open Settings
            </AppText>
          </Pressable>
        </View>
      ) : ids.length === 0 ? (
        <View style={styles.centered}>
          <AppText style={styles.centeredText} variant="cardTitle">
            No photos yet
          </AppText>
          <AppText color="dim" style={styles.centeredText}>
            {access === 'limited'
              ? 'Choose which photos Bunari may see, and they appear here.'
              : 'Your photo library has no photos.'}
          </AppText>
          {access === 'limited' && (
            <Pressable accessibilityRole="button" onPress={allowMore} style={styles.primaryButton}>
              <AppText color="onAccent" variant="caption">
                Allow photos
              </AppText>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          data={ids}
          keyExtractor={(id) => id}
          numColumns={columns}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.6}
          renderItem={({ item }) => {
            const order = selected.indexOf(item);
            return (
              <Pressable
                accessibilityLabel={order >= 0 ? `Photo, selected ${order + 1}` : 'Photo'}
                accessibilityRole="button"
                accessibilityState={{ selected: order >= 0 }}
                onPress={() => toggle(item)}
                style={{ height: tile, width: tile }}
              >
                <Image
                  contentFit="cover"
                  recyclingKey={item}
                  source={{ uri: thumbnailUri(item) }}
                  style={styles.thumbnail}
                />
                {order >= 0 && <View style={styles.selectedOverlay} />}
                <View style={[styles.badge, order >= 0 && styles.badgeSelected]}>
                  {order >= 0 &&
                    (max > 1 ? (
                      <AppText color="onAccent" numeric style={styles.badgeText} variant="caption">
                        {order + 1}
                      </AppText>
                    ) : (
                      <Check color={colors.onAccent} size={13} strokeWidth={3} />
                    ))}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
  },
  headerButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 44 },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: spacing[4],
  },
  addButtonDisabled: { opacity: 0.4 },
  notice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.control,
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[2],
    marginHorizontal: spacing[3],
    padding: spacing[3],
  },
  noticeText: { flex: 1 },
  error: { marginBottom: spacing[2], marginHorizontal: spacing[5] },
  centered: { alignItems: 'center', flex: 1, gap: spacing[3], justifyContent: 'center', paddingHorizontal: spacing[8] },
  centeredText: { textAlign: 'center' },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    marginTop: spacing[2],
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
  },
  grid: { gap: spacing[1], padding: spacing[1] },
  row: { gap: spacing[1] },
  thumbnail: { borderRadius: 4, height: '100%', width: '100%' },
  selectedOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderColor: colors.accent,
    borderRadius: 4,
    borderWidth: 2,
  },
  badge: {
    alignItems: 'center',
    borderColor: '#ffffff',
    borderRadius: 11,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 5,
    top: 5,
    width: 22,
  },
  badgeSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  badgeText: { fontSize: 11, lineHeight: 13 },
});
