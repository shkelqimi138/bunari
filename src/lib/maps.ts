// Opens a place in Apple Maps
import { Linking } from 'react-native';

type Place = { latitude: number | null; longitude: number | null; label: string };

// Opens a place in Apple Maps, at its coordinates when they are known.
export function openInAppleMaps({ label, latitude, longitude }: Place) {
  const query = encodeURIComponent(label);
  const url =
    latitude !== null && longitude !== null
      ? `https://maps.apple.com/?ll=${latitude},${longitude}&q=${query}`
      : `https://maps.apple.com/?q=${query}`;
  return Linking.openURL(url);
}
