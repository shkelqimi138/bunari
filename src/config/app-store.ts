// Bunari's App Store listing, for Share Bunari and Rate in the App Store
// Null until the app is live on the App Store: the numeric Apple ID from App Store Connect › App
// Information. While it is null both rows stay hidden, because the link would not open yet.
export const appStoreId: string | null = null;

export function appStoreLinks(id: string | null) {
  if (!id || !/^\d+$/.test(id)) return null;
  return {
    listing: `https://apps.apple.com/app/id${id}`,
    review: `itms-apps://itunes.apple.com/app/id${id}?action=write-review`,
  };
}
