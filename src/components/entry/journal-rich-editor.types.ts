// Shared types for the rich-text editor and its toolbar state
import type { StyleProp, ViewStyle } from 'react-native';

import type { RichTextDocument } from '@/domain/journal';

export type EditorToolbarState = {
  bold: boolean;
  bulletList: boolean;
  italic: boolean;
  taskList: boolean;
  underline: boolean;
};

export const emptyToolbarState: EditorToolbarState = {
  bold: false,
  bulletList: false,
  italic: false,
  taskList: false,
  underline: false,
};

export type JournalRichEditorHandle = {
  blur: () => void;
  getDocument: () => Promise<RichTextDocument>;
  getText: () => Promise<string>;
  indent: () => void;
  insertImage: (uri: string) => void;
  toggleBold: () => void;
  toggleBulletList: () => void;
  toggleItalic: () => void;
  toggleTaskList: () => void;
  toggleUnderline: () => void;
};

export type JournalRichEditorProps = {
  autofocus: boolean;
  editable: boolean;
  initialDocument: RichTextDocument;
  onContentChange?: () => void;
  // iOS can end the editor's web content while the app is in the background; the screen then reloads it.
  onEditorLost?: () => void;
  onToolbarStateChange: (state: EditorToolbarState) => void;
  style?: StyleProp<ViewStyle>;
};

export function isRichTextDocument(value: object): value is RichTextDocument {
  const candidate = value as Partial<RichTextDocument>;
  return candidate.type === 'doc' && Array.isArray(candidate.content);
}

export function plainTextFromDocument(document: RichTextDocument): string {
  const text: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const node = value as { content?: unknown[]; text?: unknown; type?: unknown };
    if (typeof node.text === 'string') text.push(node.text);
    node.content?.forEach(visit);
    if (node.type === 'paragraph') text.push('\n');
  };
  visit(document);
  return text.join('').trim();
}

export function documentFromPlainText(value: string): RichTextDocument {
  return {
    type: 'doc',
    content: value.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}
