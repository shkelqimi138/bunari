// Addresses of the public website's pages, and the support email
// Only bunari.app serves the website; the pages.dev address answers "Not found" (user, 2026-10-07), so
// builds before 1.0.2 build 2 show "Not found" from these rows.
const websiteUrl = 'https://bunari.app';

export const websiteLinks = {
  home: websiteUrl,
  privacy: `${websiteUrl}/#privacy`,
  support: `${websiteUrl}/#support`,
  terms: `${websiteUrl}/#terms`,
} as const;

// The address Contact Support writes to, the same one the website shows (user, 2026-10-07). If it is ever
// null, Contact Support opens the website's support page instead.
export const supportEmail: string | null = 'contact@bunari.app';
