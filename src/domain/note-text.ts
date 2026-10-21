// Note text size: "Larger note text" in Account, kept on this device only
export type NoteTextSize = 'standard' | 'large';

// The note text (in the editor) and the note's title, in points. Standard matches iOS Notes.
export const noteTextSizes = {
  standard: { body: 14, title: 17, titleLineHeight: 23 },
  large: { body: 17, title: 20, titleLineHeight: 27 },
} as const satisfies Record<NoteTextSize, { body: number; title: number; titleLineHeight: number }>;

// A saved value from this device, or standard when there is none.
export function noteTextSizeOf(value: unknown): NoteTextSize {
  return value === 'large' ? 'large' : 'standard';
}

// The note text in points: the chosen size, scaled by the iPhone's Text Size (Settings › Display &
// Brightness › Text Size, and Larger Accessibility Sizes) like the rest of the app. The editor is a
// web page, which does not follow Text Size by itself.
export function noteBodyFontSize(size: NoteTextSize, fontScale: number) {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return Math.round(noteTextSizes[size].body * scale);
}
