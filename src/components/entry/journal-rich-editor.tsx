// Native rich-text editor for entries, built on the tentap editor
import { RichText, useBridgeState, useEditorBridge } from '@10play/tentap-editor';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';

import { editorCss } from '@/components/entry/editor-css';
import {
  type JournalRichEditorHandle,
  type JournalRichEditorProps,
  isRichTextDocument,
} from '@/components/entry/journal-rich-editor.types';
import { noteBodyFontSize } from '@/domain/note-text';
import { useSettings } from '@/state/settings-context';
import { darkPalette, lightPalette } from '@/theme/tokens';

// Swiping down over the text closes the keyboard, as in iOS Notes: a quick, clearly
// downward, mostly vertical drag removes focus from the editor. A press held before moving
// (iOS starts a text selection) or a drag while text is selected is left alone: closing the
// keyboard in the middle of a selection drag left the note unresponsive (build 4, 2026-09-30).
const swipeDownToDismissKeyboard = `
  (function () {
    if (window.__bunariSwipeDismiss) return;
    window.__bunariSwipeDismiss = true;
    var startX = 0, startY = 0, startTime = 0, moved = false, tracking = false;
    function selecting() {
      var selection = window.getSelection && window.getSelection();
      return !!selection && !selection.isCollapsed;
    }
    document.addEventListener('touchstart', function (event) {
      var touch = event.touches[0];
      startX = touch.clientX; startY = touch.clientY; startTime = Date.now(); moved = false;
      tracking = event.touches.length === 1 && !selecting();
    }, { passive: true });
    document.addEventListener('touchmove', function (event) {
      if (!tracking) return;
      if ((!moved && Date.now() - startTime > 350) || selecting()) { tracking = false; return; }
      moved = true;
      var touch = event.touches[0];
      var dx = touch.clientX - startX, dy = touch.clientY - startY;
      if (dy > 48 && dy > Math.abs(dx) * 2) {
        tracking = false;
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }
    }, { passive: true });
  })();
  true;
`;

export const JournalRichEditor = forwardRef<JournalRichEditorHandle, JournalRichEditorProps>(function JournalRichEditor(
  { autofocus, editable, initialDocument, onContentChange, onEditorLost, onToolbarStateChange, style },
  ref,
) {
  const editor = useEditorBridge({
    autofocus,
    // The entry screen already moves up for the keyboard; letting tentap shift the content too
    // pushed earlier lines out of view while typing.
    avoidIosKeyboard: false,
    editable,
    initialContent: initialDocument,
    onChange: onContentChange,
  });
  const state = useBridgeState(editor);
  const { noteTextSize, theme } = useSettings();
  // Follows the iPhone's Text Size, as the note's title already does.
  const { fontScale } = useWindowDimensions();

  // tentap reports "ready" only after the first change or focus, so an opened note stayed in
  // unstyled black text until tapped. The page also announces its editor ("editor-ready") as soon
  // as it exists; styling then too is safe, since scripts sent then are never dropped.
  const [editorStarts, setEditorStarts] = useState(0);
  useEffect(() => {
    if (!state.isReady && editorStarts === 0) return;
    editor.injectCSS(
      editorCss(theme === 'light' ? lightPalette : darkPalette, theme, noteBodyFontSize(noteTextSize, fontScale)),
      'journal-editor',
    );
    editor.injectJS(swipeDownToDismissKeyboard);
  }, [editor, editorStarts, fontScale, noteTextSize, state.isReady, theme]);

  useEffect(() => {
    if (state.isReady) editor.setEditable(editable);
  }, [editable, editor, state.isReady]);

  useEffect(() => {
    onToolbarStateChange({
      bold: state.isBoldActive,
      bulletList: state.isBulletListActive,
      italic: state.isItalicActive,
      taskList: state.isTaskListActive,
      underline: state.isUnderlineActive,
    });
  }, [
    onToolbarStateChange,
    state.isBoldActive,
    state.isBulletListActive,
    state.isItalicActive,
    state.isTaskListActive,
    state.isUnderlineActive,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      blur: editor.blur,
      getDocument: async () => {
        const document = await editor.getJSON();
        if (!isRichTextDocument(document)) throw new Error('Invalid rich-text document');
        return document;
      },
      getText: editor.getText,
      indent: editor.sinkTaskListItem,
      insertImage: editor.setImage,
      toggleBold: editor.toggleBold,
      toggleBulletList: editor.toggleBulletList,
      toggleItalic: editor.toggleItalic,
      toggleTaskList: editor.toggleTaskList,
      toggleUnderline: editor.toggleUnderline,
    }),
    [editor],
  );

  const onMessage = (event: WebViewMessageEvent) => {
    const { data } = event.nativeEvent;
    if (typeof data === 'string' && data.includes('"editor-ready"')) setEditorStarts((count) => count + 1);
  };

  return (
    <RichText
      editor={editor}
      exclusivelyUseCustomOnMessage={false}
      onContentProcessDidTerminate={onEditorLost}
      onMessage={onMessage}
      style={style}
    />
  );
});
