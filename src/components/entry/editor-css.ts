// The note editor's styles: theme colors, text size, and checklist boxes
export type EditorPalette = { accent: string; background: string; onAccent: string; text: string; textDim: string };

// Editor styles in the current theme's colors and the chosen note text size (in points). Checklist
// boxes are drawn here because iOS's native checkbox is always white; the empty-checklist hint sits
// beside the box, not over it. Boxes and spacing grow with the text, so a To-Do at a large Text Size
// keeps its proportions; at the standard 14 points they are as designed.
export function editorCss(
  { accent, background, onAccent, text, textDim }: EditorPalette,
  scheme: 'dark' | 'light',
  fontSize: number,
) {
  const size = (points: number) => `${Math.round(((points * fontSize) / 14) * 10) / 10}px`;
  const tick = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="${onAccent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  );
  return `
  :root { color-scheme: ${scheme}; }
  * { box-sizing: border-box; }
  html, body { background: ${background} !important; }
  body { color: ${text} !important; font-family: -apple-system, BlinkMacSystemFont, sans-serif !important; font-size: ${fontSize}px !important; line-height: 1.3 !important; padding: 0 !important; }
  p { margin: 0 0 ${size(6)} !important; }
  ul, ol { padding-left: ${size(20)} !important; }
  .ProseMirror { min-height: 160px; outline: none !important; caret-color: ${accent}; }
  /* tentap paints the selected text with a fixed pale lavender; use the accent like the app's text fields. */
  .highlight-background { background-color: ${accent}59 !important; }
  .ProseMirror > .is-editor-empty::before { content: none !important; }
  .ProseMirror > p.is-editor-empty:first-child::before { color: ${textDim}; content: 'Start writing…' !important; float: left; height: 0; pointer-events: none; }
  ul[data-type="taskList"] { padding-left: 0 !important; margin: 0 0 ${size(10)}; }
  ul[data-type="taskList"] ul[data-type="taskList"] { padding-left: ${size(28)} !important; margin: ${size(6)} 0 0; }
  ul[data-type="taskList"] li { align-items: flex-start; display: flex; margin: 0 0 ${size(6)}; }
  ul[data-type="taskList"] li > div { flex: 1 1 auto; min-width: 0; }
  ul[data-type="taskList"] p { margin: 0 !important; }
  ul[data-type="taskList"] li > label { flex: 0 0 auto; margin: 0 ${size(10)} 0 0 !important; padding-top: ${size(3)}; }
  ul[data-type="taskList"] li > label > input {
    -webkit-appearance: none; appearance: none; background: transparent !important; border: 1.5px solid ${accent} !important;
    border-radius: ${size(5)} !important; display: block; height: ${size(18)} !important; margin: 0 !important; padding: 0 !important; width: ${size(18)} !important;
  }
  ul[data-type="taskList"] li > label > input:checked { background: ${accent} url("data:image/svg+xml,${tick}") center / ${size(14)} no-repeat !important; }
  ul[data-type="taskList"] li[data-checked="true"] > div { color: ${textDim}; text-decoration: line-through; }
  .ProseMirror > ul[data-type="taskList"]:only-child > li:only-child > div > p:has(> br:only-child)::before { color: ${textDim}; content: 'Add a task'; float: left; height: 0; pointer-events: none; }
`;
}
