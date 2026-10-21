// Profile avatar letter: display name first, then email; empty means show the person icon
export function profileInitial(displayName: string | undefined, email: string | undefined) {
  const source = displayName?.trim() || email?.trim() || '';
  return source.charAt(0).toUpperCase();
}

// Longest first name the Today greeting shows in full; with the greeting shrinking a little,
// it still fits on one line on the smallest supported iPhone (375 points wide).
export const greetingNameMaxLetters = 11;

// Code points that belong to the character before them: zero-width joiner, variation selectors,
// skin tones, combining accents, keycap and other symbol marks, and tag characters.
function extendsPrevious(codePoint: number) {
  return (
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) ||
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xe0020 && codePoint <= 0xe007f)
  );
}

function isRegionalIndicator(codePoint: number) {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

// The letters a person sees, so a cut never splits an emoji, a flag, or an accented letter.
function visibleLetters(text: string) {
  const letters: string[] = [];
  let afterJoiner = false;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    const previous = letters[letters.length - 1];
    const pairsFlag =
      isRegionalIndicator(codePoint) &&
      previous !== undefined &&
      Array.from(previous).length === 1 &&
      isRegionalIndicator(previous.codePointAt(0) ?? 0);
    if (previous !== undefined && (afterJoiner || extendsPrevious(codePoint) || pairsFlag)) {
      letters[letters.length - 1] = previous + character;
    } else {
      letters.push(character);
    }
    afterJoiner = codePoint === 0x200d;
  }
  return letters;
}

// The name in the Today greeting: the first word of the saved name, cut with "…" after 11 letters.
export function greetingName(displayName: string | undefined, maxLetters = greetingNameMaxLetters) {
  const firstName = displayName?.normalize('NFC').trim().split(/\s+/)[0] ?? '';
  const letters = visibleLetters(firstName);
  return letters.length > maxLetters ? `${letters.slice(0, maxLetters).join('')}…` : firstName;
}

// "Good afternoon, Mira", or just "Good afternoon" when no name is saved. VoiceOver gets the
// full first name by passing Infinity.
export function todayGreeting(hour: number, displayName: string | undefined, maxLetters = greetingNameMaxLetters) {
  const timeOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = greetingName(displayName, maxLetters);
  return name ? `${timeOfDay}, ${name}` : timeOfDay;
}

// When the greeting or the date next changes: noon, six in the evening, or midnight.
export function nextGreetingChange(now: Date) {
  const next = new Date(now);
  const hour = now.getHours();
  if (hour < 12) next.setHours(12, 0, 0, 0);
  else if (hour < 18) next.setHours(18, 0, 0, 0);
  else next.setHours(24, 0, 0, 0);
  return next;
}

// The previous profile photo to delete once a new one is saved, or null. Each new photo gets its own
// file, and the old ones used to stay in storage, where they now count toward the photo limit
// (code review, 2026-10-08). Only a file in the account's own profile folder is ever removed.
export function replacedAvatarPath(
  previousPath: string | null | undefined,
  newPath: string | null | undefined,
  userId: string,
) {
  if (!previousPath || !newPath || previousPath === newPath) return null;
  return previousPath.startsWith(`${userId}/profile/`) ? previousPath : null;
}
