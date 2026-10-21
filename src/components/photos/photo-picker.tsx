// Photo picker for the web preview (and Android): the system picker. The iPhone uses Bunari's own
// picker in photo-picker.ios.tsx, which needs expo-media-library and would not load here.
import * as ImagePicker from 'expo-image-picker';
import type { PropsWithChildren } from 'react';

import type { PickedPhoto, PickOptions, PickPhotos } from '@/components/photos/photo-picker.types';

export type { PickedPhoto } from '@/components/photos/photo-picker.types';

async function systemPicker({ max = 1 }: PickOptions = {}): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: max > 1,
    mediaTypes: ['images'],
    quality: 0.85,
    selectionLimit: max,
  });
  return result.canceled
    ? []
    : result.assets.map((asset) => ({ mimeType: asset.mimeType ?? 'image/jpeg', uri: asset.uri }));
}

export function PhotoPickerProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function usePhotoPicker(): PickPhotos {
  return systemPicker;
}
