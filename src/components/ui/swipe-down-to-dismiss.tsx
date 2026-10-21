// Gesture wrapper that closes the keyboard on a downward swipe
import { type PropsWithChildren, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

type PressTiming = { pressedAt: number; quickStart: boolean };

function markPressed(timing: PressTiming) {
  timing.pressedAt = Date.now();
}

function markStarted(timing: PressTiming) {
  timing.quickStart = Date.now() - timing.pressedAt < 350;
}

function dismissAllowed(timing: PressTiming, translationY: number) {
  return timing.quickStart && translationY > 40;
}

// Calls `onDismiss` when the user swipes down over the children, as iOS Notes does
// to close the keyboard. Horizontal drags are left to other gestures, and so is a press held
// before moving, which iOS uses to select text: closing the keyboard during a selection drag
// could leave the note unresponsive.
export function SwipeDownToDismiss({ children, onDismiss }: PropsWithChildren<{ onDismiss: () => void }>) {
  // One timing record per mounted wrapper, updated only from gesture callbacks.
  const [timing] = useState<PressTiming>(() => ({ pressedAt: 0, quickStart: false }));
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(24)
        .failOffsetX([-24, 24])
        .runOnJS(true)
        .onBegin(() => markPressed(timing))
        .onStart(() => markStarted(timing))
        .onEnd((event) => {
          if (dismissAllowed(timing, event.translationY)) onDismiss();
        }),
    [onDismiss, timing],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View>{children}</View>
    </GestureDetector>
  );
}
