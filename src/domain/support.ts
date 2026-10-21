// Contact Support and the version shown in Account: only the app and iOS versions, never journal data
export type SupportDetails = { appVersion: string; buildNumber: string; osVersion: string };

// "1.0.1 (9)", the way TestFlight and the App Store show a build.
export function appVersionLabel(version: string | null, buildNumber: string | null) {
  if (!version) return 'Unknown';
  return buildNumber ? `${version} (${buildNumber})` : version;
}

// A new email to support with the subject filled in and the versions at the bottom, which help
// answer most questions; the user writes the rest.
export function supportMailUrl(email: string, details: SupportDetails) {
  const body = `\n\n—\nBunari ${appVersionLabel(details.appVersion, details.buildNumber)}, iOS ${details.osVersion}`;
  return `mailto:${email}?subject=${encodeURIComponent('Bunari support')}&body=${encodeURIComponent(body)}`;
}
