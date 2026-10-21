// Builds a shared note as a styled HTML page (turned into a PDF on iOS)
import type { JournalEntry, RichTextDocument } from '@/domain/journal';
import type { darkPalette } from '@/theme/tokens';

type Palette = { [Key in keyof typeof darkPalette]: string };

type DocumentNode = {
  attrs?: Record<string, unknown>;
  content?: DocumentNode[];
  marks?: { attrs?: Record<string, unknown>; type?: string }[];
  text?: string;
  type?: string;
};

export type NoteImages = {
  cover?: string | null;
  photos: string[];
};

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function textWithMarks(node: DocumentNode) {
  let html = escapeHtml(node.text ?? '');
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') html = `<strong>${html}</strong>`;
    else if (mark.type === 'italic') html = `<em>${html}</em>`;
    else if (mark.type === 'underline') html = `<u>${html}</u>`;
    else if (mark.type === 'strike') html = `<s>${html}</s>`;
    else if (mark.type === 'code') html = `<code>${html}</code>`;
    else if (mark.type === 'link' && typeof mark.attrs?.href === 'string' && /^https?:\/\//i.test(mark.attrs.href)) {
      html = `<a href="${escapeHtml(mark.attrs.href)}">${html}</a>`;
    }
  }
  return html;
}

function nodeHtml(node: DocumentNode): string {
  const children = (node.content ?? []).map(nodeHtml).join('');
  switch (node.type) {
    case 'text':
      return textWithMarks(node);
    case 'hardBreak':
      return '<br>';
    case 'paragraph':
      return `<p>${children || '<br>'}</p>`;
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 1), 3) + 1;
      return `<h${level}>${children}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${children}</ul>`;
    case 'orderedList':
      return `<ol>${children}</ol>`;
    case 'listItem':
      return `<li>${children}</li>`;
    case 'taskList':
      return `<ul class="tasks">${children}</ul>`;
    case 'taskItem': {
      const checked = node.attrs?.checked === true;
      return `<li class="${checked ? 'done' : ''}"><span class="box">${checked ? '✓' : ''}</span><div>${children}</div></li>`;
    }
    case 'blockquote':
      return `<blockquote>${children}</blockquote>`;
    case 'codeBlock':
      return `<pre>${children}</pre>`;
    case 'horizontalRule':
      return '<hr>';
    default:
      return children;
  }
}

export function documentHtml(document: RichTextDocument) {
  return ((document.content ?? []) as DocumentNode[]).map(nodeHtml).join('');
}

function readableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short' }).format(date);
}

// One note as a full page in the app's colors: cover, folder, date, title, details, body, and photos.
export function noteHtml(
  entry: JournalEntry,
  { folderName, images, palette }: { folderName?: string | null; images: NoteImages; palette: Palette },
) {
  const details = [entry.mood, entry.locationLabel]
    .filter(Boolean)
    .map((value) => `<span>${escapeHtml(String(value))}</span>`)
    .join('');
  const body = documentHtml(entry.body) || `<p>${escapeHtml(entry.plainText).replaceAll('\n', '<br>')}</p>`;
  const photos = images.photos.length
    ? `<div class="photos">${images.photos.map((src) => `<img src="${escapeHtml(src)}">`).join('')}</div>`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(entry.title || 'Note')}</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: ${palette.background}; margin: 0; min-height: 100vh; }
  /* A fixed layer is repeated on every printed page, so the note color reaches the bottom of each page. */
  .page-bg { background: ${palette.background}; bottom: 0; left: 0; position: fixed; right: 0; top: 0; z-index: -1; }
  .cover, .page { position: relative; }
  body { color: ${palette.text}; font: 15px/1.6 -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; }
  .page { padding: 40px 44px 56px; }
  .cover { display: block; height: 220px; object-fit: cover; width: 100%; }
  .folder { color: ${palette.accent}; font-size: 11px; font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase; }
  h1 { font-size: 28px; line-height: 1.2; margin: 8px 0 6px; }
  .date { color: ${palette.textDim}; font-size: 13px; }
  .details { margin-top: 10px; }
  .details span { border: 1px solid ${palette.line}; border-radius: 999px; color: ${palette.textDim}; display: inline-block; font-size: 12px; margin: 0 6px 6px 0; padding: 2px 10px; }
  hr.rule { border: 0; border-top: 1px solid ${palette.line}; margin: 18px 0 20px; }
  p { margin: 0 0 10px; }
  h2, h3, h4 { line-height: 1.3; margin: 18px 0 8px; }
  ul, ol { margin: 0 0 10px; padding-left: 22px; }
  ul.tasks { list-style: none; padding-left: 0; }
  ul.tasks ul.tasks { padding-left: 26px; }
  ul.tasks li { display: flex; gap: 10px; margin: 0 0 6px; }
  ul.tasks li > div { flex: 1; }
  ul.tasks li p { margin: 0; }
  .box { border: 1.5px solid ${palette.accent}; border-radius: 5px; color: ${palette.onAccent}; flex: 0 0 18px; font-size: 12px; font-weight: 700; height: 18px; line-height: 16px; margin-top: 3px; text-align: center; }
  li.done > .box { background: ${palette.accent}; }
  li.done > div { color: ${palette.textDim}; text-decoration: line-through; }
  blockquote { border-left: 3px solid ${palette.accent}; color: ${palette.textDim}; margin: 0 0 10px; padding-left: 12px; }
  pre, code { background: ${palette.surface}; border-radius: 6px; font-family: Menlo, monospace; font-size: 13px; }
  pre { padding: 10px 12px; white-space: pre-wrap; }
  a { color: ${palette.accent}; }
  /* Photos sit below the note as small square tiles, three to a row, so the writing stays the focus. */
  .photos { display: grid; gap: 8px; grid-template-columns: repeat(3, 1fr); margin-top: 20px; }
  .photos img { aspect-ratio: 1 / 1; border-radius: 8px; break-inside: avoid; display: block; object-fit: cover; width: 100%; }
  .footer { color: ${palette.textDim}; font-size: 11px; margin-top: 32px; }
</style></head>
<body>
<div class="page-bg"></div>
${images.cover ? `<img class="cover" src="${escapeHtml(images.cover)}">` : ''}
<div class="page">
  ${folderName ? `<div class="folder">${escapeHtml(folderName)}</div>` : ''}
  <h1>${escapeHtml(entry.title || 'Untitled note')}</h1>
  <div class="date">${escapeHtml(readableDate(entry.createdAt))}</div>
  ${details ? `<div class="details">${details}</div>` : ''}
  <hr class="rule">
  <div class="body">${body}</div>
  ${photos}
  <div class="footer">Shared from Bunari</div>
</div>
</body></html>`;
}

// The note as plain text, with checklist lines marked, for apps that take only text.
export function noteText(entry: JournalEntry) {
  const lines: string[] = [];
  const visit = (node: DocumentNode, depth: number) => {
    if (node.type === 'taskItem') {
      const line = (node.content ?? []).find((child) => child.type === 'paragraph');
      lines.push(
        `${'  '.repeat(depth)}${node.attrs?.checked === true ? '☑' : '☐'} ${(line?.content ?? []).map((child) => child.text ?? '').join('')}`,
      );
      (node.content ?? []).filter((child) => child !== line).forEach((child) => visit(child, depth + 1));
      return;
    }
    if (node.type === 'paragraph' || node.type === 'heading') {
      lines.push(
        (node.content ?? []).map((child) => (child.type === 'hardBreak' ? '\n' : (child.text ?? ''))).join(''),
      );
      return;
    }
    (node.content ?? []).forEach((child) => visit(child, depth));
  };
  (entry.body.content as DocumentNode[]).forEach((node) => visit(node, 0));
  const body = lines.join('\n').trim() || entry.plainText;
  return [entry.title, body].filter(Boolean).join('\n\n');
}
