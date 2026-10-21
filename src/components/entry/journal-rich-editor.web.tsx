// Web preview version of the rich-text editor
import { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  documentFromPlainText,
  emptyToolbarState,
  type JournalRichEditorHandle,
  type JournalRichEditorProps,
  plainTextFromDocument,
} from '@/components/entry/journal-rich-editor.types';
import { colors, fontFamilies, typography } from '@/theme/tokens';

export const JournalRichEditor = forwardRef<JournalRichEditorHandle, JournalRichEditorProps>(function JournalRichEditor(
  { autofocus, editable, initialDocument, onToolbarStateChange, style },
  ref,
) {
  const [text, setText] = useState(() => plainTextFromDocument(initialDocument));

  useImperativeHandle(
    ref,
    () => ({
      blur: () => undefined,
      getDocument: async () => documentFromPlainText(text),
      getText: async () => text,
      indent: () => onToolbarStateChange(emptyToolbarState),
      insertImage: () => undefined,
      toggleBold: () => onToolbarStateChange(emptyToolbarState),
      toggleBulletList: () => onToolbarStateChange(emptyToolbarState),
      toggleItalic: () => onToolbarStateChange(emptyToolbarState),
      toggleTaskList: () => onToolbarStateChange(emptyToolbarState),
      toggleUnderline: () => onToolbarStateChange(emptyToolbarState),
    }),
    [onToolbarStateChange, text],
  );

  return (
    <View style={style}>
      <TextInput
        accessibilityLabel="Entry body"
        autoFocus={autofocus}
        editable={editable}
        multiline
        onChangeText={setText}
        placeholder="Start writing…"
        placeholderTextColor={colors.textDim}
        style={styles.editor}
        textAlignVertical="top"
        value={text}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  editor: {
    color: colors.text,
    fontFamily: fontFamilies.body.regular,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    minHeight: 160,
    padding: 0,
  },
});
